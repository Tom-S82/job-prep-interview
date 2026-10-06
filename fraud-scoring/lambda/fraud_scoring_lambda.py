"""
Real-time card application scoring: AWS Lambda behind API Gateway.

Request flow and latency budget (target: well under 200 ms end to end)
----------------------------------------------------------------------
    1. Parse + validate the request          ~1 ms     (reject malformed input with 400)
    2. Read customer features (DynamoDB)     ~5–15 ms  (single GetItem, short timeouts)
    3. Score (pure Python, scoring.py)       < 1 ms
    4. Record the decision (DynamoDB)        ~5–15 ms  (conditional put = idempotency)
    5. Publish decision event (Kinesis)      ~10–30 ms (best effort; never blocks the answer)
    6. Update velocity features (DynamoDB)   ~5–15 ms  (best effort)
Network to/from API Gateway adds roughly 10–30 ms. Cold starts are the main risk
to the budget: use provisioned concurrency for this function.

Failure behaviour (fail safe, never fail open)
-----------------------------------------------
* Malformed request              → 400 with field errors; nothing scored or stored.
* Feature store unavailable/slow → fallback decision (manual review, or decline if the
                                   request alone scores that high), flagged with a reason.
* Same application_id retried    → the original decision is returned (idempotent).
* Kinesis or velocity update fails → the decision still stands and is returned; the
                                   failure is logged and counted. DynamoDB Streams on the
                                   decisions table is the safety net for durability.

Environment variables
---------------------
FEATURE_TABLE   DynamoDB table of precomputed customer features (key: customer_id)
DECISIONS_TABLE DynamoDB table of decisions (key: application_id)
DECISION_STREAM Kinesis Data Stream for decision events
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Optional, Protocol

from scoring import (
    RULESET_VERSION,
    Application,
    CustomerFeatures,
    ScoreResult,
    fallback_result,
    score_application,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

VALID_SCA_RESULTS = {"passed", "failed", "not_attempted"}
MAX_AMOUNT = 50_000
MAX_MONTHLY_INCOME = 1_000_000


# --- Dependencies (real in AWS, fake in tests) --------------------------------------


class DecisionAlreadyExists(Exception):
    """Raised by save_decision when this application_id was already decided."""

    def __init__(self, existing: dict[str, Any]):
        super().__init__("decision already exists")
        self.existing = existing


class Dependencies(Protocol):
    def now(self) -> datetime: ...
    def get_features(self, customer_id: str) -> CustomerFeatures: ...
    def save_decision(self, record: dict[str, Any]) -> None: ...  # raises DecisionAlreadyExists
    def publish_decision(self, record: dict[str, Any]) -> None: ...
    def record_application(self, customer_id: str, applied_at: datetime) -> None: ...


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def features_from_item(item: Optional[dict[str, Any]]) -> CustomerFeatures:
    """Map a DynamoDB feature-store item (as returned by boto3's Table resource) to CustomerFeatures."""
    if not item:
        return CustomerFeatures()
    income = item.get("typical_monthly_income")
    return CustomerFeatures(
        account_opened_at=_parse_dt(item.get("account_opened_at")),
        last_activity_at=_parse_dt(item.get("last_activity_at")),
        typical_monthly_income=float(income) if income is not None else None,
        known_devices=frozenset(item.get("known_devices") or ()),
        usual_locations=frozenset(item.get("usual_locations") or ()),
        recent_application_times=tuple(
            datetime.fromtimestamp(float(ts), tz=timezone.utc) for ts in item.get("recent_application_ts") or ()
        ),
    )


class AwsDependencies:
    """boto3-backed dependencies. Clients are created once per container and reused."""

    def __init__(self) -> None:
        import boto3  # available in the Lambda runtime; imported here so tests don't need it
        from botocore.config import Config

        # Short timeouts and few retries: a slow dependency must not eat the latency budget.
        cfg = Config(connect_timeout=0.2, read_timeout=0.3, retries={"max_attempts": 2, "mode": "standard"})
        dynamodb = boto3.resource("dynamodb", config=cfg)
        self._features = dynamodb.Table(os.environ["FEATURE_TABLE"])
        self._decisions = dynamodb.Table(os.environ["DECISIONS_TABLE"])
        self._kinesis = boto3.client("kinesis", config=cfg)
        self._stream = os.environ["DECISION_STREAM"]
        self._conditional_failed = dynamodb.meta.client.exceptions.ConditionalCheckFailedException

    def now(self) -> datetime:
        return datetime.now(timezone.utc)

    def get_features(self, customer_id: str) -> CustomerFeatures:
        resp = self._features.get_item(Key={"customer_id": customer_id})
        return features_from_item(resp.get("Item"))

    def save_decision(self, record: dict[str, Any]) -> None:
        try:
            self._decisions.put_item(
                Item=json.loads(json.dumps(record), parse_float=Decimal),  # DynamoDB needs Decimal, not float
                ConditionExpression="attribute_not_exists(application_id)",
            )
        except self._conditional_failed:
            existing = self._decisions.get_item(Key={"application_id": record["application_id"]}).get("Item", {})
            raise DecisionAlreadyExists(json.loads(json.dumps(existing, default=float)))

    def publish_decision(self, record: dict[str, Any]) -> None:
        self._kinesis.put_record(
            StreamName=self._stream,
            Data=json.dumps(record).encode(),
            PartitionKey=record["customer_id"],  # keeps one customer's events in order
        )

    def record_application(self, customer_id: str, applied_at: datetime) -> None:
        # Append to the velocity list; a nightly batch job trims entries older than 30 days.
        self._features.update_item(
            Key={"customer_id": customer_id},
            UpdateExpression="SET recent_application_ts = list_append(if_not_exists(recent_application_ts, :empty), :ts)",
            ExpressionAttributeValues={":ts": [Decimal(str(applied_at.timestamp()))], ":empty": []},
        )


_deps: Optional[Dependencies] = None


def _default_deps() -> Dependencies:
    global _deps
    if _deps is None:
        _deps = AwsDependencies()
    return _deps


# --- Request handling ----------------------------------------------------------------


def validate(body: Any) -> tuple[Optional[dict[str, Any]], list[str]]:
    """Schema validation at the edge: cheap checks that reject malformed input before scoring."""
    if not isinstance(body, dict):
        return None, ["body must be a JSON object"]
    errors: list[str] = []

    def text(name: str, max_len: int = 64) -> None:
        v = body.get(name)
        if not isinstance(v, str) or not v.strip() or len(v) > max_len:
            errors.append(f"{name} must be a non-empty string of at most {max_len} characters")

    def number(name: str, low: float, high: float) -> None:
        v = body.get(name)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not (low <= v <= high):
            errors.append(f"{name} must be a number between {low} and {high}")

    text("application_id")
    text("customer_id")
    text("device_id", 128)
    text("device_location")
    number("amount", 1, MAX_AMOUNT)
    number("stated_monthly_income", 0, MAX_MONTHLY_INCOME)
    if body.get("sca_result") not in VALID_SCA_RESULTS:
        errors.append(f"sca_result must be one of {sorted(VALID_SCA_RESULTS)}")
    return (body if not errors else None), errors


def _response(status: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(payload)}


def _emit_metrics(decision: str, latency_ms: float, fallback: bool, publish_ok: bool) -> None:
    """CloudWatch Embedded Metric Format: metrics from a log line, no SDK call or extra latency."""
    if os.environ.get("FRAUD_SCORING_EMF") == "off":  # local examples and benchmarks
        return
    print(
        json.dumps(
            {
                "_aws": {
                    "Timestamp": int(time.time() * 1000),
                    "CloudWatchMetrics": [
                        {
                            "Namespace": "FraudScoring",
                            "Dimensions": [["Decision"]],
                            "Metrics": [
                                {"Name": "LatencyMs", "Unit": "Milliseconds"},
                                {"Name": "Decisions", "Unit": "Count"},
                                {"Name": "Fallbacks", "Unit": "Count"},
                                {"Name": "PublishFailures", "Unit": "Count"},
                            ],
                        }
                    ],
                },
                "Decision": decision,
                "LatencyMs": round(latency_ms, 2),
                "Decisions": 1,
                "Fallbacks": int(fallback),
                "PublishFailures": int(not publish_ok),
            }
        )
    )


def handle(event: dict[str, Any], deps: Dependencies, clock: Callable[[], float] = time.perf_counter) -> dict[str, Any]:
    """Score one application. Separated from `handler` so tests can inject dependencies."""
    t0 = clock()
    timings: dict[str, float] = {}

    def lap(stage: str, since: float) -> float:
        now = clock()
        timings[stage] = round((now - since) * 1000, 2)
        return now

    # 1. Parse and validate
    raw = event.get("body", event)  # API Gateway proxy sends a JSON string; direct invokes send a dict
    try:
        body = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return _response(400, {"errors": ["body is not valid JSON"]})
    valid, errors = validate(body)
    if errors:
        return _response(400, {"errors": errors})
    assert valid is not None
    app = Application(
        application_id=valid["application_id"],
        customer_id=valid["customer_id"],
        applied_at=deps.now(),  # server time: client clocks can't be trusted
        amount=float(valid["amount"]),
        stated_monthly_income=float(valid["stated_monthly_income"]),
        device_id=valid["device_id"],
        device_location=valid["device_location"],
        sca_result=valid["sca_result"],
    )
    t = lap("validate", t0)

    # 2. Customer context (fail safe if unavailable)
    features: Optional[CustomerFeatures] = None
    try:
        features = deps.get_features(app.customer_id)
    except Exception:  # noqa: BLE001 - any feature-store failure must fall back, not fail the call
        logger.exception("feature store unavailable for application %s", app.application_id)
    t = lap("features", t)

    # 3. Score
    result: ScoreResult = (
        score_application(app, features) if features is not None else fallback_result(app, "features_unavailable")
    )
    response = result.to_response()
    t = lap("score", t)

    # 4. Record the decision (idempotent on application_id)
    record = {
        **response,
        "customer_id": app.customer_id,
        "decided_at": app.applied_at.isoformat(),
        "amount": app.amount,
        # The inputs the rules saw: needed for audit, replay and point-in-time model training.
        "evidence": [
            {"factor": o.factor, "fired": o.fired, "evaluated": o.evaluated, **o.evidence} for o in result.outcomes
        ],
    }
    try:
        deps.save_decision(record)
    except DecisionAlreadyExists as dup:
        logger.info("duplicate request for %s; returning original decision", app.application_id)
        original = {k: v for k, v in dup.existing.items() if k not in ("evidence", "customer_id", "amount", "decided_at")}
        return _response(200, {**original, "idempotent_replay": True})
    t = lap("save", t)

    # 5. Publish for durability and downstream (best effort)
    publish_ok = True
    try:
        deps.publish_decision(record)
    except Exception:  # noqa: BLE001
        publish_ok = False
        logger.exception("failed to publish decision %s; DynamoDB Streams will backfill", app.application_id)
    t = lap("publish", t)

    # 6. Update velocity features for the next application (best effort)
    try:
        deps.record_application(app.customer_id, app.applied_at)
    except Exception:  # noqa: BLE001
        logger.exception("failed to update velocity features for %s", app.customer_id)
    lap("velocity", t)

    latency_ms = (clock() - t0) * 1000
    _emit_metrics(response["decision"], latency_ms, result.fallback_reason is not None, publish_ok)
    logger.info(json.dumps({"application_id": app.application_id, "decision": response["decision"], "timings_ms": timings}))
    return _response(200, {**response, "latency_ms": round(latency_ms, 2)})


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AWS Lambda entry point (handler setting: fraud_scoring_lambda.handler)."""
    return handle(event, _default_deps())


__all__ = ["handler", "handle", "validate", "features_from_item", "DecisionAlreadyExists", "RULESET_VERSION"]

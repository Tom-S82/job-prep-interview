"""
Tests for the Lambda handler with in-memory dependencies (no AWS needed).

    cd fraud-scoring/lambda
    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("FRAUD_SCORING_EMF", "off")

from fraud_scoring_lambda import features_from_item, handle  # noqa: E402
from local_deps import InMemoryDependencies  # noqa: E402

NOW = datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc)
SCENARIOS = json.loads((Path(__file__).resolve().parents[1] / "examples" / "scenarios.json").read_text(encoding="utf-8"))


def request(**overrides) -> dict:
    body = {
        "application_id": "APP_1",
        "customer_id": "CUST_1",
        "amount": 500,
        "stated_monthly_income": 1500,
        "device_id": "dev-1",
        "device_location": "Manchester",
        "sca_result": "passed",
    }
    body.update(overrides)
    return {"body": json.dumps(body)}


def call(event: dict, deps: InMemoryDependencies) -> tuple[int, dict]:
    resp = handle(event, deps)
    return resp["statusCode"], json.loads(resp["body"])


class Validation(unittest.TestCase):
    def test_malformed_json_is_400(self):
        status, body = call({"body": "{not json"}, InMemoryDependencies(now=NOW))
        self.assertEqual(status, 400)
        self.assertIn("errors", body)

    def test_missing_and_invalid_fields_are_reported_together(self):
        status, body = call(request(amount=-5, sca_result="maybe", customer_id=""), InMemoryDependencies(now=NOW))
        self.assertEqual(status, 400)
        joined = " ".join(body["errors"])
        for field in ("amount", "sca_result", "customer_id"):
            self.assertIn(field, joined)

    def test_booleans_are_not_numbers(self):
        status, _ = call(request(amount=True), InMemoryDependencies(now=NOW))
        self.assertEqual(status, 400)

    def test_nothing_is_stored_for_an_invalid_request(self):
        deps = InMemoryDependencies(now=NOW)
        call(request(amount=0), deps)
        self.assertEqual((deps.decisions, deps.published), ({}, []))

    def test_direct_invocation_with_a_dict_body_also_works(self):
        status, body = call(json.loads(request()["body"]), InMemoryDependencies(now=NOW))
        self.assertEqual(status, 200)
        self.assertIn(body["decision"], {"approve", "manual_review", "decline"})


class EndToEnd(unittest.TestCase):
    def test_all_documented_scenarios_give_their_expected_decision(self):
        for s in SCENARIOS["scenarios"]:
            with self.subTest(s["name"]):
                deps = InMemoryDependencies({s["features"]["customer_id"]: s["features"]}, now=datetime.fromisoformat(SCENARIOS["now"]))
                status, body = call({"body": json.dumps(s["request"])}, deps)
                self.assertEqual(status, 200)
                self.assertEqual(body["decision"], s["expected"])

    def test_response_shape(self):
        status, body = call(request(), InMemoryDependencies(now=NOW))
        self.assertEqual(status, 200)
        for key in ("application_id", "decision", "score", "confidence", "reasoning", "recommended_action", "customer_message", "ruleset_version", "latency_ms"):
            self.assertIn(key, body)
        self.assertTrue(0.0 <= body["score"] <= 1.0)

    def test_decision_is_recorded_with_evidence_and_published(self):
        deps = InMemoryDependencies(now=NOW)
        call(request(), deps)
        record = deps.decisions["APP_1"]
        self.assertEqual(len(record["evidence"]), 7)  # every rule's inputs, fired or not
        self.assertEqual(deps.published[0]["application_id"], "APP_1")
        self.assertEqual(record["decided_at"], NOW.isoformat())

    def test_velocity_history_is_updated_for_the_next_application(self):
        deps = InMemoryDependencies(now=NOW)
        for i in range(4):
            call(request(application_id=f"APP_{i}"), deps)
        _, body = call(request(application_id="APP_9"), deps)
        factors = {r["factor"] for r in body["reasoning"]}
        self.assertIn("velocity_spike", factors)

    def test_customer_message_does_not_reveal_the_rules(self):
        _, body = call(request(sca_result="failed", device_id="new"), InMemoryDependencies(now=NOW))
        for factor in ("sca", "device", "velocity", "income"):
            self.assertNotIn(factor, body["customer_message"].lower())


class Resilience(unittest.TestCase):
    def test_retry_with_same_application_id_returns_the_original_decision(self):
        deps = InMemoryDependencies(now=NOW)
        _, first = call(request(), deps)
        _, second = call(request(sca_result="failed"), deps)  # a retry must not be re-scored
        self.assertTrue(second["idempotent_replay"])
        self.assertEqual((second["decision"], second["score"]), (first["decision"], first["score"]))
        self.assertEqual(len(deps.published), 1)

    def test_feature_store_outage_fails_safe(self):
        status, body = call(request(), InMemoryDependencies(now=NOW, features_fail=True))
        self.assertEqual(status, 200)
        self.assertEqual(body["decision"], "manual_review")
        self.assertEqual(body["fallback_reason"], "features_unavailable")

    def test_publish_failure_does_not_change_the_answer(self):
        deps = InMemoryDependencies(now=NOW, publish_fail=True)
        status, body = call(request(), deps)
        self.assertEqual(status, 200)
        self.assertIn("APP_1", deps.decisions)  # still recorded; DynamoDB Streams can backfill


class FeatureMapping(unittest.TestCase):
    def test_dynamodb_item_maps_to_features(self):
        f = features_from_item(
            {
                "account_opened_at": "2026-01-01T00:00:00Z",
                "typical_monthly_income": 1200,
                "known_devices": {"a", "b"},
                "recent_application_ts": [1791021600],
            }
        )
        self.assertEqual(f.account_opened_at, datetime(2026, 1, 1, tzinfo=timezone.utc))
        self.assertEqual((f.typical_monthly_income, f.known_devices), (1200.0, frozenset({"a", "b"})))
        self.assertEqual(f.recent_application_times[0], datetime(2026, 10, 3, 10, 0, tzinfo=timezone.utc))

    def test_unknown_customer_has_empty_features(self):
        f = features_from_item(None)
        self.assertIsNone(f.account_opened_at)
        self.assertEqual(f.known_devices, frozenset())


if __name__ == "__main__":
    unittest.main()

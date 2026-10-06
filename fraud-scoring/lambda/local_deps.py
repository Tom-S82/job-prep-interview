"""
In-memory stand-ins for the AWS dependencies, used by tests, examples and the benchmark.

They behave like the real ones where it matters: decisions are idempotent on
application_id, published events are kept in order, and velocity updates append
to the customer's application history.
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any, Optional

from fraud_scoring_lambda import DecisionAlreadyExists, features_from_item
from scoring import CustomerFeatures


class InMemoryDependencies:
    def __init__(
        self,
        feature_items: Optional[dict[str, dict[str, Any]]] = None,
        now: Optional[datetime] = None,
        features_fail: bool = False,
        publish_fail: bool = False,
    ) -> None:
        self.feature_items = copy.deepcopy(feature_items or {})
        self.decisions: dict[str, dict[str, Any]] = {}
        self.published: list[dict[str, Any]] = []
        self.features_fail = features_fail
        self.publish_fail = publish_fail
        self._now = now or datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc)

    def now(self) -> datetime:
        return self._now

    def get_features(self, customer_id: str) -> CustomerFeatures:
        if self.features_fail:
            raise TimeoutError("feature store timed out")
        return features_from_item(self.feature_items.get(customer_id))

    def save_decision(self, record: dict[str, Any]) -> None:
        existing = self.decisions.get(record["application_id"])
        if existing is not None:
            raise DecisionAlreadyExists(copy.deepcopy(existing))
        self.decisions[record["application_id"]] = copy.deepcopy(record)

    def publish_decision(self, record: dict[str, Any]) -> None:
        if self.publish_fail:
            raise ConnectionError("kinesis unavailable")
        self.published.append(copy.deepcopy(record))

    def record_application(self, customer_id: str, applied_at: datetime) -> None:
        item = self.feature_items.setdefault(customer_id, {"customer_id": customer_id})
        item.setdefault("recent_application_ts", []).append(applied_at.timestamp())

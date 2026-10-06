"""
Measure the parts of the latency that can be measured locally.

    cd fraud-scoring/lambda
    python examples/benchmark.py

This measures the scoring logic and the full handler with in-memory dependencies, i.e.
everything except network calls to DynamoDB and Kinesis. Real end-to-end latency must be
measured in AWS (see decision-rules.md, "Performance"): these numbers show the code itself
is a negligible part of the 200 ms budget, not what production latency will be.
"""

from __future__ import annotations

import json
import os
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("FRAUD_SCORING_EMF", "off")

from fraud_scoring_lambda import handle  # noqa: E402
from local_deps import InMemoryDependencies  # noqa: E402
from scoring import Application, CustomerFeatures, score_application  # noqa: E402

NOW = datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc)
N = 5000


def percentiles(samples_ms: list[float]) -> str:
    q = statistics.quantiles(samples_ms, n=100)
    return f"p50 {q[49]:.3f} ms | p95 {q[94]:.3f} ms | p99 {q[98]:.3f} ms | max {max(samples_ms):.3f} ms"


def bench(fn, n: int = N) -> list[float]:
    for _ in range(200):  # warm up
        fn(0)
    out = []
    for i in range(n):
        t = time.perf_counter()
        fn(i)
        out.append((time.perf_counter() - t) * 1000)
    return out


def main() -> None:
    app = Application("APP_B", "CUST_B", NOW, 500, 1500, "dev-1", "Manchester", "passed")
    features = CustomerFeatures(
        account_opened_at=NOW - timedelta(days=400),
        last_activity_at=NOW - timedelta(days=1),
        typical_monthly_income=1500,
        known_devices=frozenset({"dev-1", "dev-2"}),
        usual_locations=frozenset({"Manchester"}),
        recent_application_times=tuple(NOW - timedelta(hours=h) for h in range(30)),
    )
    print(f"Python {sys.version.split()[0]}, {N} iterations each\n")
    print("Scoring only (scoring.score_application):")
    print("  " + percentiles(bench(lambda i: score_application(app, features))))

    item = {
        "customer_id": "CUST_B",
        "account_opened_at": (NOW - timedelta(days=400)).isoformat(),
        "last_activity_at": (NOW - timedelta(days=1)).isoformat(),
        "typical_monthly_income": 1500,
        "known_devices": ["dev-1", "dev-2"],
        "usual_locations": ["Manchester"],
        "recent_application_ts": [],
    }
    deps = InMemoryDependencies({"CUST_B": item}, now=NOW)
    body = {"customer_id": "CUST_B", "amount": 500, "stated_monthly_income": 1500, "device_id": "dev-1", "device_location": "Manchester", "sca_result": "passed"}

    def call(i: int) -> None:
        deps.feature_items["CUST_B"]["recent_application_ts"] = []  # keep velocity constant across iterations
        handle({"body": json.dumps({**body, "application_id": f"APP_{i}_{time.perf_counter_ns()}"})}, deps)

    print("\nFull handler, in-memory dependencies (validation, features mapping, scoring, record, publish):")
    print("  " + percentiles(bench(call)))
    print("\nNetwork calls (DynamoDB get/put/update, Kinesis put) are not included: measure them in AWS.")


if __name__ == "__main__":
    main()

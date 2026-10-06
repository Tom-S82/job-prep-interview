"""
"What would we decide for customer X?"

Runs each scenario in scenarios.json through the real handler (with in-memory
dependencies instead of AWS) and prints the decision and its reasoning.

    cd fraud-scoring/lambda
    python examples/run_examples.py            # all scenarios
    python examples/run_examples.py APP_10003  # one application
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("FRAUD_SCORING_EMF", "off")  # keep CloudWatch metric lines out of the output

from fraud_scoring_lambda import handle  # noqa: E402
from local_deps import InMemoryDependencies  # noqa: E402

DATA = json.loads((Path(__file__).parent / "scenarios.json").read_text(encoding="utf-8"))


def run(scenario: dict) -> dict:
    deps = InMemoryDependencies(
        feature_items={scenario["features"]["customer_id"]: scenario["features"]},
        now=datetime.fromisoformat(DATA["now"]),
    )
    response = handle({"body": json.dumps(scenario["request"])}, deps)
    return json.loads(response["body"])


def main(only: str | None = None) -> int:
    mismatches = 0
    for s in DATA["scenarios"]:
        if only and s["request"]["application_id"] != only:
            continue
        out = run(s)
        ok = out["decision"] == s["expected"]
        mismatches += not ok
        print(f"\n{s['name']}  ({s['request']['application_id']})")
        print(f"  decision: {out['decision']}   score: {out['score']}   confidence: {out['confidence']}" + ("" if ok else f"   EXPECTED {s['expected']}"))
        for r in out["reasoning"]:
            detail = ", ".join(f"{k}={v}" for k, v in r.items() if k not in ("factor", "contribution"))
            print(f"    +{r['contribution']:.2f}  {r['factor']}" + (f"  ({detail})" if detail else ""))
        if out["not_evaluated"]:
            print(f"    not evaluated (missing data): {', '.join(out['not_evaluated'])}")
        print(f"  action: {out['recommended_action']}")
        print(f"  why: {s['why']}")
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))

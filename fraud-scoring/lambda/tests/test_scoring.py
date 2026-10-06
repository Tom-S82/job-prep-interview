"""
Unit tests for the rules engine (scoring.py). Standard library only:

    cd fraud-scoring/lambda
    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import re
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import scoring  # noqa: E402
from scoring import (  # noqa: E402
    Application,
    CustomerFeatures,
    Decision,
    decide,
    fallback_result,
    score_application,
)

NOW = datetime(2026, 10, 6, 10, 0, tzinfo=timezone.utc)


def app(**overrides) -> Application:
    base = dict(
        application_id="APP_1",
        customer_id="CUST_1",
        applied_at=NOW,
        amount=500.0,
        stated_monthly_income=1500.0,
        device_id="dev-known",
        device_location="Manchester",
        sca_result="passed",
    )
    base.update(overrides)
    return Application(**base)


def established(**overrides) -> CustomerFeatures:
    """A customer for whom no rule fires and every rule can be evaluated."""
    base = dict(
        account_opened_at=NOW - timedelta(days=400),
        last_activity_at=NOW - timedelta(days=1),
        typical_monthly_income=1500.0,
        known_devices=frozenset({"dev-known"}),
        usual_locations=frozenset({"Manchester"}),
        recent_application_times=(),
    )
    base.update(overrides)
    return CustomerFeatures(**base)


def fired(result) -> dict[str, float]:
    return {o.factor: o.contribution for o in result.outcomes if o.fired}


class EachRule(unittest.TestCase):
    def test_baseline_nothing_fires_and_confidence_is_full(self):
        r = score_application(app(), established())
        self.assertEqual(fired(r), {})
        self.assertEqual((r.score, r.decision, r.confidence), (0.0, Decision.APPROVE, 1.0))

    def test_new_account_boundary_is_strictly_less_than_7_days(self):
        self.assertIn("new_account", fired(score_application(app(), established(account_opened_at=NOW - timedelta(days=6)))))
        self.assertNotIn("new_account", fired(score_application(app(), established(account_opened_at=NOW - timedelta(days=7)))))

    def test_missing_account_record_counts_as_new(self):
        r = score_application(app(), established(account_opened_at=None))
        self.assertEqual(fired(r)["new_account"], 0.25)

    def test_velocity_needs_more_than_two_prior_applications_in_7_days(self):
        two = tuple(NOW - timedelta(days=d) for d in (1, 2))
        three = tuple(NOW - timedelta(days=d) for d in (1, 2, 3))
        self.assertNotIn("velocity_spike", fired(score_application(app(), established(recent_application_times=two))))
        r = score_application(app(), established(recent_application_times=three))
        self.assertEqual(fired(r)["velocity_spike"], 0.35)
        evidence = next(o.evidence for o in r.outcomes if o.factor == "velocity_spike")
        self.assertEqual(evidence, {"count": 3, "period": "7_days"})

    def test_velocity_ignores_applications_older_than_the_window(self):
        old = tuple(NOW - timedelta(days=d) for d in (8, 9, 10, 11))
        self.assertNotIn("velocity_spike", fired(score_application(app(), established(recent_application_times=old))))

    def test_device_new(self):
        self.assertEqual(fired(score_application(app(device_id="dev-other"), established()))["device_new"], 0.15)

    def test_income_ratio_boundary_is_strictly_greater_than_1_5(self):
        self.assertNotIn("income_consistency", fired(score_application(app(stated_monthly_income=1500), established(typical_monthly_income=1000))))
        r = score_application(app(stated_monthly_income=1510), established(typical_monthly_income=1000))
        self.assertEqual(fired(r)["income_consistency"], 0.20)

    def test_income_not_evaluated_without_history_and_lowers_confidence(self):
        r = score_application(app(), established(typical_monthly_income=None))
        outcome = next(o for o in r.outcomes if o.factor == "income_consistency")
        self.assertFalse(outcome.evaluated)
        self.assertEqual(r.confidence, round(6 / 7, 2))

    def test_dormant_reactivation_after_more_than_30_days(self):
        self.assertNotIn("dormant_reactivation", fired(score_application(app(), established(last_activity_at=NOW - timedelta(days=30)))))
        self.assertIn("dormant_reactivation", fired(score_application(app(), established(last_activity_at=NOW - timedelta(days=31)))))

    def test_sca(self):
        self.assertEqual(fired(score_application(app(sca_result="failed"), established()))["sca_fail"], 0.30)
        not_attempted = score_application(app(sca_result="not_attempted"), established())
        self.assertFalse(next(o for o in not_attempted.outcomes if o.factor == "sca_fail").evaluated)

    def test_location_unusual(self):
        self.assertEqual(fired(score_application(app(device_location="Leeds"), established()))["location_unusual"], 0.10)


class Decisions(unittest.TestCase):
    def test_thresholds(self):
        self.assertEqual(decide(0.49), Decision.APPROVE)
        self.assertEqual(decide(0.50), Decision.MANUAL_REVIEW)
        self.assertEqual(decide(0.75), Decision.MANUAL_REVIEW)  # exactly 0.75 is review, not decline
        self.assertEqual(decide(0.76), Decision.DECLINE)

    def test_score_is_capped_at_1_but_raw_score_is_kept(self):
        r = score_application(
            app(device_id="x", device_location="Leeds", sca_result="failed", stated_monthly_income=5000),
            established(
                account_opened_at=NOW - timedelta(days=2),
                recent_application_times=tuple(NOW - timedelta(days=d) for d in (1, 2, 3)),
                typical_monthly_income=1000,
            ),
        )
        self.assertEqual(r.score, 1.0)
        self.assertGreater(r.raw_score, 1.0)
        self.assertEqual(r.decision, Decision.DECLINE)

    def test_response_lists_fired_rules_largest_first(self):
        r = score_application(app(device_id="x", sca_result="failed"), established())
        factors = [x["factor"] for x in r.to_response()["reasoning"]]
        self.assertEqual(factors, ["sca_fail", "device_new"])

    def test_scoring_is_deterministic(self):
        f = established(account_opened_at=NOW - timedelta(days=2))
        self.assertEqual(score_application(app(), f).to_response(), score_application(app(), f).to_response())


class FailSafe(unittest.TestCase):
    def test_fallback_never_approves(self):
        r = fallback_result(app(), "features_unavailable")
        self.assertEqual(r.decision, Decision.MANUAL_REVIEW)
        self.assertEqual(r.to_response()["fallback_reason"], "features_unavailable")

    def test_fallback_still_sees_a_failed_sca(self):
        r = fallback_result(app(sca_result="failed"), "features_unavailable")
        self.assertEqual(fired(r), {"sca_fail": 0.30})
        self.assertEqual(r.decision, Decision.MANUAL_REVIEW)
        self.assertLess(r.confidence, 0.5)


class Performance(unittest.TestCase):
    def test_scoring_takes_well_under_a_millisecond(self):
        a, f = app(), established(recent_application_times=tuple(NOW - timedelta(hours=h) for h in range(50)))
        n = 2000
        start = time.perf_counter()
        for _ in range(n):
            score_application(a, f)
        per_call_ms = (time.perf_counter() - start) * 1000 / n
        self.assertLess(per_call_ms, 1.0, f"{per_call_ms:.3f} ms per score")


class DbtDrift(unittest.TestCase):
    """The dbt project must use the same weights and thresholds as the Lambda."""

    def test_dbt_vars_match_the_ruleset(self):
        yml = (Path(__file__).resolve().parents[2] / "dbt" / "dbt_project.yml").read_text(encoding="utf-8")

        def var(name: str) -> str:
            m = re.search(rf"^\s+{name}:\s*['\"]?([^'\"\s#]+)", yml, re.MULTILINE)
            self.assertIsNotNone(m, f"{name} missing from dbt_project.yml")
            return m.group(1)

        self.assertEqual(var("ruleset_version"), scoring.RULESET_VERSION)
        self.assertEqual(float(var("decline_above")), scoring.DECLINE_ABOVE)
        self.assertEqual(float(var("review_from")), scoring.REVIEW_FROM)
        for factor, weight in scoring.WEIGHTS.items():
            self.assertEqual(float(var(f"weight_{factor}")), weight, factor)
        self.assertEqual(int(var("new_account_days")), scoring.NEW_ACCOUNT_DAYS)
        self.assertEqual(int(var("velocity_window_days")), scoring.VELOCITY_WINDOW_DAYS)
        self.assertEqual(int(var("velocity_max_prior_applications")), scoring.VELOCITY_MAX_PRIOR_APPLICATIONS)
        self.assertEqual(float(var("income_ratio_limit")), scoring.INCOME_RATIO_LIMIT)
        self.assertEqual(int(var("dormant_days")), scoring.DORMANT_DAYS)


if __name__ == "__main__":
    unittest.main()

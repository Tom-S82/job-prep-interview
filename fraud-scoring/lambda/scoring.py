"""
Behavioural fraud scoring for card applications.

thinkmoney's customers are often credit-challenged: bureau scores are missing or
uninformative, so risk is assessed from behaviour instead (how fast someone is
applying, whether their device and location are familiar, whether stated income
matches what actually flows through the account, and so on).

Design principles
-----------------
* Pure and deterministic: no I/O, no clock reads, no randomness. The same inputs
  always give the same decision, which makes the rules testable, replayable in
  batch (dbt) and explainable to an auditor.
* Additive and explainable: each rule that fires adds a fixed weight, and every
  contribution is returned with the evidence behind it.
* Versioned: every decision carries RULESET_VERSION so it can be traced to the
  exact rules that produced it.
* Honest about missing data: a rule that lacks the data it needs is reported as
  "not evaluated" rather than silently treated as low risk, and lowers confidence.

The weights and thresholds below are starting values for calibration, not
fitted parameters. See decision-rules.md for how to calibrate them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Optional

RULESET_VERSION = "2026.10-v1"

# Decision thresholds (score is capped to the range 0–1)
DECLINE_ABOVE = 0.75  # score > 0.75 → decline
REVIEW_FROM = 0.50  # 0.50 ≤ score ≤ 0.75 → manual review; below → approve

# Rule parameters
NEW_ACCOUNT_DAYS = 7  # account younger than this is "new"
VELOCITY_WINDOW_DAYS = 7
VELOCITY_MAX_PRIOR_APPLICATIONS = 2  # more than this many in the window fires the rule
INCOME_RATIO_LIMIT = 1.5  # stated income more than 1.5× typical inflow fires the rule
DORMANT_DAYS = 30  # no activity for longer than this, then an application


class Decision(str, Enum):
    APPROVE = "approve"
    MANUAL_REVIEW = "manual_review"
    DECLINE = "decline"


@dataclass(frozen=True)
class Application:
    """One card application, as received from the app (already schema-validated)."""

    application_id: str
    customer_id: str
    applied_at: datetime  # timezone-aware UTC
    amount: float  # requested limit, GBP
    stated_monthly_income: float  # GBP
    device_id: str
    device_location: str  # coarse location, e.g. "London" or a postcode district
    sca_result: str  # "passed" | "failed" | "not_attempted"


@dataclass(frozen=True)
class CustomerFeatures:
    """
    Precomputed customer context from the feature store.

    Batch jobs rebuild the slow-moving fields nightly from Silver; the application
    timestamps are appended in real time by the scoring Lambda itself.
    Any field may be None when the customer has no history for it.
    """

    account_opened_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None  # last transaction before today
    typical_monthly_income: Optional[float] = None  # mean monthly credits, trailing 90 days
    known_devices: frozenset[str] = field(default_factory=frozenset)
    usual_locations: frozenset[str] = field(default_factory=frozenset)  # seen in the last 90 days
    recent_application_times: tuple[datetime, ...] = ()  # prior applications (not this one)


@dataclass(frozen=True)
class RuleOutcome:
    """The result of evaluating one rule against one application."""

    factor: str
    fired: bool
    evaluated: bool  # False when the data needed was missing
    contribution: float
    evidence: dict[str, Any]


@dataclass(frozen=True)
class Rule:
    factor: str
    weight: float
    description: str  # internal, for documentation and support staff
    evaluate: Callable[[Application, CustomerFeatures], RuleOutcome]


def _outcome(rule_factor: str, weight: float, fired: bool, evaluated: bool = True, **evidence: Any) -> RuleOutcome:
    return RuleOutcome(
        factor=rule_factor,
        fired=fired,
        evaluated=evaluated,
        contribution=weight if fired else 0.0,
        evidence=evidence,
    )


# --- Rules -----------------------------------------------------------------------
# Each rule returns the evidence it used, whether or not it fired, so the decision
# record shows why a rule did NOT fire as well as why one did.


def _new_account(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["new_account"]
    if f.account_opened_at is None:
        # No account record at all is treated as brand new (age 0), and fires.
        return _outcome("new_account", w, True, value=0, unit="days", note="no account history")
    age_days = max(0, (app.applied_at - f.account_opened_at).days)
    return _outcome("new_account", w, age_days < NEW_ACCOUNT_DAYS, value=age_days, unit="days")


def _velocity_spike(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["velocity_spike"]
    window_start = app.applied_at - timedelta(days=VELOCITY_WINDOW_DAYS)
    # The current application is never in this list (it is appended after the decision),
    # so applications at the same instant are other applications and do count.
    prior = sum(1 for t in f.recent_application_times if window_start <= t <= app.applied_at)
    return _outcome(
        "velocity_spike",
        w,
        prior > VELOCITY_MAX_PRIOR_APPLICATIONS,
        count=prior,
        period=f"{VELOCITY_WINDOW_DAYS}_days",
    )


def _device_new(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["device_new"]
    return _outcome("device_new", w, app.device_id not in f.known_devices, known_devices=len(f.known_devices))


def _income_consistency(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["income_consistency"]
    typical = f.typical_monthly_income
    if typical is None or typical <= 0:
        # Not enough account history to compare against: say so, don't guess.
        return _outcome("income_consistency", w, False, evaluated=False, note="no income history")
    ratio = round(app.stated_monthly_income / typical, 2)
    return _outcome("income_consistency", w, ratio > INCOME_RATIO_LIMIT, ratio=ratio, typical_monthly_income=round(typical, 2))


def _dormant_reactivation(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["dormant_reactivation"]
    if f.last_activity_at is None:
        # A customer with no activity yet is new, not dormant.
        return _outcome("dormant_reactivation", w, False, evaluated=False, note="no activity history")
    idle_days = max(0, (app.applied_at - f.last_activity_at).days)
    return _outcome("dormant_reactivation", w, idle_days > DORMANT_DAYS, days_inactive=idle_days)


def _sca_fail(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["sca_fail"]
    if app.sca_result == "not_attempted":
        return _outcome("sca_fail", w, False, evaluated=False, sca_result=app.sca_result)
    return _outcome("sca_fail", w, app.sca_result == "failed", sca_result=app.sca_result)


def _location_unusual(app: Application, f: CustomerFeatures) -> RuleOutcome:
    w = WEIGHTS["location_unusual"]
    if not f.usual_locations:
        return _outcome("location_unusual", w, False, evaluated=False, note="no location history")
    return _outcome("location_unusual", w, app.device_location not in f.usual_locations, location=app.device_location)


# Weights: the single place a weight is defined. dbt reads the same values from
# dbt_project.yml vars, and a test fails if the two ever drift apart.
WEIGHTS: dict[str, float] = {
    "new_account": 0.25,
    "velocity_spike": 0.35,
    "device_new": 0.15,
    "income_consistency": 0.20,
    "dormant_reactivation": 0.20,
    "sca_fail": 0.30,
    "location_unusual": 0.10,
}

RULES: tuple[Rule, ...] = (
    Rule("new_account", WEIGHTS["new_account"], f"Account opened less than {NEW_ACCOUNT_DAYS} days ago", _new_account),
    Rule(
        "velocity_spike",
        WEIGHTS["velocity_spike"],
        f"More than {VELOCITY_MAX_PRIOR_APPLICATIONS} prior applications in {VELOCITY_WINDOW_DAYS} days",
        _velocity_spike,
    ),
    Rule("device_new", WEIGHTS["device_new"], "Device not previously seen for this customer", _device_new),
    Rule(
        "income_consistency",
        WEIGHTS["income_consistency"],
        f"Stated income more than {INCOME_RATIO_LIMIT}x typical monthly inflow",
        _income_consistency,
    ),
    Rule("dormant_reactivation", WEIGHTS["dormant_reactivation"], f"No activity for more than {DORMANT_DAYS} days", _dormant_reactivation),
    Rule("sca_fail", WEIGHTS["sca_fail"], "Strong customer authentication failed during the application", _sca_fail),
    Rule("location_unusual", WEIGHTS["location_unusual"], "Device location not seen for this customer in 90 days", _location_unusual),
)


# --- Decision ----------------------------------------------------------------------

RECOMMENDED_ACTION = {
    Decision.APPROVE: "Approve",
    Decision.MANUAL_REVIEW: "Hold for manual review (target: same working day)",
    Decision.DECLINE: "Decline with offer of manual review",
}

# What support may tell the customer. Deliberately general: revealing the exact
# rules would teach fraudsters how to avoid them.
CUSTOMER_MESSAGE = {
    Decision.APPROVE: "Your application has been approved.",
    Decision.MANUAL_REVIEW: "We need to run a few quick checks on your application. We'll be in touch shortly.",
    Decision.DECLINE: "We can't approve your application right now. You can ask us to review this decision.",
}


@dataclass(frozen=True)
class ScoreResult:
    application_id: str
    decision: Decision
    score: float  # capped at 1.0
    raw_score: float  # uncapped sum of contributions
    confidence: float  # share of rules that had the data they needed
    outcomes: tuple[RuleOutcome, ...]
    ruleset_version: str = RULESET_VERSION
    fallback_reason: Optional[str] = None

    def to_response(self) -> dict[str, Any]:
        """The API response: fired rules first (largest contribution first), then the rest."""
        fired = sorted((o for o in self.outcomes if o.fired), key=lambda o: -o.contribution)
        return {
            "application_id": self.application_id,
            "decision": self.decision.value,
            "score": self.score,
            "raw_score": self.raw_score,
            "confidence": self.confidence,
            "reasoning": [{"factor": o.factor, **o.evidence, "contribution": o.contribution} for o in fired],
            "not_evaluated": [o.factor for o in self.outcomes if not o.evaluated],
            "recommended_action": RECOMMENDED_ACTION[self.decision],
            "customer_message": CUSTOMER_MESSAGE[self.decision],
            "ruleset_version": self.ruleset_version,
            **({"fallback_reason": self.fallback_reason} if self.fallback_reason else {}),
        }


def decide(score: float) -> Decision:
    if score > DECLINE_ABOVE:
        return Decision.DECLINE
    if score >= REVIEW_FROM:
        return Decision.MANUAL_REVIEW
    return Decision.APPROVE


def score_application(app: Application, features: CustomerFeatures) -> ScoreResult:
    """Evaluate every rule and turn the total into a decision. Pure: no I/O."""
    outcomes = tuple(rule.evaluate(app, features) for rule in RULES)
    raw = round(sum(o.contribution for o in outcomes), 4)
    score = round(min(1.0, raw), 4)
    confidence = round(sum(1 for o in outcomes if o.evaluated) / len(outcomes), 2)
    return ScoreResult(
        application_id=app.application_id,
        decision=decide(score),
        score=score,
        raw_score=raw,
        confidence=confidence,
        outcomes=outcomes,
    )


def fallback_result(app: Application, reason: str) -> ScoreResult:
    """
    Fail safe when customer features cannot be read in time.

    Rules that only need the request are still evaluated (so a failed SCA is still
    visible), but the decision is never an automatic approval without context:
    it is at least MANUAL_REVIEW, and a decline if the request alone scores that high.
    """
    # Only rules that need nothing but the request can run; everything else is "not evaluated".
    request_only_rules = {"sca_fail"}
    outcomes = tuple(
        rule.evaluate(app, CustomerFeatures())
        if rule.factor in request_only_rules
        else RuleOutcome(rule.factor, False, False, 0.0, {"note": "features unavailable"})
        for rule in RULES
    )
    raw = round(sum(o.contribution for o in outcomes), 4)
    score = round(min(1.0, raw), 4)
    return ScoreResult(
        application_id=app.application_id,
        decision=Decision.DECLINE if score > DECLINE_ABOVE else Decision.MANUAL_REVIEW,
        score=score,
        raw_score=raw,
        confidence=round(sum(1 for o in outcomes if o.evaluated) / len(outcomes), 2),
        outcomes=outcomes,
        fallback_reason=reason,
    )

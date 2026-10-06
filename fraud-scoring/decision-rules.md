# Card application fraud rules (ruleset `2026.10-v1`)

Behavioural scoring for card applications at thinkmoney. Many customers are credit-challenged, so bureau scores are missing or uninformative; risk is assessed from **how the customer behaves**, not their credit file.

- **Real time:** [`lambda/fraud_scoring_lambda.py`](lambda/fraud_scoring_lambda.py) scores each application in the request, with the rules in [`lambda/scoring.py`](lambda/scoring.py).
- **Batch:** [`dbt/models/gold/decisions.sql`](dbt/models/gold/decisions.sql) re-scores every application hourly with the same rules, for audit, reconciliation and calibration.
- **One ruleset:** weights and thresholds are defined in `scoring.py` and mirrored in `dbt/dbt_project.yml` vars. A unit test fails if they ever differ.

## How a score becomes a decision

Each rule that fires adds its weight. The total is capped at 1.0 (the uncapped `raw_score` is kept for analysis).

| Score        | Decision          | What happens                                       |
| ------------ | ----------------- | -------------------------------------------------- |
| above 0.75   | **decline**       | Decline with an offer of manual review             |
| 0.50 to 0.75 | **manual_review** | Held for the fraud team (target: same working day) |
| below 0.50   | **approve**       | Approved                                           |

**Confidence** is the share of the 7 rules that had the data they needed. A brand-new customer has no income history, so income consistency is _not evaluated_ (not assumed safe) and confidence is 6/7 = 0.86.

**Fail safe:** if the feature store can't be read in time, the decision is never an automatic approval. It is `manual_review`, or `decline` if the request alone scores that high, with `fallback_reason: features_unavailable`.

## The rules

| Rule                   | Fires when                                                   | Weight | Why it signals risk                                                                                        | Data needed                                 |
| ---------------------- | ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `new_account`          | account opened less than 7 days ago (or no account record)   | 0.25   | Fraudsters open accounts to exploit them quickly; genuine customers rarely need credit in their first week | account opening date                        |
| `velocity_spike`       | more than 2 other applications in the last 7 days            | 0.35   | "Fishing" for credit: repeated attempts to find what gets approved                                         | application history                         |
| `device_new`           | device never seen for this customer                          | 0.15   | Account takeover often starts from a new device                                                            | device history                              |
| `income_consistency`   | stated monthly income more than 1.5× typical monthly inflow  | 0.20   | Inflated income to obtain a bigger limit                                                                   | 30+ days of transactions                    |
| `dormant_reactivation` | no activity for more than 30 days, then an application       | 0.20   | Dormant accounts are targets for takeover                                                                  | transaction history                         |
| `sca_fail`             | strong customer authentication failed during the application | 0.30   | The person applying couldn't prove they control the account                                                | SCA result (not evaluated if not attempted) |
| `location_unusual`     | location not seen for this customer in 90 days               | 0.10   | Weak alone (people travel), useful alongside other signals                                                 | 90 days of sightings                        |

**Feature definitions** (shared by the Lambda's feature store and the batch re-score, in [`dbt/macros/features.sql`](dbt/macros/features.sql)):

- **Elapsed days:** whole days elapsed (floor), not calendar-day boundaries. 4 days 20 hours counts as 4.
- **Typical monthly income:** credits in the last 90 days, divided by the months of history actually covered. Dividing by a full 3 months for a 40-day-old account would understate income and unfairly flag newer customers. Not evaluated below 30 days of history.
- **Velocity:** counts other applications by the same customer in the 7 days up to and including this one.

## Example scenarios

These are the exact outputs of `python lambda/examples/run_examples.py`. The batch model produces the same scores from the sample Silver data in `dbt/seeds`.

### Scenario 1: new customer, low risk → **approve** (score 0.40)

The account was opened on the web 3 days ago, and the customer is now applying from a new phone.

| Factor               | Evidence                               | Contribution                        |
| -------------------- | -------------------------------------- | ----------------------------------- |
| new_account          | 3 days                                 | +0.25                               |
| device_new           | 1 known device (the web browser)       | +0.15                               |
| _income_consistency_ | _not evaluated: no income history yet_ | –                                   |
| **Total**            |                                        | **0.40 → approve**, confidence 0.86 |

A new account on a new device is normal for a first application, and nothing else is unusual. Two "new" signals together still approve. That is deliberate: penalising every new customer would fail the people thinkmoney exists to serve.

### Scenario 2: high velocity, new device → **decline** (score 1.00, raw 1.15)

The account is 4 days old, this is the 4th application in a week, the device and location have never been seen, and SCA failed.

| Factor           | Evidence                       | Contribution       |
| ---------------- | ------------------------------ | ------------------ |
| velocity_spike   | 3 prior applications in 7 days | +0.35              |
| sca_fail         | SCA failed                     | +0.30              |
| new_account      | 4 days                         | +0.25              |
| device_new       | not among 1 known device       | +0.15              |
| location_unusual | Birmingham (usually Leeds)     | +0.10              |
| **Total**        | raw 1.15, capped               | **1.00 → decline** |

### Scenario 3: dormant account reactivated → **manual review** (score 0.55)

A customer since 2023, quiet for 69 days, now applying from a new device and stating income well above what flows through the account.

| Factor               | Evidence                                     | Contribution                             |
| -------------------- | -------------------------------------------- | ---------------------------------------- |
| income_consistency   | stated £2,600 vs typical £1,450 (ratio 1.79) | +0.20                                    |
| dormant_reactivation | 69 days inactive                             | +0.20                                    |
| device_new           | not the usual device                         | +0.15                                    |
| **Total**            |                                              | **0.55 → manual review**, confidence 1.0 |

This is exactly what manual review is for: each signal has an innocent explanation (a new phone, a new job, time away), but together they are worth a human look.

### Scenario 4: established customer, everything familiar → **approve** (score 0.00)

Every rule has its data and none fire, so confidence is 1.0.

## Calibration notes

**The weights and thresholds are starting values, not fitted parameters.** There is no historical outcome data behind them yet. In the interview, say so; claiming "historically 0.75 worked" without data would not survive a follow-up question.

How they should be calibrated once decisions are flowing:

1. **Label outcomes.** Join `gold.decisions` to confirmed fraud and charge-off events, and to manual-review outcomes.
2. **Back-test.** `gold.decisions` stores every rule's inputs and outputs, so any alternative weight or threshold can be replayed over history in SQL. For each candidate, compare fraud caught, good customers declined, and review volume.
3. **Set thresholds against capacity and harm.** The review band (0.50–0.75) should produce the volume the fraud team can handle the same day. The decline threshold should balance fraud losses against declining genuine, often financially vulnerable, customers.
4. **Check the rules are independent.** `new_account` and `device_new` are correlated: almost every new customer is on a new device. Additive scoring double-counts correlated signals. If labelled data shows this matters, reduce one weight or combine them.
5. **Graduate when the data supports it.** With enough labels, a logistic regression over the same features gives fitted weights while staying explainable. Keep this rules engine as the fallback and the challenger baseline.

**Why additive and capped?** It's simple to explain to support staff, customers and the FCA: "these four things added up to 0.82". The cap keeps the score in 0–1. A probabilistic combination (1 − Π(1 − wᵢ)) would avoid the cap but is harder to explain; revisit only if calibration shows the additive model mis-ranks risk.

## Fairness and customer outcomes (Consumer Duty)

thinkmoney's customers are more likely to have irregular income, shared or second-hand phones, and gaps in activity. Every behavioural rule can therefore fall harder on genuine customers in difficult circumstances. The safeguards:

- **"Not evaluated" is not "risky":** missing history lowers confidence, never adds risk (except `new_account`, by design).
- **Review before decline:** most combinations land in manual review, not decline, and every decline offers a review.
- **Location is coarse and weakly weighted,** because postcode-level location can act as a proxy for protected characteristics.
- **Monitor outcomes by segment** (see below), including approval rates for customers flagged as vulnerable.
- **Explain without revealing rules:** support staff see the reasons; customers get a general message ("we need to run a few quick checks"). Telling customers exactly which rules fired would teach fraudsters how to avoid them.

## Monitoring: how do we know it's working?

| Signal                                                    | Where                                                                | Healthy looks like            | Action if not                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------- |
| Decline / review / approve rates, daily and 7-day rolling | `gold.decision_summary`                                              | stable week on week           | investigate a step change: new fraud pattern, data issue or ruleset change                |
| Review overturn rate (reviews the team approves)          | `gold.decision_summary.review_overturn_rate`                         | moderate                      | very high: rules too strict for these customers; very low: review band could decline more |
| Same-day review rate                                      | `gold.decision_summary.review_same_day_rate`                         | near 100%                     | review band too wide for team capacity                                                    |
| Real-time vs batch agreement                              | `gold.decision_reconciliation`, test `assert_realtime_matches_batch` | ≥ 95% per day                 | drift between feature store and batch, or a ruleset mismatch                              |
| Fallback decisions                                        | CloudWatch metric `FraudScoring/Fallbacks`                           | near zero                     | feature store latency or availability incident                                            |
| Latency                                                   | CloudWatch `FraudScoring/LatencyMs`, Lambda Duration p99             | p99 well under 200 ms         | provisioned concurrency, timeouts, DynamoDB capacity                                      |
| Average confidence                                        | `gold.decision_summary.avg_confidence`                               | stable                        | feature pipeline not populating a feature                                                 |
| Fraud caught vs genuine customers declined                | outcome labels joined to `gold.decisions`                            | improving per ruleset version | recalibrate (see above)                                                                   |

## Performance

**Measured locally** (Python 3.12, `python lambda/examples/benchmark.py`, 5,000 iterations):

| What                                              | p50      | p99      |
| ------------------------------------------------- | -------- | -------- |
| Scoring only (`score_application`)                | 0.011 ms | 0.015 ms |
| Full handler, in-memory dependencies (no network) | 0.085 ms | 0.17 ms  |

The code itself uses well under 1% of the 200 ms budget. **End-to-end latency is dominated by network calls and must be measured in AWS.** The design budget:

| Stage                                     | Budget    |
| ----------------------------------------- | --------- |
| API Gateway to Lambda                     | ~10–30 ms |
| Feature store read (DynamoDB GetItem)     | ~5–15 ms  |
| Scoring                                   | < 1 ms    |
| Record decision (conditional PutItem)     | ~5–15 ms  |
| Publish to Kinesis (best effort)          | ~10–30 ms |
| Velocity update (UpdateItem, best effort) | ~5–15 ms  |

**How to get the real numbers:** CloudWatch Lambda `Duration` (p50/p99), the `FraudScoring/LatencyMs` metric the handler emits, the per-stage `timings_ms` in each log line, and X-Ray traces for the AWS SDK calls. The main risk to the budget is cold starts, so use provisioned concurrency for this function. SDK timeouts are set short (0.2 s connect, 0.3 s read) so a slow dependency triggers the fallback rather than a timeout.

## Governance

- **Versioned:** every decision carries `ruleset_version`. A rule change is a pull request that bumps the version in `scoring.py` and `dbt_project.yml` together (the drift test enforces it), with a back-test attached.
- **Shadow first:** a new ruleset runs alongside the live one (scored, not acted on) and is compared in `gold.decisions` before it goes live.
- **Owned:** the fraud team owns the rules and thresholds; the data team owns the platform, tests and reconciliation.
- **Auditable:** each decision record stores every rule's inputs, whether it fired and whether it could be evaluated, so any decision can be explained months later.

## Notes on the original brief

- **Scores can exceed 1.0:** the seven weights sum to 1.55, so the score is capped at 1.0 and `raw_score` keeps the uncapped total.
- **Income contribution:** the brief's example output showed `income_consistency` contributing 0.07; the rule as specified adds 0.20, which is what this implementation does.
- **Confidence:** the brief didn't define it; here it is the share of rules with the data they needed.
- **Handler file name:** the brief named it `fraud-scoring-lambda.py`, but Python can't import a module with hyphens, so it is `fraud_scoring_lambda.py` (handler `fraud_scoring_lambda.handler`).
- **Performance figures:** the brief quoted "avg 180 ms, p99 280 ms". Those weren't measured (and 280 ms would miss the target); the figures above are the ones that were.

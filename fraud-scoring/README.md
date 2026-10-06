# Fraud scoring pipeline (interview reference)

Behavioural fraud scoring for card applications at thinkmoney: a real-time AWS Lambda and a dbt batch layer that use **the same rules**, plus the documentation to explain them.

Start with **[decision-rules.md](decision-rules.md)**: the rules, worked examples, calibration, fairness, monitoring and performance.

```
fraud-scoring/
  decision-rules.md            rules, examples, calibration, monitoring, performance
  lambda/
    scoring.py                 the rules engine: pure, deterministic, no dependencies
    fraud_scoring_lambda.py    Lambda handler: validate, read features, score, record, publish
    local_deps.py              in-memory AWS stand-ins for tests and examples
    tests/                     34 unit tests (rules, thresholds, handler, fail-safe, dbt drift)
    examples/
      scenarios.json           example applications + feature-store items
      run_examples.py          "what would we decide for customer X?"
      benchmark.py             local latency measurement
  dbt/
    dbt_project.yml            ruleset vars (mirrors scoring.py; drift-tested)
    macros/features.sql        shared feature definitions
    models/gold/
      decisions.sql            incremental: one row per application, re-scored as at application time
      decision_reconciliation.sql  real-time vs batch decisions
      decision_summary.sql     daily counts, rates, scores, review outcomes
      customer_features.sql    feature-store snapshot exported to DynamoDB
    tests/                     score range, no future dates, completeness, reconciliation
    seeds/                     sample Silver data (local runs and CI only)
```

## Run it

**Lambda (Python 3.12+, standard library only):**

```bash
cd fraud-scoring/lambda
python -m unittest discover -s tests -v     # 34 tests
python examples/run_examples.py             # all scenarios
python examples/run_examples.py APP_10003   # one application
python examples/benchmark.py                # local latency
```

**dbt (dbt-core 1.10+; Redshift in production, DuckDB locally):**

```bash
pip install "dbt-core~=1.10.0" "dbt-duckdb~=1.9.0"
cd fraud-scoring/dbt
cp profiles.example.yml ~/.dbt/profiles.yml   # or use --profiles-dir
dbt build --target local                      # seeds, 4 models, 28 tests on DuckDB
```

Verified locally: `dbt build` passes 38/38 (6 seeds, 4 models, 28 tests), an incremental re-run passes, and the batch scores match the Lambda's for every reconciled application. `dbt source freshness` is a production check: on the sample data it will report the seeds as stale.

## Deploy (outline)

- **Lambda:** Python 3.12 runtime; package `scoring.py` and `fraud_scoring_lambda.py`; handler `fraud_scoring_lambda.handler`; provisioned concurrency; environment `FEATURE_TABLE`, `DECISIONS_TABLE`, `DECISION_STREAM`.
- **IAM (least privilege):** `dynamodb:GetItem` and `UpdateItem` on the feature table, `PutItem` and `GetItem` on the decisions table, `kinesis:PutRecord` on the stream. Nothing else.
- **DynamoDB:** feature table keyed by `customer_id` (populated nightly from `gold.customer_features`); decisions table keyed by `application_id`, with Streams enabled as a durability backstop for Kinesis.
- **dbt:** run hourly after the CDC merge into Silver (Step Functions), with `dbt build --select fraud_scoring`.

## In the interview

> "Our customers are often credit-challenged, so scoring is behavioural: new account +0.25, velocity spike +0.35, SCA failure +0.30, new device +0.15, and so on. Each rule that fires adds its weight; above 0.75 we decline, 0.50 to 0.75 goes to manual review. The Lambda scores inside the request, against precomputed features, and the code itself takes a fraction of a millisecond, so the 200 ms budget is all network. Every decision is recorded with the evidence for each rule, so support can explain it and the batch layer can re-score and reconcile it. The weights are starting values; once outcomes are labelled we back-test and calibrate, and we watch approval rates for vulnerable customers, because behavioural signals can fall harder on people in difficult circumstances."

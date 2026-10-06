# Build Step 009: Fraud Scoring Pipeline for thinkmoney

## Context
thinkmoney serves underbanked customers (credit-challenged). No credit scores available or useful.
Risk assessment is purely behavioral:
- Velocity (how fast are they trying things?)
- Consistency (stated income vs actual spending)
- Device/location signals (new device? unusual location?)
- Account history (dormant reactivation? multiple applications?)
- SCA/3DS responses (can they verify?)
- Application patterns (fishing for credit?)

## Scope: Build Working Code

Generate THREE integrated pieces:

### 1. Lambda Function: Real-Time Application Scoring
File: `fraud-scoring-lambda.py`

Requirements:
- Takes application data (customer_id, amount, device, income, etc.)
- Queries Feature Store for customer context (account age, velocity, history)
- Computes risk score with explainable rules
- Returns decision (approve/decline/manual_review) + reasoning
- Logs decision to DynamoDB (Feature Store)
- Publishes to Kinesis (for durability)
- Latency target: <200ms

Scoring rules (thinkmoney-specific):
- **New account** (<7 days): +0.25 to risk
- **Velocity spike** (>2 applications/week): +0.35 to risk
- **New device**: +0.15 to risk
- **Income consistency** (stated vs typical): if ratio >1.5, +0.20 to risk
- **Dormant reactivation** (quiet >30 days, now active): +0.20 to risk
- **SCA fail**: +0.30 to risk
- **Device location** (unusual): +0.10 to risk

Decision thresholds:
- Score > 0.75: DECLINE
- Score 0.50–0.75: MANUAL_REVIEW
- Score < 0.50: APPROVE

Output format:
```python
{
    "application_id": "APP_12345",
    "decision": "decline",
    "score": 0.82,
    "confidence": 0.91,
    "reasoning": [
        {"factor": "new_account", "value": 5, "contribution": 0.25},
        {"factor": "velocity_spike", "count": 3, "period": "7_days", "contribution": 0.35},
        {"factor": "device_new", "contribution": 0.15},
        {"factor": "income_consistency", "ratio": 1.87, "contribution": 0.07}
    ],
    "recommended_action": "Decline with offer of manual review"
}
```

### 2. dbt Models: Batch Scoring & Analysis
Files: `models/gold/decisions.sql`, `models/gold/decision_analysis.sql`

Requirements:
- Incremental model: `gold.decisions` (one row per application)
  - Joins: applications + customers + account history + device history
  - Computes all risk factors
  - Records decision, score, reasoning
  - Refresh: hourly (after CDC arrives)

- Aggregate model: `gold.decision_summary` (daily)
  - Count by decision type (approve/decline/manual)
  - Average score by decision
  - Decline rate trends
  - Manual review resolution rate

- Tests:
  - Each application has exactly one decision
  - Score between 0–1
  - No future dates
  - Reconciliation: batch decisions match Lambda decisions (where captured)

### 3. Documentation: Rules + Examples
File: `decision-rules.md`

Requirements:
- Table: Each rule, its rationale, its weight
- Example scenarios:
  - **Scenario 1: New customer, low risk** (approve)
  - **Scenario 2: High velocity, new device** (decline)
  - **Scenario 3: Dormant account reactivated** (manual review)
- Calibration notes: "Why 0.75 threshold? Because historically..."
- Monitoring: "How do we know if this is working?"

---

## Output

- `fraud-scoring-lambda.py`: production-ready Lambda
- `models/gold/decisions.sql` + tests: dbt model
- `decision-rules.md`: documented rules
- Example invocations: "What would we decide for customer X?"
- Performance notes: "Lambda avg 180ms, p99 280ms"

---

## Interview Usage

You can say:
> "I built a fraud scoring pipeline in Claude Code. It's behavior-based (no credit scores) because our customer base is credit-challenged. The Lambda scores in real-time for support staff visibility, and dbt processes batch decisions for analysis. Here's the logic: new account +0.25, velocity spike +0.35, device new +0.15... We threshold at 0.75 for decline. The reasoning is logged so support can explain to customers why we flagged them."

---

## Calibration

This teaches:
- How to design scoring without traditional credit data
- Trade-off between simplicity and accuracy (8 rules vs 50)
- Real-time (Lambda) vs batch (dbt)
- Explainability (every factor contributes to the score)
- Governance (rules are versioned, tested, documented)
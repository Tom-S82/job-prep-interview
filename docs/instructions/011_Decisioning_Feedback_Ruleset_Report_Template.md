Iteration 11 Prompt: Decisioning Feedback Loop, Ruleset Management & Report Governance

Add three features to the interview prep site:

1. Update Decisioning Pipeline Diagram

Add a dashed return arrow from Lambda Scorer back to "Application" labeled "sync decision (< 200ms)". This clarifies the customer-facing decision is synchronous while Kinesis publishing is async.
Add a new box after Feature Store called "Fraud Rules Config (dbt model)" to show where rule weights, thresholds, and rule definitions live. Show it feeding the Lambda alongside the Feature Store. This visualizes that rules are versioned, auditable, and live in the medallion.

2. Create a New Page: "Report Standards"
Use the mockup provided as the template. Create a page showing a standardized report layout:

Header: Logo, "ID - ReportName" format (e.g. "2501 - Fraud Decisioning Summary"), run date
Purpose section: Describes what the report does
Parameters section: Filters / scope (date range, region, rule version)
Key metrics displayed as cards (approval rate, manual review rate, decline rate, Lambda-vs-batch reconciliation)
A tabbed "Data & Lineage" section with:
Data dictionary (fraud_score, confidence, decision, rule_*) with definitions
Lineage showing how metrics flow from Lambda → Kinesis → dbt → gold table
Sources section listing Feature Store, DynamoDB, etc.
Footer: Report category, last refresh time, page number
The point: Users reference "the 2501" instead of "which fraud report?" — ID-based governance.

3. Navigation Update
Add a 4th tab to the site header linking to this new Report Standards page.

Acceptance criteria:

Decisioning Pipeline shows both sync and async paths clearly
Fraud Rules Config is visible as a dbt model feeding the Lambda
Report Standards page is visually professional, mirrors the mockup, and demonstrates governance thinking
All existing pages (Track 1, Track 2, Interview Mode, Challenge, Speak) still work
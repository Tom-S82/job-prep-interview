# Build Step 006: Architecture Challenge Mode (Enhanced)

## Vision
Interactive scenario-based learning where user solves **thinkmoney business problems** by designing platform changes. Each scenario teaches decision-making by forcing trade-off thinking at three levels:
1. **High-level approach** (what's your strategy?)
2. **Detailed design** (which tools, why those, backups?)
3. **Reasoning** (when would this fail? What would you do then?)

## Part A: Core Interaction Flow

### Start
- User clicks "Architecture Challenge"
- Scenario picker: 8 real thinkmoney problems (see Part C)
- User picks one, reads the business context

### Design Phase (User Input)
User designs a solution by answering **three levels of questions**:

**Level 1: High-Level Approach (Free text)**
> "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet—what's your strategy?"

Example prompt for "Real-time fraud detection":
- Are you adding to existing Kinesis/Firehose, or new parallel stream?
- Does fraud logic go in transit (Lambda), at Silver layer (Spark), or in MCP semantic layer?
- How do you communicate verdicts back to the product?

**Level 2: Detailed Design (Guided multiple-choice + reasoning)**
> "Now let's dig deeper. For each decision, pick your choice AND explain why."

Example (for Fraud Detection):
Q1: Where does fraud-detection compute happen?
A) Lambda on Kinesis stream (low latency, limited logic)
B) Spark job at Silver layer (rich context, batch latency)
C) Both (dual-write, complex)

Your choice: [pick A/B/C]
Why? [free text]

Q2: How do you store fraud verdicts?
A) Alongside transaction in Silver (fast, tight coupling)
B) Separate fraud_verdicts table (loose coupling, easier to iterate)
C) Both

Your choice: [pick]
Why? [free text]


**Level 3: Trade-offs & Constraints (Reflection)**
> "Where would your design break? What would you do then?"

Example prompts:
- "Your fraud-detection Lambda times out on spike traffic. How do you handle that?"
- "The fraud team wants to change rules every day. Does your design support that?"
- "You need to audit every fraud decision for compliance. How?"

### Compare Phase (Expert Answer)
After user submits, show:

**1. Your Approach** (read-only, what they entered)

**2. Expert Answer** (color-coded comparison)

Level 1: Strategy
─────────────────
Your answer: [their text]

Expert answer: [your real answer]

✅ You nailed: [what they got right]
⚠️ Consider: [what they could improve]
❌ Gap: [what they missed]

Trade-off they made well: [acknowledge depth]


**3. Deeper Reasoning** (the "why" teaching)

Why did the Lead choose Option B (Spark at Silver)?

Gives fraud team access to full customer context (not just txn)
Verdicts loop back to Validation layer (prevents bad txns)
Fits the medallion pattern (compute at each layer)
But: introduces 5-minute latency (acceptable for risk, not for decline)

When would you use Option A instead?

If fraud verdicts must affect real-time product UX
You'd need to parallelize: Kinesis → Lambda for immediate deny,
plus Spark for deeper investigation + feedback loop
Cost tradeoff: dual-stream, dual-logic (maintenance burden)

**4. Feedback Score** (not pass/fail, but guidance)

Depth of thinking: ⭐⭐⭐⭐ (You considered governance)
Trade-off awareness: ⭐⭐⭐ (Good on latency, didn't mention cost)
Alignment w/ thinkmoney: ⭐⭐⭐⭐⭐ (Fits their world perfectly)

Overall: This would work. Two questions to dig deeper:

How does your design handle the SSIS→Kinesis migration?
Who owns fraud rules—Product or Data?

**5. Follow-Up Questions** (optional deeper dives)

Want to explore this more?

"What if fraud rules change hourly?" → tests flexibility
"How do you A/B test fraud models?" → tests governance
"Show me the data flow for one fraud verdict" → tests detail

### Save & Reflect
- "Save your design" button → stores attempt
- "Try another scenario" button → loops back

---

## Part B: UI/UX

### Layout

┌─ Architecture Challenge ──────────────────────┐
│ │
│ Scenario: Real-time Fraud Detection │
│ Context: "Fraud team needs to reject │
│ bad txns in <2s. Current: batch │
│ daily. Design a better way." │
│ │
│ ┌─ Your Design ─────────────────────────┐ │
│ │ Level 1: High-Level Approach │ │
│ │ [text area - 3-5 bullets] │ │
│ │ │ │
│ │ Level 2: Detailed Choices │ │
│ │ [guided multi-choice + reasoning] │ │
│ │ │ │
│ │ Level 3: Trade-offs │ │
│ │ [guided prompts] │ │
│ │ │ │
│ │ [Submit] [Save Draft] │ │
│ └────────────────────────────────────────┘ │
│ │
└───────────────────────────────────────────────┘


After submit:

┌─ Expert Feedback ──────────────────────────┐
│ │
│ Your Approach vs Expert Answer │
│ ✅ ⚠️ ❌ [colored comparison] │
│ │
│ Why the Lead chose this: │
│ [narrative explanation + trade-offs] │
│ │
│ Depth Score: ⭐⭐⭐⭐ │
│ │
│ Follow-up Questions: │
│ • "What if rules change hourly?" │
│ • "How do you A/B test?" │
│ │
│ [Try Follow-up] [Next Scenario] │
│ │
└──────────────────────────────────────────────┘


---

## Part C: Scenarios (8 Real thinkmoney Problems)

### 1. Real-time Fraud Detection
**Context:** Fraud team currently reviews flagged txns daily (batch). Product wants in-app fraud warnings in <2 seconds. Current platform can't support this.

**Your design should address:**
- Where compute happens (latency vs richness trade-off)
- How verdicts feed back to product
- How fraud team iterates rules
- SSIS involvement (if any)

**Expert answer talks about:** Kinesis + Lambda for immediate deny, Spark at Silver for feedback loop, semantic layer for rule iteration.

### 2. Build a Self-Serve Data Access Layer (MCP Semantic Layer)
**Context:** Data Scientists and BAs constantly ask for "customer [X]" queries. Data team manually writes SQL. Slow, error-prone, not scalable.

**Your design should address:**
- What is the "semantic layer" (metrics + governance)?
- How do users query it (SQL, natural language, both)?
- How do you prevent them querying sensitive data?
- How does the MCP server fit in?

**Expert answer talks about:** Redshift views + MCP server, metric definitions, row-level security, audit logging.

### 3. Migrate Legacy SSIS to Cloud (Keep What Works, Replace What Doesn't)
**Context:** You have 50k SSIS jobs. Some are rock-solid (CDC from SQL Server), others are fragile (complex transformations, no monitoring). You have 18 months to migrate. Budget exists. How?

**Your design should address:**
- What stays (CDC, simple ETL)?
- What moves to Kinesis (real-time)?
- What moves to Spark/Glue (transformations)?
- How do you migrate without downtime?
- What about dbt?

**Expert answer talks about:** Keep CDC (works), add Kinesis for new events, move transformations to Glue/dbt, parallel run period, monitoring.

### 4. Data Scientist Needs Clean Data in 24h (Current Platform Can't Deliver)
**Context:** New DS joined Monday. Needs cleaned transaction data for ML model by Tuesday. Current medallion is slow/incomplete. What's your quickfix vs long-term fix?

**Your design should address:**
- Quick path to data (this week)?
- What "clean" means (joins, deduping, aggregates)?
- How does this integrate into medallion long-term?
- Who owns the cleanness contract?

**Expert answer talks about:** Quick path: manual SQL + annotation, data contracts, feedback loop, making DS self-serve over time.

### 5. Power BI Dashboards Are Slow (Query Times >10s)
**Context:** Finance team's monthly revenue dashboard takes 30 seconds. Queries are hitting raw Silver tables (no pre-aggregation). How do you fix it?

**Your design should address:**
- Aggregate vs index vs caching strategy?
- Does Gold help? Iceberg materialized views?
- Who owns the slow query (Data or BI)?
- How do you prevent future slow dashboards?

**Expert answer talks about:** Gold layer aggregates, Redshift materialized views, monitoring, BI/Data partnership.

### 6. GDPR Deletion Request: A Customer Wants All Data Erased (Within 30 Days)
**Context:** EU customer invokes GDPR Article 17 (right to be forgotten). You have 30 days. Data is in SQL Server, S3, Redshift, backups. How do you handle it without corrupting referential integrity?

**Your design should address:**
- Tokenization vs masking vs deletion?
- How do you find all instances (lineage)?
- What about historical aggregates?
- Audit trail (who deleted what, when, why)?

**Expert answer talks about:** Crypto-shredding (surrogate keys), pseudonymization, versioned deletion trail, retention policies.

### 7. Streaming Events from Mobile App (Clickstream, Device, Location)
**Context:** Mobile team wants to stream user actions (tap, swipe, view) to analytics in real-time. 10k events/sec, each 2KB. How do you ingest, store, and make usable?

**Your design should address:**
- Ingestion tool (Kinesis, Kafka)?
- Raw storage format (JSON, Parquet, Avro)?
- How long to keep raw (cost)?
- How do you aggregate for dashboards?

**Expert answer talks about:** Firehose to S3/Iceberg (simple, cheap, batch-friendly), aggregate at Silver/Gold (real-time dashboards optional), retention policy.

### 8. Data Quality SLA for Downstream APIs
**Context:** Product engineering team pulls data via API (customers, accounts, transactions). Occasionally API returns stale data (>5 min old). They want SLA: fresh within 3 minutes or error. How?

**Your design should address:**
- Where's the freshness bottleneck (ingestion, transforms, API)?
- How do you monitor it?
- What's your alerting strategy?
- Fallback when SLA breaks?

**Expert answer talks about:** Watermarking, CloudWatch metrics, data quality checks, fallback to cache or static default.

---

## Part D: Implementation Details

### Data Structure
```typescript
interface ArchitectureScenario {
  id: string;
  title: string;
  context: string; // markdown
  businessContext: string; // why does this matter?
  
  level1Prompt: string; // "What's your high-level strategy?"
  level1Expert: string; // markdown answer
  
  level2Choices: {
    question: string;
    options: Array<{ text: string; label: string }>;
    expert: string; // "Here's why the Lead would choose X"
  }[];
  
  level3Prompts: Array<{
    question: string; // "Where would this break?"
    expert: string;
  }>;
  
  scoring: {
    depthPoints: number; // 1-5
    tradeoffPoints: number; // 1-5
    alignmentPoints: number; // 1-5
  };
  
  relatedQuestions: string[]; // links to questions.ts IDs
}
```

### New Files
- `src/lib/data/scenarios.ts`: all 8 scenarios (with expert answers)
- `src/routes/challenge/+page.svelte`: main Architecture Challenge page
- `src/lib/components/ArchitectureChallenge.svelte`: scenario picker + design form
- `src/lib/components/ChallengeSubmission.svelte`: feedback + expert answer
- `src/lib/stores/challengeProgress.ts`: save user attempts, scores
- Tests: `src/routes/challenge.e2e.ts` (pick scenario, submit, check feedback)

### Integration with Existing App
- New button in Pipeline: "Architecture Challenge"
- Progress tracker shows: scenarios completed, average score
- "Challenge" tab in main nav

---

## Part E: Success Criteria
- [ ] 8 scenarios fully written (context + expert answers)
- [ ] User can pick a scenario
- [ ] Level 1, 2, 3 forms work
- [ ] Submission shows expert answer + feedback
- [ ] Score is calculated and saved
- [ ] User can try another scenario
- [ ] Progress tracker shows scenarios completed
- [ ] All e2e tests pass
- [ ] Mobile responsive

---

## Interview Value
User can now say: 

> "I built an interactive tool with 8 real thinkmoney scenarios. I can design a solution, get expert feedback, and see exactly where my thinking differed from the approach a Lead would take. It taught me to think through trade-offs, not just tools."

**That's impressive.** More impressive than "I studied Q&A."
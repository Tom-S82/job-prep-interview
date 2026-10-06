# Architecture Challenge: Real-Time + Batch Medallion Under Constraints

## The Scenario

thinkmoney wants:
- **Real-time fraud detection** (decision needed in <2 seconds on an active call)
- **Batch CDC** (SSIS, once per hour, 50M transactions/run)
- **Both landing in the same medallion** (Bronze → Silver → Gold)
- **Query performance** that doesn't degrade based on partition key
- **Cost optimization** (data tiering, Glacier for old data)
- **Fast materialized view refreshes** (10+ reports, daily)
- **Operational sanity** (dbt, Terraform, CI/CD, monitoring)

**The constraint:** Firehose has a ~1-minute buffer before flushing to S3. But fraud detection needs a decision in 2 seconds. How do you square that circle?

---

## Part A: Data Flow Architecture (The Core Design)

### Question 1: Design the Complete Flow
Your answer should address:

**Level 1: Strategy**
- Where does streaming data go? (Kinesis stream? Direct to Lambda? Both?)
- Where does CDC go? (SSIS → S3? SSIS → Redshift? Both?)
- How do they meet in Silver?
- Do they have separate consumers initially, or merge immediately?

**Level 2: Detailed Design**
For each of these, specify:
- Tool/service (Kinesis, Firehose, Lambda, Spark, etc.)
- Latency guarantee
- Durability (does this become source of truth, or is it intermediate?)
- Partition/ordering strategy

Paths to design:
1. **Real-time fraud path** (must be <2 sec)
   - How does it bypass Firehose's 1-min buffer?
   - What logic runs where (stream vs Lambda vs Spark)?
   - How does it surface a verdict to the product?

2. **Batch CDC path** (SSIS, once hourly)
   - Where does it land initially?
   - How is it made idempotent and replayable?
   - When does it merge with streaming?

3. **Validation integration**
   - Does fraud logic validate before or after Kinesis?
   - Where do invalid records go (quarantine)?
   - Can the fraud system safely reject a record?

4. **Materialization in Gold**
   - What's pre-aggregated for reports (daily_customer_spend)?
   - What stays atomic (transaction facts)?
   - Refresh strategy for each (on CDC arrival? Nightly? Hourly)?

**Level 3: Trade-offs & Constraints**
- "If fraud logic runs in Lambda, we decide in <200ms. But we can't see the full customer context. If it runs in Spark at Silver, we have full context but 5-min latency. Which wins and why?"
- "Firehose has a 1-min buffer. How do you get <2 sec fraud decisions? What's the cost?"
- "CDC arrives once per hour. Real-time queries see stale data for 59 minutes. Acceptable or not? How do you communicate this?"

---

## Part B: The Querying Problem

### Question 2: Partitioning & Clustering for Multi-Access Patterns

**The Problem:** You partition Silver by `transaction_date`. Queries like "all transactions for customer X in Oct" are instant. Queries like "top 100 customers by lifetime spend" scan everything. How do you solve this without duplicating the data?

Your answer should cover:

**Level 1: Strategy**
- Is the problem partitioning, or clustering, or indexing, or something else?
- What's the difference between "partition by date" and "cluster by date"?
- Can you have multiple orderings?

**Level 2: Detailed Design**
Pick one: Iceberg table formatting, Redshift sort keys, Delta Lake Z-order, or a combination.

For Silver transactions table, specify:
- **Partitioning:** By what? (date, customer_id, both?)
- **Clustering/sort key:** How is data physically ordered within partitions?
- **Indexes:** What gets indexed? (primary key? frequently-filtered columns?)
- **Query examples:** Show how a partition-key query and a non-partition-key query both perform well

**Level 3: Trade-offs**
- "If you partition by customer_id, you solve the 'customer lifetime spend' query but break date-range queries. Which matters more?"
- "Redshift sort keys work within a table but not across partitions. How does that change your strategy?"
- "Iceberg's partition evolution lets you change partitioning, but re-writing 50M rows takes time. When would you do it?"

---

## Part C: Materialized Views & Refresh Performance

### Question 3: How to Keep Materialized Views Fast

**The Problem:** You have 10 daily reports on Gold data. Each refresh queries Silver/Gold and aggregates. Redshift MV refreshes take 20 minutes per day. That's 200 minutes of refresh overhead, and the data is stale. How do you do better?

Your answer should cover:

**Level 1: Strategy**
- Refresh MV in place? Pre-compute elsewhere and load? Incremental refresh?
- What's the difference between REFRESH MATERIALIZED VIEW and building a new table and swapping?
- Could Glue/Spectrum solve this differently than Redshift MVs?

**Level 2: Detailed Design**
Pick an approach and specify:
- **Refresh cadence:** Nightly? After CDC? Real-time? Per-report?
- **Compute location:** Redshift MV? Spark incremental model? Glue job?
- **Storage:** Redshift table? S3 Iceberg? Both (dual-write)?
- **Staleness tolerance:** How old is acceptable for each report type?

Scenario-specific:
- Fraud scorecard (intraday decision support): needs fresh data every hour
- Customer profitability (finance reporting): nightly is fine
- Executive dashboard (anomaly detection): needs real-time(ish)

For each, how do you handle the refresh?

**Level 3: Trade-offs**
- "Incremental refresh is faster (only process yesterday's delta) but more complex. When is it worth it?"
- "Glue + Spectrum lets you query S3 directly. Faster refresh (no Redshift load), slower queries. Worth it for thinkmoney?"
- "Materialized views refresh slowly but are simple. Pre-computing in dbt is faster but requires orchestration. Pick one and defend it."

---

## Part D: Validation Integration

### Question 4: Where Does Validation Live?

**The Problem:** You have three validation points:
1. Schema (does the record have the right shape?)
2. Quality (is the data true?)
3. Business rules (does it meet the fraud/risk ruleset?)

Where does each run, and what happens if it fails?

Your answer should cover:

**Level 1: Strategy**
- Should validation block ingestion (fail fast) or flag and quarantine?
- Can fraud validation reject a record mid-transaction? (customer on phone, needs answer in 2s)
- If validation rejects a record, how does it get corrected and replayed?

**Level 2: Detailed Design**
For each validation type, specify:
- **When:** Schema at ingestion? Quality at Silver? Business logic at Kinesis/Lambda/Spark?
- **Where:** Kinesis Lambda? Spark job? Redshift rules engine? dbt tests?
- **Failure mode:** Quarantine table? Dead-letter queue? Hard stop?
- **Replay:** How do corrected records re-enter the pipeline?

Real-time fraud example:
- Customer calls to apply for a card.
- Transaction enters Kinesis.
- Fraud Lambda scores it in <200ms.
- What validation has it already passed?
- What validation happens in that 200ms?
- If validation fails, does the customer wait? Do they apply anyway?

**Level 3: Trade-offs**
- "If you validate strictly at ingestion, you block streaming. If you validate late, bad data pollutes Silver. How strict should you be?"
- "Real-time fraud decisions need speed. Can you re-validate in batch and correct later?"

---

## Part E: Redshift Concurrency Scaling

### Question 5: How Does Scaling Trigger & What Does It Cost?

**The Problem:** Redshift cluster has 2 base nodes. They handle normal BI queries. At 10am, everyone runs reports. Queue builds up. Redshift can spin up temp clusters. How does this work and when should it trigger?

Your answer should cover:

**Level 1: Strategy**
- What triggers concurrency scaling? (queue length? wait time? CPU?)
- Does it happen automatically or do you configure it?
- What's the cost model? (pay only for temp cluster runtime?)

**Level 2: Detailed Design**
- **Workload queues:** Separate high-priority (exec dashboards) from low-priority (self-serve SQL)?
- **Scaling threshold:** At what queue depth does the temp cluster spin up?
- **Max temp clusters:** How many can run simultaneously? (cost control)
- **Data consistency:** Do temp clusters see the same data as base cluster?
- **Monitoring:** How do you know concurrency scaling happened? (alert to Slack?)

Scenario-specific:
- 9:30am: Nightly MV refresh finishes. Redshift is busy.
- 10:00am: Finance team runs 5 reports simultaneously.
- 10:15am: Self-serve analysts open their SQL notebooks.
- What happens to each? Queue? Temp cluster? Timeout?

**Level 3: Trade-offs**
- "Concurrency scaling costs extra. When is it worth it vs just telling users to wait or try later?"
- "If you queue low-priority queries, they might wait 2 hours. Fair or not?"

---

## Part F: Data Lifecycle & Cost Optimization

### Question 6: Hot/Cold Data Strategy

**The Problem:** thinkmoney has 10 years of transaction history. Bronze/Silver have 2 years. Queries almost never touch data >6 months old. Storage cost is high. How do you optimize?

Your answer should cover:

**Level 1: Strategy**
- Should recent data (0-6 months) stay in hot storage (S3 standard, Redshift)?
- Should old data (6mo-10yr) move to cold storage (Glacier, deep archive)?
- Should old queries be diverted to a separate read-only warehouse (Athena over Glacier)?

**Level 2: Detailed Design**
- **Hot layer:** What goes here? (e.g., last 6 months of Silver/Gold in Iceberg)
- **Warm layer:** What? (e.g., 6mo-2yr in S3 Infrequent Access)
- **Cold layer:** What? (e.g., 2yr+ in Glacier, Athena queries only)
- **Lifecycle policies:** S3 lifecycle rules, when do objects transition?
- **Query routing:** How do queries find data in cold storage? (Glue Catalog metadata?)

Redshift-specific:
- Redshift only hot data (0-6mo)? (cheaper storage, faster queries)
- S3 Spectrum for warm/cold? (cheaper than Redshift, slower queries)
- Separate cold warehouse (Athena)? (cheapest, slowest, suitable for analytics only)

**Level 3: Trade-offs**
- "Moving data to Glacier saves 80% on storage but requires 4-hour retrieval. When is that acceptable?"
- "Querying cold data through Athena is slow. Do you tell self-serve users 'this query will take 5 minutes'? Or hide old data?"

---

## Part G: Orchestration & DevOps

### Question 7: How Do You Manage This System?

**The Problem:** You have Kinesis, Firehose, Lambda, Spark, Redshift, S3 Glacier, dbt, Terraform. How do you define, deploy, monitor and update it all?

Your answer should cover:

**Level 1: Strategy**
- **Infrastructure:** Terraform for AWS resources (Kinesis, Firehose, Redshift, Lambda)?
- **Data transformations:** dbt for Silver/Gold?
- **Orchestration:** Step Functions? Airflow? dbt Cloud?
- **CI/CD:** GitHub Actions? GoCD (you've used it before)?

**Level 2: Detailed Design**
- **Terraform structure:** One monolithic file or modularised (modules/lambda/, modules/redshift/)?
- **dbt structure:** Staging models (Silver), marts (Gold), tests (dbt_tests)?
- **Orchestration DAG:** What runs when?
  - 00:00 - Nightly CDC extract starts
  - 01:00 - CDC loaded to S3/Iceberg
  - 01:15 - Spark job runs (merge, clean, build Silver)
  - 01:30 - dbt runs (Gold marts)
  - 01:45 - Redshift MV refreshes
  - 02:00 - S3 lifecycle job archives old data
  - 02:15 - Monitoring/reconciliation checks run
- **Alerting:** Where do failures surface? (Slack? PagerDuty?)
- **Monitoring:** What metrics do you track? (row counts, latency, reconciliation drift?)

**Level 3: Trade-offs**
- "dbt for Silver/Gold is elegant but requires learning dbt. SSIS is what thinkmoney knows. Migrate or stay?"
- "Step Functions is AWS-native but less visible than Airflow. Which fits your team's ops skills?"
- "GitHub Actions is free but slower than GoCD. Worth switching from GoCD?"

---

## Part H: Real-Time Fraud Under Constraints

### Question 8: The Full Fraud Path

**Integrating everything above into one scenario:**

A customer calls support and applies for a card. The app calls your fraud API with:
```json
{
  "customer_id": 12345,
  "amount": 5000,
  "device_location": "London",
  "device_new": true,
  "income_stated": 25000
}
```

You have 2 seconds to return:
```json
{
  "decision": "decline",
  "reason": "high_risk",
  "score": 0.87
}
```

Walk the request through your architecture:

1. **Ingestion (0-100ms):**
   - Request enters Lambda (via API Gateway)
   - Schema validation (is it shaped right?)
   - Validation either passes or rejects here
   
2. **Enrichment (100-500ms):**
   - Lambda looks up customer context from... where?
   - (Silver? Redshift? Cache? Redis?)
   - Computes fraud score based on:
     - Customer history (how old? cold data? Glacier?)
     - Device history (queried from?)
     - Income vs requested amount
     - Velocity (transactions in last hour)
   
3. **Decision (500-1500ms):**
   - Score is returned to the app
   - Decision recorded for audit/replay
   
4. **Downstream (1500-2000ms):**
   - Decision queued to Kinesis (lands in Bronze eventually)
   - Correlates with the transaction when CDC arrives

**Your design should specify:**
- **Where is customer context stored?** (Redshift? Cached?)
- **How fresh does it need to be?** (5 min old? 1 hour?)
- **What if the customer context is in cold storage?** (can't query in 2s, fallback?)
- **How do you reconcile the real-time decision with the batch CDC later?**
- **Where are training data for the model coming from?** (batch, historical transactions in Silver/Gold)

---

## Success Criteria

- [ ] Data flow is clear: streaming and batch both land in Bronze
- [ ] Query performance is addressed: partitioning + clustering strategy specified
- [ ] Validation is integrated: knows where it runs and what it rejects
- [ ] Real-time fraud works: designed for <2s with full context
- [ ] MVs and refresh are realistic: not hand-waving "it just refreshes"
- [ ] Cost optimization is explicit: hot/warm/cold strategy named
- [ ] DevOps is complete: Terraform, dbt, orchestration all specified
- [ ] Trade-offs are named: acknowledges tensions and picks sides
- [ ] You can explain the whole system in 5 minutes to an interviewer

---

## Why This Scenario Matters

This is not a theoretical design exercise. thinkmoney *will* ask this. The question is:
- Can you hold the whole system in your head?
- Do you know the trade-offs between real-time and batch?
- Can you design for both without over-engineering?
- Do you understand cost, ops and governance as well as data flow?

A weak answer: "Use Kinesis for real-time, SSIS for batch, merge in Silver, done."
A strong answer: "Kinesis → Lambda for immediate fraud decision (2s SLA), parallel SSIS → S3 Iceberg for durable record, reconcile hourly in Spark, pre-aggregate in Gold with hourly refresh for reports, partition by date + cluster by customer for query performance, Redshift hot (6mo), Glacier cold (2yr+), Terraform manages it all, dbt builds Silver/Gold, Step Functions orchestrates, monitoring alerts on reconciliation drift."

The second one shows you've thought about the tension between "now" and "eventually", and you've designed for both.
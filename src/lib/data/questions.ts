import type { InterviewQuestion } from './stages.ts';

// ============================================================================
// TIER 1: Real Stories (Your Actual Experience)
// ============================================================================

export const ingestionQuestions: InterviewQuestion[] = [
	{
		q: 'How would you migrate from SSIS to Kinesis without losing data?',
		a: `First I'd push back on the premise a little: I wouldn't migrate SSIS CDC to Kinesis at all on day one. **SSIS CDC is the part of the platform that works**, and the JD says "evolve and reuse what works". Kinesis is for **new event sources** (card auths, app events) where we need sub-minute latency. CDC from SQL Server is a different problem.

If we did later move CDC off SSIS, I'd do it the way I ran DMS migrations: **run the new path in parallel with the old one**, land both in Bronze, and reconcile before cutting over. Concretely: take a full load plus CDC from a recorded LSN, so there's no gap between snapshot and change stream. Make writes **idempotent**, keyed on primary key + LSN, so replays never duplicate. Compare daily **row counts, checksums on key columns and financial totals** (balances, transaction sums) between the two paths. Only switch consumers once the numbers match for an agreed period, and keep SSIS warm as a rollback.

The data-loss risks I'd call out are **CDC log retention** (if the log is truncated before we read it, changes are gone silently), so we need **LSN-lag alerting**, and Kinesis retention, so we land to S3 via Firehose straight away and never treat the stream as the system of record.`
	},
	{
		q: 'Your system has both batch CDC and streaming real-time events. How do you reconcile them?',
		a: `I'd treat them as **two views of the business that must agree at the end of the day**, not two copies of the same data.

Design rules: both paths land in Bronze with the same **metadata envelope** (source system, event/LSN id, event time, ingest time). Silver merges on a **business key with event-time ordering**, so a late batch record and an earlier stream record resolve deterministically: latest event time wins, ties broken by source priority (SQL Server is the system of record for balances).

Then **reconcile explicitly**. The stream gives a fast, provisional view (e.g. today's card spend). The nightly CDC batch is authoritative. A reconciliation job compares counts and totals per account per day and flags drift above a threshold to the quarantine/ops queue.

From my 2021 SQL Server-to-RDS migration and later Redshift work, reconciliation by **aggregates (sums, counts per partition) is far cheaper and more convincing to finance stakeholders** than row-by-row diffing. In an FCA firm, being able to show "streamed figures were reconciled to the ledger" is a control in its own right.`
	},
	{
		q: "You've done AWS DMS migrations. Would you use DMS at thinkmoney instead of SSIS CDC?",
		a: `Maybe, eventually, but not as an opening move. **DMS is good at what I used it for: moving SQL Server into RDS or Redshift with full load + ongoing replication**, with very little custom code. It has real limits too. LOB handling needs tuning, it needs sensible task and table mappings, and you have to watch replication lag and validate the target yourself. DMS's built-in validation helps but isn't a substitute for business reconciliation.

At thinkmoney the question I'd ask is **"what problem does replacing SSIS solve?"** If SSIS CDC is reliable, the bigger wins are elsewhere: streaming, a rebuilt medallion, the semantic layer. I'd revisit DMS (or log-based CDC into Kinesis/MSK) if SSIS became a constraint: a hosting move off on-prem SQL Server, latency requirements batch can't meet, or the cost of maintaining SSIS packages and skills in the team.

So my answer is: I know how to do it and where it bites, which is exactly why I wouldn't do it just because it's newer.`
	},
	{
		q: 'How do you make ingestion idempotent and replayable?',
		a: `Three things. First, every record carries a **deterministic identity**: for CDC that's **primary key + LSN/sequence**; for events, a producer-generated **event id**. Second, **landing is append-only in Bronze**, partitioned by ingest date, so reprocessing never destroys history. Third, downstream loads are **MERGE/upsert on that identity** rather than blind inserts, so running the same load twice gives the same result.

Operationally I'd orchestrate with **Step Functions** (or the existing scheduler if that's what's in place), with each run recording a **watermark**: last LSN or Kinesis sequence processed. A rerun starts from a chosen watermark. That's the pattern I've used for ETL in Talend/Matillion and **PySpark**: we built Step Functions jobs that orchestrate PySpark transformations in EMR, with watermark tracking in DynamoDB for resumability. The tooling changes, but "**watermark + idempotent merge**" is the bit that matters.

The test is simple: can an engineer safely re-run yesterday's load at 9am without asking anyone? If not, it isn't idempotent yet.`
	},
	{
		q: 'How would you design the Kinesis streaming path for card and app events?',
		a: `Producers (card processor webhooks, app backend) publish to **Kinesis Data Streams** with a **partition key that spreads load but keeps per-entity ordering**, usually account or customer id. Before landing, events are **validated against a registered schema**; failures go to a **dead-letter stream** rather than being dropped.

Consumers: **Firehose delivers every event to S3 Bronze**, buffered and compressed, as the durable copy. Anything needing real-time action (fraud signals, app notifications) reads the stream directly via **Lambda**, or Flink if we need windowed aggregations and state. I'd be honest that Flink adds operational complexity; I'd start with Lambda + Firehose and introduce Flink when a use case needs stateful processing.

Security: **PANs never enter the stream**. Tokenise at source for PCI-DSS scope reduction, KMS encryption, and **IAM producers/consumers scoped per stream**. Monitoring: iterator age, throttled records, DLQ depth. My hands-on Kinesis/Firehose experience is the landing side; the stateful processing is where I'd lean on the team and on spikes before committing.`
	},
	{
		q: 'An upstream team changes a SQL Server column without telling you. What happens and how do you stop it happening again?',
		a: `Short term: the pipeline should **fail loudly or quarantine, never silently load wrong data**. Schema checks at Bronze→Silver catch new, removed or retyped columns; affected loads stop, and the previous Gold stays in place with a freshness warning rather than showing broken numbers.

Fix: assess the change, update the model, **backfill from Bronze**. Because Bronze is raw and replayable, recovery is a re-run, not a re-extract.

Long term it's a **people and process fix** more than a tooling one. **Agree data contracts with source owners** for the tables we depend on: columns, types, semantics, notice period. Add a lightweight check in their release process (even a CI step that diffs schema against the contract). Make the data team a reviewer on changes to contracted tables.

As a lead, I'd frame it as **shared ownership**: product teams aren't wrong to change their systems, they just need to know who depends on them. Lineage makes that visible.`
	}
];

export const validationQuestions: InterviewQuestion[] = [
	{
		q: "What's the difference between schema validation and data quality testing?",
		a: `**Schema validation** asks "**is this record shaped correctly?**": right columns, types, nullability, enum values, parseable dates. It's structural and cheap, and it belongs **at the edge**: as data lands in Bronze or as events enter the stream. Failure means the record can't be processed.

**Data quality testing** asks "**is this data true and fit for use?**": uniqueness, referential integrity, valid ranges, freshness, completeness against the source, reconciliation to totals. It needs context (other tables, history, business rules), so it runs on Silver and Gold models.

A record can pass schema validation and still be wrong: a correctly-typed transaction amount that's 100x too big, or a customer with no account. At thinkmoney I'd run **schema checks at ingestion with quarantine**, and quality tests as **dbt tests (plus something like Soda or Great Expectations for distribution checks) gating promotion to Gold**.`
	},
	{
		q: "How would you handle data that's technically valid but suspicious (e.g., implausible values)?",
		a: `In my previous role, we dealt with exactly this in Google GA4 data. The schema was perfect: right columns, types, everything valid. But the data was **full of bot traffic and cookie conflicts**. Google kept changing their data capture, and they're too big to hold accountable.

**Distinguish between "definitely wrong" and "unusual"**. Hard rules (negative balance where the product can't go negative, a date in the future) **fail and quarantine**. Suspicious-but-possible data (a spike in direct debits, a £50k transaction on a basic account) should **warn, not block**. Blocking real data is its own incident.

Implementation: **anomaly checks comparing against history**, e.g. daily volume outside a rolling band, null rate jump, distribution shift. Results are recorded as quality metrics with severity levels. Warnings go to the dataset owner's channel; errors stop promotion to Gold.

The important part in fintech is that **someone looks at it**. Some "suspicious data" is actually fraud or a real operational issue. For GA4, we built bot-detection rules on IP patterns, click velocity and user-agent anomalies. If we hadn't filtered bots, session-to-application metrics would've been completely wrong. And S2A moves the needle—a 1% improvement increased revenue by 7 figures. So the schema was valid, but the data was dirty.`
	},
	{
		q: 'Testing is an area you say you are growing in. What testing strategy would you put in place?',
		a: `I'd be upfront: my strength is **building robust ETL**, and testing as a formal discipline is something I'm actively levelling up. That's partly why I like the **dbt-based approach**, because it makes testing part of the model rather than an afterthought.

Strategy in layers:
1. **Unit-level**: dbt unit tests for complex transformation logic (e.g. interest calculation, SCD2 merges) with fixed input/output fixtures.
2. **Data tests**: not-null, unique, relationships, accepted values on every model's keys. Cheap and mandatory.
3. **Reconciliation**: counts and financial totals Silver vs SQL Server source, daily.
4. **CI**: every PR runs affected models + tests against a dev schema (slim CI), and **Claude Code can help write and review tests quickly**.
5. **Observability**: freshness and volume monitors in production.

What I've learned from migrations is that **reconciliation to source catches the problems stakeholders actually care about**. I'd start there, then broaden.`
	},
	{
		q: 'What do you do with records that fail validation?',
		a: `**Quarantine, never silently drop.** Failed records go to a quarantine table or dead-letter queue with the **original payload, the rule that failed, the load id and a timestamp**. The rest of the batch carries on, unless the failure rate breaches a threshold, in which case the whole load stops because it probably indicates a systemic issue.

Then there's a **feedback loop**: quarantine is triaged daily, root causes are fixed at source wherever possible (the upstream team or the mapping), and corrected records are **replayed through the normal pipeline from Bronze**, not hand-patched in Gold.

For a regulated firm this matters because **quarantine is an audit trail**. If the FCA or internal audit asks why a figure moved, we can show exactly which records were held, why and when they were corrected. I'd also report **quarantine volume per source as a KPI**, which is a good conversation starter with source system owners.`
	},
	{
		q: 'How do you avoid alert fatigue in data quality monitoring?',
		a: `**Severity and ownership**. Every check has a severity (block / warn / info) and an owning team, and **only "block" pages anyone out of hours**. Most checks should notify a channel during working hours.

**Tune for actionability**: if an alert fires and the correct response is "ignore it", the check is wrong. I'd review the noisiest checks regularly and either fix the threshold, fix the data or delete the check. **Aggregate related failures**, so one upstream outage creates one incident, not 40 test failures. Lineage helps here: **alert on the root node, suppress downstream**.

And make **freshness the first-class check**. In my experience the most common real incident is "the data didn't arrive", not "the data was subtly wrong". A clear **freshness SLA per Gold dataset** covers a lot of ground with few alerts.`
	},
	{
		q: 'How would you validate the medallion rebuild against the existing SQL Server platform?',
		a: `**Same discipline as a migration**, which is where most of my experience is. **Run old and new in parallel and prove equivalence before anyone switches a report**.

Pick the **10–20 highest-value outputs first**: regulatory figures, finance dashboards, key KPIs. For each, define **reconciliation queries**: totals and counts by day/product/segment in both platforms, with an agreed tolerance (zero for money). **Automate them so they run every day** of the parallel period, and publish the results so stakeholders can see convergence.

Where numbers differ, it's often the old platform that's wrong. **Undocumented logic in SSIS packages or Power BI measures is common**. Those differences need a business decision and a written record, not a quiet fix. Only when a domain has reconciled for an agreed period do we cut over its Power BI reports and retire the old objects.`
	}
];

export const bronzeQuestions: InterviewQuestion[] = [
	{
		q: 'Why separate Bronze/Silver/Gold instead of just landing raw data and transforming once?',
		a: `Because **each layer has a different job and a different consumer**, and mixing them is how platforms become "not fit for purpose".

**Bronze is the raw, immutable record**: it lets you **replay history when logic changes or a bug is found**, without re-extracting from production SQL Server. **Silver is cleaned and conformed truth** (one customer, deduplicated, typed), reused by many marts. **Gold is shaped for specific business questions**.

If you transform once from raw straight to reports, every report **re-implements cleaning**, the same customer logic is **duplicated with slight differences**, and when something's wrong you can't tell whether it's the source, the cleaning or the business logic. **Layers give you places to test, clear ownership and cheap reprocessing**.

That said, the layers are a means, not an end. thinkmoney already has bronze/silver/gold and it isn't working, so the names alone don't fix anything. **What matters is the contract each layer guarantees**.`
	},
	{
		q: "When would you break medallion architecture? What's a case where one layer is better?",
		a: `When the **extra layers cost more than they protect**. Examples:

**Real-time operational use cases**: a fraud signal from card authorisations needs a decision in milliseconds. That's processed on the stream itself; it still lands in Bronze for history, but the operational path doesn't wait for Silver/Gold.

**Small, clean, single-use reference data**: a static lookup from a trusted vendor file may go almost straight to Silver. **Forcing three layers adds latency** and models nobody needs.

**Exploration**: data scientists sometimes need Bronze-level detail directly, in a sandbox, with appropriate PII controls.

The principle I'd take into the role: **medallion is a default, not a religion**. The **non-negotiables are: raw retained for replay, tested before business use, governed access**. If a simpler path meets those, take it. Saying this matters at thinkmoney because "rebuild properly" can easily turn into over-engineering.`
	},
	{
		q: "thinkmoney's medallion exists but isn't fit for purpose. How would you assess it in your first 90 days?",
		a: `**Listen and measure before redesigning**. "Evolve what works" applies to the medallion too.

**First 30 days: inventory**. What's in each layer, which SSIS packages build it, who consumes what (Power BI usage stats are gold dust here), what breaks and how often. Talk to analysts and the team about their pain. I'd use **Claude Code to accelerate reading SSIS package XML and stored procedures** to map lineage.

**Days 30–60: diagnose** against what each layer should guarantee. Typical findings: **Bronze isn't actually raw** (transformed on landing, so no replay), **business logic is scattered** across SSIS, views and Power BI, no tests, no clear ownership, and SQL Server can't scale or stream.

**Days 60–90: a target architecture and an incremental plan**. Pick **one domain** (e.g. customers/accounts, which is also the CDP foundation), rebuild it end-to-end in the new pattern, reconcile against the old, cut over and prove value. Then repeat domain by domain rather than doing a big bang.`
	},
	{
		q: 'How do you handle GDPR right-to-erasure in an immutable Bronze layer?',
		a: `There's real tension, and in banking it's compounded because **FCA and AML record-keeping rules often require retaining data for years**. Erasure may legitimately be refused or deferred for regulated records. Legal/DPO decide that; data engineering makes it executable.

**Technical patterns: minimise PII in Bronze**, tokenising or separating identifying fields into a dedicated, tightly-controlled store keyed by a surrogate id. **Erasure then becomes deleting or crypto-shredding the identity record** (per-customer or per-partition keys), leaving the analytical history anonymised.

If PII must sit in Bronze, use a **table format that supports row-level deletes** (Iceberg on S3), so erasure is a governed delete job with an audit log, not a manual rewrite of files.

**Retention policies should be explicit lifecycle rules** per dataset (S3 lifecycle / Iceberg expiry), documented against the regulatory basis for keeping them.`
	},
	{
		q: 'Where would Bronze physically live: SQL Server, S3 or Iceberg?',
		a: `**I'd move Bronze to S3**, and I'd seriously consider **Iceberg as the table format**.

**SQL Server as Bronze has problems**: storage cost, it competes with OLTP and reporting for resources, and it's a poor fit for streaming landings or large history. **S3 is cheap, durable** and the natural landing zone for Firehose and file feeds, and it decouples storage from compute.

**Iceberg adds what plain Parquet files lack: ACID writes, schema evolution, time travel** (great for "what did we know on date X?" questions, which regulators ask) and **row-level deletes for erasure**. It's queryable from Athena, Redshift, Spark and Snowflake, which avoids lock-in.

I'd be honest about complexity: **Iceberg needs table maintenance** (compaction, snapshot expiry) and the team needs to learn it. So: **start with S3 + Iceberg for Bronze** where streaming and history matter, keep SSIS landing CDC changes into it, and grow from there.`
	},
	{
		q: 'What metadata should every Bronze record carry?',
		a: `Enough to answer **"where did this come from, when and in which load?"** without guesswork:
- **source system and object** (e.g. sqlserver.core.accounts)
- **source change identifier**: CDC LSN/sequence, or event id
- **operation type** for CDC (insert/update/delete)
- **event time** (when it happened) and **ingest time** (when we received it)
- **load/batch id** linking back to the orchestration run
- **schema version**
- **a hash of the payload**, for duplicate detection and reconciliation

These columns **make idempotent merges, late-data handling, lineage and audit possible**. It's a small cost per row and it saves days during incidents. In my migration work, having a **load id on every row was the single most useful thing** when proving to stakeholders which load produced which figure.`
	}
];

export const silverQuestions: InterviewQuestion[] = [
	{
		q: 'How would you merge batch CDC and streaming events into one Silver table?',
		a: `**Normalise both into the same envelope in Bronze** (business key, event time, source, sequence), then **build Silver with an incremental merge that orders by event time, then source sequence, then source priority**.

**Late-arriving data is the hard part**. I'd use a **lookback window on incremental runs** (reprocess the last N days of keys touched) rather than assuming data arrives in order, and support a **full rebuild from Bronze** for when the logic changes.

Where streams and CDC describe the same entity (e.g. a card transaction streamed in real time, then settled via the core banking CDC), I'd **model them as states of one record**: authorised → settled, with the **SQL Server ledger as the system of record** for the final value. That's a modelling conversation with finance as much as an engineering one.`
	},
	{
		q: 'Explain SCD Type 2 and when you would use it here.',
		a: `**SCD2 keeps history by closing the old row and inserting a new version** whenever a tracked attribute changes, with **valid_from / valid_to and an is_current flag**. You can then ask **"what did this look like on date X?"**

At thinkmoney I'd use it for **customer attributes that matter historically**: address (affordability and fraud), product/tariff, risk rating, vulnerability flags (Consumer Duty). Those are exactly the questions **regulators and complaints teams ask: "what did we know about this customer at the time?"**

I wouldn't use it on **high-churn columns like current balance**. That's a fact/snapshot table, not a dimension. **CDC is a great feed for SCD2** because it gives you every change with ordering. I've built SCD2 merges in SQL and ETL tools before. In dbt it's **snapshots or an incremental merge model**, with tests that each key has exactly one current row and no overlapping validity windows.`
	},
	{
		q: 'How do you build a single customer view for the Customer Data Platform?',
		a: `**Identity resolution in Silver**. Customers appear across core banking (SQL Server), cards, the app and support systems with different ids. **Start with deterministic matching on strong identifiers** (customer number, verified email/phone), producing a **customer_key and a crosswalk table** from each source id to that key. **Add probabilistic matching later if needed**, but carefully, because **a false merge in banking is a data protection incident**.

Then **build conformed customer dimensions (SCD2)** and activity facts keyed on **customer_key**, and consent and marketing preferences as first-class attributes, so the CDP respects them by design.

**Governance**: **PII columns tagged at Silver**, masked by default, unmasked only for authorised roles. The CDP and any Claude/MCP access read from Gold/semantic layer, never raw identity tables.`
	},
	{
		q: 'Where should business logic live: SSIS, SQL views, dbt or Power BI?',
		a: `**In version-controlled, tested transformation code**, which in the target state means **dbt models over Silver/Gold**, with metric definitions in the semantic layer. **Not scattered across SSIS data flows, SQL views and DAX measures**, which is usually why numbers disagree today.

**Rule of thumb**: **Silver holds technical cleaning and conforming**, **Gold holds business logic**, the **semantic layer holds metric definitions** (what is an "active customer"), and **Power BI holds presentation only**.

Migration-wise, I wouldn't rip logic out of SSIS overnight. As each domain is rebuilt, **extract its logic into dbt, test it against the old outputs and retire the SSIS transformation steps**, while SSIS CDC continues doing ingestion. **Claude Code is genuinely useful here** for reading legacy SSIS/T-SQL and drafting equivalent dbt models that an engineer then reviews and tests.`
	}
];

export const goldQuestions: InterviewQuestion[] = [
	{
		q: 'How would you prioritise which Gold marts to rebuild first?',
		a: `**Value × pain × dependency**. I'd score candidate domains on **business value** (regulatory reporting, finance and exec KPIs score highest), **current pain** (incidents, manual workarounds, disagreeing numbers) and **how foundational they are**.

**Customers/accounts usually wins**: it's foundational for the CDP, every other mart joins to it, and it's where **inconsistent definitions hurt most**. Regulatory datasets come early too, but with more caution and sign-off, and the old process kept in parallel longer.

I'd avoid starting with the hardest domain. The **first rebuild needs to be visibly successful in weeks, not quarters**, to build trust with stakeholders and the team. Then use **Power BI usage data to retire reports nobody opens** rather than migrating them.`
	},
	{
		q: 'How do you stop metric definitions drifting across teams?',
		a: `**Define each metric once, in the semantic layer**, with a **named owner and a written definition**, and **make every consumer read from it**: Power BI, ad-hoc SQL and Claude via MCP. **If Power BI has its own DAX version of "active customer", drift is inevitable**.

**Process**: a lightweight **metrics catalogue**. **Changes to a certified metric go through a PR** with the owner's approval, and **tests guard key metrics** (e.g. active customers can't change by more than X% day-on-day without explanation). **Certified vs exploratory datasets are clearly labelled** so analysts know what's safe for board packs.

The **AI angle makes this more important**: if Claude answers "how many active customers do we have?", it must use the **same definition as the exec dashboard**, or trust in both disappears.`
	},
	{
		q: 'Why aggregate in Gold rather than letting Power BI do it?',
		a: `**Power BI is good at presenting and slicing**, but **pushing heavy aggregation and business logic into it causes**: duplicated logic per report, slow refreshes, inconsistent numbers and logic nobody can test or version properly.

**Gold pre-aggregates where it makes sense** (daily account snapshots, monthly cohort summaries, regulatory return tables), so they're **computed once, tested, documented and reused** by BI, the semantic layer and AI. **Power BI then reads well-shaped star schemas** and does light, interactive aggregation on top.

The balance: **don't pre-aggregate everything**. Keep atomic facts in Gold so new questions can still be answered, and **add aggregates where performance or consistency demands it**.`
	},
	{
		q: 'How would you treat Gold as a product?',
		a: `**Each Gold dataset has an owner**, a description, a freshness SLA, documented columns, tests and **known consumers** (dbt exposures linking marts to Power BI reports and MCP tools). Consumers can see in the catalogue when it last refreshed and whether its tests passed.

**Changes follow product discipline**: versioning for breaking changes, deprecation notices, usage tracking. **If nothing has queried a mart in 90 days**, we discuss retiring it.

For the team, this also gives engineers **clear ownership and something to be proud of**. As a line manager I'd use **domain ownership as a growth path**: a junior can own a small mart end-to-end with support.`
	}
];

// ============================================================================
// NEW TIER 1 SECTIONS: Your Real Technical Stories
// ============================================================================

export const terraformQuestions: InterviewQuestion[] = [
	{
		q: 'Walk us through your Terraform infrastructure-as-code work.',
		a: `Between 2023 and 2026, I built **Terraform modules for a complete AWS data stack**: RDS (SQL Server, Postgres), S3 buckets with lifecycle policies, Lambda functions, EventBridge rules, Glue jobs for ETL, DMS tasks, and EC2 instances. I also did **extensive "terraform imports"** to align infrastructure that had been created ad-hoc in the AWS console, bringing it under version control so it was reproducible and auditable.

The steepest learning curve was understanding **state management and the blast radius of changes**. Early on, a Terraform plan nearly destroyed a production database. That was a hard lesson, but it taught me to **never apply directly to production**. 

Our deployment pipeline used **GitHub for version control and GoCD to orchestrate**. Every change went through **dev → QA → production, with manual approval at each gate**. A junior could propose infrastructure, others reviewed the Terraform plan, and we only applied after explicit human review. This governance prevented incidents and gave the team confidence.

**Claude Code made this dramatically easier**, especially for scaffolding module structure, documenting inputs/outputs and writing variables.tf. The AI speed-read existing modules and generated sensible patterns. We experimented with GitHub Actions but ran into configuration and licensing issues with our setup, so GoCD remained our CI/CD orchestrator.

The real win: **infrastructure changes are now code reviews, not console clicks**. Disaster recovery, scaling, cost optimization—all auditable and reproducible.`
	},
	{
		q: 'How do you prevent Terraform from destroying production resources?',
		a: `**Three layers of protection**:

1. **Human review gates**: every prod change requires explicit approval of the Terraform plan. No auto-apply.
2. **State isolation**: prod state lives in a separate S3 backend with versioning and MFA delete, accessed only by CI/CD with tight IAM roles.
3. **Destructive operation flags**: I'd add -target to limit scope, and critical resources get lifecycle rules (e.g. prevent_destroy on production RDS instances).

We learned this when a Terraform plan nearly deleted a production database. The engineer spotted it during plan review—that's exactly why the process exists. We built better variable validation and data source queries to catch assumptions early.`
	},
	{
		q: 'How do you version control your infrastructure while development happens in the console?',
		a: `**Terraform import**. For every resource created manually in AWS console, we'd run terraform import to bring it under version control. It's tedious but essential for reproducibility.

I'd push back on console development as a team practice going forward: it's a toddler phase. But for migrating legacy infrastructure, terraform import is the bridge. It lets you treat the console as a temporary scratch space, then formalize the result in code.`
	}
];

export const cicdQuestions: InterviewQuestion[] = [
	{
		q: 'Describe your CI/CD pipeline for data infrastructure.',
		a: `**GitHub for version control, GoCD for orchestration**. Every developer commits infrastructure changes, data transformations, and pipeline definitions to GitHub. A PR review happens first—peers check Terraform plans, data schema changes, transformation logic and tests.

When merged, **GoCD triggers automatically**:
1. **Dev deployment**: changes applied to dev AWS environment, tests run
2. **Approval gate**: humans review, verify tests pass
3. **QA deployment**: same changes applied to QA, full integration testing
4. **Approval gate**: final human sign-off
5. **Production deployment**: only after explicit approval

**Manual gates at each stage were critical**. We tried to automate prod deploys early on, and it went badly when someone missed a Terraform plan detail. A 10-second approval prevents hours of recovery.

We experimented with **GitHub Actions** for CI, but ran into **configuration and licensing issues**. GoCD was more flexible for our complex approval workflows.

**Monitoring**: every deployment logs to Slack (who deployed what, when), and we track deployment frequency and failure rates. Postmortems happen if prod breaks.

The win: developers ship fast in dev/QA, but prod changes are deliberate and observed.`
	},
	{
		q: 'What happens when a CI/CD pipeline breaks in production?',
		a: `**Immediate**: rollback to the last known-good state, which we can do in minutes because everything is versioned. Concretely, for data, that means reverting the dbt or Terraform change and re-running from the last good commit. For infrastructure, Terraform keeps state history.

**Within an hour**: postmortem. What was the change? Why didn't tests catch it? What gate failed? What process failed?

**Fix**: update the tests or the process. If a schema change broke a downstream job, we add a test for that. If a Terraform plan was hard to read, we add more comments. If humans missed something, we discuss adding an automation check (not as a punishment, but as a learning).

We kept a very low bar for rolling back because reversibility meant we could move fast without fear.`
	}
];

export const pysparkQuestions: InterviewQuestion[] = [
	{
		q: 'Tell us about your PySpark work.',
		a: `We used **PySpark in two contexts**:

**First**: **GA4 data transformation** (Google BigQuery → S3). We started with Matillion's PySpark component, but that was a bottleneck—every change needed a rebuild, and performance was unpredictable. **We moved the transformation in-house as a Python/PySpark job**, version-controlled in GitHub, deployable as a **Step Functions job orchestrated by Lambda**.

**Second**: **Lambda timeout mitigation**. Some ETL tasks were compute-heavy and regularly hit Lambda's 15-minute timeout. We migrated those to **PySpark on EMR**, launched by Step Functions. It was slower to start (cluster provisioning) but much more reliable for large aggregations.

**Third**: **Versioning Redshift stored procedures**. We kept all sprocs in GitHub as SQL files, deployed via Python scripts and PySpark jobs, so disaster recovery was straightforward: we could rebuild the cluster from a commit hash and know exactly what ran when.

The wins: **version control for transformations**, reliable scaling beyond Lambda's limits, and **easy rollback**. The downside: PySpark clusters need babysitting (hanging jobs, cost surprises if you forget to terminate), so we added monitoring.

I've written DataFrames and Spark SQL both. DataFrames are cleaner for complex multi-step logic; Spark SQL is better for analytical queries people understand. I'd use **both pragmatically** at thinkmoney.`
	},
	{
		q: 'How do you handle PySpark job failures in production?',
		a: `**Orchestration is key**. Step Functions runs the PySpark job (or several in sequence) and retries are built in: if a job times out, we retry once. If it fails again, Step Functions triggers a Lambda that sends an alert to Slack and quarantines the data.

**Monitoring**: Cloudwatch logs stream directly to DataDog (or equivalent). We watch for OOM errors (scale the cluster), shuffle spills (data's too wide), and long executors (stuck in a join).

**Idempotency**: the same principles as Kinesis: every job writes to a **partitioned S3 location keyed by run date and run id**, and the next stage uses **MERGE/upsert on the run id**, so re-running is safe.

**Rollback**: if a job produced bad data, we can quickly re-run from the last known-good commit, which we track in Git tags or DynamoDB metadata.`
	}
];

export const reportTemplatingQuestions: InterviewQuestion[] = [
	{
		q: 'Report templating and design discipline—tell us about the impact you saw.',
		a: `Back in 2013, one company **used a wireframing tool** (predecessor to Figma) with a **standardised report template**: header (report ID, description, version, last updated, data refresh date), footer (page numbers), and a centre slot for content. **Every report had a data dictionary at the back**, explaining metric definitions and key terms.

**The impact was transformational**. Without it, disputes about revenue figures were common: Finance, HR and Sales all had different "revenue" numbers because they used different calculations. With templating and a data dictionary, the question became **specific: "this number in my 102 report is wrong"**, and the data engineer could go straight to report 102, read the dictionary, verify the formula, and resolve it in minutes.

**Additionally**, every report got a **3-digit ID that the whole company was trained to use**. Instead of "the sales report" (which one?), it was "report 102". This eliminated confusion and made **incident response immediate**.

The wins: **consistency, clarity, speed**. Reports didn't become political. Data dictionaries meant users understood what they were reading. The template prevented siloed design decisions. And the ID system prevented "which report?" becoming the first 10 minutes of every troubleshooting call.

At thinkmoney, I'd bring back that discipline. It seems like overhead but it's the opposite: it saves time and prevents disputes. It also raises the bar for what gets published—not every table becomes a report, only ones that meet the standard.`
	},
	{
		q: 'How would you institute report governance at thinkmoney?',
		a: `**Start with a template and a naming convention**. Every report has:
- A **3-digit ID** (report 101, 102, etc.)
- A **brief purpose statement** ("daily fraud detection summary")
- **Refresh frequency and time**
- **A data dictionary page** at the end explaining every metric and how it's calculated
- **Clear ownership** (which team owns this?)
- **Known consumers** (which Power BI dashboards or emails use this?)

**Process**: a lightweight **report catalogue** in Confluence or the semantic layer tool. New reports must have a owner and meet the template standard before publishing. Deprecated reports are marked "retiring on date X" to give consumers time to migrate.

**This isn't bureaucracy**—it's clarity**. Users know what they're reading, data engineers can quickly find the authoritative version, and disputes are resolved by reference, not politics.`
	}
];

export const businessProblemDiscoveryQuestions: InterviewQuestion[] = [
	{
		q: 'Tell us about a time you questioned the brief and found a different problem.',
		a: `This is an area where I wish I could have pushed more. In my last role, I was asked to build a **GDPR redaction pipeline**—straightforward requirement, right? But as I dug in, I realized the real problem wasn't just deletion, it was **data lineage**. The business didn't know where PII actually lived across the system.

I **proposed doing dbt and lineage documentation first**, before the redaction work, so we'd have a clear map of which columns were sensitive and where they flowed. That would make redaction automatic and maintainable. The answer was no—**leadership decided that wasn't valuable enough**.

So we built redaction manually, tracked lineage in spreadsheets, and it was painful. We got there, but it cost 3x the effort and is fragile. In retrospect, I should have **pushed harder on the real problem**: "we don't know our own data landscape."

The lesson for thinkmoney: **Good data engineers ask "why?" and "what problem are we actually solving?"** Not to be difficult, but because the stated problem is often a symptom of a deeper architectural issue. If thinkmoney says "rebuild medallion", the question I'd ask first is "what problem is the current medallion creating?" Is it slow? Is it wrong? Is it hard to change? The answer shapes whether we redesign or rearchitect entirely.

As a lead, I'd **create psychological safety for the team to ask those questions**, and I'd model it myself in conversations with leadership.`
	}
];

// ============================================================================
// TIER 2: Your Honest Gaps (Growing Into These)
// ============================================================================

export const dbtGapQuestions: InterviewQuestion[] = [
	{
		q: 'You say dbt is a gap. What do you actually know about it?',
		a: `I've **tried dbt on a side project** and liked it. What appeals to me: **version control for transformations, automated documentation, column-level lineage, the 'ref' function** that creates explicit dependencies. What I haven't done: **large-scale dbt projects, the full dbt Cloud setup, advanced testing patterns**.

At my last company, I **wanted to use dbt for the GDPR redaction work**—I knew it would've saved us time and kept lineage clean. I wasn't given the budget/priority. So it's on my growth list. If I join thinkmoney, **I'd contribute to dbt models immediately and level up on best practices with the team**. 

I don't claim dbt expertise, but I understand the philosophy and I'm keen to build it properly.`
	}
];

export const testingGapQuestions: InterviewQuestion[] = [
	{
		q: 'Testing is an area you say you are growing in. What testing strategy would you put in place?',
		a: `I'd be upfront: my strength is **building robust ETL**, and testing as a formal discipline is something I'm actively levelling up. That's partly why I like the **dbt-based approach**, because it makes testing part of the model rather than an afterthought.

**Strategy in layers**:
1. **Unit-level**: dbt unit tests for complex transformation logic (e.g. interest calculation, SCD2 merges) with fixed input/output fixtures.
2. **Data tests**: not-null, unique, relationships, accepted values on every model's keys. Cheap and mandatory.
3. **Reconciliation**: counts and financial totals Silver vs SQL Server source, daily.
4. **CI**: every PR runs affected models + tests against a dev schema (slim CI), and **Claude Code can help write and review tests quickly**.
5. **Observability**: freshness and volume monitors in production.

What I've learned from migrations is that **reconciliation to source catches the problems stakeholders actually care about**. I'd start there, then broaden.`
	}
];

export const aiMcpGapQuestions: InterviewQuestion[] = [
	{
		q: 'You mention you have not built MCP servers. What is your understanding?',
		a: `**I understand the concept**: an MCP server exposes a semantic layer as a structured interface so that LLMs like Claude can **query data safely**—constrained to approved tables, masked PII, audited access. **I haven't built one**. But I've seen how it matters: the fintech world will increasingly rely on AI to answer business questions. If your data platform doesn't have a governed semantic layer, **you can't safely expose it to Claude or other LLMs**.

At thinkmoney, I'd **focus on getting the semantic layer right first** (metrics, conformed dimensions, column tagging), then expose it via MCP. I'd **work closely with your applied AI team** to understand what they need. 

**This isn't something I claim expertise in**, but I understand the architecture, and **I'm keen to learn it properly**. It's exactly the kind of thing where a Lead role gives you time to level up on strategic tech while shipping.`
	}
];

// ============================================================================
// TIER 3: Generic / Contextual Questions (Original Placeholders)
// ============================================================================

export const genericContextualQuestions: InterviewQuestion[] = [
	{
		q: 'What does "not fit for purpose" mean in the context of a data platform?',
		a: `A platform is fit for purpose when it **reliably delivers the data its consumers need, in the form they need, at the cadence they require, with trustworthy quality**.

"Not fit for purpose" means it's failing one or more of those: slow to deliver features, data quality is unpredictable, governance is weak, users can't trust the numbers, or changes ripple unpredictably across the system. At thinkmoney, the medallion exists but doesn't serve BI, doesn't support streaming or AI, and requires workarounds and external platforms to fill the gaps.

The fix isn't always a rewrite. It's usually: **clarify what "purpose" is, measure how far you are, then fix the biggest friction point first**. Then iterate.`
	},
	{
		q: 'How do you build trust in a data platform?',
		a: `**Transparency, consistency, and follow-through**. 

Transparency: **publish schema, document metrics, explain how data moves**. If someone asks "where did this number come from?" they should get a traceable answer, not a shrug.

Consistency: **same metric defined once**. If Finance and Marketing both report "revenue", they're using the same SQL, dbt model and lineage.

Follow-through: **fix issues promptly**, communicate postmortems honestly, and **don't ship bad data to production once**. After the first incident, users lose faith and build their own pipelines.

As a lead, I'd also **involve stakeholders early**: data scientists, compliance, product. They don't always know what they need until you show them something. Iteration breeds confidence.`
	},
	{
		q: 'What would you do in your first week at thinkmoney?',
		a: `**Listen**. One-on-ones with every person on the data team, the Head of Data & AI, the lead ML engineer, the lead BI analyst and the lead applied AI engineer. What breaks most often? What's the friction? What's thinkmoney uniquely bad at?

Then: **audit the platform by running a high-value report end-to-end**. Which SSIS packages run? Where are the handoffs? Where do people have to manually intervene? That gives me the system map faster than documentation.

By end of week: **a short "state of the data estate" summary** for the Head of Data & AI, with observations, no solutions yet. And a commitment to the team: "We're going to fix the things that hurt most, together."

Speed comes later. First week is about understanding.`
	},
	{
		q: 'What would success look like in your first 90 days?',
		a: `**One complete domain rebuilt and trusted**. Probably customers/accounts (it's foundational), running end-to-end in the new architecture (Bronze/Silver/Gold with medallion done right), with tests passing, reconciliation against the old system validated, and one Power BI report migrated and performing better.

That's not a lot of surface area, but it's **highly visible, it proves the approach works, and it builds trust with the team and stakeholders** to tackle the next domains.

Supporting: **a working governance practice** (data contracts with source teams, clear ownership of datasets, a metrics catalogue), and **a hiring plan** because a Lead role carrying all the work is not scaling.`
	}
];

// ============================================================================
// Registry: every question set, used by Interview Mode and progress tracking
// ============================================================================

export type QuestionTier = 'Pipeline' | 'Your stories' | 'Honest gaps' | 'General';

export interface QuestionSet {
	id: string;
	label: string;
	tier: QuestionTier;
	questions: InterviewQuestion[];
}

export const questionSets: QuestionSet[] = [
	{ id: 'ingestion', label: 'Ingestion', tier: 'Pipeline', questions: ingestionQuestions },
	{ id: 'validation', label: 'Validation', tier: 'Pipeline', questions: validationQuestions },
	{ id: 'bronze', label: 'Bronze', tier: 'Pipeline', questions: bronzeQuestions },
	{ id: 'silver', label: 'Silver', tier: 'Pipeline', questions: silverQuestions },
	{ id: 'gold', label: 'Gold', tier: 'Pipeline', questions: goldQuestions },
	{ id: 'terraform', label: 'Terraform', tier: 'Your stories', questions: terraformQuestions },
	{ id: 'cicd', label: 'CI/CD', tier: 'Your stories', questions: cicdQuestions },
	{ id: 'pyspark', label: 'PySpark', tier: 'Your stories', questions: pysparkQuestions },
	{ id: 'reporting', label: 'Report templating', tier: 'Your stories', questions: reportTemplatingQuestions },
	{ id: 'discovery', label: 'Business discovery', tier: 'Your stories', questions: businessProblemDiscoveryQuestions },
	{ id: 'dbt', label: 'dbt', tier: 'Honest gaps', questions: dbtGapQuestions },
	{ id: 'testing', label: 'Testing', tier: 'Honest gaps', questions: testingGapQuestions },
	{ id: 'ai-mcp', label: 'AI / MCP', tier: 'Honest gaps', questions: aiMcpGapQuestions },
	{ id: 'general', label: 'General', tier: 'General', questions: genericContextualQuestions }
].map((s) => ({ ...s, tier: s.tier as QuestionTier, questions: s.questions.filter((q) => q.a) }));

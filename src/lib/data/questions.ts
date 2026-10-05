import type { InterviewQuestion } from './stages.ts';

// ============================================================================
// TIER 1: Real Stories (Your Actual Experience)
// ============================================================================

export const ingestionQuestions: InterviewQuestion[] = [
	{
		q: 'How would you migrate from SSIS to Kinesis without losing data?',
		keyPoints: [
			'Challenge the premise: what works stays',
			'What Kinesis is actually for',
			'Parallel run + reconcile before cutover (DMS lessons)',
			'Full load + CDC from a recorded LSN; idempotent writes',
			'Two data-loss risks and their mitigations'
		],
		a: `First I'd push back on the premise a little: I wouldn't migrate SSIS CDC to Kinesis at all on day one. **SSIS CDC is the part of the platform that works**, and the JD says "evolve and reuse what works". Kinesis is for **new event sources** (card auths, app events) where we need sub-minute latency. CDC from SQL Server is a different problem.

If we did later move CDC off SSIS, I'd do it the way I ran DMS migrations: **run the new path in parallel with the old one**, land both in Bronze, and reconcile before cutting over. Concretely: take a full load plus CDC from a recorded LSN, so there's no gap between snapshot and change stream. Make writes **idempotent**, keyed on primary key + LSN, so replays never duplicate. Compare daily **row counts, checksums on key columns and financial totals** (balances, transaction sums) between the two paths. Only switch consumers once the numbers match for an agreed period, and keep SSIS warm as a rollback.

The data-loss risks I'd call out are **CDC log retention** (if the log is truncated before we read it, changes are gone silently), so we need **LSN-lag alerting**, and Kinesis retention, so we land to S3 via Firehose straight away and never treat the stream as the system of record.`
	},
	{
		q: 'Your system has both batch CDC and streaming real-time events. How do you reconcile them?',
		keyPoints: [
			'Two views that must agree, not two copies',
			'Shared Bronze envelope',
			'Merge rule: event time, then source priority',
			'Provisional stream vs authoritative batch',
			'Reconcile by aggregates (and why finance cares)'
		],
		a: `I'd treat them as **two views of the business that must agree at the end of the day**, not two copies of the same data.

Design rules: both paths land in Bronze with the same **metadata envelope** (source system, event/LSN id, event time, ingest time). Silver merges on a **business key with event-time ordering**, so a late batch record and an earlier stream record resolve deterministically: latest event time wins, ties broken by source priority (SQL Server is the system of record for balances).

Then **reconcile explicitly**. The stream gives a fast, provisional view (e.g. today's card spend). The nightly CDC batch is authoritative. A reconciliation job compares counts and totals per account per day and flags drift above a threshold to the quarantine/ops queue.

From my 2021 SQL Server-to-RDS migration and later Redshift work, reconciliation by **aggregates (sums, counts per partition) is far cheaper and more convincing to finance stakeholders** than row-by-row diffing. In an FCA firm, being able to show "streamed figures were reconciled to the ledger" is a control in its own right.`
	},
	{
		q: "You've done AWS DMS migrations. Would you use DMS at thinkmoney instead of SSIS CDC?",
		keyPoints: [
			'Not as an opening move',
			'What DMS is good at, and where it bites',
			'The one question to ask before replacing SSIS',
			'Triggers that would make you revisit it'
		],
		a: `Maybe, eventually, but not as an opening move. **DMS is good at what I used it for: moving SQL Server into RDS or Redshift with full load + ongoing replication**, with very little custom code. It has real limits too. LOB handling needs tuning, it needs sensible task and table mappings, and you have to watch replication lag and validate the target yourself. DMS's built-in validation helps but isn't a substitute for business reconciliation.

At thinkmoney the question I'd ask is **"what problem does replacing SSIS solve?"** If SSIS CDC is reliable, the bigger wins are elsewhere: streaming, a rebuilt medallion, the semantic layer. I'd revisit DMS (or log-based CDC into Kinesis/MSK) if SSIS became a constraint: a hosting move off on-prem SQL Server, latency requirements batch can't meet, or the cost of maintaining SSIS packages and skills in the team.

So my answer is: I know how to do it and where it bites, which is exactly why I wouldn't do it just because it's newer.`
	},
	{
		q: 'How do you make ingestion idempotent and replayable?',
		keyPoints: [
			'Deterministic identity per record',
			'Append-only landing',
			'MERGE, not blind INSERT',
			'Watermarks (your Step Functions / DynamoDB story)',
			'The "9am re-run" test'
		],
		a: `Three things. First, every record carries a **deterministic identity**: for CDC that's **primary key + LSN/sequence**; for events, a producer-generated **event id**. Second, **landing is append-only in Bronze**, partitioned by ingest date, so reprocessing never destroys history. Third, downstream loads are **MERGE/upsert on that identity** rather than blind inserts, so running the same load twice gives the same result.

Operationally I'd orchestrate with **Step Functions** (or the existing scheduler if that's what's in place), with each run recording a **watermark**: last LSN or Kinesis sequence processed. A rerun starts from a chosen watermark. That's the pattern I've used for ETL in Talend/Matillion and **PySpark**: we built Step Functions jobs that orchestrate PySpark transformations in EMR, with watermark tracking in DynamoDB for resumability. The tooling changes, but "**watermark + idempotent merge**" is the bit that matters.

The test is simple: can an engineer safely re-run yesterday's load at 9am without asking anyone? If not, it isn't idempotent yet.`
	},
	{
		q: 'How would you design the Kinesis streaming path for card and app events?',
		keyPoints: [
			'Choosing the partition key',
			'Schema validation + dead-letter stream',
			'Durable copy via Firehose',
			'Lambda first, Flink when…?',
			'PCI: what never enters the stream'
		],
		a: `Producers (card processor webhooks, app backend) publish to **Kinesis Data Streams** with a **partition key that spreads load but keeps per-entity ordering**, usually account or customer id. Before landing, events are **validated against a registered schema**; failures go to a **dead-letter stream** rather than being dropped.

Consumers: **Firehose delivers every event to S3 Bronze**, buffered and compressed, as the durable copy. Anything needing real-time action (fraud signals, app notifications) reads the stream directly via **Lambda**, or Flink if we need windowed aggregations and state. I'd be honest that Flink adds operational complexity; I'd start with Lambda + Firehose and introduce Flink when a use case needs stateful processing.

Security: **PANs never enter the stream**. Tokenise at source for PCI-DSS scope reduction, KMS encryption, and **IAM producers/consumers scoped per stream**. Monitoring: iterator age, throttled records, DLQ depth. My hands-on Kinesis/Firehose experience is the landing side; the stateful processing is where I'd lean on the team and on spikes before committing.`
	},
	{
		q: 'An upstream team changes a SQL Server column without telling you. What happens and how do you stop it happening again?',
		keyPoints: [
			'Short term: fail loudly, never silently',
			'Recovery is a replay from Bronze',
			'Long term: data contracts',
			'Shared ownership, made visible by lineage'
		],
		a: `Short term: the pipeline should **fail loudly or quarantine, never silently load wrong data**. Schema checks at Bronze→Silver catch new, removed or retyped columns; affected loads stop, and the previous Gold stays in place with a freshness warning rather than showing broken numbers.

Fix: assess the change, update the model, **backfill from Bronze**. Because Bronze is raw and replayable, recovery is a re-run, not a re-extract.

Long term it's a **people and process fix** more than a tooling one. **Agree data contracts with source owners** for the tables we depend on: columns, types, semantics, notice period. Add a lightweight check in their release process (even a CI step that diffs schema against the contract). Make the data team a reviewer on changes to contracted tables.

As a lead, I'd frame it as **shared ownership**: product teams aren't wrong to change their systems, they just need to know who depends on them. Lineage makes that visible.`
	},
	{
		q: 'What would you use to ingest data from SQL Server into the platform? Why that choice, and what are your fallbacks?',
		keyPoints: [
			'Primary: SSIS CDC (why keep it)',
			'Secondary: AWS DMS (when, and your experience)',
			'Tertiary: log-based streaming CDC for specific tables',
			'Firehose is delivery, not extraction',
			'Name the switch triggers'
		],
		a: `**Primary: SSIS CDC, kept as it is.** It already captures changes from SQL Server reliably, the team knows it, and replacing it adds risk without adding value. I'd point its output at the new S3 Bronze landing zone and add monitoring: LSN lag, run duration, row counts.

**Secondary: AWS DMS (full load + ongoing CDC).** This is the managed alternative, and it's what I've used in production migrations. I'd move to it if SSIS became the constraint: SQL Server moving to RDS or off-premises, SSIS skills leaving the team, or the cost of maintaining packages outgrowing the value. The playbook is the one I've run before: parallel run, reconcile counts and totals, cut over, keep SSIS warm as rollback.

**Tertiary: log-based streaming CDC** (DMS with a Kinesis target, or Debezium on MSK Connect) for **specific tables that need sub-minute latency**. More moving parts and more on-call burden, so only where the business case is real.

One clarification I'd make in the room: **Firehose isn't an extraction tool for SQL Server**; it's the delivery stream that lands events in S3. For new event sources (card authorisations, app events) the pattern is producers → Kinesis Data Streams → Firehose → S3.

**Switch triggers**: hosting change, latency requirement batch can't meet, or SSIS maintenance cost.`
	}
];

export const validationQuestions: InterviewQuestion[] = [
	{
		q: "What's the difference between schema validation and data quality testing?",
		keyPoints: [
			'Schema = "is it shaped right?" (where does it run?)',
			'Quality = "is it true and fit for use?" (needs context)',
			'Example of valid-but-wrong',
			'Tools and placement at thinkmoney'
		],
		a: `**Schema validation** asks "**is this record shaped correctly?**": right columns, types, nullability, enum values, parseable dates. It's structural and cheap, and it belongs **at the edge**: as data lands in Bronze or as events enter the stream. Failure means the record can't be processed.

**Data quality testing** asks "**is this data true and fit for use?**": uniqueness, referential integrity, valid ranges, freshness, completeness against the source, reconciliation to totals. It needs context (other tables, history, business rules), so it runs on Silver and Gold models.

A record can pass schema validation and still be wrong: a correctly-typed transaction amount that's 100x too big, or a customer with no account. At thinkmoney I'd run **schema checks at ingestion with quarantine**, and quality tests as **dbt tests (plus something like Soda or Great Expectations for distribution checks) gating promotion to Gold**.`
	},
	{
		q: "How would you handle data that's technically valid but suspicious (e.g., implausible values)?",
		keyPoints: [
			'"Definitely wrong" vs "unusual"',
			'Block vs warn',
			'Anomaly checks against history',
			'Someone must look: route to fraud/ops',
			'Review alert volume'
		],
		a: `In my previous role, we dealt with exactly this in Google GA4 data. The schema was perfect: right columns, types, everything valid. But the data was **full of bot traffic and cookie conflicts**. Google kept changing their data capture, and they're too big to hold accountable.

**Distinguish between "definitely wrong" and "unusual"**. Hard rules (negative balance where the product can't go negative, a date in the future) **fail and quarantine**. Suspicious-but-possible data (a spike in direct debits, a £50k transaction on a basic account) should **warn, not block**. Blocking real data is its own incident.

Implementation: **anomaly checks comparing against history**, e.g. daily volume outside a rolling band, null rate jump, distribution shift. Results are recorded as quality metrics with severity levels. Warnings go to the dataset owner's channel; errors stop promotion to Gold.

The important part in fintech is that **someone looks at it**. Some "suspicious data" is actually fraud or a real operational issue. For GA4, we built bot-detection rules on IP patterns, click velocity and user-agent anomalies. If we hadn't filtered bots, session-to-application metrics would've been completely wrong. And S2A moves the needle—a 1% improvement increased revenue by 7 figures. So the schema was valid, but the data was dirty.`
	},
	{
		q: 'Testing is an area you say you are growing in. What testing strategy would you put in place?',
		keyPoints: [
			'Be honest: ETL is the strength, testing is growing',
			'Five layers: unit → data tests → reconciliation → CI → observability',
			'Where Claude Code fits',
			'Start with reconciliation to source (why?)'
		],
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
		keyPoints: [
			'Quarantine, never drop',
			'What a quarantine record contains',
			'When the whole load stops',
			'Fix at source, replay from Bronze',
			'Audit trail + KPI per source'
		],
		a: `**Quarantine, never silently drop.** Failed records go to a quarantine table or dead-letter queue with the **original payload, the rule that failed, the load id and a timestamp**. The rest of the batch carries on, unless the failure rate breaches a threshold, in which case the whole load stops because it probably indicates a systemic issue.

Then there's a **feedback loop**: quarantine is triaged daily, root causes are fixed at source wherever possible (the upstream team or the mapping), and corrected records are **replayed through the normal pipeline from Bronze**, not hand-patched in Gold.

For a regulated firm this matters because **quarantine is an audit trail**. If the FCA or internal audit asks why a figure moved, we can show exactly which records were held, why and when they were corrected. I'd also report **quarantine volume per source as a KPI**, which is a good conversation starter with source system owners.`
	},
	{
		q: 'How do you avoid alert fatigue in data quality monitoring?',
		keyPoints: [
			'Severity and ownership',
			'What actually pages out of hours',
			'Tune for actionability',
			'Root-node alerting via lineage',
			'Freshness as the first-class check'
		],
		a: `**Severity and ownership**. Every check has a severity (block / warn / info) and an owning team, and **only "block" pages anyone out of hours**. Most checks should notify a channel during working hours.

**Tune for actionability**: if an alert fires and the correct response is "ignore it", the check is wrong. I'd review the noisiest checks regularly and either fix the threshold, fix the data or delete the check. **Aggregate related failures**, so one upstream outage creates one incident, not 40 test failures. Lineage helps here: **alert on the root node, suppress downstream**.

And make **freshness the first-class check**. In my experience the most common real incident is "the data didn't arrive", not "the data was subtly wrong". A clear **freshness SLA per Gold dataset** covers a lot of ground with few alerts.`
	},
	{
		q: 'How would you validate the medallion rebuild against the existing SQL Server platform?',
		keyPoints: [
			'Treat it like a migration',
			'Parallel run, prove equivalence',
			'Highest-value outputs + automated reconciliation',
			'When numbers differ, the old one may be wrong',
			'Cut over domain by domain'
		],
		a: `**Same discipline as a migration**, which is where most of my experience is. **Run old and new in parallel and prove equivalence before anyone switches a report**.

Pick the **10–20 highest-value outputs first**: regulatory figures, finance dashboards, key KPIs. For each, define **reconciliation queries**: totals and counts by day/product/segment in both platforms, with an agreed tolerance (zero for money). **Automate them so they run every day** of the parallel period, and publish the results so stakeholders can see convergence.

Where numbers differ, it's often the old platform that's wrong. **Undocumented logic in SSIS packages or Power BI measures is common**. Those differences need a business decision and a written record, not a quiet fix. Only when a domain has reconciled for an agreed period do we cut over its Power BI reports and retire the old objects.`
	}
];

export const bronzeQuestions: InterviewQuestion[] = [
	{
		q: 'Why separate Bronze/Silver/Gold instead of just landing raw data and transforming once?',
		keyPoints: [
			'Each layer: different job, different consumer',
			'Bronze → replay · Silver → conformed truth · Gold → business questions',
			'What goes wrong if you transform once',
			'Names don’t fix it; contracts do'
		],
		a: `Because **each layer has a different job and a different consumer**, and mixing them is how platforms become "not fit for purpose".

**Bronze is the raw, immutable record**: it lets you **replay history when logic changes or a bug is found**, without re-extracting from production SQL Server. **Silver is cleaned and conformed truth** (one customer, deduplicated, typed), reused by many marts. **Gold is shaped for specific business questions**.

If you transform once from raw straight to reports, every report **re-implements cleaning**, the same customer logic is **duplicated with slight differences**, and when something's wrong you can't tell whether it's the source, the cleaning or the business logic. **Layers give you places to test, clear ownership and cheap reprocessing**.

That said, the layers are a means, not an end. thinkmoney already has bronze/silver/gold and it isn't working, so the names alone don't fix anything. **What matters is the contract each layer guarantees**.`
	},
	{
		q: "When would you break medallion architecture? What's a case where one layer is better?",
		keyPoints: [
			'When layers cost more than they protect',
			'Real-time operational example',
			'Reference data + exploration examples',
			'Default, not a religion: the non-negotiables'
		],
		a: `When the **extra layers cost more than they protect**. Examples:

**Real-time operational use cases**: a fraud signal from card authorisations needs a decision in milliseconds. That's processed on the stream itself; it still lands in Bronze for history, but the operational path doesn't wait for Silver/Gold.

**Small, clean, single-use reference data**: a static lookup from a trusted vendor file may go almost straight to Silver. **Forcing three layers adds latency** and models nobody needs.

**Exploration**: data scientists sometimes need Bronze-level detail directly, in a sandbox, with appropriate PII controls.

The principle I'd take into the role: **medallion is a default, not a religion**. The **non-negotiables are: raw retained for replay, tested before business use, governed access**. If a simpler path meets those, take it. Saying this matters at thinkmoney because "rebuild properly" can easily turn into over-engineering.`
	},
	{
		q: "thinkmoney's medallion exists but isn't fit for purpose. How would you assess it in your first 90 days?",
		keyPoints: [
			'Listen and measure before redesigning',
			'Days 0–30: inventory (where Claude Code helps)',
			'Days 30–60: diagnose (typical findings)',
			'Days 60–90: target architecture + one domain end-to-end'
		],
		a: `**Listen and measure before redesigning**. "Evolve what works" applies to the medallion too.

**First 30 days: inventory**. What's in each layer, which SSIS packages build it, who consumes what (Power BI usage stats are gold dust here), what breaks and how often. Talk to analysts and the team about their pain. I'd use **Claude Code to accelerate reading SSIS package XML and stored procedures** to map lineage.

**Days 30–60: diagnose** against what each layer should guarantee. Typical findings: **Bronze isn't actually raw** (transformed on landing, so no replay), **business logic is scattered** across SSIS, views and Power BI, no tests, no clear ownership, and SQL Server can't scale or stream.

**Days 60–90: a target architecture and an incremental plan**. Pick **one domain** (e.g. customers/accounts, which is also the CDP foundation), rebuild it end-to-end in the new pattern, reconcile against the old, cut over and prove value. Then repeat domain by domain rather than doing a big bang.`
	},
	{
		q: 'How do you handle GDPR right-to-erasure in an immutable Bronze layer?',
		keyPoints: [
			'The tension: erasure vs FCA/AML retention',
			'Minimise PII: identity vault + surrogate keys',
			'Crypto-shredding',
			'Row-level deletes (table format)',
			'Explicit lifecycle rules'
		],
		a: `There's real tension, and in banking it's compounded because **FCA and AML record-keeping rules often require retaining data for years**. Erasure may legitimately be refused or deferred for regulated records. Legal/DPO decide that; data engineering makes it executable.

**Technical patterns: minimise PII in Bronze**, tokenising or separating identifying fields into a dedicated, tightly-controlled store keyed by a surrogate id. **Erasure then becomes deleting or crypto-shredding the identity record** (per-customer or per-partition keys), leaving the analytical history anonymised.

If PII must sit in Bronze, use a **table format that supports row-level deletes** (Iceberg on S3), so erasure is a governed delete job with an audit log, not a manual rewrite of files.

**Retention policies should be explicit lifecycle rules** per dataset (S3 lifecycle / Iceberg expiry), documented against the regulatory basis for keeping them.`
	},
	{
		q: 'Where would Bronze physically live: SQL Server, S3 or Iceberg?',
		keyPoints: [
			'Why not SQL Server',
			'Why S3',
			'What Iceberg adds (4 things)',
			'Be honest about the maintenance cost'
		],
		a: `**I'd move Bronze to S3**, and I'd seriously consider **Iceberg as the table format**.

**SQL Server as Bronze has problems**: storage cost, it competes with OLTP and reporting for resources, and it's a poor fit for streaming landings or large history. **S3 is cheap, durable** and the natural landing zone for Firehose and file feeds, and it decouples storage from compute.

**Iceberg adds what plain Parquet files lack: ACID writes, schema evolution, time travel** (great for "what did we know on date X?" questions, which regulators ask) and **row-level deletes for erasure**. It's queryable from Athena, Redshift, Spark and Snowflake, which avoids lock-in.

I'd be honest about complexity: **Iceberg needs table maintenance** (compaction, snapshot expiry) and the team needs to learn it. So: **start with S3 + Iceberg for Bronze** where streaming and history matter, keep SSIS landing CDC changes into it, and grow from there.`
	},
	{
		q: 'What metadata should every Bronze record carry?',
		keyPoints: [
			'"Where, when, which load?"',
			'Source + change id + operation type',
			'Two timestamps (which?)',
			'Load id, schema version, payload hash',
			'Your load-id story'
		],
		a: `Enough to answer **"where did this come from, when and in which load?"** without guesswork:
- **source system and object** (e.g. sqlserver.core.accounts)
- **source change identifier**: CDC LSN/sequence, or event id
- **operation type** for CDC (insert/update/delete)
- **event time** (when it happened) and **ingest time** (when we received it)
- **load/batch id** linking back to the orchestration run
- **schema version**
- **a hash of the payload**, for duplicate detection and reconciliation

These columns **make idempotent merges, late-data handling, lineage and audit possible**. It's a small cost per row and it saves days during incidents. In my migration work, having a **load id on every row was the single most useful thing** when proving to stakeholders which load produced which figure.`
	},
	{
		q: 'How would you store Bronze data? Why that choice over the alternatives?',
		keyPoints: [
			'Primary: S3 + Iceberg (four reasons)',
			'Secondary: plain Parquet on S3, or Redshift for a query-heavy subset',
			'Tertiary: Delta Lake (only with Databricks)',
			'Why not SQL Server staging tables'
		],
		a: `**Primary: S3 with Apache Iceberg tables.** Cheap, durable storage that scales without planning, plus what Bronze specifically needs: **append-only history you can replay**, **schema evolution** without rewriting data, **ACID writes** so a failed load never leaves half a partition, **time travel** for "what did we receive on date X?", and **row-level deletes** for GDPR erasure. Spark, Glue, Athena and Redshift can all read it, so we're not locked to one engine.

**Secondary: plain Parquet files on S3** (partitioned by ingest date) if the team isn't ready for Iceberg's table maintenance yet. Simpler, but no transactions or row-level deletes, so erasure means rewriting files. Separately, **Redshift** for a query-heavy subset, though Bronze is rarely queried interactively, so that's seldom worth the cost.

**Tertiary: Delta Lake**, which offers similar features but makes most sense if Databricks is the compute platform. thinkmoney isn't there, so it would add a platform decision we don't need to make.

**Why not keep SQL Server staging tables** as Bronze: storage cost, competition with OLTP and reporting workloads, no streaming landing, and in practice they tend to be transformed on load, which destroys the ability to replay.`
	}
];

export const silverQuestions: InterviewQuestion[] = [
	{
		q: 'How would you merge batch CDC and streaming events into one Silver table?',
		keyPoints: [
			'Same envelope first',
			'Merge ordering (three tie-breakers)',
			'Late data: lookback + full rebuild',
			'States of one record; ledger is the system of record'
		],
		a: `**Normalise both into the same envelope in Bronze** (business key, event time, source, sequence), then **build Silver with an incremental merge that orders by event time, then source sequence, then source priority**.

**Late-arriving data is the hard part**. I'd use a **lookback window on incremental runs** (reprocess the last N days of keys touched) rather than assuming data arrives in order, and support a **full rebuild from Bronze** for when the logic changes.

Where streams and CDC describe the same entity (e.g. a card transaction streamed in real time, then settled via the core banking CDC), I'd **model them as states of one record**: authorised → settled, with the **SQL Server ledger as the system of record** for the final value. That's a modelling conversation with finance as much as an engineering one.`
	},
	{
		q: 'Explain SCD Type 2 and when you would use it here.',
		keyPoints: [
			'Mechanics: close old row, insert new',
			'The columns that make it work',
			'Which attributes at thinkmoney (and why regulators care)',
			'What NOT to SCD2',
			'CDC as the feed + tests'
		],
		a: `**SCD2 keeps history by closing the old row and inserting a new version** whenever a tracked attribute changes, with **valid_from / valid_to and an is_current flag**. You can then ask **"what did this look like on date X?"**

At thinkmoney I'd use it for **customer attributes that matter historically**: address (affordability and fraud), product/tariff, risk rating, vulnerability flags (Consumer Duty). Those are exactly the questions **regulators and complaints teams ask: "what did we know about this customer at the time?"**

I wouldn't use it on **high-churn columns like current balance**. That's a fact/snapshot table, not a dimension. **CDC is a great feed for SCD2** because it gives you every change with ordering. I've built SCD2 merges in SQL and ETL tools before. In dbt it's **snapshots or an incremental merge model**, with tests that each key has exactly one current row and no overlapping validity windows.`
	},
	{
		q: 'How do you build a single customer view for the Customer Data Platform?',
		keyPoints: [
			'Identity resolution in Silver',
			'Deterministic first → crosswalk table',
			'Probabilistic carefully (the banking risk)',
			'Consent as a first-class attribute',
			'PII masking; CDP/AI read Gold only'
		],
		a: `**Identity resolution in Silver**. Customers appear across core banking (SQL Server), cards, the app and support systems with different ids. **Start with deterministic matching on strong identifiers** (customer number, verified email/phone), producing a **customer_key and a crosswalk table** from each source id to that key. **Add probabilistic matching later if needed**, but carefully, because **a false merge in banking is a data protection incident**.

Then **build conformed customer dimensions (SCD2)** and activity facts keyed on **customer_key**, and consent and marketing preferences as first-class attributes, so the CDP respects them by design.

**Governance**: **PII columns tagged at Silver**, masked by default, unmasked only for authorised roles. The CDP and any Claude/MCP access read from Gold/semantic layer, never raw identity tables.`
	},
	{
		q: 'Where should business logic live: SSIS, SQL views, dbt or Power BI?',
		keyPoints: [
			'Version-controlled, tested code',
			'Rule of thumb: one job per layer',
			'Migrate logic domain by domain',
			'Claude Code on legacy SSIS/T-SQL'
		],
		a: `**In version-controlled, tested transformation code**, which in the target state means **dbt models over Silver/Gold**, with metric definitions in the semantic layer. **Not scattered across SSIS data flows, SQL views and DAX measures**, which is usually why numbers disagree today.

**Rule of thumb**: **Silver holds technical cleaning and conforming**, **Gold holds business logic**, the **semantic layer holds metric definitions** (what is an "active customer"), and **Power BI holds presentation only**.

Migration-wise, I wouldn't rip logic out of SSIS overnight. As each domain is rebuilt, **extract its logic into dbt, test it against the old outputs and retire the SSIS transformation steps**, while SSIS CDC continues doing ingestion. **Claude Code is genuinely useful here** for reading legacy SSIS/T-SQL and drafting equivalent dbt models that an engineer then reviews and tests.`
	},
	{
		q: 'Where would Silver live: Iceberg in S3, Redshift tables, or both? How do you decide?',
		keyPoints: [
			'Primary: Iceberg on S3, queried by Athena/Spark/Redshift',
			'Secondary: copy hot, critical datasets into Redshift',
			'Tertiary: Redshift only (the legacy pattern)',
			'Decision rule: who queries it, how often, how fast'
		],
		a: `**Primary: Iceberg on S3**, built by dbt (on Athena or Glue) and Spark where needed. Silver is mostly read by **other pipelines**, not humans, so cheap storage with **snapshot history** (useful for audits and for debugging "what changed?") matters more than interactive speed. Redshift can still query it via Spectrum, and Athena covers ad-hoc work.

**Secondary: both, selectively.** If a Silver dataset is queried heavily and interactively (e.g. the conformed customer table used by analysts every day), materialise a copy in Redshift. The cost is a second copy to keep in sync, so it needs a reason and a freshness check comparing the two.

**Tertiary: Redshift only**, the traditional warehouse pattern. It works, but storage and compute are tied together so cost grows with history, you lose cheap time travel, and streaming or Spark workloads have to go through the warehouse.

**Decision rule**: who queries it (pipelines or people), how often, and what latency they need. Default to Iceberg; promote to Redshift when usage proves it. Iceberg gives **history**; lineage comes from dbt and the catalogue, not the storage format.`
	}
];

export const goldQuestions: InterviewQuestion[] = [
	{
		q: 'How would you prioritise which Gold marts to rebuild first?',
		keyPoints: [
			'Value × pain × dependency',
			'Which domain usually wins, and why',
			'Regulatory: early but cautious',
			'Win in weeks; retire unused reports'
		],
		a: `**Value × pain × dependency**. I'd score candidate domains on **business value** (regulatory reporting, finance and exec KPIs score highest), **current pain** (incidents, manual workarounds, disagreeing numbers) and **how foundational they are**.

**Customers/accounts usually wins**: it's foundational for the CDP, every other mart joins to it, and it's where **inconsistent definitions hurt most**. Regulatory datasets come early too, but with more caution and sign-off, and the old process kept in parallel longer.

I'd avoid starting with the hardest domain. The **first rebuild needs to be visibly successful in weeks, not quarters**, to build trust with stakeholders and the team. Then use **Power BI usage data to retire reports nobody opens** rather than migrating them.`
	},
	{
		q: 'How do you stop metric definitions drifting across teams?',
		keyPoints: [
			'Define once, in the semantic layer',
			'Owner + PR approval for certified metrics',
			'Tests that guard key metrics',
			'Certified vs exploratory',
			'Why the AI angle raises the stakes'
		],
		a: `**Define each metric once, in the semantic layer**, with a **named owner and a written definition**, and **make every consumer read from it**: Power BI, ad-hoc SQL and Claude via MCP. **If Power BI has its own DAX version of "active customer", drift is inevitable**.

**Process**: a lightweight **metrics catalogue**. **Changes to a certified metric go through a PR** with the owner's approval, and **tests guard key metrics** (e.g. active customers can't change by more than X% day-on-day without explanation). **Certified vs exploratory datasets are clearly labelled** so analysts know what's safe for board packs.

The **AI angle makes this more important**: if Claude answers "how many active customers do we have?", it must use the **same definition as the exec dashboard**, or trust in both disappears.`
	},
	{
		q: 'Why aggregate in Gold rather than letting Power BI do it?',
		keyPoints: [
			'What goes wrong with logic in Power BI',
			'Compute once, test, reuse',
			'Star schemas for BI',
			'Keep atomic facts too'
		],
		a: `**Power BI is good at presenting and slicing**, but **pushing heavy aggregation and business logic into it causes**: duplicated logic per report, slow refreshes, inconsistent numbers and logic nobody can test or version properly.

**Gold pre-aggregates where it makes sense** (daily account snapshots, monthly cohort summaries, regulatory return tables), so they're **computed once, tested, documented and reused** by BI, the semantic layer and AI. **Power BI then reads well-shaped star schemas** and does light, interactive aggregation on top.

The balance: **don't pre-aggregate everything**. Keep atomic facts in Gold so new questions can still be answered, and **add aggregates where performance or consistency demands it**.`
	},
	{
		q: 'How would you treat Gold as a product?',
		keyPoints: [
			'Owner, SLA, docs, tests, consumers',
			'Product discipline for changes',
			'Retire what nobody queries',
			'Ownership as a growth path for the team'
		],
		a: `**Each Gold dataset has an owner**, a description, a freshness SLA, documented columns, tests and **known consumers** (dbt exposures linking marts to Power BI reports and MCP tools). Consumers can see in the catalogue when it last refreshed and whether its tests passed.

**Changes follow product discipline**: versioning for breaking changes, deprecation notices, usage tracking. **If nothing has queried a mart in 90 days**, we discuss retiring it.

For the team, this also gives engineers **clear ownership and something to be proud of**. As a line manager I'd use **domain ownership as a growth path**: a junior can own a small mart end-to-end with support.`
	},
	{
		q: 'How would you serve Gold datasets: Redshift, Iceberg, or something else?',
		keyPoints: [
			'Primary: Iceberg as system of record + Redshift for BI serving',
			'Power BI connectivity detail (private Redshift → gateway)',
			'Secondary: Iceberg + Athena only (cost-led)',
			'Tertiary: a different warehouse, only at much larger scale'
		],
		a: `**Primary: Iceberg on S3 as the system of record, served through Redshift** for BI. Gold marts are built once (dbt), kept in Iceberg for history and regulatory snapshots, and the marts Power BI uses are materialised in Redshift (or queried through Spectrum where performance is fine). Redshift gives fast, concurrent queries, workload management, **row-level security and dynamic data masking**. A practical detail: if Redshift is private in a VPC, as it should be, the Power BI service needs a **data gateway** to reach it.

**Secondary: Iceberg plus Athena only**, if Redshift cost isn't justified by usage. It's cheaper and pay-per-query, but slower for interactive dashboards, so Power BI would lean on import mode or caching, and concurrency limits need watching.

**Tertiary: a different warehouse** (e.g. Snowflake) only if scale, multi-cloud or an existing enterprise agreement demanded it. thinkmoney is nowhere near needing that, and it would be a rebuild for the sake of rebuilding.

How I'd decide: start with Redshift Serverless for the BI-facing marts (pay for what's used), measure query volume and cost for a quarter, then decide whether provisioned Redshift or Athena-only fits better.`
	}
];

// ============================================================================
// NEW TIER 1 SECTIONS: Your Real Technical Stories
// ============================================================================

export const terraformQuestions: InterviewQuestion[] = [
	{
		q: 'Walk us through your Terraform infrastructure-as-code work.',
		keyPoints: [
			'Scope: modules for the whole AWS data stack',
			'terraform import of console-built resources',
			'The near-miss and its lesson',
			'GitHub + GoCD gated promotion',
			'Where Claude Code helped'
		],
		a: `Between 2023 and 2026, I built **Terraform modules for a complete AWS data stack**: RDS (SQL Server, Postgres), S3 buckets with lifecycle policies, Lambda functions, EventBridge rules, Glue jobs for ETL, DMS tasks, and EC2 instances. I also did **extensive "terraform imports"** to align infrastructure that had been created ad-hoc in the AWS console, bringing it under version control so it was reproducible and auditable.

The steepest learning curve was understanding **state management and the blast radius of changes**. Early on, a Terraform plan nearly destroyed a production database. That was a hard lesson, but it taught me to **never apply directly to production**. 

Our deployment pipeline used **GitHub for version control and GoCD to orchestrate**. Every change went through **dev → QA → production, with manual approval at each gate**. A junior could propose infrastructure, others reviewed the Terraform plan, and we only applied after explicit human review. This governance prevented incidents and gave the team confidence.

**Claude Code made this dramatically easier**, especially for scaffolding module structure, documenting inputs/outputs and writing variables.tf. The AI speed-read existing modules and generated sensible patterns. We experimented with GitHub Actions but ran into configuration and licensing issues with our setup, so GoCD remained our CI/CD orchestrator.

The real win: **infrastructure changes are now code reviews, not console clicks**. Disaster recovery, scaling, cost optimization—all auditable and reproducible.`
	},
	{
		q: 'How do you prevent Terraform from destroying production resources?',
		keyPoints: [
			'Human review of the plan',
			'State isolation',
			'Lifecycle guards (prevent_destroy, -target)',
			'The near-miss that proved it'
		],
		a: `**Three layers of protection**:

1. **Human review gates**: every prod change requires explicit approval of the Terraform plan. No auto-apply.
2. **State isolation**: prod state lives in a separate S3 backend with versioning and MFA delete, accessed only by CI/CD with tight IAM roles.
3. **Destructive operation flags**: I'd add -target to limit scope, and critical resources get lifecycle rules (e.g. prevent_destroy on production RDS instances).

We learned this when a Terraform plan nearly deleted a production database. The engineer spotted it during plan review—that's exactly why the process exists. We built better variable validation and data source queries to catch assumptions early.`
	},
	{
		q: 'How do you version control your infrastructure while development happens in the console?',
		keyPoints: [
			'The tool that bridges console → code',
			'Console as scratch space only'
		],
		progressiveReveal: false,
		a: `**Terraform import**. For every resource created manually in AWS console, we'd run terraform import to bring it under version control. It's tedious but essential for reproducibility.

I'd push back on console development as a team practice going forward: it's a toddler phase. But for migrating legacy infrastructure, terraform import is the bridge. It lets you treat the console as a temporary scratch space, then formalize the result in code.`
	}
];

export const cicdQuestions: InterviewQuestion[] = [
	{
		q: 'Describe your CI/CD pipeline for data infrastructure.',
		keyPoints: [
			'GitHub + GoCD, PR review first',
			'The five steps dev → prod',
			'Why manual gates (the incident)',
			'Why not GitHub Actions',
			'Monitoring + postmortems'
		],
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
		keyPoints: [
			'Immediate: roll back (how?)',
			'Within an hour: postmortem questions',
			'Fix the test or the process, not the person',
			'Low bar for rollback = speed'
		],
		a: `**Immediate**: rollback to the last known-good state, which we can do in minutes because everything is versioned. Concretely, for data, that means reverting the dbt or Terraform change and re-running from the last good commit. For infrastructure, Terraform keeps state history.

**Within an hour**: postmortem. What was the change? Why didn't tests catch it? What gate failed? What process failed?

**Fix**: update the tests or the process. If a schema change broke a downstream job, we add a test for that. If a Terraform plan was hard to read, we add more comments. If humans missed something, we discuss adding an automation check (not as a punishment, but as a learning).

We kept a very low bar for rolling back because reversibility meant we could move fast without fear.`
	}
];

export const pysparkQuestions: InterviewQuestion[] = [
	{
		q: 'Tell us about your PySpark work.',
		keyPoints: [
			'GA4: Matillion bottleneck → in-house PySpark',
			'Lambda 15-min timeout → EMR',
			'Versioned Redshift procs → rebuild from a commit',
			'Wins + the downside (cluster babysitting)',
			'DataFrames vs Spark SQL'
		],
		a: `We used **PySpark in two contexts**:

**First**: **GA4 data transformation** (Google BigQuery → S3). We started with Matillion's PySpark component, but that was a bottleneck—every change needed a rebuild, and performance was unpredictable. **We moved the transformation in-house as a Python/PySpark job**, version-controlled in GitHub, deployable as a **Step Functions job orchestrated by Lambda**.

**Second**: **Lambda timeout mitigation**. Some ETL tasks were compute-heavy and regularly hit Lambda's 15-minute timeout. We migrated those to **PySpark on EMR**, launched by Step Functions. It was slower to start (cluster provisioning) but much more reliable for large aggregations.

**Third**: **Versioning Redshift stored procedures**. We kept all sprocs in GitHub as SQL files, deployed via Python scripts and PySpark jobs, so disaster recovery was straightforward: we could rebuild the cluster from a commit hash and know exactly what ran when.

The wins: **version control for transformations**, reliable scaling beyond Lambda's limits, and **easy rollback**. The downside: PySpark clusters need babysitting (hanging jobs, cost surprises if you forget to terminate), so we added monitoring.

I've written DataFrames and Spark SQL both. DataFrames are cleaner for complex multi-step logic; Spark SQL is better for analytical queries people understand. I'd use **both pragmatically** at thinkmoney.`
	},
	{
		q: 'How do you handle PySpark job failures in production?',
		keyPoints: [
			'Orchestration + retries (Step Functions)',
			'What you monitor for (3 failure types)',
			'Idempotent outputs: run-date/run-id partitions + MERGE',
			'Rollback to last known-good'
		],
		a: `**Orchestration is key**. Step Functions runs the PySpark job (or several in sequence) and retries are built in: if a job times out, we retry once. If it fails again, Step Functions triggers a Lambda that sends an alert to Slack and quarantines the data.

**Monitoring**: Cloudwatch logs stream directly to DataDog (or equivalent). We watch for OOM errors (scale the cluster), shuffle spills (data's too wide), and long executors (stuck in a join).

**Idempotency**: the same principles as Kinesis: every job writes to a **partitioned S3 location keyed by run date and run id**, and the next stage uses **MERGE/upsert on the run id**, so re-running is safe.

**Rollback**: if a job produced bad data, we can quickly re-run from the last known-good commit, which we track in Git tags or DynamoDB metadata.`
	}
];

export const reportTemplatingQuestions: InterviewQuestion[] = [
	{
		q: 'Report templating and design discipline—tell us about the impact you saw.',
		keyPoints: [
			'The 2013 template: header, footer, data dictionary',
			'Before: three different "revenue" numbers',
			'After: "report 102 is wrong" → minutes to resolve',
			'3-digit IDs the company was trained on',
			'What you’d bring to thinkmoney'
		],
		a: `Back in 2013, one company **used a wireframing tool** (predecessor to Figma) with a **standardised report template**: header (report ID, description, version, last updated, data refresh date), footer (page numbers), and a centre slot for content. **Every report had a data dictionary at the back**, explaining metric definitions and key terms.

**The impact was transformational**. Without it, disputes about revenue figures were common: Finance, HR and Sales all had different "revenue" numbers because they used different calculations. With templating and a data dictionary, the question became **specific: "this number in my 102 report is wrong"**, and the data engineer could go straight to report 102, read the dictionary, verify the formula, and resolve it in minutes.

**Additionally**, every report got a **3-digit ID that the whole company was trained to use**. Instead of "the sales report" (which one?), it was "report 102". This eliminated confusion and made **incident response immediate**.

The wins: **consistency, clarity, speed**. Reports didn't become political. Data dictionaries meant users understood what they were reading. The template prevented siloed design decisions. And the ID system prevented "which report?" becoming the first 10 minutes of every troubleshooting call.

At thinkmoney, I'd bring back that discipline. It seems like overhead but it's the opposite: it saves time and prevents disputes. It also raises the bar for what gets published—not every table becomes a report, only ones that meet the standard.`
	},
	{
		q: 'How would you institute report governance at thinkmoney?',
		keyPoints: [
			'Template + naming convention (6 elements)',
			'Report catalogue + publishing standard',
			'Deprecation with notice',
			'Clarity, not bureaucracy'
		],
		a: `**Start with a template and a naming convention**. Every report has:
- A **3-digit ID** (report 101, 102, etc.)
- A **brief purpose statement** ("daily fraud detection summary")
- **Refresh frequency and time**
- **A data dictionary page** at the end explaining every metric and how it's calculated
- **Clear ownership** (which team owns this?)
- **Known consumers** (which Power BI dashboards or emails use this?)

**Process**: a lightweight **report catalogue** in Confluence or the semantic layer tool. New reports must have a owner and meet the template standard before publishing. Deprecated reports are marked "retiring on date X" to give consumers time to migrate.

**This isn't bureaucracy—it's clarity**. Users know what they're reading, data engineers can quickly find the authoritative version, and disputes are resolved by reference, not politics.`
	}
];

export const businessProblemDiscoveryQuestions: InterviewQuestion[] = [
	{
		q: 'Tell us about a time you questioned the brief and found a different problem.',
		keyPoints: [
			'The brief: GDPR redaction pipeline',
			'The real problem you found',
			'What you proposed, and the outcome',
			'The cost of not pushing harder',
			'The lesson + psychological safety as a lead'
		],
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
		keyPoints: [
			'What you have done (side project)',
			'What appeals to you (4 features)',
			'What you haven’t done',
			'The GDPR work where you wanted it',
			'What you’d do in the role'
		],
		a: `I've **tried dbt on a side project** and liked it. What appeals to me: **version control for transformations, automated documentation, column-level lineage, the 'ref' function** that creates explicit dependencies. What I haven't done: **large-scale dbt projects, the full dbt Cloud setup, advanced testing patterns**.

At my last company, I **wanted to use dbt for the GDPR redaction work**—I knew it would've saved us time and kept lineage clean. I wasn't given the budget/priority. So it's on my growth list. If I join thinkmoney, **I'd contribute to dbt models immediately and level up on best practices with the team**. 

I don't claim dbt expertise, but I understand the philosophy and I'm keen to build it properly.`
	}
];

export const testingGapQuestions: InterviewQuestion[] = [
	{
		q: 'Testing is an area you say you are growing in. What testing strategy would you put in place?',
		keyPoints: [
			'Be honest: ETL is the strength, testing is growing',
			'Five layers: unit → data tests → reconciliation → CI → observability',
			'Where Claude Code fits',
			'Start with reconciliation to source (why?)'
		],
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
		keyPoints: [
			'The concept in one sentence',
			'Honest: not built one',
			'Why governance comes first',
			'Semantic layer first, then MCP',
			'Partner with the applied AI team'
		],
		a: `**I understand the concept**: an MCP server exposes a semantic layer as a structured interface so that LLMs like Claude can **query data safely**—constrained to approved tables, masked PII, audited access. **I haven't built one**. But I've seen how it matters: the fintech world will increasingly rely on AI to answer business questions. If your data platform doesn't have a governed semantic layer, **you can't safely expose it to Claude or other LLMs**.

At thinkmoney, I'd **focus on getting the semantic layer right first** (metrics, conformed dimensions, column tagging), then expose it via MCP. I'd **work closely with your applied AI team** to understand what they need. 

**This isn't something I claim expertise in**, but I understand the architecture, and **I'm keen to learn it properly**. It's exactly the kind of thing where a Lead role gives you time to level up on strategic tech while shipping.`
	}
];

export const sourcesQuestions: InterviewQuestion[] = [
	{
		q: 'How would you audit the existing sources in your first 30 days?',
		keyPoints: [
			'Inventory: tables, volumes, what SSIS extracts',
			'Who depends on each source',
			'Talk to source owners: what hurts?',
			'Week 2: a simple lineage map',
			'Day 30: a source scorecard (4 measures)'
		],
		a: `**Inventory first, then understand dependencies**. I'd run queries against thinkmoney's core banking SQL Server, cards system, and app backend to answer:
- **What tables exist and how large are they?** Row counts, growth rate per day
- **What's currently being extracted?** Which SSIS packages touch which tables, at what frequency
- **Who depends on each source?** Power BI reports, downstream systems, APIs
- **What's missing?** Data you'd expect to exist but doesn't (event logs, audit trails)

Then I'd **talk to source system owners**: product, core banking, fraud teams. "What breaks in your system? What would you ask data for if you could?" Often the pain isn't in the data itself, it's in the friction of getting it out.

**Week 2**, I'd **build a simple lineage map**: source tables → SSIS packages → Bronze → Gold → Power BI reports. That shows me which domains are foundational (customers, accounts, transactions) and which are isolated (nice-to-have).

By day 30 I'd have a **source scorecard**: reliability (how often does it fail?), freshness (latency from event to arrival), completeness (are there gaps?), and **data quality** (how much cleaning happens downstream?). That scorecard tells me which sources to focus on first for improvement.`
	},
	{
		q: 'How do you agree data contracts with upstream product teams?',
		keyPoints: [
			'A mutual promise, not a burden',
			'Listen first: removes blame',
			'What the written contract contains',
			'CI schema check in their pipeline',
			'Version contracts; start with three critical sources'
		],
		a: `**Make it mutual and lightweight**, not a burden. A **data contract** is a promise: "If you produce data shaped like X on schedule Y, we'll deliver it to analytics as Z by time T."

**Process**:
1. **Listen first**: what does the source team actually care about? Often it's not the data itself, it's being blamed when things go wrong. A contract removes blame—it's explicit.
2. **Document the contract in writing**: table name, column names/types, primary key, expected row count range, freshness SLA (e.g. "within 5 minutes"), and what happens on failure (alert, quarantine, retry).
3. **Build a lightweight check**: a CI step in their release pipeline that diffs schema against the contract. If they add a column without telling us, the build fails. They have to update the contract and notify data.
4. **Make it two-way**: we commit to processing it on time. If we miss SLA, we notify them. If they miss theirs, they notify us. No surprises.

**From my experience**, the magic is in **naming the contract explicitly**. Instead of "the customer table", it's "Contract v1.2: core.customer". Versions matter because schema changes are managed, not chaotic.

**As a lead**, I'd **start with the three most critical sources** (customers, transactions, fraud signals) and prototype the process there. Once it works, other teams want in because they see the stability.`
	}
];

// ============================================================================
// PIPELINE: Semantic layer + Consumers
// ============================================================================

export const semanticQuestions: InterviewQuestion[] = [
	{
		q: 'How would you design a semantic layer that both BI and Claude can query safely?',
		keyPoints: [
			'One set of metric definitions, two front doors',
			'What Claude can and cannot touch',
			'PII handled before the semantic layer, enforced again in it',
			'Audit every query',
			'Lineage from metric back to source'
		],
		a: `**One set of definitions, two front doors.** Metrics and dimensions are defined once (dbt Semantic Layer / MetricFlow, or Cube) on top of Gold. Power BI consumes them through a connector or certified datasets; Claude consumes them through an **MCP server that exposes the semantic layer, not the warehouse**.

The safety comes from **constraining what can be asked, not trusting what is asked**:
- **Claude gets metrics and approved dimensions only**: no raw tables, no free-form SQL against Bronze/Silver.
- **PII never reaches the layer in clear text**: Gold is pseudonymised, and PII-tagged columns are blocked as AI dimensions. Small groups are suppressed (e.g. minimum group size of 10) to prevent re-identification.
- **Row-level security follows the caller**: the MCP server passes the user's identity through, so Claude sees exactly what that analyst could see in Power BI, no more.
- **Every call is audited**: user, tool, arguments, rows returned, policy checks passed. In an FCA firm that audit trail is a control, not a nice-to-have.
- **Lineage**: every metric resolves to dbt models and source columns, so "where did this number come from?" has an answer.

Honestly, I haven't built an MCP server yet, but the design principle is the same one I'd apply to any API over sensitive data: **least privilege, defined contracts, full audit**.`
	},
	{
		q: 'Define "active customer". How do you make sure everyone uses the same definition?',
		keyPoints: [
			'It is a business decision, not a SQL decision',
			'Make the definition precise (window, events, exclusions)',
			'One owner, one place, certified',
			'Changes go through review'
		],
		a: `First point: **it's a business decision, not a data engineering one**. My job is to make the ambiguity visible and get it decided. "Active" could mean logged in, transacted, or had a balance. Those give very different numbers.

A good definition is precise: **"a customer with at least one customer-initiated transaction in the trailing 30 days, excluding fees, interest and internal transfers, on an open account."** Each clause matters. Without "customer-initiated", a monthly fee makes a dormant account look active.

Then make it the only definition:
- **Defined once in the semantic layer**, with a **named business owner** (e.g. Head of Analytics) and a plain-English description.
- **Certified**: Power BI reports and the MCP server read the certified metric. A DAX re-implementation in a report is treated as a defect.
- **Changes via pull request** with owner approval, and a test that alerts if the metric moves more than an agreed % day-on-day.
- **Variants are named, not hidden**: "active_customers_30d" and "active_customers_90d" can coexist if the business genuinely needs both.

The report-ID and data-dictionary discipline I used years ago solved exactly this problem: disputes became "check the definition", not politics.`
	},
	{
		q: 'How would you design the MCP server that lets Claude access thinkmoney data?',
		keyPoints: [
			'Tools, not SQL: a small set of typed tools',
			'Identity pass-through + row-level security',
			'Policy checks before execution',
			'Audit log + rate limits',
			'Start read-only, small, with the applied AI team'
		],
		a: `I'd treat it as a **product API with a deliberately small surface**, and I'd be upfront that I'd build it with the applied AI team rather than claim prior MCP experience.

Design:
- **Tools, not raw SQL**: e.g. \`list_metrics\`, \`describe_metric\`, \`get_metric(metric, dimensions, filters, period)\`. Each tool has a typed schema, so Claude can only ask questions the semantic layer can answer.
- **Identity pass-through**: the server acts on behalf of the signed-in user (SSO), applying the same row-level security as Power BI. No shared "god" service account.
- **Policy checks before execution**: block PII dimensions, enforce minimum group sizes, cap row counts, restrict time ranges.
- **Audit everything**: every tool call logged with user, arguments, rows returned and checks passed; logs retained with personal data redacted.
- **Rate limits and cost guards**: stop a looping agent hammering the warehouse.
- **Read-only, always**: no write tools in phase one.

Delivery: start with **five to ten certified metrics** that people actually ask about (balances, active customers, arrears), let a pilot group use it, review the audit logs together, then widen. The audit log doubles as product research: it shows which questions people ask that we can't answer yet.`
	},
	{
		q: 'How do you tag columns for PII and sensitivity, and what do the tags actually do?',
		keyPoints: [
			'A small, clear classification scheme',
			'Tag once, in code, at Silver',
			'Tags drive enforcement (masking, access, AI exposure)',
			'Tags drive erasure and retention too',
			'CI check: no untagged columns in Gold'
		],
		a: `Tags are only useful if they **drive enforcement automatically**; otherwise they're documentation that goes stale.

**Scheme** (keep it small): \`public\`, \`internal\`, \`confidential\`, \`pii_direct\` (name, email, phone), \`pii_indirect\` (postcode, DOB), \`pci\` (should never exist past ingestion), \`special_category\` (e.g. vulnerability flags).

**Where**: tagged **once, in code**, in the dbt model YAML at Silver, and inherited downstream through lineage. Lake Formation LF-Tags (or the catalogue) mirror them so AWS-level permissions follow the same scheme.

**What the tags do**:
- **Access**: \`pii_direct\` columns are masked by default; unmasking needs a role with a recorded justification.
- **AI exposure**: the semantic layer refuses PII-tagged dimensions in MCP tools.
- **Erasure and retention**: RTBF jobs find every PII column via tags plus lineage, not tribal knowledge.
- **Quality gate**: a CI check fails any PR that adds an untagged column to Gold.

This connects to my GDPR redaction experience: the hard part wasn't deleting data, it was **knowing where PII lived**. Tags plus lineage solve that up front.`
	},
	{
		q: 'How do you version metrics and handle breaking changes?',
		keyPoints: [
			'What counts as a breaking change',
			'Version, run in parallel, deprecate',
			'Use lineage/exposures to find who is affected',
			'Communicate and annotate history'
		],
		a: `**Breaking** means the number changes meaning: a new definition of active customer, a currency or timezone change, a removed dimension. Adding a dimension or fixing a documented bug is usually non-breaking.

For breaking changes:
1. **Version it**: \`active_customers\` v1 stays; v2 is published alongside, clearly labelled.
2. **Run both in parallel** for an agreed window and publish the difference, so stakeholders see the impact before it's forced on them.
3. **Find every consumer** via dbt exposures and the MCP audit log: which Power BI reports, which tools, which teams.
4. **Deprecate with a date**: v1 is marked "retiring on X", owners migrate, then v1 is removed.
5. **Annotate history**: dashboards show a marker where the definition changed, so a step-change in a trend isn't misread as real.

Regulatory figures get stricter treatment: historic submitted numbers never change; restatements are explicit and signed off. It's the same discipline as API versioning: **consumers should never be surprised**.`
	},
	{
		q: 'What are conformed dimensions and why does one customer view matter?',
		keyPoints: [
			'Definition: shared dimensions, same keys everywhere',
			'Without them: numbers that do not join or agree',
			'At thinkmoney: customer, account, date, product',
			'The CDP and AI depend on it'
		],
		a: `A **conformed dimension** is one shared definition of an entity (customer, account, product, date) used by every fact table and mart, with the **same keys and the same attributes**. It's what lets you combine numbers from different domains and trust the result.

Without it, cards counts customers one way, core banking another, the app a third. "Customers who used the app and missed a payment" becomes impossible or wrong, because the joins don't line up.

At thinkmoney I'd prioritise:
- **dim_customer**: built from identity resolution in Silver (a single customer_key with a crosswalk to each source id), SCD2 for attributes that matter historically.
- **dim_account**, **dim_product**, **dim_date**: boring but essential.

Why it matters more now:
- The **Customer Data Platform** is a conformed customer dimension plus activity facts.
- **Claude via MCP** will happily join anything it's offered. Conformed dimensions mean it can only join things that are actually comparable.
- **Regulatory and Consumer Duty** questions ("how did vulnerable customers fare?") need one agreed view of who the customer is.`
	},
	{
		q: 'How would you expose the semantic layer to BI and AI tools: Redshift views, an MCP server, or both?',
		keyPoints: [
			'Primary: one metric layer; Power BI via connector/certified datasets, Claude via MCP',
			'Secondary: Redshift views as a thin interim layer',
			'Tertiary: MCP-only (why it does not work for BI)',
			'Same definitions for both, always'
		],
		a: `**Primary: one semantic layer (dbt Semantic Layer or Cube) with two front doors.** Power BI connects through the layer's connector or certified datasets generated from it; Claude connects through an **MCP server that calls the same metric definitions**, with identity pass-through, policy checks and audit logging. Both read Redshift underneath. The point is that **"active customers" means the same thing on the exec dashboard and in Claude's answer**.

**Secondary: Redshift views as a thin semantic layer**, a pragmatic first step. Curated views with agreed metric logic, RLS and masking applied in Redshift, and Power BI reading them directly. It's simple and fast to deliver, but metric definitions live in SQL views (harder to version and document), and an MCP server on top has to re-implement access logic. I'd accept this as a phase one if it gets governed metrics in front of people sooner.

**Tertiary: MCP only.** Fine if AI were the main consumer, but Power BI dashboards need direct, fast, cached access; routing BI through an AI-oriented API would be slow and odd.

Whichever path: **definitions in version control, a named owner per metric, and both consumers reading the same source**.`
	}
];

export const consumersQuestions: InterviewQuestion[] = [
	{
		q: 'What is the difference between Power BI and MCP access as ways of consuming data?',
		keyPoints: [
			'Power BI: visual exploration, curated by humans',
			'MCP: structured, programmatic access for AI',
			'Different risks for each',
			'Same semantic layer underneath'
		],
		a: `They serve different jobs, but they should sit on **the same governed foundation**.

**Power BI** is visual exploration and reporting. A human designs the report, chooses the visuals, and consumers slice within those boundaries. Risks: logic creeping into DAX, report sprawl, numbers that drift from the source of truth.

**MCP** is structured, programmatic access: Claude calls tools with typed arguments and gets data back to reason about. There's no human designer between the question and the query. Risks: an over-broad tool exposing too much, re-identification through fine-grained slicing, confident answers built on the wrong metric.

So the controls differ:
- Power BI: certified datasets, RLS, a report catalogue, usage tracking.
- MCP: a small set of tools, identity pass-through, policy checks (no PII dimensions, minimum group sizes), full audit logging.

What they share is the important bit: **both read the same metric definitions from the semantic layer**. If the exec dashboard and Claude disagree on active customers, trust in both disappears.`
	},
	{
		q: 'How would you enable analysts to write SQL safely (self-serve)?',
		keyPoints: [
			'Give them a governed place to play',
			'Certified vs sandbox datasets',
			'Access controls do the safety work',
			'Cost and performance guardrails',
			'A path from sandbox to production'
		],
		a: `Self-serve works when the **platform makes the safe thing the easy thing**, rather than relying on everyone being careful.

- **Governed access to Gold (and some Silver)**: analysts query through Athena or Redshift with their own identity. Lake Formation / RLS controls apply; PII columns are masked unless their role allows it.
- **Certified vs sandbox**: certified datasets are labelled and safe for board packs; each analyst or team gets a sandbox schema to build their own tables, clearly marked as non-certified.
- **Guardrails**: query timeouts, workgroup cost limits, and no access to Bronze except for the platform team.
- **Documentation where they work**: dbt docs and the catalogue show definitions, owners and freshness, so they don't have to ask.
- **A path to production**: when a sandbox query becomes something people rely on, we promote it into a dbt model with tests and an owner. That's how good analyst work becomes platform work instead of shadow IT.

Claude Code can help here too: analysts drafting SQL against documented models get further, faster, and the guardrails still apply.`
	},
	{
		q: 'How would Claude be integrated into how thinkmoney consumes data? Give examples and constraints.',
		keyPoints: [
			'Three use cases: questions, explanations, engineering',
			'Constraints: governed metrics, identity, audit',
			'What Claude must not do',
			'Measure value and start small'
		],
		a: `I'd separate three uses, because they need different controls:

1. **Business questions via MCP**: "How did active customers change by product last month?" Claude calls certified metric tools, gets aggregates, and explains them. The answer cites the metric definition so people can check it.
2. **Explaining data**: "What does arrears_rate include?" Claude reads the semantic layer and catalogue documentation. Low risk, high value for new starters.
3. **Engineering with Claude Code**: the data team uses it to read legacy SSIS/T-SQL, draft dbt models and tests, write documentation. The JD calls this out explicitly.

**Constraints**:
- Only certified metrics and approved dimensions; no free-form SQL on customer-level data.
- The user's own permissions apply (identity pass-through).
- No PII in prompts or results; minimum group sizes enforced.
- Every call audited, and outputs used in decisions should be checkable by a human.
- Read-only.

I'd start with a pilot group and a handful of metrics, review the audit logs with them, and measure value: questions answered without a ticket to the data team.`
	},
	{
		q: 'You mentioned translating SSRS reports to QuickSight via YAML. Walk us through that approach.',
		keyPoints: [
			'SSRS reports are XML (RDL): parse them',
			'An intermediate YAML spec per report',
			'YAML → QuickSight via its API',
			'Reports become code: version control + review',
			'Data dictionary built in; CI tests reports when metrics change'
		],
		a: `It builds on the report discipline I learned back in 2013: report IDs, a standard template, and a data dictionary in every report.

**The approach**:
1. **SSRS reports are XML** (RDL files), so they can be parsed. I extracted the layout, the datasets and queries, and the calculations from each one.
2. **Convert each to a YAML spec**: report ID, title, purpose, owner, refresh schedule, the **data dictionary** (every metric and how it's calculated), metric definitions and the visual layout.
3. **YAML → QuickSight**: QuickSight dashboards can be created through its API from a definition, so the YAML is transformed into that definition and the dashboard is rebuilt. Where something didn't map cleanly, it was finished by hand, but the spec still recorded it.

**Why it's worth it**:
- **Reports become code**: version-controlled in GitHub, changes reviewed in a PR like any other code.
- **The data dictionary is built in**, not a PDF or Word document that goes stale.
- **CI/CD integration**: when a metric definition changes, every report that uses it can be identified and tested automatically.

At thinkmoney the target is Power BI rather than QuickSight, but the principle transfers directly: **a declarative report spec, generated from and checked against the semantic layer**.`
	},
	{
		q: 'Who owns the alerts on a Gold dataset?',
		keyPoints: [
			'Split by failure type: platform vs data vs business',
			'Named owner per dataset',
			'Route by severity',
			'Consumers get told, not surprised'
		],
		a: `Ownership depends on **what kind of failure it is**, so I'd split it explicitly:

- **Platform failures** (pipeline didn't run, job crashed, freshness SLA missed): the **data engineering team**, via an on-call rota during agreed hours.
- **Data quality failures** (tests fail, reconciliation drifts): the **dataset owner** in the data team, with the **source owner** pulled in when the root cause is upstream.
- **Business anomalies** (valid data, surprising numbers, e.g. a spike in arrears): the **business owner** of the metric. The data team flags it; they interpret it.

Every Gold dataset has a **named owner, an SLA and a severity per check** recorded in the catalogue, so routing is automatic rather than "whoever sees it in Slack".

And **consumers are told, not surprised**: if Gold is stale or failed a check, Power BI shows a freshness banner and the MCP server returns a warning with its answer. Nothing destroys trust faster than a finance director finding a broken number before the data team does.`
	},
	{
		q: 'How do you build a feedback loop with consumers to improve metrics and reports?',
		keyPoints: [
			'Measure usage (what is opened, asked, ignored)',
			'Make feedback easy and visible',
			'Regular review with metric owners',
			'Retire as well as add'
		],
		a: `**Measure what people actually do**, then talk to them.

- **Usage data**: Power BI usage metrics show which reports are opened and by whom; the MCP audit log shows what questions people ask, including ones we can't answer yet. That's the best backlog input there is.
- **Easy feedback**: every report and metric links to a feedback channel and its owner, so "this looks wrong" goes straight to the person who can fix it, with the report ID attached.
- **Regular review**: a short monthly session per domain with metric owners: what's confusing, what's missing, which definitions caused disputes.
- **Retire as well as add**: reports not opened in 90 days get a retirement notice. Fewer, trusted reports beat many disputed ones.

As a lead I'd also share wins back: "you asked for X, here it is". It turns stakeholders into partners and makes them more likely to report problems early.`
	},
	{
		q: 'How do you serve different consumer types (BI, self-serve SQL, AI)? What tooling?',
		keyPoints: [
			'BI: Power BI on certified Gold/semantic (RLS)',
			'Self-serve SQL: Redshift Query Editor v2 / Athena, IAM-gated, sandboxes',
			'AI: Claude via MCP, audited',
			'Secondary + tertiary options and their trade-offs',
			'Principle: separate doors, shared definitions'
		],
		a: `**Primary: a separate door per consumer type, all on shared definitions.**
- **BI**: Power BI on certified Gold marts and semantic-layer metrics, with Redshift row-level security following the user.
- **Self-serve SQL**: **Redshift Query Editor v2** and **Athena**, signed in with the analyst's own identity (SSO/IAM), masked PII by default, workgroup cost limits, and a sandbox schema per team.
- **AI**: Claude via the **MCP server**: a small set of metric tools, identity pass-through, every call audited.

Why: **least privilege, everything auditable, and each door tuned to how that consumer works**.

**Secondary: everything through semantic-layer views.** One place to manage, which is attractive. The cost is that self-serve analysts often need row-level data the semantic layer doesn't expose, and per-user security gets harder to express in shared views.

**Tertiary: everything through MCP/AI.** Interesting for the future, but asking finance to get their monthly pack through Claude rather than Power BI is a big behaviour change, and you still need structured BI for regulatory reporting.

I'd measure usage across all three doors (Power BI usage metrics, query logs, MCP audit) to see where demand actually is before investing further.`
	}
];

// ============================================================================
// ARCHITECTURE & GOVERNANCE: technology choices, masking, quarantine, redaction
// ============================================================================

export const technologyStackQuestions: InterviewQuestion[] = [
	{
		q: 'If you were building this platform, what would be your primary, secondary and tertiary systems?',
		keyPoints: [
			'Primary (keep): SSIS CDC from SQL Server',
			'Secondary (add): Kinesis → Firehose → S3/Iceberg',
			'Tertiary (fallback): DMS, Flink, and what triggers each',
			'Principle: evolve what works'
		],
		a: `I'd frame it as **keep, add, and hold in reserve**, which mirrors the JD's "evolve and reuse what works".

**Primary (keep): SQL Server CDC via SSIS.** It works, the team knows it, and rewriting it delivers no new business value. I'd wrap it with monitoring (LSN lag, run duration, row counts) and point its output at the new Bronze.

**Secondary (add): Kinesis for new real-time events** such as card authorisations and app events, with **Firehose landing everything in S3**, as Iceberg tables for durability, schema evolution and replay. Lambda handles simple real-time reactions.

**Tertiary (fallback, not day one)**:
- **AWS DMS** if SSIS becomes unmaintainable (hosting moves off on-prem, skills disappear, latency needs tighten). I've run DMS migrations, so I know the playbook: full load plus CDC, parallel run, reconcile, cut over.
- **Flink** (Managed Service for Apache Flink) if we need **stateful, windowed aggregations at scale**, e.g. real-time fraud features. Powerful but operationally heavy, so only when Lambda can't cope.

The trade-off I'd make explicit: every system added is something the team must run at 3am. **Each tertiary option needs a named trigger**, not just "it's modern".`
	},
	{
		q: 'Would you use S3/Iceberg for all medallion layers, or add polyglot stores like Redshift, DynamoDB, Neptune or OpenSearch?',
		keyPoints: [
			'What Iceberg is (plain explanation)',
			'Iceberg for Bronze/Silver/Gold as the system of record',
			'Redshift for fast BI on Gold',
			'DynamoDB / OpenSearch / graph only for specific jobs',
			'Every extra store must earn its place'
		],
		a: `First, what **Iceberg** is, because it's often misunderstood: it's an **open table format** that sits on top of Parquet files in S3. A catalogue (e.g. AWS Glue) tracks metadata and **snapshots**, which gives you database-like behaviour on cheap storage: **ACID writes, MERGE/upserts, schema evolution, time travel** ("what did this table look like on 1 March?") and **row-level deletes** for GDPR. Many engines read the same tables: Athena, Spark/EMR, Glue, Redshift and Snowflake. The trade-off: it needs maintenance (compacting small files, expiring old snapshots).

My default:
- **Bronze and Silver in Iceberg**: history, replay, schema evolution and erasure support.
- **Gold in Iceberg as the system of record, plus Redshift** where Power BI needs fast, concurrent queries. Redshift can query the Iceberg tables directly or hold materialised copies of the hottest marts.

Polyglot stores only for specific jobs:
- **DynamoDB**: operational state, e.g. pipeline watermarks or quarantine triage status. Not analytics.
- **OpenSearch**: full-text search, e.g. complaints or documents.
- **A graph store (Neptune)** for lineage: possible, but I'd use an off-the-shelf catalogue (DataHub, OpenMetadata or DataZone) before building one.

Rule: **every extra store is another thing to secure, monitor and pay for**, so it has to earn its place.`
	},
	{
		q: 'How do you decide when to add a new technology to the platform?',
		keyPoints: [
			'Start from a problem, not a tool',
			'Can an existing tool do it well enough?',
			'Total cost: skills, ops, security, money',
			'Spike, then decide with a written record'
		],
		a: `**Start from the problem**: "we need sub-minute fraud signals", not "we should use Flink".

Then ask, in order:
1. **Can something we already run do it well enough?** Lambda before Flink, Redshift before a new warehouse.
2. **What's the total cost?** Not just licences: skills in the team, on-call burden, security review, PCI/FCA implications, and how hard it is to leave later.
3. **What does the team think?** They'll run it. A lead imposing a favourite tool is how platforms become unmaintainable when that lead leaves, which is relevant at thinkmoney.

If it's still promising, **time-box a spike** (one or two weeks) against a real use case, then write a short decision record: the problem, options considered, the decision, and what would make us revisit it. Claude Code makes spikes much cheaper now, which is a good reason to test ideas rather than debate them.

That's how I'd apply "don't rebuild for the sake of rebuilding" to new technology too.`
	}
];

export const dataGovernanceQuestions: InterviewQuestion[] = [
	{
		q: 'How would you mask or encrypt sensitive data in Bronze/Silver, and make it available only to authorised users?',
		keyPoints: [
			'Three techniques: encryption, tokenisation, masking (when each fits)',
			'Layers: at rest, field-level, access policy',
			'Who sees what: IAM / Lake Formation / RLS / semantic layer',
			'Performance trade-offs',
			'UK examples: PAN, NI number, postcode'
		],
		a: `Three techniques, each for a different job:
- **Encryption** protects data from people who shouldn't have the key. Everything is encrypted **at rest with SSE-KMS (AES-256)** and in transit with TLS; that's the baseline. For the most sensitive fields, **field-level encryption** before landing (or Parquet column encryption where supported) adds a second layer with separate KMS keys.
- **Tokenisation** replaces a value with a meaningless token. **Card PANs are tokenised at ingestion**, so they never enter the platform and it stays out of PCI-DSS cardholder-data scope.
- **Masking** shows a partial value at query time: postcode **AB1 2CD → AB1 •••** (keeps the region for analysis), National Insurance number shown as **••••••••C**, email as **j•••@domain.com**.

**Who sees what**: IAM and **Lake Formation** column-, row- and tag-based permissions on S3/Iceberg; **Redshift row-level security and dynamic data masking** for Gold; the **semantic layer** filters what BI and Claude can see. Unmasked access is a separate role, granted with a recorded justification and reviewed regularly.

**Performance trade-offs**: randomly encrypted columns can't be filtered, joined or indexed efficiently; anything needing those operations must be decrypted first, which is slow and widens exposure. **Deterministic tokens** allow equality joins (e.g. on a tokenised customer id) without revealing the value, which is usually the right compromise for keys.`
	},
	{
		q: 'Design a quarantine system for the platform. What service, how is it administered, and how do you stop it becoming a data graveyard?',
		keyPoints: [
			'Service: Iceberg quarantine table in S3 (+ DLQ for streams)',
			'What each record holds',
			'Triage: owner, SLA, statuses',
			'Feedback loop: root cause → fix → replay',
			'Retention + metrics stop the graveyard'
		],
		a: `**Service**: an **Iceberg quarantine table in S3**, one per domain, written by both batch and streaming paths (Kinesis failures go to a dead-letter stream, then Firehose lands them in the same table). Using Iceberg means it's queryable in Athena, governed by the same Lake Formation rules as Bronze (it contains raw PII), and supports deletes for erasure. Triage **status** can live in the table itself; DynamoDB only if we build an interactive triage app.

**Each record**: original payload (or a pointer to it), source and load id, the rule that failed, severity, first-seen timestamp, status (\`new → triaged → fixed_at_source → replayed\` or \`discarded\`), assignee and root-cause note.

**Administration**:
- **Every rule has an owner**; failures route to the source owner's queue with a daily digest.
- **SLA by severity**, e.g. errors triaged within one working day.
- If the failure rate breaches a threshold, the **whole load stops**, because that's a systemic issue, not bad rows.

**Feedback loop**: fix at source where possible, add or adjust a rule if needed, then **replay from Bronze** through the normal pipeline. Never hand-patch Gold.

**Avoiding the graveyard**:
- **Retention**: records expire after **30 days**; anything unresolved by then is escalated, not silently dropped.
- **Metrics**: quarantine rate per source, top firing rules, age of open items, replay rate. Reviewed weekly; a source that is always in quarantine needs a conversation, not more storage.`
	},
	{
		q: 'Should you redact data backwards (from Consumers to Bronze) or forwards (from Bronze to Consumers), or both?',
		keyPoints: [
			'Forwards = prevention (minimise once, inherited downstream)',
			'Backwards = erasure (find every copy via lineage)',
			'You need both',
			'Design so backwards is cheap'
		],
		a: `**Both, for different purposes.**

**Forwards (prevention)**: minimise and protect PII **as early as possible**: tokenise at ingestion, split identifiers into an identity vault at Bronze, tag and mask at Silver. Everything downstream inherits the protection automatically. It's cheap because it's applied once, and it shrinks the problem for everything after it.

**Backwards (erasure)**: a right-to-erasure request arrives from the customer's side, and you must **find every copy**: Power BI caches, MCP logs, Gold marts, Silver, Bronze, archives, quarantine. That needs lineage and tags; without them it's spreadsheets and guesswork, which is exactly the GDPR redaction pain I lived through.

**The design goal is to make backwards cheap by doing forwards well**: if Gold only holds surrogate keys and the identity vault holds the PII, erasure is mostly **crypto-shredding one identity record** plus deleting live rows, rather than restoring and rewriting archives. And legal retention (e.g. MLR 2017) means some records are restricted and scheduled for deletion rather than erased immediately, so the trace has to record that decision too.`
	}
];

// ============================================================================
// TOOLSET REFERENCE: primary / secondary / tertiary choices across the platform
// ============================================================================

export const techStackReferenceQuestions: InterviewQuestion[] = [
	{
		q: 'Summarise your target toolset for thinkmoney end to end, in about a minute.',
		keyPoints: [
			'Ingest: SSIS CDC + Kinesis/Firehose',
			'Store: S3 + Iceberg; Redshift for BI serving',
			'Transform + orchestrate: dbt, Glue/EMR Spark, Step Functions',
			'Serve: semantic layer → Power BI + MCP',
			'Govern + run: Lake Formation, KMS, catalogue, CloudWatch, Terraform'
		],
		a: `**Ingest**: SSIS CDC from SQL Server stays (it works); Kinesis Data Streams and Firehose for new real-time events; files land straight in S3.

**Store**: S3 with **Iceberg tables** for Bronze, Silver and Gold as the system of record; **Redshift** serves the BI-facing Gold marts.

**Transform and orchestrate**: **dbt** for SQL transformations and tests; **Glue or EMR Spark** for heavy Python work (where my PySpark experience fits); **Step Functions** to orchestrate, alongside the existing SSIS scheduling.

**Serve**: a **semantic layer** with metrics defined once, consumed by **Power BI** and by **Claude through an MCP server**; Redshift Query Editor and Athena for self-serve SQL.

**Govern and run**: **Lake Formation** and Redshift RLS/masking for access, **KMS** encryption everywhere, a **catalogue with lineage** (Glue Data Catalog plus dbt docs, DataZone or DataHub), **CloudWatch** plus dbt freshness and quality checks for monitoring, all deployed with **Terraform** through a gated CI/CD pipeline.

The theme: **AWS-managed where possible, evolve what works, and add nothing without a named problem it solves**.`
	},
	{
		q: 'What is your primary tooling for data ingestion across batch, streaming and files? When would you switch?',
		keyPoints: [
			'Batch DB: SSIS CDC → (DMS)',
			'Streaming: Kinesis Data Streams → Firehose → S3',
			'Files: S3 landing + event triggers',
			'Third-party SaaS: managed connectors (AppFlow) before custom code',
			'Switch triggers'
		],
		a: `**Batch from databases**: primary **SSIS CDC** (keep); secondary **AWS DMS** if SSIS becomes the constraint; tertiary streaming CDC (DMS to Kinesis, or Debezium on MSK Connect) for tables that need sub-minute latency.

**Streaming events** (card authorisations, app events): primary **Kinesis Data Streams → Firehose → S3/Iceberg**, with Lambda for simple real-time reactions; secondary **Amazon MSK (Kafka)** if we need Kafka's ecosystem or very high fan-out; tertiary **Managed Service for Apache Flink** when we need stateful, windowed processing.

**Files** (bureau data, partner feeds): primary **S3 landing bucket with an event trigger** (EventBridge or S3 notifications) starting validation; secondary **AWS Transfer Family** if partners need SFTP.

**SaaS sources**: managed connectors such as **Amazon AppFlow** before writing custom API code; custom Lambda or Glue jobs only when no connector exists.

**When I'd switch**: latency requirements the current tool can't meet, operational pain (on-call load, failures), cost growth, or a skills gap in the team. Never because the alternative is newer.`
	},
	{
		q: 'What is your storage architecture across Bronze, Silver and Gold?',
		keyPoints: [
			'One format (Iceberg on S3) across all three layers',
			'Redshift only where people query interactively',
			'Glue Data Catalog as the Iceberg catalogue',
			'Lifecycle tiers: Standard → IA → Glacier',
			'Small stores for small jobs (DynamoDB state)'
		],
		a: `**Primary: Iceberg on S3 for all three layers**, registered in the **Glue Data Catalog**, so every engine (Athena, Glue, EMR, Redshift) sees the same tables. One format means one set of skills, one permission model (Lake Formation) and one erasure mechanism (row-level deletes).

**Serving layer: Redshift** for the Gold marts Power BI and analysts query interactively, loaded from or reading the Iceberg tables. Start with Redshift Serverless and size up once usage is known.

**Lifecycle**: S3 lifecycle rules move older Bronze partitions from Standard to Infrequent Access to Glacier Deep Archive, with expiry tied to retention rules (e.g. MLR 2017 record-keeping). Silver and most Gold can be rebuilt from Bronze, so they don't need archiving; regulatory snapshots do.

**Secondary**: plain Parquet on S3 if Iceberg maintenance (compaction, snapshot expiry) is too much for the team at first. **Tertiary**: Redshift for everything, the classic warehouse, which is simpler but costlier and loses cheap history.

**Supporting stores, each for one job**: DynamoDB for pipeline state such as watermarks; OpenSearch only if we need full-text search.`
	},
	{
		q: 'How would you run transformations: dbt, Spark on Glue or EMR, or Redshift SQL?',
		keyPoints: [
			'Primary: dbt for SQL transformations + tests',
			'Spark (Glue/EMR) for heavy Python and complex logic',
			'Redshift stored procedures: legacy, migrate away gradually',
			'Pick by workload, not by preference',
			'Your PySpark/EMR story'
		],
		a: `**Primary: dbt** for the bulk of transformations: SQL models with tests, documentation and lineage built in, running on **Athena/Glue for Iceberg layers** (dbt-athena or dbt-glue) and on **Redshift for the serving marts**. Most medallion logic is SQL, and dbt makes it reviewable, testable and versioned. I'm honest that dbt at scale is something I'm still building depth in, but it's the right default.

**Secondary: Spark on Glue or EMR** for what SQL handles badly: heavy Python logic, large reprocessing jobs, complex parsing, or ML feature preparation. **Glue** is serverless and Iceberg-native, good for scheduled jobs; **EMR** gives more control for very large or long-running work. I've used both patterns: PySpark jobs orchestrated by Step Functions, and moving compute-heavy work from Lambda to EMR when it hit the 15-minute limit.

**Tertiary: Redshift stored procedures.** Fine for logic that already lives there, and no data movement, but hard to test and review. I'd version-control the existing ones in Git (as I've done before) and migrate them into dbt over time.

**Rule**: choose by workload: SQL-shaped work goes to dbt, compute-heavy or Python work goes to Spark.`
	},
	{
		q: 'How would you orchestrate pipelines?',
		keyPoints: [
			'Primary: Step Functions (+ EventBridge schedules)',
			'Keep existing SSIS/SQL Agent scheduling where it works',
			'Secondary: Managed Airflow (MWAA) when dependencies get complex',
			'What good orchestration gives you (retries, watermarks, alerts)'
		],
		a: `**Primary: AWS Step Functions** with **EventBridge** schedules and event triggers. It's serverless, integrates natively with Glue, EMR, Lambda and Athena, has built-in retries and error branches, and it's what I've used in production: Step Functions orchestrating PySpark jobs, with watermarks stored for resumable reruns.

**Keep what works**: SSIS packages and their existing scheduling (SQL Server Agent) carry on; Step Functions picks up when the data lands in S3, triggered by the arrival event rather than a guessed time.

**Secondary: Amazon MWAA (managed Airflow)** if the dependency graph grows large and cross-cutting, with many teams, backfills and complex cross-pipeline dependencies, where Airflow's DAG model and ecosystem pay off. It costs more to run and needs Python DAG skills.

**Tertiary: dbt Cloud's scheduler** for dbt-only workloads, simple but limited to dbt.

Whatever the tool, good orchestration means **idempotent tasks, retries with backoff, watermarks for resumability, alerts routed to an owner, and run metadata (load ids) written for lineage**.`
	},
	{
		q: 'How would you enforce row-level security and column masking?',
		keyPoints: [
			'S3/Iceberg: Lake Formation (LF-Tags, row and cell filters)',
			'Redshift: RLS policies + dynamic data masking',
			'Semantic layer / MCP: policy checks on top',
			'Secondary: masked views; tertiary: app-level masking',
			'Defence in depth + audit'
		],
		a: `**Primary: enforce it where the data lives, then again where it's served.**
- **S3/Iceberg**: **AWS Lake Formation** with **LF-Tags** (tag-based access control driven by the PII tags from our dbt models), plus **row and cell-level data filters**. Athena, Glue, EMR and Redshift Spectrum all respect it.
- **Redshift**: native **row-level security policies** and **dynamic data masking** attached to roles, e.g. postcode masked to the outward code for most roles.
- **Semantic layer and MCP**: an additional policy layer: PII dimensions blocked for AI, minimum group sizes, everything audited.

That's **defence in depth with an audit trail**: CloudTrail for Lake Formation access, Redshift's system logs, MCP audit logs.

**Secondary: masked views** (a secure view per role). Works anywhere, but view sprawl becomes hard to manage and easy to bypass.

**Tertiary: masking in application code.** The legacy approach: slow to change, easy to get wrong, invisible to auditors.

Tag-based tools like **Apache Ranger** do similar things in Hadoop-style platforms; on AWS, Lake Formation LF-Tags is the native equivalent, so there's no reason to add Ranger.`
	},
	{
		q: 'What BI tooling would you use at thinkmoney?',
		keyPoints: [
			'Primary: Power BI (keep it), fixed underneath',
			'QuickSight: only with a clear reason (embedding, AWS-native)',
			'Tableau: no case at this scale',
			'Claude via MCP complements BI, does not replace it',
			'Report governance matters more than the tool'
		],
		a: `**Primary: Power BI, kept.** People know it, the reports exist, and licences are probably already covered by Microsoft 365. The problem isn't the BI tool, it's what's underneath, so I'd fix the foundations (certified Gold marts, a semantic layer, report templates and a catalogue) rather than migrate tools.

**Secondary: Amazon QuickSight, but only with a clear reason**, such as embedding dashboards in a customer-facing or internal web app, or a team that wants AWS-native, pay-per-session dashboards. My SSRS → YAML → QuickSight work showed the value of treating reports as code, and that principle applies to Power BI too. Running two BI tools without a reason doubles governance work.

**Tertiary: Tableau**, strong, but a premium licence with no gap it fills at thinkmoney's scale.

**Alongside, not instead: Claude via MCP** for ad-hoc questions in natural language. It complements dashboards; it doesn't replace governed, repeatable reporting, especially for regulatory packs.

More important than the tool: **report IDs, owners, a data dictionary, and retiring what nobody uses**.`
	},
	{
		q: 'How would you monitor the platform and alert on problems?',
		keyPoints: [
			'Primary: CloudWatch metrics, logs and alarms',
			'Data observability: dbt freshness/tests + quality checks',
			'Routing: severity → owner (SNS/Slack/on-call)',
			'Secondary: Datadog for cross-service visibility',
			'Measure the platform itself (SLAs, failures, cost)'
		],
		a: `Two kinds of monitoring, both needed:

**Infrastructure and pipelines: primary CloudWatch.** Kinesis iterator age, Firehose delivery errors, Lambda errors and duration, Glue/EMR job failures, Step Functions execution failures, Redshift queue time. Alarms go through **SNS to Slack**, and paging tools only for true out-of-hours severity.

**Data: freshness, volume and quality.** **dbt source freshness and tests** on every run, reconciliation checks against SQL Server, and quality checks (Soda, Great Expectations, or Elementary on top of dbt) for anomalies like volume drops or null spikes. Each Gold dataset has an owner and an SLA, and alerts route by severity, as I described for alert fatigue.

**Secondary: Datadog** (or similar) if we need one view across AWS, on-prem SQL Server and applications. Better correlation, at extra cost. I've used it to watch Spark jobs for OOM errors and stuck executors.

**Tertiary: custom-built monitoring jobs**, powerful but just more code to maintain.

And I'd monitor the platform as a product: **SLA hit rate, failed runs per week, time to recover, and cost per domain**.`
	},
	{
		q: 'How would you secure the platform: network, identity, encryption, secrets and audit?',
		keyPoints: [
			'Network: private VPC, VPC endpoints, no public data stores',
			'Identity: SSO, least-privilege roles, no long-lived keys',
			'Encryption: KMS at rest, TLS in transit, tokenised PANs',
			'Secrets Manager with rotation',
			'Audit + detection: CloudTrail, Config, GuardDuty, Macie'
		],
		a: `**Primary: the AWS-native baseline**, applied to every service from day one.

**Network**: everything in **private subnets of a VPC**; **VPC endpoints / PrivateLink** for S3, Kinesis, Glue and Secrets Manager so traffic never touches the internet; no public Redshift endpoints; on-prem SQL Server connected over **Site-to-Site VPN or Direct Connect**.

**Identity**: **SSO (IAM Identity Center)** for people, **least-privilege IAM roles** per pipeline and per team, no long-lived access keys, and **SCPs** in AWS Organizations to stop anyone disabling guardrails.

**Encryption**: **KMS** at rest everywhere (separate keys per domain or sensitivity), **TLS** in transit, and **PANs tokenised at ingestion** so the platform stays out of PCI-DSS cardholder-data scope.

**Secondary: secrets, audit and detection**, added in the first phase on top of the baseline.

**Secrets**: **AWS Secrets Manager** with automatic rotation for database credentials. No passwords in SSIS configs, code or Terraform state.

**Audit and detection**: **CloudTrail** (organisation-wide, immutable log bucket), **AWS Config** rules for drift, **GuardDuty** for threats, and **Macie** to find PII that has turned up somewhere it shouldn't in S3.

**Tertiary**: service-to-service **mTLS with a private CA** (ACM Private CA) only if a regulator or threat model demands it. TLS plus IAM is normally sufficient. Everything is defined in **Terraform** and reviewed in CI, so security is auditable as code.`
	},
	{
		q: 'How would you catalogue metadata and track lineage?',
		keyPoints: [
			'Technical catalogue: Glue Data Catalog (also the Iceberg catalogue)',
			'Transformation lineage: dbt docs/manifest',
			'Business catalogue: DataZone, DataHub or OpenMetadata',
			'Run-level lineage: load ids, OpenLineage events',
			'Do not build a graph database first'
		],
		a: `**Primary: build on what the stack already produces.**
- **Glue Data Catalog** is the technical catalogue: every Iceberg table, schema and partition, and it doubles as the table catalogue for Athena, Glue, EMR and Redshift.
- **dbt** generates model- and column-level lineage plus documentation for every transformation, and **exposures** link marts to Power BI reports and MCP tools.
- **Run-level lineage**: every row carries a load id, and orchestration records which run produced which partition.

**Secondary: a business catalogue** on top, such as **Amazon DataZone** (AWS-native), **DataHub** or **OpenMetadata** (open source), to bring together owners, definitions, PII tags, lineage graphs and data contracts in one searchable place for analysts and compliance. These can ingest dbt and Glue metadata automatically, and **OpenLineage** events from Spark and Airflow.

**Tertiary: a custom lineage graph** (e.g. on Neptune). Only if off-the-shelf tools genuinely can't model what we need, which is unlikely.

Why it matters at thinkmoney: **GDPR erasure, impact analysis before changes, and answering "where did this number come from?"** all depend on lineage. My GDPR redaction work taught me that lineage done afterwards in spreadsheets costs several times more.`
	}
];

// ============================================================================
// TIER 3: Generic / Contextual Questions (Original Placeholders)
// ============================================================================

export const genericContextualQuestions: InterviewQuestion[] = [
	{
		q: 'What does "not fit for purpose" mean in the context of a data platform?',
		keyPoints: [
			'Definition: 4 things consumers need',
			'Symptoms of failing them',
			'thinkmoney specifics',
			'Fix: define purpose → measure → biggest friction first'
		],
		a: `A platform is fit for purpose when it **reliably delivers the data its consumers need, in the form they need, at the cadence they require, with trustworthy quality**.

"Not fit for purpose" means it's failing one or more of those: slow to deliver features, data quality is unpredictable, governance is weak, users can't trust the numbers, or changes ripple unpredictably across the system. At thinkmoney, the medallion exists but doesn't serve BI, doesn't support streaming or AI, and requires workarounds and external platforms to fill the gaps.

The fix isn't always a rewrite. It's usually: **clarify what "purpose" is, measure how far you are, then fix the biggest friction point first**. Then iterate.`
	},
	{
		q: 'How do you build trust in a data platform?',
		keyPoints: [
			'Three words',
			'Transparency: traceable answers',
			'Consistency: one definition',
			'Follow-through: fix fast, honest postmortems',
			'Involve stakeholders early'
		],
		a: `**Transparency, consistency, and follow-through**. 

Transparency: **publish schema, document metrics, explain how data moves**. If someone asks "where did this number come from?" they should get a traceable answer, not a shrug.

Consistency: **same metric defined once**. If Finance and Marketing both report "revenue", they're using the same SQL, dbt model and lineage.

Follow-through: **fix issues promptly**, communicate postmortems honestly, and **don't ship bad data to production once**. After the first incident, users lose faith and build their own pipelines.

As a lead, I'd also **involve stakeholders early**: data scientists, compliance, product. They don't always know what they need until you show them something. Iteration breeds confidence.`
	},
	{
		q: 'What would you do in your first week at thinkmoney?',
		keyPoints: [
			'Listen: who you’d meet',
			'Run one high-value report end-to-end',
			'"State of the data estate" summary',
			'The commitment to the team'
		],
		a: `**Listen**. One-on-ones with every person on the data team, the Head of Data & AI, the lead ML engineer, the lead BI analyst and the lead applied AI engineer. What breaks most often? What's the friction? What's thinkmoney uniquely bad at?

Then: **audit the platform by running a high-value report end-to-end**. Which SSIS packages run? Where are the handoffs? Where do people have to manually intervene? That gives me the system map faster than documentation.

By end of week: **a short "state of the data estate" summary** for the Head of Data & AI, with observations, no solutions yet. And a commitment to the team: "We're going to fix the things that hurt most, together."

Speed comes later. First week is about understanding.`
	},
	{
		q: 'What would success look like in your first 90 days?',
		keyPoints: [
			'One domain rebuilt and trusted (which, and the proof)',
			'Why small but visible',
			'Governance practice',
			'A hiring plan'
		],
		a: `**One complete domain rebuilt and trusted**. Probably customers/accounts (it's foundational), running end-to-end in the new architecture (Bronze/Silver/Gold with medallion done right), with tests passing, reconciliation against the old system validated, and one Power BI report migrated and performing better.

That's not a lot of surface area, but it's **highly visible, it proves the approach works, and it builds trust with the team and stakeholders** to tackle the next domains.

Supporting: **a working governance practice** (data contracts with source teams, clear ownership of datasets, a metrics catalogue), and **a hiring plan** because a Lead role carrying all the work is not scaling.`
	}
];

// ============================================================================
// Registry: every question set, used by Interview Mode and progress tracking
// ============================================================================

export type QuestionTier = 'Pipeline' | 'Architecture' | 'Your stories' | 'Honest gaps' | 'General';

export interface QuestionSet {
	id: string;
	label: string;
	tier: QuestionTier;
	questions: InterviewQuestion[];
}

export const questionSets: QuestionSet[] = [
	{ id: 'sources', label: 'Sources', tier: 'Pipeline', questions: sourcesQuestions },
	{ id: 'ingestion', label: 'Ingestion', tier: 'Pipeline', questions: ingestionQuestions },
	{ id: 'validation', label: 'Validation', tier: 'Pipeline', questions: validationQuestions },
	{ id: 'bronze', label: 'Bronze', tier: 'Pipeline', questions: bronzeQuestions },
	{ id: 'silver', label: 'Silver', tier: 'Pipeline', questions: silverQuestions },
	{ id: 'gold', label: 'Gold', tier: 'Pipeline', questions: goldQuestions },
	{ id: 'semantic', label: 'Semantic', tier: 'Pipeline', questions: semanticQuestions },
	{ id: 'apis', label: 'Consumers', tier: 'Pipeline', questions: consumersQuestions },
	{ id: 'stack', label: 'Technology stack', tier: 'Architecture', questions: technologyStackQuestions },
	{ id: 'governance', label: 'Masking, quarantine & redaction', tier: 'Architecture', questions: dataGovernanceQuestions },
	{ id: 'toolset', label: 'Toolset reference', tier: 'Architecture', questions: techStackReferenceQuestions },
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

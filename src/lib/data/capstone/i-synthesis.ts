import type { CapstonePart } from './index.ts';

export const partI: CapstonePart = {
	id: 'medallion-i-synthesis',
	letter: 'I',
	nodes: ['app', 'api', 'features', 'kinesis', 'firehose', 'ssis', 'bronze', 'quarantine', 'spark', 'silver', 'dbt', 'gold', 'redshift', 'wlm', 'bi', 'tiers', 'model', 'ops'],
	title: 'I · Synthesis: the whole system in 5 minutes',
	summary: 'Explain the complete design to the panel: the constraint, both paths, layout, refresh, validation, capacity, lifecycle, operations and trade-offs.',
	context: `The panel says: **"Walk me through how you'd build this, end to end."**

You have about **5 minutes**. They want to hear the whole system: how the 2-second decision and the hourly CDC coexist, how data is laid out and refreshed, where validation lives, how the warehouse copes at peak, how history is tiered, and how it all runs. Above all, they want the **trade-offs** and the reasons.`,
	businessContext:
		'A weak answer lists services. A strong answer explains the tension between "now" and "eventually" and shows a design for both, without over-engineering.',
	primer: `**Shape for a 5-minute answer.**
1. **The constraint** (one sentence): a 2-second decision and an hourly batch feeding one platform.
2. **The two paths** and where they meet (Parts A and H).
3. **Storage and layout** (Part B), then **Gold and refresh** (Part C).
4. **Validation** (Part D) and **warehouse capacity** (Part E).
5. **Lifecycle and cost** (Part F), then **operations** (Part G).
6. **The trade-offs you chose**, and **what would make you change course**.

**Signpost out loud**: "There are two paths; let me take the decision path first." Signposting keeps a long answer easy to follow and gives you thinking time.

**Practise it spoken.** After submitting, try this part in Speak & Score: it's the closest thing to the real question.`,
	level1Prompt:
		'Explain the whole system as you would to the panel, in 8–12 points: the constraint, both paths, layout, refresh, validation, capacity, lifecycle, operations, and the trade-offs.',
	level1Hints: [
		'Open with the constraint in one sentence.',
		'Signpost: "two paths; the decision path first, then batch".',
		'One or two points per part (A–H), each with its reason.',
		'Finish with the trade-offs and what would change your design.'
	],
	level1Expert: `**The constraint is a 2-second fraud decision and an hourly batch feeding one platform, so I design for "now" and "eventually" separately and make them meet in one place.**

- **Decision path**: the app calls a fraud API; Lambda validates the schema, reads precomputed features from DynamoDB (history summaries from batch, velocity counters from the stream), scores within a written latency budget, and **fails safe** to refer-for-review if anything is down.
- **Recording**: the decision event, with request id, features and model version, goes through **Kinesis and Firehose into Bronze**; Firehose's buffering doesn't matter because nobody waits on it.
- **Batch path**: **SSIS CDC stays** (it works) and lands hourly in **Bronze on Iceberg**, idempotent on primary key and LSN.
- **Silver**: an hourly **MERGE** joins both paths on the business key and request id; mismatches feed a reconciliation report. Partitioned by **day**, **sorted by customer**.
- **Gold**: **dbt incremental models** with tests; whole-history questions such as lifetime spend are **pre-aggregated**. Refresh cadence per report: hourly, nightly, or **streaming ingestion** for anomalies.
- **Validation**: schema at the edge, **quality at Silver with quarantine and replay from Bronze**, and declines recorded as data.
- **Warehouse**: Redshift holds about 13 months; **WLM priorities**, refresh finished before the morning, **concurrency scaling only on the dashboard queue**, capped.
- **Lifecycle**: warm data on **Instant Retrieval** in the live tables, cold data **expired into Deep Archive** with retention-based deletion.
- **Operations**: **Terraform** modules per environment, **Step Functions** triggered by data arrival, **GoCD** with gates, monitoring of **freshness and reconciliation drift**.
- **Trade-offs**: two paths and two feature pipelines to keep consistent; incremental models need late-data handling; slower answers for old data. **If** decisions could wait minutes, I'd drop the synchronous path; **if** pipelines multiplied, I'd move to Airflow.`,
	level2: [
		{
			id: 'first',
			question: 'With 90 days and a small team, what do you build first?',
			options: [
				{ id: 'A', text: 'All parts in parallel', verdict: 'weak', feedback: 'A small team spread across eight workstreams finishes none of them.' },
				{
					id: 'B',
					text: 'Bronze and Silver for one domain with CDC, then the fraud API with rules on batch features, then stream features, then tiering',
					verdict: 'best',
					feedback: 'Each step delivers something usable and the next builds on it.'
				},
				{ id: 'C', text: 'The full streaming platform first', verdict: 'ok', feedback: 'Exciting, but without Bronze and Silver the stream has nowhere trustworthy to land and no features to read.' }
			],
			expert: `**Foundations, then the decision, then speed.** A rules-based fraud API on nightly features is valuable on day 60; stream features make it better on day 90.`
		},
		{
			id: 'truth',
			question: 'What is the single source of truth?',
			options: [
				{ id: 'A', text: 'Redshift', verdict: 'weak', feedback: 'A serving layer: fast to query, but not the raw, replayable record.' },
				{
					id: 'B',
					text: 'Bronze and Silver on Iceberg; Redshift and the feature store are serving copies',
					verdict: 'best',
					feedback: 'Everything downstream can be rebuilt from the lake.'
				},
				{ id: 'C', text: 'The feature store', verdict: 'weak', feedback: 'A derived, fast-changing cache; useful, never authoritative.' }
			],
			expert: `**The lake is the truth; everything else serves it.** If Redshift or the feature store were lost, both could be rebuilt.`
		},
		{
			id: 'cut',
			question: 'Budget is halved. What do you cut?',
			options: [
				{ id: 'A', text: 'The fraud API', verdict: 'weak', feedback: 'It is the highest-value, customer-facing part.' },
				{
					id: 'B',
					text: 'Defer concurrency scaling and streaming anomaly dashboards, use Redshift Serverless or a smaller cluster; keep the fraud API and CDC',
					verdict: 'best',
					feedback: 'Cuts conveniences, keeps the decision path and the data foundation.'
				},
				{ id: 'C', text: 'Testing and monitoring', verdict: 'weak', feedback: 'Saves little and turns every incident into a long investigation.' }
			],
			expert: `**Cut speed, not trust.** Keep the decision, the record and the checks; defer the comforts.`
		}
	],
	level3: [
		{
			id: 'tenx',
			prompt: 'Volume grows tenfold. What breaks first, and what do you do?',
			expert:
				"The hourly merge into Silver breaks first, because 500 million rows an hour won't finish inside the hour. I'd move that table to more frequent micro-batch merges and scale the Glue or EMR job, then check compaction and the feature refresh. The decision path scales with Lambda concurrency and DynamoDB capacity, so it's the least worried part. Redshift would need resizing or Serverless.",
			lookFor: ['merge|silver|hourly', 'micro-?batch|more frequent|scale', 'compaction|feature refresh', 'lambda|dynamo|decision path', 'redshift|serverless|resiz']
		},
		{
			id: 'least-sure',
			prompt: 'Which part are you least sure about, and how would you de-risk it?',
			expert:
				"The streaming feature pipeline, because my streaming experience is mostly landing data, not stateful features. I'd de-risk it with a two-week spike on real traffic, starting with rules on nightly features so the API delivers value without it. If the spike showed Lambda counters weren't accurate enough, that's the trigger for Flink, with the team and AWS support involved.",
			lookFor: ['streaming|feature', 'spike|prototype|pilot', 'nightly|rules first|without it', 'flink|trigger', 'honest|experience|team']
		}
	],
	concepts: [
		{ id: 'constraint', label: 'Opens with the now-versus-eventually constraint', patterns: ['constraint', '2[- ]second|two[- ]second|hourly'], importance: 'essential', why: 'Every other choice follows from it.' },
		{ id: 'paths', label: 'Two paths, meeting in Silver', patterns: ['decision path|synchron|api', 'batch|cdc', 'silver'], importance: 'essential', why: 'The core of the design.' },
		{ id: 'layout', label: 'Layout and pre-aggregation', patterns: ['partition|sort', 'aggregat'], importance: 'essential', why: 'Shows you know which queries layout can and cannot fix.' },
		{ id: 'refresh', label: 'Incremental refresh with cadence per report', patterns: ['incremental', 'hourly|nightly|cadence'], importance: 'essential', why: 'Fresh enough, fast enough, without waste.' },
		{ id: 'validation', label: 'Validation placement and quarantine', patterns: ['schema|validat', 'quarantine'], importance: 'essential', why: 'Where checks live determines what can go wrong.' },
		{ id: 'lifecycle', label: 'Lifecycle tiers that stay queryable', patterns: ['instant retrieval|deep archive|tier|lifecycle'], importance: 'essential', why: 'Cost without breaking queries or retention.' },
		{ id: 'ops', label: 'Operations: IaC, orchestration, monitoring', patterns: ['terraform|step functions|orchestrat', 'monitor|reconcil|drift'], importance: 'essential', why: 'Designs fail in operation, not on whiteboards.' },
		{ id: 'tradeoffs', label: 'Named trade-offs and switch conditions', patterns: ['trade-?off', '\\bif\\b'], importance: 'bonus', why: 'The senior signal: what you give up and when you would change.' }
	],
	leadExplanation: {
		constraint:
			"The constraint is a 2-second fraud decision and an hourly batch feeding one platform, so I design for 'now' and 'eventually' separately and make them meet in one place.",
		reasons: [
			'The decision happens synchronously against precomputed features, so it never waits on batch or on Firehose.',
			'Both paths land in Bronze and meet in Silver, so there is one replayable record and one reconciliation point.',
			'Gold, the warehouse, lifecycle tiers and operations are each designed for how they are used: incremental, prioritised, queryable where needed and triggered by data arrival.'
		],
		tradeOff: 'Two paths, two feature pipelines and incremental models are more to run than a single nightly batch.',
		switchWhen: "If decisions could wait minutes, I'd drop the synchronous path; if pipelines multiplied, I'd move orchestration to Airflow."
	},
	leadSays: {
		first: "A small team can't build eight things at once, so the order is foundations first: Bronze and Silver for one domain, then the fraud API on nightly features, then stream features, then tiering. Each step is usable on its own.",
		truth: 'Anything downstream should be rebuildable, so the truth is Bronze and Silver on Iceberg. Redshift and the feature store are serving copies we could rebuild if we lost them.',
		cut: 'The decision path and the data foundation are what customers and regulators rely on, so I keep those and defer concurrency scaling and the streaming anomaly dashboard. Cut speed, not trust.'
	},
	leadPhrases: [
		'"The constraint is a 2-second decision and an hourly batch feeding one platform."',
		'"There are two paths; let me take the decision path first."',
		'"The lake is the truth; everything else serves it."',
		'"Cut speed, not trust."',
		'"Here are the trade-offs I chose, and what would change them."'
	],
	antiPatterns: [
		{
			sounds: '"Kinesis for real time, SSIS for batch, merge in Silver, done."',
			problem: "True as far as it goes, but it hides every hard question: how the decision meets 2 seconds, where context comes from, how the paths reconcile, and what it costs."
		},
		{
			sounds: '"We\'d build a modern, scalable lakehouse with best practices throughout."',
			problem: 'Buzzwords instead of decisions. The panel learns nothing about your judgement.'
		}
	],
	watchOutFor: [
		'Listing services without the constraint that connects them.',
		'Spending four minutes on the stream and none on operations or lifecycle.',
		'No trade-offs: a design with no downsides is not believable.',
		'No signposting: a 5-minute answer needs a map.'
	],
	sixtySecond:
		"The constraint is a 2-second fraud decision and an hourly batch feeding one platform, so I design for now and eventually separately. The decision happens synchronously in an API against precomputed features, and fails safe if anything is down. Decisions and hourly CDC both land in Bronze on Iceberg and meet in Silver, partitioned by day and reconciled on request id. Gold is incremental dbt with refresh cadence per report; Redshift holds about 13 months with workload priorities; older data is tiered so it stays queryable or is archived by design. Terraform, Step Functions and GoCD run it, and monitoring watches reconciliation drift. The trade-off is two paths to keep consistent. If decisions could wait minutes, I'd drop the synchronous path.",
	defend: [
		{
			question: "Isn't this over-engineered for thinkmoney's size?",
			answer:
				"Each part is there because of a stated need: the 2-second decision, the hourly CDC, the reports and the retention rules. And it's built in order, foundations first, so the expensive parts arrive only when they're needed."
		},
		{
			question: 'What would you do in your first month?',
			answer:
				'Inventory the current platform and its consumers, add monitoring to the existing SSIS CDC, agree the decision-path SLA and fallback with the fraud team, and land one domain in Bronze. Design on paper; build the foundation.'
		},
		{
			question: 'Where does Claude fit?',
			answer:
				'The semantic layer over Gold is exposed through MCP for governed questions, and the team uses Claude Code to read legacy SSIS logic and draft dbt models and tests. Neither touches the decision path.'
		}
	],
	juniorVsLead: {
		junior: 'We would use Kinesis for real time, SSIS for batch, merge them in Silver, and build a modern scalable lakehouse with best practices.',
		lead: "The constraint is a 2-second decision and an hourly batch feeding one platform, so I design for now and eventually separately. The decision is synchronous against precomputed features and fails safe. Both paths land in Bronze and meet in Silver, reconciled on request id. Gold is incremental, the warehouse is prioritised, history is tiered so it stays queryable, and Terraform and Step Functions run it all. The trade-off is two paths to keep consistent. If decisions could wait minutes, I'd drop the synchronous path.",
		whyBetter: [
			'Opens with the tension that shapes everything',
			'Gives each part a reason, not just a tool',
			'Covers operations and lifecycle, not only data flow',
			'Ends on trade-offs and switch conditions'
		]
	},
	relatedSets: [
		{ id: 'toolset', label: 'Toolset reference' },
		{ id: 'general', label: 'General' }
	]
};

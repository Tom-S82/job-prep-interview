import type { ArchitectureScenario } from '../scenarios.ts';

export const apiFreshness: ArchitectureScenario = {
	id: 'api-freshness',
	title: 'Freshness SLA for product APIs',
	summary: 'Product APIs sometimes return data over 5 minutes old. They want "fresh within 3 minutes or an error".',
	leadExplanation: {
		constraint:
			"The constraint is a 3-minute freshness promise on data that currently flows through batch CDC and an analytics platform built for minutes-to-hours. Before promising anything, I'd question whether an analytics platform should serve operational APIs at all.",
		reasons: [
			'Measuring lag at every hop (source commit, landed, transformed, served) shows where the minutes go, instead of guessing.',
			'Low-latency point lookups belong in an operational read store fed by streaming CDC, not a warehouse built for large scans.',
			'Returning an "as of" timestamp with every response lets each consumer decide what "too stale" means for their use case.'
		],
		tradeOff:
			'A separate operational read store is another system to run and keep consistent, and streaming CDC costs more than the current batch.',
		switchWhen:
			'If only one or two endpoints genuinely need 3 minutes, I would serve those from a read replica of the source and leave the rest on the existing platform with a looser SLA.'
	},
	leadSays: {
		bottleneck:
			"We don't know where the five minutes go yet. So we stamp a watermark at every hop, from source commit to API response, and look at the lag distribution. It's a few days of instrumentation, and it means we fix the slowest hop, not the most visible one.",
		serve:
			"Redshift is built for big scans, not thousands of single-customer lookups a second. So the API reads from an operational store, such as DynamoDB or an Aurora read model, fed by streaming CDC. It's another store to run, but it's the right tool for low-latency reads.",
		breach:
			'A blanket error hurts consumers who would happily take 4-minute-old data. So every response carries an "as of" timestamp and a stale flag, and only the consumers who agreed it get an error. It needs a conversation per consumer, and it avoids breaking things that didn\'t need breaking.',
		monitor:
			"An SLA nobody measures is a wish. So freshness per dataset is a CloudWatch metric, we alarm on the 95th percentile, and product sees the same dashboard we do. It's a little more set-up, and it means we find breaches before they do."
	},
	leadPhrases: [
		'"The constraint is a three-minute promise on a pipeline built for batch."',
		'"First, should an analytics platform be serving operational APIs at all?"',
		'"We measure lag at every hop before we fix any of them."',
		'"Every response says how old it is; consumers decide what\'s too old."',
		'"An SLA nobody measures is a wish."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll make the whole pipeline real-time."',
			problem: 'Sounds ambitious, but hides that most of the data does not need it, and real-time everything multiplies cost and on-call load.'
		},
		{
			sounds: '"We\'ll just add caching."',
			problem: 'A cache makes stale data faster, not fresher. It hides the problem unless responses say how old they are.'
		}
	],
	watchOutFor: [
		'Accepting the 3-minute SLA without asking which endpoints actually need it.',
		'Proposing fixes before saying how you would find the bottleneck.',
		'Treating "return an error" as the only option. Ask what each consumer prefers.',
		'Forgetting to say who watches the SLA and who gets paged.'
	],
	sixtySecond:
		"The constraint is a three-minute freshness promise on a pipeline built for batch, so first I'd question whether operational APIs should read from the analytics platform at all. We instrument every hop with watermarks to find where the minutes go. The endpoints that genuinely need three minutes read from an operational store fed by streaming CDC. Every response carries an 'as of' timestamp, and only consumers who agreed it get an error when it's stale. Freshness is a CloudWatch metric with alarms and a shared dashboard. The trade-off is another store to run. If only a couple of endpoints need it, a read replica of the source may be enough.",
	defend: [
		{
			question: 'Why not just read straight from the SQL Server source?',
			answer:
				'For a few low-volume endpoints, a read replica of the source can be the simplest answer. Reading from the primary risks slowing customer transactions, and the replica still needs freshness monitoring.'
		},
		{
			question: 'What if the streaming CDC itself falls behind?',
			answer:
				'The lag metric shows it immediately, responses flag themselves as stale, and consumers who need an error get one. Then we look at the cause: source log contention, consumer throughput, or a burst we need more capacity for.'
		},
		{
			question: 'Who owns the SLA?',
			answer:
				'The data platform team owns freshness up to the read store and is alerted on breaches; the API team owns the endpoint and its error handling. Both are written into the SLA, along with what happens during planned maintenance.'
		}
	],
	context: `Product engineering pulls **customers, accounts and transactions** through internal APIs that read from the data platform. **Occasionally responses are more than 5 minutes old**. They want an SLA: **"fresh within 3 minutes, or return an error."**

Today, data arrives via **SSIS CDC in batches**, lands in the medallion, and the API reads from **Redshift**.`,
	businessContext:
		'This blurs the line between analytics and operational systems. The panel wants to see you measure before fixing, question the requirement, and design an SLA that is honest and observable.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Where do the minutes go today, and how would you find out?',
		'Should these APIs read from the analytics platform at all?',
		'What should happen when data is stale?',
		'How will anyone know whether the SLA is being met?'
	],
	level1Expert: `**Measure, question, serve from the right store, make freshness visible.**

- **Measure**: watermark every hop (source commit → landed → transformed → served) and look at the **lag distribution**, not the average.
- **Question the requirement**: which endpoints genuinely need 3 minutes? Customers' names rarely do; account balances might.
- **Serve from an operational read store** (DynamoDB or an Aurora read model) fed by **streaming CDC** for the endpoints that need it; Redshift is built for scans, not point lookups.
- **Honest responses**: every response carries an **"as of" timestamp** and a stale flag; errors only for consumers who agreed them.
- **Observable SLA**: freshness per dataset in **CloudWatch**, alarms on p95 lag, a shared dashboard with product, and clear ownership.`,
	level2: [
		{
			id: 'bottleneck',
			question: 'How do you find the bottleneck?',
			options: [
				{ id: 'A', text: 'Assume it is SSIS and speed up its schedule', verdict: 'weak', feedback: 'It may be SSIS, but guessing risks fixing the wrong hop.' },
				{
					id: 'B',
					text: 'Watermark every hop and measure the lag distribution',
					verdict: 'best',
					feedback: 'Shows exactly where the minutes go, including the occasional slow tail.'
				},
				{ id: 'C', text: 'Add more API servers', verdict: 'weak', feedback: 'API capacity does not make the data fresher.' }
			],
			expert: `**Measure every hop.** Look at the 95th and 99th percentiles, not the average: the complaint is about "occasionally", which is the tail.`
		},
		{
			id: 'serve',
			question: 'Where should the API read from?',
			options: [
				{ id: 'A', text: 'Redshift Gold tables, as today', verdict: 'weak', feedback: 'Built for large scans, not high-concurrency point lookups, and sits at the end of the slowest path.' },
				{
					id: 'B',
					text: 'An operational read store (DynamoDB or Aurora) fed by streaming CDC',
					verdict: 'best',
					feedback: 'Low-latency lookups, fed within seconds of the source changing.'
				},
				{ id: 'C', text: 'Directly from the SQL Server primary', verdict: 'ok', feedback: 'Always fresh, but adds load to the core banking database. A read replica is safer.' }
			],
			expert: `**Operational read store for operational reads.** Analytics and operational serving have different shapes. A read replica of the source is a reasonable lighter option for a few endpoints.`
		},
		{
			id: 'breach',
			question: 'What happens when data is older than the SLA?',
			options: [
				{ id: 'A', text: 'Always return an error', verdict: 'ok', feedback: 'Honest, but breaks consumers who would have accepted slightly older data.' },
				{
					id: 'B',
					text: 'Return data with an "as of" timestamp and a stale flag; error only where agreed',
					verdict: 'best',
					feedback: 'Each consumer decides what "too stale" means for their use case.'
				},
				{ id: 'C', text: 'Silently serve cached data', verdict: 'weak', feedback: 'Hides the problem: consumers cannot tell they are seeing old data.' }
			],
			expert: `**Make age explicit.** An "as of" timestamp turns a hidden failure into information consumers can act on.`
		},
		{
			id: 'monitor',
			question: 'How do you monitor the SLA?',
			options: [
				{ id: 'A', text: 'Check it manually each morning', verdict: 'weak', feedback: 'Misses breaches during the day, when they matter.' },
				{
					id: 'B',
					text: 'Freshness metric per dataset in CloudWatch, alarms on p95 lag, a dashboard shared with product',
					verdict: 'best',
					feedback: 'Continuous, alerting before consumers notice, and transparent.'
				},
				{ id: 'C', text: 'Wait for product to report problems', verdict: 'weak', feedback: 'The customer of the SLA becomes its monitoring system.' }
			],
			expert: `**Measure it continuously and share it.** Alarm on the percentile in the SLA, and route alerts to the team that owns the hop.`
		}
	],
	level3: [
		{
			id: 'maintenance',
			prompt: 'Core banking has a two-hour maintenance window every month. What happens to your SLA?',
			expert:
				"During maintenance there are no new changes to stream, so data is stale by definition. The SLA should exclude planned maintenance explicitly, responses keep flagging their age, and product is warned in advance. Pretending we can meet a freshness SLA when the source is down would just make the SLA meaningless.",
			lookFor: ['exclu|maintenance window|planned', 'flag|as of|stale|timestamp', 'warn|communicat|tell']
		},
		{
			id: 'consistency',
			prompt: 'The API shows a balance that differs from the Power BI dashboard. Which one is right?',
			expert:
				'Probably both, at different times: the API is seconds old, the dashboard might be hours old. Both should show their "as of" time so the difference is explainable. If they differ at the same point in time, that\'s a real defect, and we reconcile the two paths against the ledger.',
			lookFor: ['as of|timestamp|time', 'reconcil|ledger|source of truth', 'different (times|points)|both']
		},
		{
			id: 'cost',
			prompt: "Streaming CDC and the read store cost more than the current setup. How do you justify it?",
			expert:
				"Only for endpoints where freshness changes an outcome, such as showing a customer their balance after a payment. For everything else, the existing path with a looser SLA is fine. I'd show the cost per endpoint against the product impact, and let product choose which endpoints are worth it.",
			lookFor: ['only (for|where)|which endpoints|per endpoint', 'impact|value|outcome', 'looser|existing|batch']
		}
	],
	concepts: [
		{ id: 'measure', label: 'Measure lag at every hop', patterns: ['watermark', 'measure|instrument', 'lag|each (hop|stage)|every (hop|stage)|bottleneck'], importance: 'essential', why: 'You cannot fix a latency problem you have not located.' },
		{ id: 'question', label: 'Question the requirement (which endpoints need it?)', patterns: ['which (endpoints|data|apis)|not all|question|really need|do they need'], importance: 'essential', why: 'Most data rarely needs 3 minutes; applying it everywhere is expensive.' },
		{ id: 'store', label: 'Serve from an operational store, not the warehouse', patterns: ['dynamo|aurora|read (store|model|replica)|operational|cache'], importance: 'essential', why: 'Warehouses are built for scans, not low-latency point lookups.' },
		{ id: 'asof', label: 'Make data age explicit ("as of" timestamp)', patterns: ['as of|timestamp|stale flag|age of|freshness (header|field)'], importance: 'essential', why: 'Consumers can only make sensible decisions if they know how old the data is.' },
		{ id: 'monitor', label: 'Monitor and alert on freshness', patterns: ['cloudwatch|monitor|alert|alarm|dashboard|p9\\d|percentile'], importance: 'essential', why: 'An SLA nobody measures is a wish.' },
		{ id: 'cdc', label: 'Streaming CDC for the fresh path', patterns: ['cdc|stream|kinesis|dms|debezium'], importance: 'bonus', why: 'Batch CDC alone cannot reliably deliver 3 minutes.' },
		{ id: 'fallback', label: 'A defined fallback when the SLA breaks', patterns: ['fallback|fall back|degrade|error|stale'], importance: 'bonus', why: 'The SLA must say what happens when it is missed.' },
		{ id: 'owner', label: 'Clear ownership of the SLA', patterns: ['own|on-?call|paged|responsib'], importance: 'bonus', why: 'Someone has to be woken up when it breaks.' }
	],
	juniorVsLead: {
		junior: "We'd make the whole pipeline real-time with Kinesis and add caching on the API so it's always fast and fresh.",
		lead: "The constraint is a three-minute promise on a pipeline built for batch, so first I'd ask which endpoints really need it and measure where the minutes go. Those endpoints read from an operational store fed by streaming CDC, every response says how old it is, and only consumers who agreed get an error. Freshness is monitored and shared with product. The trade-off is another store to run. If only a couple of endpoints needed it, I'd use a read replica of the source instead.",
		whyBetter: [
			'Questions the requirement before accepting it',
			'Measures before fixing',
			'Separates operational serving from analytics',
			'Makes staleness visible instead of hiding it in a cache'
		]
	},
	relatedSets: [
		{ id: 'validation', label: 'Validation (alerting)' },
		{ id: 'toolset', label: 'Toolset reference' }
	]
};

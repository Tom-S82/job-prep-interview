import type { ArchitectureScenario } from '../scenarios.ts';

export const clickstream: ArchitectureScenario = {
	id: 'clickstream',
	title: 'Mobile app clickstream',
	summary: '10,000 events per second, 2 KB each, from the mobile app. Ingest, store and make usable.',
	leadExplanation: {
		constraint:
			"The constraint is volume and cost: 10,000 events a second at 2 KB is about 20 MB a second, roughly 1.7 TB a day of raw JSON. Anything that keeps that forever, or queries it raw, gets expensive fast. And location and device IDs are personal data.",
		reasons: [
			'Kinesis on-demand absorbs the volume without shard planning, and Firehose lands it in S3 as Parquet or Iceberg with no servers to run.',
			'Columnar Parquet is typically several times smaller than JSON and much cheaper to query, so we convert on the way in.',
			'Most consumers need hourly or daily aggregates, so we build those in Gold and keep real-time only for the few metrics that genuinely need it.'
		],
		tradeOff:
			'Batching into Parquet adds a few minutes of delay, and short raw retention means very old events can only be reprocessed from the curated copy.',
		switchWhen:
			'If product needed sub-minute dashboards or in-app personalisation from these events, I would add a real-time path (Lambda or Flink) for those specific metrics.'
	},
	leadSays: {
		ingest:
			"The constraint is 20 MB a second with uneven peaks. Kinesis Data Streams in on-demand mode scales without shard planning, and Firehose delivers to S3 without servers. Kafka would work too, but it's more to run for no extra benefit here.",
		format:
			"We'll query this data far more than we write it. So it lands as Parquet in Iceberg tables, partitioned by date, with a registered schema. It's a few minutes of batching, and it cuts storage and query cost several times over.",
		retention:
			"Raw JSON is the most expensive copy and the least used. So raw keeps a short window for reprocessing, curated Parquet keeps longer, aggregates keep longest, and lifecycle rules move old data to cheaper storage. We lose the ability to replay very old raw events, which is acceptable for clickstream.",
		dashboards:
			"Nobody needs every tap on a dashboard. So Gold holds hourly and daily aggregates, and real-time is reserved for the one or two metrics that need it. It's less impressive than real-time everything, and much cheaper."
	},
	leadPhrases: [
		'"The constraint is volume and cost: about 1.7 terabytes a day raw."',
		'"We query this far more than we write it, so it lands columnar."',
		'"Raw has a short life; aggregates have a long one."',
		'"Real-time only where someone acts on it in real time."',
		'"Location and device IDs are personal data, so consent and minimisation come first."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll stream everything in real time to a live dashboard."',
			problem: 'Sounds modern, but nobody acts on every tap in real time, and it multiplies cost. Ask who needs what latency.'
		},
		{
			sounds: '"Storage is cheap, so we\'ll keep all the raw data forever."',
			problem: 'At 1.7 TB a day it adds up quickly, and keeping personal data without a purpose conflicts with UK GDPR.'
		}
	],
	watchOutFor: [
		'Not doing the arithmetic. Saying "about 20 MB a second, 1.7 TB a day" shows you thought about scale.',
		'Ignoring privacy: precise location and device IDs need consent and minimisation.',
		'Choosing Kafka or Flink without saying what they add over the simpler option.',
		'Forgetting schema changes: the app team will add fields; say how you handle them.'
	],
	sixtySecond:
		"The constraint is volume and cost: about 20 MB a second, 1.7 TB a day raw, and it includes personal data like location. Events go to Kinesis on-demand, and Firehose lands them in S3 as Parquet in Iceberg tables, partitioned by date with a registered schema. Raw JSON keeps a short window, curated data longer, aggregates longest. Gold holds hourly and daily aggregates for dashboards; real-time only where someone acts in real time. Location precision is reduced and consent is respected at collection. The trade-off is a few minutes of delay from batching. If product needed sub-minute personalisation, I'd add a Lambda or Flink path for that.",
	defend: [
		{
			question: 'Why Kinesis rather than Kafka (MSK)?',
			answer:
				"Both handle this volume. Kinesis on-demand needs no capacity planning and integrates directly with Firehose and Lambda; MSK makes sense if we need Kafka's ecosystem or very high fan-out. For one main consumer, Kinesis is less to run."
		},
		{
			question: 'What happens when the app team adds a new field?',
			answer:
				'The schema is registered and versioned, and Iceberg handles adding columns without rewrites. Unknown or malformed events go to a dead-letter location rather than breaking the pipeline, and we agree a lightweight data contract with the app team.'
		},
		{
			question: 'How do you handle consent?',
			answer:
				'Events from users who have not consented to analytics tracking are not collected (or are stripped at the collector). Location is reduced to district level unless a specific feature needs more, and that use is documented.'
		}
	],
	context: `The mobile team wants to **stream user actions** (taps, swipes, screen views, plus device and location data) **to analytics in real time**.

Expected load: **10,000 events per second, about 2 KB each**, with spikes after push notifications and on payday.

They want dashboards on feature usage and funnels, and the data science team wants event history for modelling.`,
	businessContext:
		'Clickstream is high-volume, low-value-per-event data. The panel wants to see that you can size it, keep cost under control, and treat location and device data as personal data.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'How big is this per day? (Do the arithmetic.)',
		'How does it get in, and in what format does it land?',
		'How long do you keep raw data, and why?',
		'Who needs real time, and who needs aggregates?'
	],
	level1Expert: `**Size it, land it cheaply, aggregate for use, respect privacy.**

- **Size**: 10,000 events/s × 2 KB ≈ **20 MB/s ≈ 1.7 TB/day** raw JSON. That shapes every other choice.
- **Ingest**: app → collector endpoint → **Kinesis Data Streams (on-demand)** → **Firehose** → S3.
- **Format**: Firehose converts to **Parquet** and writes to **Iceberg** tables partitioned by date, with a **registered schema**; malformed events go to a dead-letter prefix.
- **Retention**: raw JSON for a short window (e.g. 30 days) for reprocessing; curated Parquet longer; aggregates longest; lifecycle rules to cheaper tiers.
- **Use**: hourly/daily **aggregates in Gold** for funnels and feature usage; real-time only for metrics someone acts on immediately.
- **Privacy**: respect consent at collection, reduce location precision, treat device IDs as personal data.`,
	level2: [
		{
			id: 'ingest',
			question: 'How do events get in?',
			options: [
				{ id: 'A', text: 'Kinesis Data Streams (on-demand) → Firehose → S3', verdict: 'best', feedback: 'Scales with the load, no servers to run, native delivery to S3.' },
				{ id: 'B', text: 'Amazon MSK (Kafka)', verdict: 'ok', feedback: 'Handles the volume and has a rich ecosystem, but it is more to operate than this use case needs.' },
				{ id: 'C', text: 'API Gateway → Lambda → write each event to a relational database', verdict: 'weak', feedback: 'Row-by-row inserts at 10,000 a second will be slow and expensive, and a relational database is the wrong store for this.' },
				{ id: 'D', text: 'Firehose direct put from the collector, no stream', verdict: 'ok', feedback: 'Simpler if S3 is the only consumer, but you lose the option of real-time consumers later.' }
			],
			expert: `**Kinesis on-demand plus Firehose.** On-demand mode removes shard planning (in provisioned mode you'd need at least 20 shards at 1 MB/s each, plus headroom). Firehose handles batching, conversion and delivery.`
		},
		{
			id: 'format',
			question: 'What format does raw data land in?',
			options: [
				{ id: 'A', text: 'JSON, kept forever', verdict: 'weak', feedback: 'The most expensive format to store and query, with no end date.' },
				{ id: 'B', text: 'Parquet in Iceberg tables, partitioned by date, with a registered schema', verdict: 'best', feedback: 'Columnar, compressed, schema-aware, and handles new fields without rewrites.' },
				{ id: 'C', text: 'Avro files', verdict: 'ok', feedback: 'Good for streaming and schema evolution, but row-based, so analytical queries cost more than Parquet.' }
			],
			expert: `**Parquet in Iceberg.** We read this data far more than we write it, so a columnar format pays off quickly. Iceberg adds schema evolution and deletes for GDPR.`
		},
		{
			id: 'retention',
			question: 'How long do you keep it?',
			options: [
				{ id: 'A', text: 'Keep all raw data forever, because storage is cheap', verdict: 'weak', feedback: 'Costs grow without limit, and keeping personal data with no purpose conflicts with UK GDPR.' },
				{
					id: 'B',
					text: 'Raw short (e.g. 30 days), curated longer, aggregates longest, with lifecycle rules',
					verdict: 'best',
					feedback: 'Matches retention to value, controls cost, and supports data minimisation.'
				},
				{ id: 'C', text: 'Delete everything after 7 days', verdict: 'weak', feedback: 'Cheap, but you cannot reprocess or build history for modelling.' }
			],
			expert: `**Retention by tier.** Raw is the most expensive and least used copy. Curated data serves data science; aggregates serve dashboards for years at little cost.`
		},
		{
			id: 'dashboards',
			question: 'How do dashboards use it?',
			options: [
				{ id: 'A', text: 'Power BI queries the raw events directly', verdict: 'weak', feedback: 'Slow and expensive at this volume, and exposes event-level personal data.' },
				{
					id: 'B',
					text: 'Hourly and daily aggregates in Gold; real-time only for metrics that need it',
					verdict: 'best',
					feedback: 'Fast dashboards at low cost, with real time used where it changes a decision.'
				},
				{ id: 'C', text: 'Real-time aggregation of everything with Flink', verdict: 'ok', feedback: 'Powerful, but costly and complex for metrics nobody watches minute by minute.' }
			],
			expert: `**Aggregate in Gold, real-time by exception.** Ask product which metrics they act on within minutes. Usually it's very few.`
		}
	],
	level3: [
		{
			id: 'spike',
			prompt: 'A push notification to every customer triples traffic for ten minutes. What happens to your pipeline?',
			expert:
				"Kinesis on-demand scales up automatically, within limits, and Firehose buffers. If we were in provisioned mode we'd see throttling, so producers need retries with backoff and the collector should buffer briefly. I'd also ask the mobile team to warn us before mass notifications, and load-test at three times normal peak.",
			lookFor: ['on-demand|auto|scale', 'retr|backoff|buffer', 'throttl|limit', 'load[- ]test|warn|plan']
		},
		{
			id: 'schema',
			prompt: 'The app team ships a release that renames a field without telling you. What breaks, and how do you stop it?',
			expert:
				"Dashboards depending on the old field go blank, or worse, silently undercount. Schema validation at ingestion should send non-matching events to a dead-letter location and alert. Longer term: a data contract with the app team and a check in their release pipeline that compares event schemas against the registered ones.",
			lookFor: ['schema|validat', 'dead[- ]letter|quarantine|alert', 'contract|release|ci']
		},
		{
			id: 'privacy',
			prompt: 'Data science wants precise GPS location for a fraud model. Do you give it to them?',
			expert:
				'Only if there is a clear lawful basis and the customer has been told. Precise location is sensitive, so this needs a DPIA and the DPO\'s sign-off. If approved, it is a restricted dataset with its own retention and access controls, not part of general clickstream. Often a coarser signal, such as "unusual country", is enough.',
			lookFor: ['lawful|consent|basis', 'dpia|dpo', 'restrict|access|retention', 'coarse|reduce|minimi|less precise']
		}
	],
	concepts: [
		{ id: 'size', label: 'Size the load (MB/s or TB/day)', patterns: ['\\d+ ?(mb|gb|tb)', 'per (day|second)|/s\\b|a day'], importance: 'essential', why: 'Sizing shows you thought about scale; every other choice depends on it.' },
		{ id: 'stream', label: 'Managed streaming ingestion (Kinesis / Firehose)', patterns: ['kinesis|firehose|kafka|\\bmsk\\b|stream'], importance: 'essential', why: 'This volume needs a managed, elastic ingestion path.' },
		{ id: 'columnar', label: 'Land in a columnar format (Parquet / Iceberg)', patterns: ['parquet|iceberg|columnar'], importance: 'essential', why: 'Columnar storage cuts storage and query cost several times over.' },
		{ id: 'retention', label: 'Tiered retention and lifecycle rules', patterns: ['retention|retain|lifecycle|expire|glacier|\\d+ days'], importance: 'essential', why: 'At 1.7 TB a day, retention is the main cost control.' },
		{ id: 'aggregate', label: 'Aggregate for dashboards; real-time only where needed', patterns: ['aggregat|hourly|daily|rollup|gold'], importance: 'essential', why: 'Nobody needs every tap on a dashboard.' },
		{ id: 'privacy', label: 'Treat location and device IDs as personal data', patterns: ['privacy|personal|consent|gdpr|pii|minimi|location'], importance: 'bonus', why: 'Location and device identifiers are personal data under UK GDPR.' },
		{ id: 'schema', label: 'Schema registry and evolution', patterns: ['schema'], importance: 'bonus', why: 'The app will change; the pipeline must cope.' },
		{ id: 'partition', label: 'Partition by date', patterns: ['partition'], importance: 'bonus', why: 'Date partitions keep queries and lifecycle rules cheap.' }
	],
	juniorVsLead: {
		junior: "We'd use Kafka and Flink to stream everything in real time to a live dashboard, and keep all the raw data because storage is cheap.",
		lead: "The constraint is volume and cost: about 1.7 terabytes a day raw, including personal data. So events go through Kinesis on-demand and Firehose into Parquet in Iceberg tables, raw is kept briefly, aggregates long-term, and dashboards read hourly aggregates. Real-time only where someone acts on it. The trade-off is a few minutes of delay. If product needed live personalisation, I'd add a real-time path for that.",
		whyBetter: [
			'Does the arithmetic before choosing tools',
			'Matches latency to who actually needs it',
			'Treats retention as a cost and privacy decision',
			'Names the trade-off and the condition for real time'
		]
	},
	relatedSets: [
		{ id: 'ingestion', label: 'Ingestion' },
		{ id: 'toolset', label: 'Toolset reference' }
	]
};

import type { CapstonePart } from './index.ts';

export const partH: CapstonePart = {
	id: 'medallion-h-fraud-path',
	letter: 'H',
	nodes: ['app', 'api', 'features', 'kinesis', 'model'],
	title: 'H · The full fraud path: one request in 2 seconds',
	summary: 'Walk one card application through the whole system, from request to decision to reconciliation.',
	context: `A customer calls support to apply for a card. The app calls your fraud API with:
- \`customer_id\`: 12345 · \`amount\`: 5000 · \`device_location\`: London · \`device_new\`: true · \`income_stated\`: 25000

You have **2 seconds** to return a \`decision\` (approve, decline or refer), a \`reason\` and a \`score\`.

Walk it through: **validation**, **enrichment** (customer history, device history, income vs amount, velocity in the last hour), **decision**, then what happens **downstream** when the hourly CDC arrives later.`,
	businessContext:
		'This is the question that tests whether you can hold the whole system in your head. Every earlier part shows up in one request.',
	primer: `**Latency budget.** Write down where the 2 seconds go. A typical design spends well under half a second: request and schema check (~10 ms), feature lookups (~10–30 ms, in parallel), scoring (~20–50 ms), writing the decision event (~20 ms). The rest is headroom for network and retries.

**Feature store.** Precomputed features keyed by customer: long-history summaries rebuilt in batch from Silver (e.g. tenure, typical spend, past declines), plus fast-moving counters updated from the stream (e.g. applications or payments in the last hour). Lookups take milliseconds (DynamoDB or ElastiCache).

**Never read cold data in the hot path.** History older than the feature window lives in summaries; nothing in the request touches Redshift, Athena or Glacier.

**Decision events.** Every decision is published with its request id, inputs, features used, score, reason and model version, so it can be audited, reconciled with CDC and used for training.

**Point-in-time training data.** Models must be trained on what was known *at decision time*. Logging the features used at decision time, plus Silver history (SCD2), prevents leakage from information that arrived later.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Where do the 2 seconds go? Write a latency budget.',
		'Where does each kind of customer context come from, and how fresh is it?',
		'What if the customer has little recent history, or a dependency is down?',
		'How does this decision line up with the CDC record an hour later, and feed the next model?'
	],
	level1Expert: `**A latency budget, precomputed context, a recorded decision, reconciliation later.**

- **0–20 ms**: API Gateway → Lambda; **schema validation** rejects malformed requests with a 400.
- **20–60 ms**: parallel **feature store** lookups by customer_id: long-history summaries rebuilt nightly from Silver (tenure, typical spend, past declines), and **stream-updated velocity counters** (applications and payments in the last hour), plus device history keyed by device id.
- **60–120 ms**: score with the current model or rules (amount vs stated income, new device, velocity), returning **decision, reason and score**. If features are missing or a dependency is down, **refer for review** within the budget.
- **Then**: publish the **decision event** (request id, inputs, features used, score, reason, model version) to Kinesis → Firehose → Bronze.
- **An hour later**: Silver joins the decision to the **CDC application record** on request id; mismatches go to a reconciliation report. Labels (confirmed fraud, false positive) and logged features become **point-in-time training data**.`,
	level2: [
		{
			id: 'context',
			question: 'Where does customer context come from during the request?',
			options: [
				{ id: 'A', text: 'Query Redshift for the customer\'s history', verdict: 'weak', feedback: 'Warehouse queries are too slow and too contended to sit inside a 2-second customer call.' },
				{
					id: 'B',
					text: 'A feature store of precomputed summaries refreshed from Silver, plus stream-updated velocity counters',
					verdict: 'best',
					feedback: 'Millisecond lookups with both deep history and the last hour\'s activity.'
				},
				{ id: 'C', text: 'Read Silver directly with Athena', verdict: 'weak', feedback: 'Seconds to start a query at best; unpredictable under load.' }
			],
			expert: `**Precomputed, keyed by customer.** Batch does the heavy history work; the request only does lookups.`
		},
		{
			id: 'cold',
			question: "The customer's relevant history is years old (in cold storage). What happens?",
			options: [
				{ id: 'A', text: 'Restore it from Glacier during the call', verdict: 'weak', feedback: 'Restores take minutes to hours; the call is over.' },
				{
					id: 'B',
					text: 'Never read cold data in the request: long history lives in precomputed summaries; if a feature is missing, use a conservative default and refer if needed',
					verdict: 'best',
					feedback: 'The request stays within budget, and missing information is handled explicitly.'
				},
				{ id: 'C', text: 'Decline anyone without recent history', verdict: 'weak', feedback: 'Unfair to returning customers, and a Consumer Duty problem.' }
			],
			expert: `**Summaries, not history.** The feature store holds what the model needs from ten years of data, in a few fields per customer.`
		},
		{
			id: 'reconcile',
			question: 'How do you reconcile the real-time decision with the CDC record that arrives later?',
			options: [
				{ id: 'A', text: 'There is no need; they are separate systems', verdict: 'weak', feedback: 'Then nobody notices when a decision and the application record disagree.' },
				{
					id: 'B',
					text: 'Join them in Silver on the request id; report unmatched or mismatched records',
					verdict: 'best',
					feedback: 'Every decision is tied to its application, and drift between the paths becomes visible.'
				},
				{ id: 'C', text: 'Overwrite the decision with the CDC data', verdict: 'weak', feedback: 'Destroys the record of what was decided and why.' }
			],
			expert: `**One id across both paths.** The API's request id is stored by the application system, so the two records can always be joined.`
		},
		{
			id: 'training',
			question: 'Where does model training data come from?',
			options: [
				{ id: 'A', text: 'Today\'s feature store values for past applications', verdict: 'weak', feedback: 'Leaks information that was not known at decision time; the model looks better in testing than in reality.' },
				{
					id: 'B',
					text: 'Features logged at decision time plus point-in-time Silver history, joined to outcome labels',
					verdict: 'best',
					feedback: 'Trains on exactly what was known when each decision was made.'
				},
				{ id: 'C', text: 'Gold aggregate tables', verdict: 'ok', feedback: 'Useful for analysis, but too aggregated and not point-in-time.' }
			],
			expert: `**Point in time.** Logging the features used with each decision makes training data honest by construction.`
		}
	],
	level3: [
		{
			id: 'feature-store-down',
			prompt: 'The feature store is unavailable for ten minutes during peak applications. What happens?',
			expert:
				'Requests still get an answer within the budget: the Lambda times out the lookup quickly and falls back to a rules-only decision on the request data, referring anything above a risk threshold for manual review. Each fallback is recorded with its reason code, the batch path re-scores those decisions with full context, and the fraud team reviews any differences. A spike in fallbacks pages the on-call engineer.',
			lookFor: ['fallback|rules-only|refer|manual review', 'timeout|within (the )?budget', 'record|reason', 're-?score|batch', 'page|alert|on-?call']
		},
		{
			id: 'freshness',
			prompt: 'How fresh does each kind of customer context need to be?',
			expert:
				'It depends on how fast the signal changes. Velocity (applications and payments in the last hour) needs to be seconds old, so it comes from the stream. Long-history summaries such as tenure or typical spend barely move day to day, so a nightly rebuild from Silver is enough. Device history sits in between, updated from the stream with a nightly correction. The trade-off is running two feature pipelines, which is cheaper than querying history live.',
			lookFor: ['velocity|last hour', 'stream', 'nightly|daily|batch', 'tenure|history|summar', 'trade-?off']
		}
	],
	concepts: [
		{ id: 'budget', label: 'An explicit latency budget', patterns: ['\\d+\\s?ms|budget|milliseconds'], importance: 'essential', why: 'Saying where the time goes shows the design can actually meet 2 seconds.' },
		{ id: 'features', label: 'Precomputed features with the right freshness', patterns: ['feature'], importance: 'essential', why: 'History cannot be queried live; it must be summarised in advance.' },
		{ id: 'no-cold', label: 'No cold or warehouse reads in the request', patterns: ['never read|summar|precomput|not (query|read)'], importance: 'essential', why: 'Anything slower than a key lookup breaks the budget.' },
		{ id: 'record', label: 'Decision recorded with inputs, features and model version', patterns: ['decision event|model version|record'], importance: 'essential', why: 'Audit, complaints and training all need the full decision record.' },
		{ id: 'reconcile', label: 'Reconcile with CDC on a shared id', patterns: ['reconcil|request id|join'], importance: 'essential', why: 'The two paths must be shown to agree.' },
		{ id: 'fallback', label: 'A fallback when context is missing or a dependency fails', patterns: ['fallback|refer|default|manual review'], importance: 'bonus', why: 'Outages and thin files will happen.' },
		{ id: 'pit', label: 'Point-in-time training data', patterns: ['point[- ]in[- ]time|leak|at decision time'], importance: 'bonus', why: 'Prevents models that look good in testing and fail in production.' }
	],
	leadExplanation: {
		constraint: 'The constraint is a 2-second answer for a customer on the phone, so the request can only do lookups, never queries over history.',
		reasons: [
			'A written latency budget shows the design uses well under half a second, leaving headroom.',
			'Context comes from a feature store: batch summaries for history, stream counters for the last hour, so every lookup takes milliseconds.',
			'Each decision is recorded with its request id, features and model version, so it can be reconciled with CDC, audited and used for training.'
		],
		tradeOff: 'Two feature pipelines (batch and stream) to keep consistent, and features are only as fresh as their pipeline.',
		switchWhen: "If the model needed signals that can't be precomputed, such as live credit bureau checks, I'd call them in parallel with a strict timeout and refer the application if they don't return in time."
	},
	leadSays: {
		context: 'A warehouse query cannot sit inside a 2-second call, so context comes from a feature store: history summaries rebuilt from Silver and velocity counters updated from the stream, all millisecond lookups.',
		cold: "Restoring cold data takes hours, so the request never touches it. What the model needs from ten years of history is precomputed into a few fields; if one is missing, we use a conservative default and refer if needed.",
		reconcile: "Two paths only stay trustworthy if we can show they agree, so the API's request id travels with both records and Silver joins them. Anything unmatched goes on the reconciliation report.",
		training: "A model trained on information that arrived later looks great in testing and fails in production, so training uses the features logged at decision time plus point-in-time history, joined to outcome labels."
	},
	leadPhrases: [
		'"Here\'s the latency budget: we use under half a second of the two."',
		'"The request does lookups, never queries over history."',
		'"Velocity comes from the stream; history comes from batch summaries."',
		'"Every decision carries its request id, features and model version."',
		'"We train on what we knew at the time, not what we know now."'
	],
	antiPatterns: [
		{
			sounds: '"Lambda looks up the customer\'s full history in Redshift."',
			problem: 'Puts a contended warehouse query inside a 2-second customer call; it will fail at peak.'
		},
		{
			sounds: '"The ML model handles it."',
			problem: 'Says nothing about where features come from, how fresh they are, or what happens when they are missing.'
		}
	],
	watchOutFor: [
		'No latency budget: "it\'s fast" is not an answer.',
		'Querying history or cold storage inside the request.',
		'Forgetting what happens when context is missing or a dependency is down.',
		'Not explaining how the decision lines up with CDC later.'
	],
	sixtySecond:
		"The constraint is a 2-second answer on a live call, so the request only does lookups. The API validates the schema, then reads precomputed features in parallel: history summaries rebuilt nightly from Silver and velocity counters from the stream. Scoring takes tens of milliseconds, so we use well under half a second. If a dependency is down, we refer for review and record why. The decision event, with request id, features and model version, goes through Kinesis to Bronze, joins the CDC record in Silver an hour later, and becomes point-in-time training data. The trade-off is two feature pipelines. If we needed live bureau checks, I'd call them in parallel with a strict timeout.",
	defend: [
		{
			question: 'Why DynamoDB rather than Redis for features?',
			answer:
				'Both give millisecond lookups. DynamoDB is serverless and durable with no cluster to run; ElastiCache can be faster for very high request rates. For thinkmoney\'s volumes, DynamoDB is less to operate.'
		},
		{
			question: 'What if the score is borderline?',
			answer:
				'Borderline scores go to refer rather than decline, with the reason recorded. The thresholds are owned by the fraud team and versioned like the rules.'
		},
		{
			question: 'How do you know the real-time path and batch path agree?',
			answer:
				'Reconciliation in Silver: decision counts and outcomes per hour from the stream against the CDC application records, with drift alerts above a threshold.'
		}
	],
	juniorVsLead: {
		junior: "The app calls Lambda, which uses machine learning to check the customer's history and decides if it's fraud, and it's all real time.",
		lead: "The constraint is a 2-second answer on a live call, so the request only does lookups. Lambda validates the request, reads precomputed features from batch and the stream, scores in tens of milliseconds, and records the decision with its request id and model version. Silver later joins it to the CDC record and it becomes training data. The trade-off is two feature pipelines. If we needed live bureau checks, I'd add them with a strict timeout.",
		whyBetter: [
			'Gives a latency budget instead of "real time"',
			'Explains where context comes from and how fresh it is',
			'Records the decision for audit, reconciliation and training',
			'Names the trade-off and an extension'
		]
	},
	relatedSets: [
		{ id: 'ingestion', label: 'Ingestion' },
		{ id: 'ai-mcp', label: 'AI / MCP' }
	]
};

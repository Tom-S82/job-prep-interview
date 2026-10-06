import type { CapstonePart } from './index.ts';

export const partA: CapstonePart = {
	id: 'medallion-a-flow',
	letter: 'A',
	nodes: ['app', 'api', 'kinesis', 'firehose', 'ssis', 'bronze', 'spark', 'silver'],
	title: 'A · Data flow: a decision path and a batch path',
	summary: 'Design how real-time fraud decisions and hourly CDC both reach the same medallion.',
	context: `A customer is **on the phone applying for a card**. The app needs a fraud decision in **under 2 seconds**.

Meanwhile **SSIS CDC runs hourly**, extracting up to **50 million rows** per run from SQL Server. Both must end up in the same Bronze → Silver → Gold medallion.

The catch: **Firehose batches records** (by size or time) before writing to S3, so anything that waits for data to land is far too slow for the decision.`,
	businessContext:
		'This is the core design. Get the two paths right and every later part (layout, refresh, validation, lifecycle) has a clear place to live. Get it wrong and the fraud decision depends on a batch pipeline.',
	primer: `**Synchronous vs asynchronous.** A customer waiting on the phone needs a **request/response** call: the app sends a request and waits for the answer. Kinesis is **asynchronous**: producers write and move on, and nothing "waits for Kinesis" to reply.

**Kinesis Data Streams vs Firehose.** Data Streams delivers records to consumers in about a second and keeps them for replay (24 hours by default, up to 365 days). Firehose is a **delivery** service: it buffers records and writes them in batches to S3, Redshift or Iceberg tables. Ideal for landing data, wrong for making decisions.

**System of record.** In a medallion, **Bronze is the durable record**. Streams, caches and APIs are transport and serving.

**Idempotent CDC.** An hourly load must be safe to re-run: every row carries its primary key and CDC sequence number (LSN), and loads **MERGE** on that identity rather than blindly inserting.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Does the fraud decision wait for data to land anywhere, or happen in the request?',
		'Where does each path land first, and which copy is the source of truth?',
		'Where do the streaming and batch data meet, and how are conflicts resolved?',
		'What does the decision need to know about the customer, and where does that come from in under a second?'
	],
	level1Expert: `**Two paths with different jobs, meeting in Silver.**

- **Decision path (synchronous, under 2 s)**: the app calls a fraud **API** (API Gateway → Lambda). Lambda validates the request, reads **precomputed customer features** from a feature store in milliseconds, scores, and returns the decision. Then it publishes the decision event to **Kinesis Data Streams**.
- **Landing**: Firehose delivers decision events to **Bronze (Iceberg on S3)**. The buffer delay doesn't matter here because nobody is waiting on it.
- **Batch path (hourly)**: SSIS CDC writes to **Bronze** as append-only Iceberg, partitioned by ingest hour, every row carrying primary key, **LSN** and load id, so reruns are **idempotent**.
- **Meeting point: Silver**. An hourly Spark/Glue job **MERGEs** both sources on the business key, ordered by event time, with the SQL Server ledger winning ties. Decision events join to the CDC application record by request id.
- **Feedback into the fast path**: batch jobs rebuild customer features from Silver and refresh the feature store, so the decision gets rich context without querying history live.`,
	level2: [
		{
			id: 'hot',
			question: 'How does the fraud decision meet the 2-second budget?',
			options: [
				{ id: 'A', text: 'Wait for the event to land in S3 via Firehose, then score it', verdict: 'weak', feedback: 'Firehose buffers before writing; the customer would be waiting minutes, not seconds.' },
				{
					id: 'B',
					text: 'Synchronous API: API Gateway → Lambda scores using a feature store, then publishes the decision to Kinesis',
					verdict: 'best',
					feedback: 'The decision happens inside the request. Kinesis and Firehose carry the record afterwards, where delay is harmless.'
				},
				{
					id: 'C',
					text: 'Write to Kinesis; a Lambda consumer scores it; the app polls for the result',
					verdict: 'ok',
					feedback: 'Works for transaction monitoring where nobody waits, but polling adds latency and complexity for a live call.'
				},
				{ id: 'D', text: 'Spark Structured Streaming on Silver', verdict: 'weak', feedback: 'Seconds to minutes of latency and heavy to run; right for deep analysis, wrong for a live decision.' }
			],
			expert: `**Synchronous API.** The customer is waiting, so the decision is request/response. The stream exists to record the decision durably and feed everything downstream, not to make it.`
		},
		{
			id: 'cdc',
			question: 'Where does the hourly SSIS CDC land first?',
			options: [
				{ id: 'A', text: 'Directly into Redshift tables', verdict: 'weak', feedback: 'Couples ingestion to the warehouse and leaves no raw copy to replay from.' },
				{
					id: 'B',
					text: 'S3 Bronze as append-only Iceberg, with primary key, LSN and load id on every row',
					verdict: 'best',
					feedback: 'A durable, replayable raw record; reruns are idempotent because every row has a deterministic identity.'
				},
				{ id: 'C', text: 'Straight into Silver with a MERGE', verdict: 'weak', feedback: 'Fast, but if the merge logic is wrong there is no raw copy to rebuild from.' }
			],
			expert: `**Bronze first, always.** Raw, append-only and replayable. SSIS stays as the extractor (it works); only its destination changes.`
		},
		{
			id: 'meet',
			question: 'Where do the streaming and batch data meet?',
			options: [
				{ id: 'A', text: 'In one shared Bronze table', verdict: 'weak', feedback: 'Mixes sources in the raw layer and makes replaying one source without the other hard.' },
				{
					id: 'B',
					text: 'In Silver: an hourly incremental MERGE on the business key, ordered by event time, ledger wins ties',
					verdict: 'best',
					feedback: 'Deterministic conflict resolution in one place, with each source still replayable from its own Bronze table.'
				},
				{ id: 'C', text: 'Only in the Gold reports', verdict: 'weak', feedback: 'Every report reconciles the sources its own way, so numbers disagree.' }
			],
			expert: `**Silver is where sources become one truth.** Keep Bronze per source; merge in Silver with explicit ordering rules so the result is the same however many times it runs.`
		},
		{
			id: 'truth',
			question: 'What is the system of record for a fraud decision?',
			options: [
				{ id: 'A', text: "The Lambda's API response", verdict: 'weak', feedback: 'Ephemeral: once returned, it is gone.' },
				{
					id: 'B',
					text: 'The decision event in Bronze, with the rule and model version that produced it',
					verdict: 'best',
					feedback: 'Durable, immutable and auditable: every decision can be explained later.'
				},
				{ id: 'C', text: 'A row in a Redshift table', verdict: 'ok', feedback: 'Queryable, but a serving copy, not the raw immutable record.' }
			],
			expert: `**The event in Bronze.** Every decision is stored with its inputs, rule or model version and score, so we can answer "why did we decline this customer?" months later.`
		}
	],
	level3: [
		{
			id: 'lambda-vs-spark',
			prompt:
				'If fraud logic runs in Lambda, you decide in 200 ms but cannot see the full customer context. In Spark at Silver you have full context but minutes of latency. Which wins, and why?',
			expert:
				"Both, with different jobs. The decision has to happen inside the request, so Lambda makes it, and I fix the context problem by precomputing it: Spark builds customer features from Silver and pushes them to the feature store, so Lambda reads rich context in milliseconds. Spark keeps the deep investigation and model training. The trade-off is feature freshness: history features are only as fresh as the last refresh, so velocity features come from the stream instead.",
			lookFor: ['precomput|feature store|features', 'lambda', 'spark|batch', 'fresh|stale|refresh', 'trade-?off']
		},
		{
			id: 'firehose',
			prompt: 'Firehose buffers before writing. How do you still get decisions in under 2 seconds, and what does it cost you?',
			expert:
				"The decision never waits for Firehose: it is made synchronously in Lambda, and Firehose only lands the decision event in Bronze afterwards, where a minute's delay doesn't matter. The cost is a second path to build and keep consistent: the API, the feature store and the feature-refresh jobs. If Bronze ever needed faster landing, we could shorten the buffer interval, at the price of more small files to compact.",
			lookFor: ['synchron|request|api', 'never waits|afterwards|doesn.?t matter', 'cost|second path|two paths', 'buffer', 'small files|compact']
		},
		{
			id: 'stale-hour',
			prompt: 'CDC arrives hourly, so batch-fed tables are up to 59 minutes stale. Acceptable? How do you communicate it?',
			expert:
				"For reporting, yes; for the fraud decision, no, which is why the decision uses stream-fed velocity features. We make staleness visible: every Gold table carries a data-as-of timestamp, dashboards show it, and the semantic layer returns it with each answer. If finance needed intraday figures, we'd move only the tables they need to near-real-time CDC, not everything.",
			lookFor: ['as of|timestamp|freshness', 'report|finance|dashboard', 'stream|velocity', 'only|specific tables|not everything']
		}
	],
	concepts: [
		{ id: 'sync', label: 'A synchronous decision path (API request/response)', patterns: ['synchron', 'request', 'api gateway|\\bapi\\b'], importance: 'essential', why: 'A customer on the phone needs a request/response answer; streams are asynchronous.' },
		{ id: 'features', label: 'Precomputed context in a fast store', patterns: ['feature', 'precomput', 'dynamo|cache'], importance: 'essential', why: 'History cannot be queried live in under a second; it has to be precomputed.' },
		{ id: 'stream', label: 'Decision events streamed onward (Kinesis)', patterns: ['kinesis|stream'], importance: 'essential', why: 'Decisions must be recorded durably and feed the rest of the platform.' },
		{ id: 'bronze', label: 'Bronze as the durable record for both paths', patterns: ['bronze'], importance: 'essential', why: 'One replayable raw layer is what makes rebuilds and audits possible.' },
		{ id: 'idempotent', label: 'Idempotent, replayable CDC (LSN, MERGE)', patterns: ['\\blsn\\b|idempot|replay|merge'], importance: 'essential', why: 'Hourly loads will fail and be re-run; they must not duplicate.' },
		{ id: 'silver', label: 'Sources meet in Silver with explicit ordering rules', patterns: ['silver'], importance: 'essential', why: 'Conflicts between stream and batch need one deterministic resolution point.' },
		{ id: 'firehose', label: 'Firehose only lands data; it is not in the decision path', patterns: ['firehose'], importance: 'bonus', why: 'Its buffering is fine for landing and fatal for decisions.' },
		{ id: 'staleness', label: 'Staleness made visible', patterns: ['as of|timestamp|stale|fresh'], importance: 'bonus', why: 'Users should know how old the data they are reading is.' }
	],
	leadExplanation: {
		constraint: 'The constraint is a 2-second decision on a live call, and that rules out anything that waits on Firehose or a batch layer.',
		reasons: [
			'The decision is made synchronously in an API, because the customer is waiting for an answer.',
			'Rich context comes from features precomputed in batch and stored for millisecond lookups, so the decision never queries history live.',
			'Both paths land in Bronze and meet in Silver, so there is one replayable record and one place where conflicts are resolved.'
		],
		tradeOff: 'Two paths to run and keep consistent, plus the jobs that move features from batch into the fast store.',
		switchWhen:
			"If decisions could wait a few minutes, as in overnight transaction monitoring, I'd drop the synchronous path and score from the stream or Silver alone."
	},
	leadSays: {
		hot: "The constraint is the 2-second budget on a live call, so the decision has to happen inside the request: API Gateway to Lambda, scoring against precomputed features. Kinesis records the decision afterwards. That means two paths, but it's the only way to meet the budget.",
		cdc: "Bronze first, because if anything downstream is wrong we need a raw copy to replay. SSIS keeps extracting, so we only change where it lands, and every row carries its LSN so reruns are idempotent.",
		meet: "Conflicts need one place to be resolved, so the sources meet in Silver: an incremental MERGE on the business key, ordered by event time, with the ledger winning ties. It costs an hourly job, but every report then reads the same truth.",
		truth: "A decision we can't explain later is a regulatory problem, so the system of record is the decision event in Bronze with its rule and model version. The API response is just how we deliver it."
	},
	leadPhrases: [
		'"The constraint is a 2-second decision on a live call, so the decision happens in the request."',
		'"Kinesis records the decision; it doesn\'t make it."',
		'"Both paths land in Bronze and meet in Silver."',
		'"History is precomputed into features, never queried live."',
		'"The trade-off is two paths to keep consistent."'
	],
	antiPatterns: [
		{
			sounds: '"Kinesis gives us real-time fraud detection."',
			problem: 'Kinesis is asynchronous transport. Saying it "detects" anything hides the question of where the decision runs and how the caller gets an answer.'
		},
		{
			sounds: '"We merge streaming and batch in a lambda architecture."',
			problem: 'Naming a pattern is not a design. Say where they meet, how conflicts are resolved and which copy is the record.'
		}
	],
	watchOutFor: [
		'Putting Firehose or S3 in the decision path. Say explicitly that the decision never waits for data to land.',
		'Forgetting how the decision gets context. "Lambda scores it" invites the question "using what?"',
		'Not naming the system of record. Interviewers will ask where the truth lives.',
		'Leaving out idempotency for the hourly CDC.'
	],
	sixtySecond:
		"The constraint is a 2-second decision on a live call, so the decision happens inside the request: the app calls an API, Lambda reads precomputed customer features from a fast store, scores and replies. Then it publishes the decision to Kinesis, and Firehose lands it in Bronze, where delay doesn't matter. Hourly SSIS CDC also lands in Bronze, idempotent because every row carries its LSN. Both meet in Silver through a MERGE with explicit ordering rules. The trade-off is two paths to keep consistent. If decisions could wait minutes, I'd drop the synchronous path.",
	defend: [
		{
			question: "Why not just use Kinesis and a Lambda consumer? That's real time.",
			answer:
				'It is real time for processing, but asynchronous: the app would have to poll for the result. For a customer on the phone, a synchronous API is simpler and faster. The stream still carries the decision afterwards.'
		},
		{
			question: 'What happens if the hourly CDC fails halfway?',
			answer:
				'Nothing is half-merged, because Iceberg commits are atomic, and the rerun starts from the last committed LSN. Rows that landed twice are deduplicated by the MERGE on primary key and LSN.'
		},
		{
			question: 'How do the fraud decision and the later CDC record line up?',
			answer:
				'The API returns a request id that the application system stores; in Silver we join decision events to the CDC application record on that id and flag anything unmatched for the reconciliation report.'
		}
	],
	juniorVsLead: {
		junior: 'We would use Kinesis for real time, SSIS for batch, merge them in Silver, and it would be scalable.',
		lead: "The constraint is a 2-second decision on a live call, so the decision happens synchronously in an API that reads precomputed features. The decision event then goes through Kinesis and Firehose into Bronze, and hourly CDC lands in Bronze too. Both meet in Silver through a MERGE with explicit ordering. The trade-off is two paths to keep consistent. If decisions could wait minutes, I'd score from the stream alone.",
		whyBetter: [
			'Separates making the decision from recording it',
			'Says where context comes from',
			'Names the system of record and the meeting point',
			'States the trade-off and when the design would change'
		]
	},
	relatedSets: [
		{ id: 'ingestion', label: 'Ingestion' },
		{ id: 'silver', label: 'Silver' }
	]
};

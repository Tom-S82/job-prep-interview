import type { ArchitectureScenario } from '../scenarios.ts';

export const fraud: ArchitectureScenario = {
	id: 'fraud',
	title: 'Real-time fraud warnings',
	summary: 'Fraud is reviewed next day in batch. Product wants in-app warnings in under 2 seconds.',
	leadExplanation: {
		constraint:
			'The constraint is the 2-second budget. Anything batch-based is out, so scoring has to happen on the stream.',
		reasons: [
			'A warning only helps while the customer is still looking at their phone. Minutes later it is noise.',
			'Rules need context such as recent spending velocity, so features must be precomputed and looked up in milliseconds, not queried from the warehouse.',
			'Every warning must be explainable to the FCA and the customer, so each verdict is stored with the rule version that produced it.'
		],
		tradeOff:
			'We run two paths, a fast one for warnings and a slower one for investigation, so there is more to operate, and the fast path can only use simple rules and precomputed features.',
		switchWhen:
			'If the fraud team needs stateful patterns across millions of events, like rolling windows per merchant, we would move scoring from Lambda to Flink.'
	},
	leadSays: {
		compute:
			'The constraint is the two-second budget, which rules out anything batch. Lambda on Kinesis fits because the logic is simple rules plus lookups, and it scales with the stream. The trade-off is limited state and timeouts. If we need rolling windows at volume, we would switch to Flink.',
		features:
			"Scoring has a millisecond budget, so features can't be computed on demand. A DynamoDB table updated by the stream gives key lookups in milliseconds. The trade-off is keeping it in sync, so we also write features to Bronze to audit exactly what the scorer saw.",
		verdicts:
			'The requirement is that every warning can be explained later. So each decision is its own row, with the rule version and features used, rather than a flag overwriting the transaction. It costs a join, but we never lose history.',
		rules:
			"Fraud changes faster than our release cycle, but every rule change is a regulated decision. So rules are versioned config the fraud team owns, reviewed, and run in shadow mode first. That's slower than editing production, and that's deliberate."
	},
	leadPhrases: [
		'"The constraint is the two-second budget, which rules out batch."',
		'"Here\'s the trade-off: speed on the hot path, depth on the cold path."',
		'"If the rules outgrow Lambda, we\'d switch to Flink, and here\'s the trigger."',
		'"Every verdict carries its rule version, so we can always answer \'why?\'"',
		'"We\'d start in shadow mode and measure false positives before any customer sees a warning."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll use machine learning to detect fraud."',
			problem:
				'Sounds advanced, but says nothing about latency, features, labels or how a decision is explained. Start with rules you can explain and measure, then earn the model.'
		},
		{
			sounds: '"It\'s real-time and fully scalable."',
			problem: 'Every design claims this. Say what the latency budget is and what breaks first under load.'
		}
	],
	juniorVsLead: {
		junior:
			"We'd use Kinesis, Lambda and DynamoDB, plus maybe a machine learning model, to detect fraud in real time. It's scalable and follows best practice.",
		lead: "The constraint is two seconds, so scoring has to happen on the stream. I'd score card events in Lambda against precomputed features, store every verdict with its rule version for audit, and keep a slower path for investigation. The trade-off is two paths to run. If the rules need complex state, we'd move to Flink.",
		whyBetter: [
			'Opens with the constraint, so every choice that follows has a reason',
			'Names the trade-off instead of implying it is all upside',
			'Says when the design would change',
			'Replaces "scalable" and "best practice" with specifics'
		]
	},
	context: `Today the fraud team reviews **flagged card transactions the next morning**, from a batch extract that SSIS loads into SQL Server and a Power BI report.

Product wants to **warn customers in the app within 2 seconds** when a card payment looks suspicious ("Was this you?"), and the fraud team wants to **change rules without waiting for a release**.

Constraints:
- The **card processor makes the actual authorisation decision**. The platform supplies signals and warnings, not the decline itself.
- Card numbers (PANs) must stay **tokenised**: the platform is out of PCI-DSS cardholder-data scope and must stay that way.
- Every fraud decision must be **explainable for audit** (FCA, complaints).`,
	businessContext:
		'Faster warnings reduce fraud losses and customer harm (Consumer Duty), but false positives annoy customers and flood support. The design has to balance speed, accuracy and auditability.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Is this a new streaming path, or a change to the existing batch flow?',
		'Where does the fraud logic run, and where does the context it needs come from?',
		'How does a verdict get back to the app, and to the fraud team?',
		'How do rules change safely, and how do you audit every decision?'
	],
	level1Expert: `**Two paths: a hot path for seconds, a cold path for depth.**

- **Hot path (seconds)**: card authorisation events → **Kinesis Data Streams** (partitioned by account) → a **Lambda scoring function** that applies the current rules using a small **feature store** (DynamoDB: recent velocity, usual merchants, device) → verdict event → the app's notification service. Budget the 2 seconds explicitly: ingest, lookup, score, notify.
- **Rules as versioned configuration, owned by the fraud team**: reviewed, deployed through CI, tested in **shadow mode** (score without warning) before going live. No code release per rule change.
- **Every verdict is persisted with its rule version** (Firehose → Bronze → a \`fraud_verdicts\` table in Silver), so any decision can be explained later.
- **Cold path (minutes to hours)**: the fraud team's investigation, Power BI, and outcome labels (confirmed fraud / false positive) come back to **measure precision and tune rules**, and later to train a model if rules plateau.
- **SSIS is untouched**: batch CDC still delivers the ledger, which is used to reconcile what the stream saw. Fraud logic doesn't belong in SSIS.

Start small: one or two high-value rules in shadow mode, measure false positives, then switch warnings on.`,
	level2: [
		{
			id: 'compute',
			question: 'Where does real-time scoring run?',
			options: [
				{
					id: 'A',
					text: 'Lambda consuming the Kinesis stream',
					verdict: 'best',
					feedback:
						'Seconds of latency, scales with the stream, simple to operate. Ideal for rules plus feature lookups.'
				},
				{
					id: 'B',
					text: 'A Spark/Glue job on the Silver layer',
					verdict: 'weak',
					feedback:
						'Rich context, but minutes of latency at best. It cannot meet a 2-second warning. Great for the cold path, not the hot one.'
				},
				{
					id: 'C',
					text: 'Managed Service for Apache Flink',
					verdict: 'ok',
					feedback:
						'Right tool for complex, stateful, windowed logic at high volume, but heavier to run. A sensible graduation path, not where to start.'
				},
				{
					id: 'D',
					text: 'A new SSIS package running every minute',
					verdict: 'weak',
					feedback: 'SSIS is a batch tool; a one-minute schedule still misses the target and makes it fragile.'
				}
			],
			expert: `**Lambda on Kinesis.** The latency target rules out anything batch-based, and the logic (rules plus a few feature lookups) is simple enough for Lambda. I'd keep **Flink** as the next step if we need stateful windows over millions of events; Lambda's limits (timeouts, no long-lived state) are the trigger to move.`
		},
		{
			id: 'features',
			question: 'Where do features like "5 card payments in the last 10 minutes" come from?',
			options: [
				{
					id: 'A',
					text: 'Query Redshift for each transaction',
					verdict: 'weak',
					feedback:
						'Warehouse queries per event are too slow and too expensive at authorisation volume, and concurrency limits will bite.'
				},
				{
					id: 'B',
					text: 'A DynamoDB feature table kept up to date by the stream',
					verdict: 'best',
					feedback: 'Millisecond lookups, updated as events arrive. The standard low-latency feature store pattern.'
				},
				{
					id: 'C',
					text: 'Recalculate from the events in each Lambda batch',
					verdict: 'weak',
					feedback: 'Lambda is stateless; a batch only sees a slice of recent events, so counts will be wrong.'
				},
				{
					id: 'D',
					text: 'Keyed state inside Flink',
					verdict: 'ok',
					feedback: 'Correct and powerful if you have chosen Flink, but it ties features to one job and adds operational weight.'
				}
			],
			expert: `**A DynamoDB feature table updated by the stream.** Scoring needs answers in milliseconds, so features must be precomputed and stored for fast key lookups (by account). The same features are also written to Bronze so the cold path can audit and retrain on exactly what the scorer saw.`
		},
		{
			id: 'verdicts',
			question: 'How do you store fraud verdicts?',
			options: [
				{
					id: 'A',
					text: 'Update the transaction row in Silver with a fraud flag',
					verdict: 'weak',
					feedback:
						'Mutates core data, couples fraud logic to the transaction model, and loses history when a verdict changes.'
				},
				{
					id: 'B',
					text: 'A separate fraud_verdicts table: one row per decision, with rule version and features used',
					verdict: 'best',
					feedback: 'Loose coupling, full history, and every decision can be explained and audited.'
				},
				{
					id: 'C',
					text: 'Only in CloudWatch logs',
					verdict: 'weak',
					feedback: 'Not queryable for investigations or reporting, and retention is not designed for audit.'
				}
			],
			expert: `**A separate \`fraud_verdicts\` table**, one row per decision with the transaction key, rule id and **rule version**, score, features used, and later the outcome label. It joins to transactions for investigation and Power BI, and answers the audit question "why did we warn this customer?" without guesswork.`
		},
		{
			id: 'rules',
			question: 'How does the fraud team change rules?',
			options: [
				{
					id: 'A',
					text: 'Raise a ticket; the data team changes code and deploys',
					verdict: 'ok',
					feedback: 'Safe, but slow. The fraud team will be waiting days for each change while fraudsters adapt in hours.'
				},
				{
					id: 'B',
					text: 'Versioned rules config, reviewed, tested in shadow mode, deployed via CI',
					verdict: 'best',
					feedback: 'Fast and governed: the fraud team owns the rules, changes are reviewed and auditable, and shadow mode measures impact first.'
				},
				{
					id: 'C',
					text: 'Analysts edit a live rules table in production',
					verdict: 'weak',
					feedback: 'Fast, but no review, no testing and a weak audit trail, which is a real problem in an FCA-regulated firm.'
				}
			],
			expert: `**Versioned rules as configuration.** The fraud team owns the logic; the data team owns the platform that runs it safely. Rules live in version control (or AppConfig/DynamoDB with versioning), changes are reviewed, run in **shadow mode** against live traffic to measure false positives, then promoted. Each verdict records the rule version, which closes the audit loop.`
		}
	],
	concepts: [
		{
			id: 'paths',
			label: 'Separate a fast path from a deeper batch path',
			patterns: ['hot path', 'cold path', 'two paths?', 'fast path', 'real[- ]?time.{0,60}(batch|silver|spark)', '(batch|silver|spark).{0,60}real[- ]?time'],
			importance: 'essential',
			why: 'Seconds-level warnings and deep investigation have different latency needs; one path cannot serve both well.'
		},
		{
			id: 'stream',
			label: 'Stream the card events (Kinesis or Kafka)',
			patterns: ['kinesis', 'kafka', '\\bmsk\\b', 'stream'],
			importance: 'essential',
			why: 'A 2-second target needs events as they happen, not a batch extract.'
		},
		{
			id: 'features',
			label: 'Low-latency features or state for scoring',
			patterns: ['feature', 'dynamo', 'velocity', 'state', 'cache', 'lookup'],
			importance: 'essential',
			why: 'Rules like "5 payments in 10 minutes" need precomputed context available in milliseconds.'
		},
		{
			id: 'audit',
			label: 'Audit trail for every decision',
			patterns: ['audit', 'explain', 'rule version', 'log (every|each|all)', 'trace'],
			importance: 'essential',
			why: 'Every warning must be explainable to the FCA, complaints teams and the customer.'
		},
		{
			id: 'rules',
			label: 'Governed, versioned rule changes owned by the fraud team',
			patterns: ['rule', 'config', 'shadow', 'champion', 'a/b'],
			importance: 'essential',
			why: 'The fraud team must iterate quickly, but every change needs review and measurement.'
		},
		{
			id: 'feedback',
			label: 'Feedback loop: outcome labels, false positives, precision',
			patterns: ['feedback', 'label', 'false positive', 'precision', 'outcome', 'tune'],
			importance: 'bonus',
			why: 'Without outcomes you cannot tell whether rules work or just annoy customers.'
		},
		{
			id: 'ssis',
			label: 'Leave SSIS CDC as it is (batch truth for reconciliation)',
			patterns: ['ssis', '\\bcdc\\b', 'reconcil'],
			importance: 'bonus',
			why: 'The batch ledger still matters: it is the source of truth to reconcile streamed decisions against.'
		},
		{
			id: 'latency',
			label: 'Explicit latency budget or SLA',
			patterns: ['latency', 'second', '\\b2 ?s\\b', '\\bsla\\b', 'budget'],
			importance: 'bonus',
			why: 'Breaking the 2 seconds into ingest, lookup, score and notify shows where the risk is.'
		},
		{
			id: 'pci',
			label: 'PCI: keep PANs tokenised',
			patterns: ['\\bpci\\b', 'token', '\\bpan'],
			importance: 'bonus',
			why: 'Fraud data is card data; staying out of PCI-DSS cardholder scope is a design constraint.'
		}
	],
	watchOutFor: [
		'Saying "Kinesis is better" without saying better for what. Name the constraint it serves: the 2-second budget.',
		'Describing only the fast path. If you skip the slower investigation path, it sounds like you forgot the fraud team needs depth and feedback.',
		'Forgetting ownership: the fraud team owns the rules, the data team owns the platform that runs them, product owns the customer message.',
		'Rambling through every AWS service. Three components and one trade-off beat ten components.'
	],
	sixtySecond:
		'The constraint is a two-second budget, so scoring has to happen on the stream. Card events go through Kinesis to a Lambda that applies the fraud team\'s rules against precomputed features in DynamoDB, and every verdict is stored with its rule version for audit. A slower path gives the fraud team depth: investigation, outcome labels and tuning. The trade-off is running two paths. If the rules needed complex state across millions of events, I\'d move scoring to Flink.',
	defend: [
		{
			question: 'What if the Lambda times out or errors during a spike?',
			answer:
				'We fail open for the warning, never for the payment: no warning is shown, and the event goes to an on-failure destination (an SQS dead-letter queue) to be scored later for the fraud team. Kinesis keeps the records, so nothing is lost. Then we look at batch size, memory and concurrency; if we keep hitting limits, that is the trigger for Flink.'
		},
		{
			question: 'How do fraud rules get updated?',
			answer:
				'Rules are versioned config owned by the fraud team. A change is reviewed, run in shadow mode against live traffic to measure false positives, then promoted. Every verdict records the rule version, so we can always say which rule fired and when it changed.'
		},
		{
			question: 'How would you A/B test a new model against the current rules?',
			answer:
				'Champion and challenger: the new model scores the same events in shadow, we compare precision and false-positive rates on labelled outcomes, and only then route a small share of live warnings to it. The fraud team signs off before it becomes the champion.'
		},
		{
			question: 'Who owns what?',
			answer:
				'The fraud team owns the rules and their outcomes; the data team owns the streaming platform, the features and the audit trail; product owns the in-app message. Writing that down avoids "it\'s the data team\'s fault" when a rule misfires.'
		}
	],
	level3: [
		{
			id: 'spike',
			prompt: 'Black Friday: card volume triples and your scoring Lambda starts throttling. Where does your design break, and what do you do?',
			expert:
				'The weak point is Lambda concurrency and the feature lookups. First, the warning path fails open: no warning is shown, the payment is unaffected, and failed events go to a dead-letter queue to be scored later. Then I\'d raise reserved concurrency and stream capacity (or use on-demand mode), and load-test before peak periods next time. If spikes keep pushing us to the limit, that\'s the trigger to move scoring to Flink.',
			lookFor: ['fail[- ]?(open|safe)', 'dead[- ]letter|\\bdlq\\b|\\bsqs\\b|retry', 'concurrency|shard|on-demand|scal', 'load[- ]test|peak', 'flink']
		},
		{
			id: 'hourly',
			prompt: 'The fraud team now wants to change rules every hour. Does your design cope?',
			expert:
				'Yes, if rules are configuration, not code. Hourly changes are fine as long as each one is versioned, reviewed by a second fraud analyst, and runs briefly in shadow mode before going live. What I wouldn\'t accept is editing production directly, because then we can\'t explain past decisions to the FCA. If hourly changes become the norm, I\'d invest in a small rules UI with built-in review rather than pull requests.',
			lookFor: ['config', 'version', 'review|approv', 'shadow', 'audit|explain']
		},
		{
			id: 'audit',
			prompt: 'A customer complains they were wrongly warned. Compliance asks you to explain that exact decision. Can you?',
			expert:
				'Yes, because every verdict row stores the transaction key, the rule id and version, the score and the features the rule saw at that moment. So we can say: rule 14, version 3, fired because there were six payments in ten minutes at new merchants. If the rule was wrong, we fix it through the normal review path and record the complaint as a false-positive label.',
			lookFor: ['rule (id|version)|version', 'feature', 'verdict|decision', 'false positive|label']
		}
	],
	relatedSets: [
		{ id: 'ingestion', label: 'Ingestion' },
		{ id: 'toolset', label: 'Toolset reference' }
	]
};

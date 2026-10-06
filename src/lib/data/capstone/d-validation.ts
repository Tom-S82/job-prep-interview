import type { CapstonePart } from './index.ts';

export const partD: CapstonePart = {
	id: 'medallion-d-validation',
	letter: 'D',
	nodes: ['api', 'quarantine', 'spark', 'dbt'],
	title: 'D · Validation: where each check runs, and what failure means',
	summary: 'Place schema, quality and business-rule checks on both paths, and decide what happens when they fail.',
	context: `There are three kinds of validation:
1. **Schema**: does the record have the right shape?
2. **Quality**: is the data true and complete?
3. **Business rules**: does it pass the fraud and risk rules?

On the **decision path** a customer is on the phone and the API has under 2 seconds. On the **batch path**, the hourly CDC brings up to 50 million rows, and a small percentage typically fail quality checks.`,
	businessContext:
		'Validation in the wrong place either blocks customers or lets bad data into reports and models. The panel wants to see that you separate rejecting malformed data from recording a negative decision.',
	primer: `**Three different jobs.** Schema checks are cheap and belong at the edge. Quality checks need context (other tables, history) and belong at Silver, typically as dbt tests and reconciliation. Business rules produce **decisions**, not rejections.

**A decline is valid data.** A declined application is a perfectly good record: it must be stored, with the reason and rule version, for audit and model training. Only malformed data is "invalid".

**Quarantine, not delete.** Batch rows that fail quality checks go to a quarantine table with the rule that failed, so they can be fixed and **replayed from Bronze**. A whole load stops only when the failure rate passes a threshold, which signals a systemic problem.

**Fail safe for decisions.** If the decision cannot be completed in time (a dependency is down), choose a safe default (refer to manual review, or a rules-only decision) and record why. Do not make the customer wait indefinitely, and do not approve blindly.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Which checks must happen before the decision, and which can happen later?',
		'Is a declined application invalid data?',
		'What happens to batch rows that fail a quality check?',
		'What does the customer experience if the decision cannot be completed in time?'
	],
	level1Expert: `**Schema at the edge, quality at Silver, rules as decisions, everything replayable.**

- **Decision path**: the API validates the request **schema** first and returns a 400 for malformed input in milliseconds; only well-formed requests are scored.
- **Business rules make decisions, not rejections**: a decline is recorded with reason, score and rule/model version. It is valid data.
- **Fail safe**: if features or the model are unavailable, return a "refer for manual review" (or rules-only) decision within the budget and record the reason; batch re-scores later.
- **Batch path**: schema checks as CDC lands in Bronze; **quality checks** (dbt tests, reconciliation to source totals) at Silver. Failing rows go to **quarantine** with the rule that failed; the load stops only above a failure threshold.
- **Replay**: corrected records re-enter from Bronze through the normal pipeline, never patched in Gold.`,
	level2: [
		{
			id: 'schema',
			question: 'Where does schema validation run for the fraud API?',
			options: [
				{ id: 'A', text: 'In the Lambda before scoring, returning a 400 immediately for malformed requests', verdict: 'best', feedback: 'Cheap, fast, and the caller gets an actionable error within milliseconds.' },
				{ id: 'B', text: 'Later, when the event lands in Bronze', verdict: 'weak', feedback: 'Too late: the decision has already been made on malformed input.' },
				{ id: 'C', text: 'Skip it to save time', verdict: 'weak', feedback: 'Malformed input reaches the model and produces meaningless scores.' }
			],
			expert: `**At the edge.** Schema validation costs microseconds and protects everything after it.`
		},
		{
			id: 'decline',
			question: 'How is a declined application treated?',
			options: [
				{ id: 'A', text: 'As invalid: quarantined or dropped', verdict: 'weak', feedback: 'Loses the audit trail and the training data the model needs.' },
				{
					id: 'B',
					text: 'As valid data: stored with decision, reason, score and rule/model version',
					verdict: 'best',
					feedback: 'A decision is an outcome to record, not an error to remove.'
				},
				{ id: 'C', text: 'Logged in CloudWatch only', verdict: 'weak', feedback: 'Not queryable for investigation, audit or training.' }
			],
			expert: `**A decline is data.** Regulators, complaints teams and the next model all need it.`
		},
		{
			id: 'quality',
			question: 'An hourly CDC run has 2% of rows failing quality checks. What happens?',
			options: [
				{ id: 'A', text: 'Fail the whole load', verdict: 'ok', feedback: 'Safe, but blocks 98% good data; use a threshold to tell systemic problems from bad rows.' },
				{
					id: 'B',
					text: 'Quarantine failing rows with reasons, load the rest, stop only above a threshold; replay fixes from Bronze',
					verdict: 'best',
					feedback: 'Good data flows, bad rows are kept and fixable, and systemic failures still stop the line.'
				},
				{ id: 'C', text: 'Load everything and fix it in Gold', verdict: 'weak', feedback: 'Bad data reaches reports and models, and fixes in Gold drift from the source.' }
			],
			expert: `**Quarantine plus a threshold.** Individual bad rows are expected; a sudden jump in failures means stop and investigate.`
		},
		{
			id: 'fallback',
			question: 'The feature store is down during a call. What happens to the decision?',
			options: [
				{ id: 'A', text: 'The customer waits until it recovers', verdict: 'weak', feedback: 'Breaks the 2-second promise and the customer experience.' },
				{
					id: 'B',
					text: 'Fail safe: refer for manual review (or rules-only), record why, re-score later in batch',
					verdict: 'best',
					feedback: 'The customer gets an answer in time, risk stays controlled, and the decision is auditable.'
				},
				{ id: 'C', text: 'Approve automatically', verdict: 'weak', feedback: 'Turns an outage into fraud exposure.' }
			],
			expert: `**Fail safe, and say so.** The fallback is a designed outcome with its own reason code, not an accident.`
		}
	],
	level3: [
		{
			id: 'strictness',
			prompt: 'Validate strictly at ingestion and you block streaming; validate late and bad data pollutes Silver. How strict should you be?',
			expert:
				"Strict on shape, lenient on content. Schema checks at the edge are cheap and catch what can't be processed, so they reject. Content checks need context, so they run at Silver and quarantine rather than block. The trade-off is that questionable rows reach Bronze, which is fine because Bronze is raw by design; they just don't get promoted until they pass.",
			lookFor: ['shape|schema', 'content|quality', 'quarantine', 'bronze|raw', 'promot|silver']
		},
		{
			id: 'rescore',
			prompt: 'Real-time decisions need speed. Can you re-validate in batch and correct later?',
			expert:
				"Yes: batch re-scores every decision with full context and the latest features, and compares. Differences go to the fraud team as a review queue, and they feed model tuning. We never silently change a decision the customer was given; a correction is a new, recorded decision with its own reason.",
			lookFor: ['re-?score|re-?validat|batch', 'compar|differ', 'review|fraud team', 'new (recorded )?decision|never silently|record']
		}
	],
	concepts: [
		{ id: 'edge', label: 'Schema validation at the edge', patterns: ['schema', 'edge|before scor|400|ingest'], importance: 'essential', why: 'Cheap checks that stop malformed data before it is used.' },
		{ id: 'decision-data', label: 'A decline is valid data, recorded with its reason', patterns: ['declin', 'record|stored|valid data'], importance: 'essential', why: 'Decisions are needed for audit, complaints and model training.' },
		{ id: 'quarantine', label: 'Quarantine with a failure threshold', patterns: ['quarantine'], importance: 'essential', why: 'Bad rows are kept and fixable without blocking good ones.' },
		{ id: 'failsafe', label: 'Fail safe when the decision cannot complete', patterns: ['fail[- ]?safe|manual review|refer|fallback|rules-only'], importance: 'essential', why: 'Outages must produce a controlled outcome, not a hung call or a blind approval.' },
		{ id: 'replay', label: 'Replay corrections from Bronze', patterns: ['replay'], importance: 'essential', why: 'Fixes go through the pipeline, never patched in Gold.' },
		{ id: 'quality', label: 'Quality checks at Silver (dbt tests, reconciliation)', patterns: ['quality', 'silver|dbt test|reconcil'], importance: 'bonus', why: 'Truth checks need context that only exists after the merge.' },
		{ id: 'threshold', label: 'Stop the load only above a threshold', patterns: ['threshold'], importance: 'bonus', why: 'Separates a few bad rows from a systemic failure.' }
	],
	leadExplanation: {
		constraint:
			"The constraint is that the decision path can't wait and the batch path can't let bad data through, so each check has to sit where it costs least and protects most.",
		reasons: [
			'Schema checks are cheap, so they run at the edge and reject malformed requests in milliseconds.',
			'A decline is an outcome, not an error, so it is recorded with its reason and rule version.',
			'Quality checks need context, so they run at Silver and quarantine failing rows for replay from Bronze.'
		],
		tradeOff: 'Questionable rows reach Bronze, and someone has to own the quarantine queue so it does not become a graveyard.',
		switchWhen: 'If a source started failing more than the agreed threshold, I would stop that load entirely and escalate to the source owner instead of quarantining row by row.'
	},
	leadSays: {
		schema: 'Schema checks cost microseconds, so they run in the Lambda before scoring and return a 400 straight away. Nothing malformed ever reaches the model.',
		decline: 'A decline is an outcome the regulator and the next model both need, so it is stored with the reason, score and rule version. Only malformed data is invalid.',
		quality: "Individual bad rows are normal, so they go to quarantine with the rule that failed, and the rest of the load continues. Above a threshold we stop, because that means something systemic.",
		fallback: "The customer can't wait indefinitely and we can't approve blind, so the fallback is refer-for-review within the budget, recorded with its reason, and batch re-scores it later."
	},
	leadPhrases: [
		'"Strict on shape, lenient on content."',
		'"A decline is data, not an error."',
		'"Quarantine, don\'t delete, and stop the line above a threshold."',
		'"When the decision can\'t complete, we fail safe and record why."',
		'"Corrections replay from Bronze; nothing is patched in Gold."'
	],
	antiPatterns: [
		{
			sounds: '"We validate everything at ingestion so nothing bad gets in."',
			problem: 'Content checks need context that does not exist at ingestion; trying blocks good data and slows the decision.'
		},
		{
			sounds: '"Fraudulent transactions get rejected from the pipeline."',
			problem: 'Confuses a business decision with data quality. A decline must be recorded, not removed.'
		}
	],
	watchOutFor: [
		'Treating declines as invalid data.',
		'No answer for what happens when a dependency is down mid-call.',
		'Quarantine with no owner, SLA or replay route.',
		'Running expensive checks inside the 2-second budget.'
	],
	sixtySecond:
		"The constraint is that the decision path can't wait and the batch path can't let bad data through. So schema checks run at the edge, in the Lambda, and reject malformed requests in milliseconds. Business rules produce decisions, not rejections: a decline is stored with its reason and rule version. If the feature store is down, we fail safe with a refer-for-review decision and record why. On the batch path, quality checks run at Silver, failing rows are quarantined and replayed from Bronze once fixed, and the load stops only above a threshold. The trade-off is owning a quarantine queue. If a source kept failing, I'd stop that load and escalate.",
	defend: [
		{
			question: 'Why not just reject the 2% of bad rows?',
			answer:
				"Because some of them are real transactions with a fixable problem, and dropping them changes financial totals. Quarantine keeps them visible until they're fixed or explicitly discarded."
		},
		{
			question: 'Who owns the quarantine queue?',
			answer: 'Each validation rule has an owner, usually the source system team, with an SLA by severity; the data team owns the platform and the replay mechanism.'
		},
		{
			question: "Isn't refer-for-review just a slow decline?",
			answer:
				'It is a controlled outcome: the customer is told their application needs a quick check, which is better than a wrong decline or a blind approval. We track how often it happens, because a high rate is itself an incident.'
		}
	],
	juniorVsLead: {
		junior: "We'd validate everything strictly at ingestion and reject fraudulent records so only clean data gets in. It's best practice.",
		lead: "The constraint is that the decision can't wait and batch can't let bad data through. So schema checks run at the edge and reject malformed requests; business rules produce decisions, and a decline is recorded as data. Quality checks run at Silver with quarantine and replay from Bronze. The trade-off is owning the quarantine queue. If a source kept failing, I'd stop that load and escalate.",
		whyBetter: [
			'Separates malformed data from negative decisions',
			'Places each check where it is cheapest and most useful',
			'Has a fail-safe answer for outages',
			'Names ownership as the trade-off'
		]
	},
	relatedSets: [
		{ id: 'validation', label: 'Validation' },
		{ id: 'governance', label: 'Masking, quarantine & redaction' }
	]
};

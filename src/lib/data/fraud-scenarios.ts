/**
 * Real-time fraud decisioning: the four documented scenarios and a faithful TypeScript
 * port of the rules engine in fraud-scoring/lambda/scoring.py.
 *
 * Scores are computed here, not hard-coded, so the visualisation shows exactly what the
 * Lambda would return (0.40, 1.00, 0.55, 0.00). The e2e tests assert those numbers.
 * Inputs mirror fraud-scoring/lambda/examples/scenarios.json.
 */

export const RULESET_VERSION = '2026.10-v1';
export const DECLINE_ABOVE = 0.75;
export const REVIEW_FROM = 0.5;

const NEW_ACCOUNT_DAYS = 7;
const VELOCITY_WINDOW_DAYS = 7;
const VELOCITY_MAX_PRIOR_APPLICATIONS = 2;
const INCOME_RATIO_LIMIT = 1.5;
const DORMANT_DAYS = 30;
const DAY_MS = 86_400_000;

export type Decision = 'approve' | 'manual_review' | 'decline';

export type RuleId =
	| 'new_account'
	| 'velocity_spike'
	| 'device_new'
	| 'income_consistency'
	| 'dormant_reactivation'
	| 'sca_fail'
	| 'location_unusual';

export type Application = {
	application_id: string;
	customer_id: string;
	amount: number;
	stated_monthly_income: number;
	device_id: string;
	device_location: string;
	sca_result: 'passed' | 'failed' | 'not_attempted';
};

/** The DynamoDB feature-store item, as the Lambda reads it. */
export type FeatureItem = {
	customer_id: string;
	account_opened_at: string | null;
	last_activity_at: string | null;
	typical_monthly_income: number | null;
	known_devices: string[];
	usual_locations: string[];
	recent_application_ts: number[]; // epoch seconds
};

export type RuleOutcome = {
	factor: RuleId;
	fired: boolean;
	evaluated: boolean;
	contribution: number;
	evidence: Record<string, string | number>;
};

export type Rule = {
	id: RuleId;
	weight: number;
	description: string;
	/** One-line plain-English evidence for the animation, e.g. "3 days old". */
	summarise: (o: RuleOutcome) => string;
};

// Same order as RULES in scoring.py, so the animation fires them in evaluation order.
export const RULES: Rule[] = [
	{
		id: 'new_account',
		weight: 0.25,
		description: `Account opened less than ${NEW_ACCOUNT_DAYS} days ago`,
		summarise: (o) => (o.evidence.note ? 'no account history' : `${o.evidence.value} days old`)
	},
	{
		id: 'velocity_spike',
		weight: 0.35,
		description: `More than ${VELOCITY_MAX_PRIOR_APPLICATIONS} prior applications in ${VELOCITY_WINDOW_DAYS} days`,
		summarise: (o) => `${o.evidence.count} prior in 7d`
	},
	{
		id: 'device_new',
		weight: 0.15,
		description: 'Device not previously seen for this customer',
		summarise: (o) => (o.fired ? 'unseen device' : 'known device')
	},
	{
		id: 'income_consistency',
		weight: 0.2,
		description: `Stated income more than ${INCOME_RATIO_LIMIT}x typical monthly inflow`,
		summarise: (o) =>
			o.evaluated ? `ratio ${Number(o.evidence.ratio).toFixed(2)}` : 'no income history'
	},
	{
		id: 'dormant_reactivation',
		weight: 0.2,
		description: `No activity for more than ${DORMANT_DAYS} days`,
		summarise: (o) =>
			o.evaluated ? `${o.evidence.days_inactive}d inactive` : 'no activity history'
	},
	{
		id: 'sca_fail',
		weight: 0.3,
		description: 'Strong customer authentication failed during the application',
		summarise: (o) => `SCA ${o.evidence.sca_result}`
	},
	{
		id: 'location_unusual',
		weight: 0.1,
		description: 'Device location not seen for this customer in 90 days',
		summarise: (o) => (o.evaluated ? String(o.evidence.location) : 'no location history')
	}
];

const W = Object.fromEntries(RULES.map((r) => [r.id, r.weight])) as Record<RuleId, number>;

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
/** Whole days elapsed (floor), matching Python's timedelta.days for positive spans. */
const daysBetween = (from: Date, to: Date) =>
	Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));

function outcome(
	factor: RuleId,
	fired: boolean,
	evaluated: boolean,
	evidence: RuleOutcome['evidence']
): RuleOutcome {
	return { factor, fired, evaluated, contribution: fired ? W[factor] : 0, evidence };
}

function evaluate(id: RuleId, app: Application, f: FeatureItem, now: Date): RuleOutcome {
	switch (id) {
		case 'new_account': {
			if (!f.account_opened_at)
				return outcome(id, true, true, { value: 0, unit: 'days', note: 'no account history' });
			const age = daysBetween(new Date(f.account_opened_at), now);
			return outcome(id, age < NEW_ACCOUNT_DAYS, true, { value: age, unit: 'days' });
		}
		case 'velocity_spike': {
			const start = now.getTime() - VELOCITY_WINDOW_DAYS * DAY_MS;
			const prior = f.recent_application_ts.filter(
				(s) => s * 1000 >= start && s * 1000 <= now.getTime()
			).length;
			return outcome(id, prior > VELOCITY_MAX_PRIOR_APPLICATIONS, true, {
				count: prior,
				period: `${VELOCITY_WINDOW_DAYS}_days`
			});
		}
		case 'device_new':
			return outcome(id, !f.known_devices.includes(app.device_id), true, {
				known_devices: f.known_devices.length
			});
		case 'income_consistency': {
			const typical = f.typical_monthly_income;
			if (typical === null || typical <= 0)
				return outcome(id, false, false, { note: 'no income history' });
			const ratio = round(app.stated_monthly_income / typical, 2);
			return outcome(id, ratio > INCOME_RATIO_LIMIT, true, {
				ratio,
				typical_monthly_income: round(typical, 2)
			});
		}
		case 'dormant_reactivation': {
			if (!f.last_activity_at) return outcome(id, false, false, { note: 'no activity history' });
			const idle = daysBetween(new Date(f.last_activity_at), now);
			return outcome(id, idle > DORMANT_DAYS, true, { days_inactive: idle });
		}
		case 'sca_fail':
			if (app.sca_result === 'not_attempted')
				return outcome(id, false, false, { sca_result: app.sca_result });
			return outcome(id, app.sca_result === 'failed', true, { sca_result: app.sca_result });
		case 'location_unusual':
			if (f.usual_locations.length === 0)
				return outcome(id, false, false, { note: 'no location history' });
			return outcome(id, !f.usual_locations.includes(app.device_location), true, {
				location: app.device_location
			});
	}
}

export function decide(score: number): Decision {
	if (score > DECLINE_ABOVE) return 'decline';
	if (score >= REVIEW_FROM) return 'manual_review';
	return 'approve';
}

export const RECOMMENDED_ACTION: Record<Decision, string> = {
	approve: 'Approve',
	manual_review: 'Hold for manual review (target: same working day)',
	decline: 'Decline with offer of manual review'
};

export const CUSTOMER_MESSAGE: Record<Decision, string> = {
	approve: 'Your application has been approved.',
	manual_review:
		"We need to run a few quick checks on your application. We'll be in touch shortly.",
	decline: "We can't approve your application right now. You can ask us to review this decision."
};

export const DECISION_META: Record<Decision, { label: string; color: string }> = {
	approve: { label: 'APPROVE', color: '#22c55e' },
	manual_review: { label: 'MANUAL REVIEW', color: '#eab308' },
	decline: { label: 'DECLINE', color: '#ef4444' }
};

export type ScoreResult = {
	outcomes: RuleOutcome[];
	/** Score after each rule in evaluation order (capped), for the running-total animation. */
	running: number[];
	raw_score: number;
	score: number;
	confidence: number;
	decision: Decision;
};

export function scoreApplication(app: Application, f: FeatureItem, now: Date): ScoreResult {
	const outcomes = RULES.map((r) => evaluate(r.id, app, f, now));
	let acc = 0;
	const running = outcomes.map((o) => {
		acc = round(acc + o.contribution, 4);
		return Math.min(1, acc);
	});
	const raw_score = round(acc, 4);
	const score = round(Math.min(1, raw_score), 4);
	const confidence = round(outcomes.filter((o) => o.evaluated).length / outcomes.length, 2);
	return { outcomes, running, raw_score, score, confidence, decision: decide(score) };
}

/** The Lambda's API response (to_response in scoring.py): fired rules, largest first. */
export function toResponse(app: Application, r: ScoreResult) {
	return {
		application_id: app.application_id,
		decision: r.decision,
		score: r.score,
		raw_score: r.raw_score,
		confidence: r.confidence,
		reasoning: r.outcomes
			.filter((o) => o.fired)
			.sort((a, b) => b.contribution - a.contribution)
			.map((o) => ({ factor: o.factor, ...o.evidence, contribution: o.contribution })),
		not_evaluated: r.outcomes.filter((o) => !o.evaluated).map((o) => o.factor),
		recommended_action: RECOMMENDED_ACTION[r.decision],
		customer_message: CUSTOMER_MESSAGE[r.decision],
		ruleset_version: RULESET_VERSION
	};
}

export type FraudScenario = {
	id: string;
	name: string;
	expected: Decision;
	why: string;
	request: Application;
	features: FeatureItem;
	result: ScoreResult;
};

/** Server time the applications arrive (scenarios.json "now"). */
export const NOW = new Date('2026-10-06T10:00:00+00:00');

const raw: Omit<FraudScenario, 'result'>[] = [
	{
		id: 'new-low-risk',
		name: 'New customer, low risk',
		expected: 'approve',
		why: 'Account opened on the web 3 days ago, now applying from a new phone: normal for a first application, and nothing else is unusual.',
		request: {
			application_id: 'APP_10001',
			customer_id: 'CUST_501',
			amount: 250,
			stated_monthly_income: 1400,
			device_id: 'dev-a1',
			device_location: 'Manchester',
			sca_result: 'passed'
		},
		features: {
			customer_id: 'CUST_501',
			account_opened_at: '2026-10-03T09:12:00+00:00',
			last_activity_at: '2026-10-05T18:40:00+00:00',
			typical_monthly_income: null,
			known_devices: ['web-501'],
			usual_locations: ['Manchester'],
			recent_application_ts: []
		}
	},
	{
		id: 'high-velocity',
		name: 'High velocity, new device',
		expected: 'decline',
		why: 'Three applications in a week from a new account, on a device and in a location never seen before, with SCA failing.',
		request: {
			application_id: 'APP_10002',
			customer_id: 'CUST_502',
			amount: 1500,
			stated_monthly_income: 2200,
			device_id: 'dev-zz9',
			device_location: 'Birmingham',
			sca_result: 'failed'
		},
		features: {
			customer_id: 'CUST_502',
			account_opened_at: '2026-10-01T14:00:00+00:00',
			last_activity_at: '2026-10-05T23:10:00+00:00',
			typical_monthly_income: null,
			known_devices: ['dev-b7'],
			usual_locations: ['Leeds'],
			recent_application_ts: [1791021600, 1791108000, 1791194400]
		}
	},
	{
		id: 'dormant',
		name: 'Dormant account reactivated',
		expected: 'manual_review',
		why: 'Long-standing account, quiet for 69 days, now applying from a new device with stated income well above what flows through the account.',
		request: {
			application_id: 'APP_10003',
			customer_id: 'CUST_503',
			amount: 800,
			stated_monthly_income: 2600,
			device_id: 'dev-new-44',
			device_location: 'Salford',
			sca_result: 'passed'
		},
		features: {
			customer_id: 'CUST_503',
			account_opened_at: '2023-02-14T11:00:00+00:00',
			last_activity_at: '2026-07-28T16:20:00+00:00',
			typical_monthly_income: 1450,
			known_devices: ['dev-old-12'],
			usual_locations: ['Salford'],
			recent_application_ts: []
		}
	},
	{
		id: 'established',
		name: 'Established customer, everything familiar',
		expected: 'approve',
		why: 'Every rule has the data it needs and none fire: score 0, confidence 1.0.',
		request: {
			application_id: 'APP_10004',
			customer_id: 'CUST_504',
			amount: 400,
			stated_monthly_income: 1600,
			device_id: 'dev-c3',
			device_location: 'Stockport',
			sca_result: 'passed'
		},
		features: {
			customer_id: 'CUST_504',
			account_opened_at: '2024-05-20T08:00:00+00:00',
			last_activity_at: '2026-10-05T12:00:00+00:00',
			typical_monthly_income: 1550,
			known_devices: ['dev-c3'],
			usual_locations: ['Stockport'],
			recent_application_ts: []
		}
	}
];

export const fraudScenarios: FraudScenario[] = raw.map((s) => ({
	...s,
	result: scoreApplication(s.request, s.features, NOW)
}));

/** The full decision record: saved to DynamoDB (decisions table) and published to Kinesis. */
export function decisionRecord(s: FraudScenario) {
	return {
		...toResponse(s.request, s.result),
		customer_id: s.request.customer_id,
		decided_at: NOW.toISOString(),
		amount: s.request.amount,
		evidence: s.result.outcomes.map((o) => ({
			factor: o.factor,
			fired: o.fired,
			evaluated: o.evaluated,
			...o.evidence
		}))
	};
}

// --- Stage content for the clickable panels ----------------------------------------

export type DecisionStage = {
	id: string;
	label: string;
	sub: string;
	color: string;
	oneLiner: string;
	what: string[];
	why: string;
	risk: string[];
	latency: string;
};

export const decisionStages: DecisionStage[] = [
	{
		id: 'application',
		label: 'Application',
		sub: 'API Gateway · schema check',
		color: '#64748b',
		oneLiner: 'Trust nothing from the client: validate the shape, stamp server time.',
		what: [
			'App POSTs the card application to API Gateway → Lambda',
			'Schema-validated (types, bounds, max lengths) before anything else; bad payloads get a 400',
			'applied_at is server time: client clocks cannot be trusted for velocity rules',
			'application_id is the idempotency key, so retries never double-decide'
		],
		why: 'Real-time decisions need a single, validated entry point so every downstream record shares one shape and one clock.',
		risk: [
			'Client retries creating duplicate decisions (solved by idempotent save on application_id)',
			'PII in logs: log ids and decisions, never the payload'
		],
		latency: '~5 ms'
	},
	{
		id: 'lambda',
		label: 'Lambda Scorer',
		sub: `Rules engine · ${RULESET_VERSION}`,
		color: '#22d3ee',
		oneLiner: 'Pure, additive, explainable: every point of score has evidence behind it.',
		what: [
			'7 behavioural rules, each adds a fixed weight if it fires; score capped at 1.0',
			'Pure function: no I/O, no clock, no randomness. Same inputs → same decision, so dbt can replay it in batch',
			'Missing data is "not evaluated", not "low risk", and lowers confidence',
			'Every decision carries ruleset_version so an auditor can trace the exact rules'
		],
		why: "thinkmoney's customers are often credit-challenged: bureau scores are thin, so risk comes from behaviour (velocity, device, location, income vs inflow).",
		risk: [
			'Correlated rules double-count (new_account and device_new nearly always fire together)',
			'Weights are starting values, not fitted: calibrate against labelled outcomes in gold.decisions',
			'Consumer Duty: rules can fall hardest on vulnerable customers; review before decline'
		],
		latency: '< 1 ms'
	},
	{
		id: 'features',
		label: 'Feature Store',
		sub: 'DynamoDB · read + append',
		color: '#a78bfa',
		oneLiner: 'Slow features from batch, fast features from the stream: one item per customer.',
		what: [
			'Read: one GetItem by customer_id, the precomputed context the rules need',
			'Slow-moving fields (account age, typical income, known devices) rebuilt nightly from Silver by dbt (gold.customer_features)',
			'Append: this application timestamp is added to recent_application_ts after the decision, so the next one sees it',
			'If the read fails or times out: fail safe, never auto-approve (fallback_result → at least manual review)'
		],
		why: 'Real-time rules need history in single-digit milliseconds; the warehouse cannot serve that, a key-value store can.',
		risk: [
			'Training/serving skew: batch and Lambda must compute features identically (shared macros + a reconciliation model)',
			'Stale nightly fields: a device registered today is not "known" until tomorrow'
		],
		latency: '~8 ms'
	},
	{
		id: 'rules-config',
		label: 'Fraud Rules Config',
		sub: 'dbt model · versioned',
		color: '#2dd4bf',
		oneLiner:
			'Rules are data, not code: versioned, reviewed, tested, and shared by real-time and batch.',
		what: [
			'Weights and thresholds live in one dbt model (fraud_rules), version-controlled in git',
			'A change is a pull request: reviewed by FinCrime, back-tested against gold.decisions in CI, then tagged (e.g. 2026.10-v1)',
			'The release publishes the ruleset as a config artefact; the Lambda loads it at cold start alongside the Feature Store read',
			'The batch re-score reads the same model, so real-time and batch can never silently drift apart'
		],
		why: 'Fraud teams tune rules far more often than engineers change code. Making rules a governed dbt model gives an audit trail (who changed which weight, when, why) without redeploying the scorer.',
		risk: [
			'A bad weight goes live everywhere at once: require a back-test diff in the PR and a named FinCrime approver',
			'Lambda caching an old ruleset after release: every decision records ruleset_version, and reconciliation flags mismatches',
			'Today the weights are also in scoring.py; a test fails if the two differ. Next step is one source of truth.'
		],
		latency: 'cold start'
	},
	{
		id: 'decision',
		label: 'Decision',
		sub: 'Approve · Review · Decline',
		color: '#eab308',
		oneLiner: 'Support sees the reasons; the customer gets a general message.',
		what: [
			'> 0.75 decline (with offer of review) · 0.50–0.75 manual review · < 0.50 approve',
			'Saved to the DynamoDB decisions table before responding (conditional put: idempotent)',
			'Support staff see fired rules + evidence; customers never see which rules fired',
			'Response includes confidence, not_evaluated and recommended_action'
		],
		why: 'A decision nobody can explain is a regulatory problem (FCA, Consumer Duty). Recording reasoning at decision time makes every outcome auditable.',
		risk: [
			'Revealing rules to customers teaches fraudsters to evade them',
			'Review band too wide → fraud team overwhelmed; calibrate to same-day capacity'
		],
		latency: '~10 ms'
	},
	{
		id: 'kinesis',
		label: 'Kinesis',
		sub: 'Decision stream · async',
		color: '#f97316',
		oneLiner: 'Publish after the decision is safe, never block the customer on it.',
		what: [
			'put_record with PartitionKey = customer_id: one customer’s events stay in order',
			'Best effort: if publish fails, the decision is already saved and DynamoDB Streams backfills',
			'Firehose lands the stream in S3 Bronze; other consumers (alerts, case management) subscribe independently',
			'This is the new streaming capability the old SQL Server + SSIS platform could not offer'
		],
		why: 'Decouples the real-time path from analytics: the customer gets an answer in ~50 ms; the data platform gets a durable, replayable event.',
		risk: [
			'Hot shards if a single customer floods applications (velocity rule helps here too)',
			'At-least-once delivery: downstream must dedupe on application_id'
		],
		latency: 'async'
	},
	{
		id: 'bronze',
		label: 'Bronze',
		sub: 'S3 · raw decision events',
		color: '#cd7f32',
		oneLiner: 'Land it exactly as it happened. Immutable, replayable, encrypted.',
		what: [
			'Firehose writes raw JSON to S3, partitioned by date; KMS-encrypted',
			'Append-only: the audit record of what the Lambda actually decided',
			'Ingestion metadata added (_ingested_at, _source, Kinesis sequence number)',
			'Same Bronze layer as the SSIS CDC batch feeds: one platform, two tracks'
		],
		why: 'If Silver logic changes or a bug is found, Bronze lets you rebuild everything from the original events.',
		risk: [
			'Small-files problem from streaming writes: buffer in Firehose, compact periodically',
			'Retention vs RTBF: crypto-shred PII keys rather than rewriting history'
		],
		latency: '~60 s buffer'
	},
	{
		id: 'silver-gold',
		label: 'Silver / Gold',
		sub: 'dbt · hourly · re-score',
		color: '#facc15',
		oneLiner: 'Batch re-scores every decision: audit, reconciliation, calibration.',
		what: [
			'Silver: decisions deduped on application_id and merged with CDC applications/transactions hourly',
			'gold.decisions: every application re-scored point-in-time with the same weights (dbt vars)',
			'gold.decision_reconciliation: flags any Lambda vs batch disagreement',
			'gold.decision_summary feeds Power BI and the semantic layer (Claude via MCP: "why was APP_10003 held?")'
		],
		why: 'Real-time decides; batch proves. An independent re-score is the evidence an auditor (or the FCA) asks for, and the data for calibrating weights.',
		risk: [
			'Point-in-time leakage: features must use only rows strictly before applied_at',
			'Weights drifting between Lambda and dbt (a test fails if they diverge)'
		],
		latency: 'hourly'
	}
];

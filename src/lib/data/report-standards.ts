/**
 * Report Standards: one worked example (2501 - Fraud Decisioning Summary) of the standard
 * report layout. Figures are illustrative, not production data.
 *
 * Numbering: the first two digits are the business area, the last two the report.
 * Users then say "the 2501 is wrong", not "the fraud report... the new one... with the bars".
 */

export type ReportCategory = { prefix: string; area: string; owner: string };

export const categories: ReportCategory[] = [
	{ prefix: '10', area: 'Finance', owner: 'Finance BI' },
	{ prefix: '15', area: 'Regulatory Reporting', owner: 'Reg Reporting' },
	{ prefix: '20', area: 'Customer & CX', owner: 'CX Insight' },
	{ prefix: '25', area: 'FinCrime & Fraud', owner: 'FinCrime' },
	{ prefix: '30', area: 'Product & Marketing', owner: 'Product Analytics' }
];

export type Metric = {
	label: string;
	value: string;
	detail: string;
	color: string;
	share?: number; // 0-1, drawn as a bar
};

export type DictionaryRow = {
	column: string;
	type: string;
	description: string;
	classification: 'Public' | 'Internal' | 'Confidential' | 'PII';
	source: string;
};

export type LineageNode = { id: string; label: string; layer: string; color: string; note: string };

/** Split a daily total across 24 hours using a typical intraday shape (largest-remainder rounding). */
function spread(total: number, shape: number[]): number[] {
	const sum = shape.reduce((a, b) => a + b, 0);
	const exact = shape.map((w) => (w / sum) * total);
	const out = exact.map(Math.floor);
	const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
	for (let k = 0; k < total - out.reduce((a, b) => a + b, 0); k++) out[order[k][1]]++;
	return out;
}

export type HourVolume = { hour: number; approve: number; manual_review: number; decline: number };

function hourlyVolumes(): HourVolume[] {
	// Quiet overnight, lunchtime bump, evening peak; fraud skews later in the evening.
	const day = [2, 1, 1, 1, 1, 2, 4, 6, 8, 9, 9, 10, 12, 11, 9, 9, 10, 11, 13, 14, 12, 9, 6, 4];
	const late = [4, 3, 3, 2, 1, 1, 2, 3, 5, 6, 6, 7, 8, 7, 6, 7, 8, 9, 12, 14, 14, 12, 9, 7];
	const a = spread(1284, day);
	const r = spread(97, day);
	const d = spread(41, late);
	return a.map((_, hour) => ({ hour, approve: a[hour], manual_review: r[hour], decline: d[hour] }));
}

export const report = {
	id: '2501',
	name: 'Fraud Decisioning Summary',
	category: categories.find((c) => c.prefix === '25')!,
	version: '1.3',
	owner: 'FinCrime Lead',
	steward: 'Lead Data Engineer',
	reportDate: '2026-10-06',
	lastRefresh: '2026-10-07 06:15 UTC',
	refreshCadence: 'Hourly (after Silver CDC merge)',
	semanticModel: 'fincrime.decisions',
	purpose: [
		'Shows how card applications were decided by the real-time fraud scorer, and whether the independent batch re-score agrees.',
		'Used daily by FinCrime to size the manual-review queue and weekly to spot rules that fire too often on genuine customers.',
		'Not for individual customer decisions: use the support case view, which applies access controls per customer.'
	],
	parameters: [
		{ name: 'Decision date', value: '2026-10-06', note: 'Europe/London day boundary' },
		{ name: 'Product', value: 'All card products', note: 'Multi-select' },
		{ name: 'Ruleset version', value: '2026.10-v1', note: 'Defaults to the live version' },
		{ name: 'Channel', value: 'App + Web', note: '' }
	],
	metrics: [
		{
			label: 'Approvals',
			value: '1,284',
			detail: '90.3% of applications · score < 0.50',
			color: '#22c55e',
			share: 0.903
		},
		{
			label: 'Manual reviews',
			value: '97',
			detail: '6.8% · 0.50–0.75 · 91 cleared same day',
			color: '#eab308',
			share: 0.068
		},
		{
			label: 'Declines',
			value: '41',
			detail: '2.9% · score > 0.75 · 6 reviews requested',
			color: '#ef4444',
			share: 0.029
		},
		{
			label: 'Lambda ↔ batch reconciliation',
			value: '100%',
			detail: '1,422 / 1,422 decisions match the dbt re-score',
			color: '#2dd4bf',
			share: 1
		}
	] satisfies Metric[],
	deltas: {
		Approvals: '+1.8% vs 7-day avg',
		'Manual reviews': '−0.6 pt vs 7-day avg',
		Declines: '+0.2 pt vs 7-day avg',
		'Lambda ↔ batch reconciliation': 'unchanged · 0 mismatches'
	} as Record<string, string>,
	kpis: [
		{
			label: 'p95 decision latency',
			value: '142 ms',
			detail: 'SLO < 200 ms (sync path)',
			ok: true
		},
		{
			label: 'Avg confidence',
			value: '0.91',
			detail: 'Lower = thinner customer history',
			ok: true
		},
		{ label: 'Fallback decisions', value: '3', detail: 'Feature Store timeout → review', ok: true },
		{
			label: 'Review SLA',
			value: '93.8%',
			detail: '91 / 97 cleared same day · target 95%',
			ok: false
		}
	],
	hourly: hourlyVolumes(),
	topRules: [
		{ factor: 'device_new', fired: 412 },
		{ factor: 'new_account', fired: 356 },
		{ factor: 'location_unusual', fired: 148 },
		{ factor: 'income_consistency', fired: 96 },
		{ factor: 'dormant_reactivation', fired: 61 },
		{ factor: 'velocity_spike', fired: 38 },
		{ factor: 'sca_fail', fired: 27 }
	],
	dictionary: [
		{
			column: 'decision_date',
			type: 'date',
			description: 'Day the decision was made (Europe/London).',
			classification: 'Internal',
			source: 'gold.decisions.decided_at'
		},
		{
			column: 'decision',
			type: 'varchar',
			description: 'approve | manual_review | decline, as returned by the Lambda.',
			classification: 'Internal',
			source: 'gold.decisions.lambda_decision'
		},
		{
			column: 'applications',
			type: 'int',
			description: 'Count of distinct application_id. Retries are deduplicated.',
			classification: 'Internal',
			source: 'gold.decisions'
		},
		{
			column: 'avg_score',
			type: 'decimal(4,2)',
			description: 'Mean capped score (0–1). Raw scores above 1 are capped.',
			classification: 'Internal',
			source: 'gold.decisions.score'
		},
		{
			column: 'avg_confidence',
			type: 'decimal(3,2)',
			description:
				'Share of rules that had the data they needed. Low = thin history, not high risk.',
			classification: 'Internal',
			source: 'gold.decisions.confidence'
		},
		{
			column: 'top_factor',
			type: 'varchar',
			description: 'Most frequent fired rule for the group.',
			classification: 'Confidential',
			source: 'gold.decisions.evidence'
		},
		{
			column: 'reconciled_pct',
			type: 'decimal(5,2)',
			description: 'Share of decisions where batch re-score equals the Lambda decision.',
			classification: 'Internal',
			source: 'gold.decision_reconciliation'
		},
		{
			column: 'customer_id',
			type: 'varchar',
			description:
				'Not exposed in this report. Drill-through goes to the access-controlled case view.',
			classification: 'PII',
			source: 'n/a (excluded)'
		}
	] satisfies DictionaryRow[],
	lineage: [
		{
			id: 'lambda',
			label: 'Lambda scorer',
			layer: 'Real-time',
			color: '#22d3ee',
			note: 'Decision + evidence, ruleset_version'
		},
		{
			id: 'kinesis',
			label: 'Kinesis · decisions',
			layer: 'Stream',
			color: '#f97316',
			note: 'Partitioned by customer_id'
		},
		{
			id: 'bronze',
			label: 'bronze.decision_events',
			layer: 'Bronze',
			color: '#cd7f32',
			note: 'Raw JSON in S3 via Firehose'
		},
		{
			id: 'silver',
			label: 'silver.decisions',
			layer: 'Silver',
			color: '#d4d4d8',
			note: 'Deduped on application_id, joined to CDC applications'
		},
		{
			id: 'gold',
			label: 'gold.decisions',
			layer: 'Gold',
			color: '#facc15',
			note: 'Point-in-time batch re-score'
		},
		{
			id: 'summary',
			label: 'gold.decision_summary',
			layer: 'Gold',
			color: '#facc15',
			note: 'Daily aggregate + reconciliation'
		},
		{
			id: 'semantic',
			label: 'fincrime.decisions',
			layer: 'Semantic',
			color: '#a78bfa',
			note: 'Metric definitions; also served to Claude via MCP'
		},
		{
			id: 'report',
			label: '2501 · Power BI',
			layer: 'Report',
			color: '#38bdf8',
			note: 'This report'
		}
	] satisfies LineageNode[],
	troubleshooting:
		'check reconciliation first (Lambda vs batch), then Silver dedup, then the semantic metric definition. Each hop has its own tests, so the fault is usually one lookup away.',
	lineageSide: {
		label: 'silver.applications',
		note: 'SSIS CDC from SQL Server (kept from the current estate)',
		joinsAt: 'silver'
	}
};

/** 2502: the forward-looking companion to 2501 (same category, separate report). */
export const forecastReport = {
	id: '2502',
	name: 'Fraud Operations Forecast & Recommendations',
	category: categories.find((c) => c.prefix === '25')!,
	version: '0.9',
	owner: 'FinCrime Operations Manager',
	steward: 'Lead ML Engineer',
	reportDate: '2026-10-07',
	lastRefresh: '2026-10-07 05:40 UTC',
	refreshCadence: 'Daily 05:30 (batch inference) · drift hourly',
	semanticModel: 'fincrime.forecasts',
	purpose: [
		"Forecasts tomorrow's manual-review demand, flags rules whose behaviour is drifting, and recommends rota and threshold changes with their expected impact.",
		"Used by the FinCrime Operations Manager each afternoon to set the next day's rota, and by the FinCrime Lead weekly to decide whether to raise a fraud_rules change.",
		'Advisory only: nothing changes automatically. Threshold changes go through a fraud_rules PR, a CI back-test and FinCrime approval. Not a measure of individual reviewer performance.'
	],
	parameters: [
		{ name: 'Forecast date', value: '2026-10-08', note: 'Next 24 hours' },
		{ name: 'Model', value: 'review-demand v3.2', note: 'From the model registry' },
		{ name: 'Rota scenario', value: 'Current vs recommended', note: '' },
		{ name: 'Capacity', value: `${60 / 12} reviews/reviewer/h`, note: '12 min average handling' }
	],
	dictionary: [
		{
			column: 'forecast_hour',
			type: 'timestamp',
			description: 'Hour being forecast (Europe/London).',
			classification: 'Internal',
			source: 'ml.review_demand_forecast.hour'
		},
		{
			column: 'forecast_reviews',
			type: 'decimal(6,1)',
			description: 'Point forecast of manual reviews arriving in the hour.',
			classification: 'Internal',
			source: 'ml.review_demand_forecast.yhat'
		},
		{
			column: 'forecast_p10 / p90',
			type: 'decimal(6,1)',
			description:
				'80% prediction interval. Wider = less certain; widens around paydays and campaigns.',
			classification: 'Internal',
			source: 'ml.review_demand_forecast'
		},
		{
			column: 'reviewers_rostered',
			type: 'int',
			description: 'Reviewers on shift in the hour, per rota scenario.',
			classification: 'Internal',
			source: 'silver.wfm_rota'
		},
		{
			column: 'sla_within_2h_pct',
			type: 'decimal(5,2)',
			description: 'Simulated share of staffed-hours reviews cleared within 2 hours (FIFO queue).',
			classification: 'Internal',
			source: 'gold.review_queue_simulation'
		},
		{
			column: 'rule_firing_pct / psi',
			type: 'decimal',
			description:
				'Share of applications where a rule fired, and its drift (PSI) vs the 30-day baseline.',
			classification: 'Confidential',
			source: 'gold.rule_drift'
		},
		{
			column: 'expected_cost_gbp',
			type: 'decimal(10,2)',
			description:
				'Missed fraud × average loss + genuine declines × harm cost, per threshold pair.',
			classification: 'Confidential',
			source: 'gold.threshold_backtest'
		},
		{
			column: 'model_version',
			type: 'varchar',
			description: 'Registry version of the forecasting model that produced the row.',
			classification: 'Internal',
			source: 'model registry (SageMaker)'
		},
		{
			column: 'reviewer_id',
			type: 'varchar',
			description: 'Not exposed. The rota is aggregated to headcount per hour.',
			classification: 'PII',
			source: 'n/a (excluded)'
		}
	] satisfies DictionaryRow[],
	lineage: [
		{
			id: 'gold',
			label: 'gold.decisions',
			layer: 'Gold',
			color: '#facc15',
			note: 'Same source as 2501'
		},
		{
			id: 'features',
			label: 'ml.review_demand_features',
			layer: 'Features',
			color: '#a78bfa',
			note: 'dbt: hourly lags, payday + campaign calendar'
		},
		{
			id: 'train',
			label: 'SageMaker training',
			layer: 'ML',
			color: '#f472b6',
			note: 'Weekly retrain, backtest gate, model registry'
		},
		{
			id: 'inference',
			label: 'ml.review_demand_forecast',
			layer: 'Inference',
			color: '#f472b6',
			note: 'Daily batch inference → Iceberg'
		},
		{
			id: 'simulation',
			label: 'gold.review_queue_simulation',
			layer: 'Gold',
			color: '#facc15',
			note: 'Queue simulation per rota; also gold.rule_drift, gold.threshold_backtest'
		},
		{
			id: 'semantic',
			label: 'fincrime.forecasts',
			layer: 'Semantic',
			color: '#a78bfa',
			note: 'Metric definitions; also served to Claude via MCP'
		},
		{
			id: 'report',
			label: '2502 · Power BI',
			layer: 'Report',
			color: '#38bdf8',
			note: 'This report + AI summary'
		}
	] satisfies LineageNode[],
	troubleshooting:
		'check the model version and its backtest gate first, then whether the rota file landed, then the freshness of gold.decisions. That table is shared with 2501, so a wrong 2501 means a wrong 2502, and the lineage shows it immediately.',
	lineageSide: {
		label: 'silver.wfm_rota',
		note: 'Workforce-management export, daily file drop to S3',
		joinsAt: 'simulation'
	}
};

/** The fields every report shares: header, footer and the context page. */
export type ReportMeta = Pick<
	typeof report,
	| 'id'
	| 'name'
	| 'category'
	| 'version'
	| 'owner'
	| 'steward'
	| 'reportDate'
	| 'lastRefresh'
	| 'refreshCadence'
	| 'semanticModel'
	| 'purpose'
	| 'parameters'
	| 'dictionary'
	| 'lineage'
	| 'lineageSide'
	| 'troubleshooting'
>;
export const reportPack: ReportMeta[] = [report, forecastReport];

export const standards = [
	{
		rule: 'Name as “ID - Report Name”',
		why: 'One unambiguous handle in tickets, Slack and meetings.'
	},
	{
		rule: 'Same header on every page',
		why: 'Report name with its ID, report date and version, always in the same place.'
	},
	{
		rule: 'Data first, context page always last',
		why: 'The data pages answer the question; the final page holds purpose, data dictionary and lineage, so readers always know where to find them.'
	},
	{
		rule: 'Related reports share a prefix, not a page',
		why: '2501 (what happened) and 2502 (what next) are separate reports with their own owners, refresh and context page, grouped by category 25.'
	},
	{
		rule: 'Parameters in the footer, on every page',
		why: 'A screenshot or printout of any page shows which filters produced the numbers.'
	},
	{
		rule: 'Every column in the dictionary',
		why: 'Definitions come from the semantic layer, so Power BI and Claude agree.'
	},
	{
		rule: 'Lineage to source',
		why: 'When “the 2501 is wrong”, you can see which layer to check first.'
	},
	{
		rule: 'Footer: owner, category, refresh, page X of Y',
		why: 'Every exported page is traceable to its owner and its data, and none goes missing unnoticed.'
	}
];

// --- Forward look (page 3): predictive + prescriptive -------------------------------
// Illustrative model outputs. In production these come from models trained on
// gold.decisions / gold.decision_summary and are served through the same semantic layer.

/** Today's applications by score. Rule weights are multiples of 0.05, so scores are too. */
export const scoreDistribution: { score: number; n: number }[] = [
	[0, 610],
	[0.05, 0],
	[0.1, 70],
	[0.15, 180],
	[0.2, 60],
	[0.25, 150],
	[0.3, 40],
	[0.35, 60],
	[0.4, 84],
	[0.45, 30],
	[0.5, 34],
	[0.55, 25],
	[0.6, 16],
	[0.65, 11],
	[0.7, 7],
	[0.75, 4],
	[0.8, 12],
	[0.85, 8],
	[0.9, 6],
	[0.95, 5],
	[1, 10]
].map(([score, n]) => ({ score, n }));

/** Calibrated probability that an application at this score is confirmed fraud (logistic fit on labelled outcomes). */
export const fraudProbability = (score: number) => 0.7 / (1 + Math.exp(-(score - 0.8) * 9));

export const REVIEW_MINUTES = 12;

/** Reviewer rota: reviewers on shift per hour (Europe/London). */
export type Rota = { name: string; reviewers: number[] };
const hours = (from: number, to: number, n: number) =>
	Array.from({ length: 24 }, (_, h) => (h >= from && h < to ? n : 0));
const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
export const rotas: { current: Rota; recommended: Rota } = {
	current: {
		name: '2 × 08:00–16:00, 1 × 16:00–22:00',
		reviewers: add(hours(8, 16, 2), hours(16, 22, 1))
	},
	recommended: {
		name: '1 × 07:00–15:00, 1 × 14:00–22:00, 1 × 16:00–23:00',
		reviewers: add(add(hours(7, 15, 1), hours(14, 22, 1)), hours(16, 23, 1))
	}
};

export const SLA_HOURS = 2;
export const STAFFED = { from: 8, to: 22 };

/**
 * Simulate the review queue through a day (FIFO). Reviews arrive per hour; each reviewer clears
 * 60 / REVIEW_MINUTES per hour; the backlog carries over. SLA = share of reviews arriving in
 * staffed hours that are cleared within SLA_HOURS. Overnight arrivals wait for the morning shift.
 */
export function simulateQueue(arrivals: number[], reviewers: number[]) {
	const queue: { hour: number; n: number }[] = [];
	let met = 0;
	let peak = 0;
	const backlog = arrivals.map((a, h) => {
		if (a > 0) queue.push({ hour: h, n: a });
		let capacity = reviewers[h] * (60 / REVIEW_MINUTES);
		while (capacity > 0 && queue.length) {
			const c = queue[0];
			const done = Math.min(c.n, capacity);
			c.n -= done;
			capacity -= done;
			if (h - c.hour < SLA_HOURS && c.hour >= STAFFED.from && c.hour < STAFFED.to) met += done;
			if (c.n <= 1e-9) queue.shift();
		}
		const waiting = queue.reduce((s, c) => s + c.n, 0);
		peak = Math.max(peak, waiting);
		return waiting;
	});
	const staffedTotal = arrivals.slice(STAFFED.from, STAFFED.to).reduce((s, v) => s + v, 0);
	return { backlog, peak, slaPct: staffedTotal ? (met / staffedTotal) * 100 : 100 };
}

export const forecastModel = {
	name: 'Gradient-boosted regressor (LightGBM)',
	features: 'hour, weekday, payday flag, 7/28-day lags, marketing calendar, ruleset_version',
	trainedOn: 'gold.decision_summary · 18 months',
	backtestMape: 8.4,
	uplift: 1.07 // tomorrow is the day after payday: +7% applications expected
};

export const driftAlerts = [
	{
		factor: 'device_new',
		today: 29.3,
		baseline: 24.8,
		psi: 0.14,
		severity: 'warning' as const,
		hypothesis:
			'Firing rate rose after the 2 Oct iOS app release. A new device-ID scheme may be making known phones look new.',
		action: 'Check device-ID continuity for iOS users before changing any weight.'
	},
	{
		factor: 'income_consistency',
		today: 6.8,
		baseline: 6.5,
		psi: 0.02,
		severity: 'stable' as const,
		hypothesis: 'Within normal variation.',
		action: 'No action.'
	}
];

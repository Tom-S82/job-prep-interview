import type { CapstonePart } from './index.ts';

export const partC: CapstonePart = {
	id: 'medallion-c-refresh',
	letter: 'C',
	nodes: ['dbt', 'gold', 'redshift', 'bi'],
	title: 'C · Gold refresh: materialised views without 200 minutes of overhead',
	summary: '10 daily reports, each taking 20 minutes to refresh. Make them fresh enough, fast enough.',
	context: `There are **10 daily reports** on Gold. Each one's materialised view takes **about 20 minutes** to refresh: **200 minutes** of warehouse time a day, and data that is stale by mid-morning.

Three reports have different needs:
- **Fraud scorecard** (intraday decision support): fresh data **every hour**.
- **Customer profitability** (finance): **nightly** is fine.
- **Executive anomaly dashboard**: as close to **real time** as is sensible.`,
	businessContext:
		'Slow refreshes waste warehouse capacity and leave reports stale. The panel wants to see refresh designed per report, not one schedule for everything.',
	primer: `**Full vs incremental refresh.** A full refresh recomputes the whole result. An incremental refresh processes only rows that changed since last time. Redshift can refresh many materialised views **incrementally**, but only if the view's SQL uses supported constructs; otherwise it silently falls back to a full recompute.

**Build-and-swap.** Build the new result in a separate table, then swap it in atomically. Readers never see a half-built table. dbt's table materialisation works this way; dbt **incremental** models MERGE only new data on a unique key.

**Redshift streaming ingestion.** Redshift can read Kinesis directly into a materialised view, giving near-real-time data without a batch load: useful for an anomaly dashboard.

**Staleness tiers.** Refresh cadence should follow how the report is used: hourly, nightly or near real time. One schedule for everything wastes money or disappoints someone.

**Where the logic lives.** Logic in dbt models is version-controlled, tested and has lineage. Logic buried in materialised view definitions is harder to test and review.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Why does each refresh take 20 minutes: is it recomputing everything?',
		'How fresh does each report really need to be?',
		'Where should the aggregation logic live so it can be tested?',
		'Which report could use streaming data directly?'
	],
	level1Expert: `**Make refresh incremental, and set cadence per report.**

- **Diagnose first**: the 20 minutes is almost certainly a full recompute over history. Check whether each view is eligible for incremental refresh.
- **Move the logic into dbt incremental models** in Redshift (MERGE on the new hour or day only), with tests and lineage; keep materialised views only for simple aggregates on top.
- **Cadence per report**: fraud scorecard rebuilt **hourly after the CDC merge**; profitability **nightly**; executive anomalies via **Redshift streaming ingestion** from Kinesis, refreshed every few minutes.
- **Trigger on data arrival**, not the clock: the orchestrator runs the Gold models when Silver commits.
- **Publish freshness**: each report shows its data-as-of time, so "stale" becomes a known number.`,
	level2: [
		{
			id: 'approach',
			question: 'What is the main fix for 20-minute refreshes?',
			options: [
				{ id: 'A', text: 'Keep full refreshes but run them in parallel overnight', verdict: 'ok', feedback: 'Shortens the wall-clock time but still recomputes all history and still runs at night only.' },
				{
					id: 'B',
					text: 'Make refreshes incremental: eligible MVs, or dbt incremental models that process only new data',
					verdict: 'best',
					feedback: 'Work is proportional to the new data, not to all history, so refreshes take minutes or less.'
				},
				{ id: 'C', text: 'Move every report to Athena over S3', verdict: 'weak', feedback: 'The same recomputation, with slower interactive queries for report users.' }
			],
			expert: `**Incremental.** The cost of a refresh should grow with the new data, not with ten years of history.`
		},
		{
			id: 'cadence',
			question: 'How do you set refresh cadence across the three report types?',
			options: [
				{ id: 'A', text: 'Everything hourly', verdict: 'weak', feedback: 'Pays to refresh finance reports nobody reads until tomorrow.' },
				{
					id: 'B',
					text: 'Per report: scorecard hourly after CDC, profitability nightly, anomalies via streaming ingestion',
					verdict: 'best',
					feedback: 'Each report gets the freshness its users act on, and no more.'
				},
				{ id: 'C', text: 'Everything nightly', verdict: 'weak', feedback: 'The fraud scorecard would be up to a day old.' }
			],
			expert: `**Freshness follows use.** Agree a staleness target per report with its owner, then schedule against data arrival.`
		},
		{
			id: 'where',
			question: 'Where does the aggregation logic live?',
			options: [
				{ id: 'A', text: 'In Redshift materialised view definitions only', verdict: 'ok', feedback: 'Simple, but logic is harder to test, review and trace.' },
				{
					id: 'B',
					text: 'In dbt incremental models, with tests and lineage; MVs only for simple aggregates on top',
					verdict: 'best',
					feedback: 'Logic is versioned and tested, and refresh is incremental by design.'
				},
				{ id: 'C', text: 'In Spark jobs that write Gold to S3, then COPY into Redshift', verdict: 'ok', feedback: 'Good for heavy transformations, but adds a load step for every report.' }
			],
			expert: `**dbt for logic, MVs for convenience.** The logic that finance and fraud depend on should be tested and visible in lineage.`
		}
	],
	level3: [
		{
			id: 'incremental-worth',
			prompt: 'Incremental refresh is faster but more complex. When is it worth it?',
			expert:
				"When the full refresh grows with history and runs often. That describes the fraud scorecard and most daily reports here. It's worth it because the work becomes proportional to new data. The trade-off is handling late-arriving and corrected rows, so incremental models use a lookback window and we run a periodic full rebuild to catch drift. For a small dimension that refreshes in seconds, I'd keep a full rebuild.",
			lookFor: ['grow|history|often', 'late|correct|lookback', 'full rebuild|periodic', 'small|seconds']
		},
		{
			id: 'spectrum',
			prompt: 'Glue plus Spectrum lets you query S3 directly: faster refresh (no load), slower queries. Worth it for thinkmoney?',
			expert:
				"For the finance and fraud reports, no: they're interactive and read repeatedly, so loading them into Redshift pays off. For the long tail of rarely used reports and for older history, yes: Spectrum over Iceberg avoids loading data nobody reads often. I'd decide per report from usage data.",
			lookFor: ['interactive|repeated|often', 'rarely|long tail|older|history', 'usage|per report']
		},
		{
			id: 'mv-vs-dbt',
			prompt: 'Materialised views are simple; dbt needs orchestration. Pick one and defend it.',
			expert:
				"dbt, because the logic behind these reports needs tests, review and lineage in a regulated firm, and incremental models make refresh fast by design. The cost is orchestration, but we need an orchestrator for the hourly CDC anyway, so dbt runs as one more step after the Silver merge. I'd still use simple MVs on top where they save time.",
			lookFor: ['dbt', 'test|lineage|review', 'orchestrat', 'incremental']
		}
	],
	concepts: [
		{ id: 'incremental', label: 'Incremental refresh (process only new data)', patterns: ['incremental'], importance: 'essential', why: 'Refresh cost should track new data, not all of history.' },
		{ id: 'cadence', label: 'Refresh cadence per report', patterns: ['hourly|nightly', 'per report|each report|cadence'], importance: 'essential', why: 'Different reports need different freshness.' },
		{ id: 'dbt', label: 'Logic in tested, versioned models (dbt)', patterns: ['\\bdbt\\b', 'test'], importance: 'essential', why: 'Report logic in a regulated firm needs tests and lineage.' },
		{ id: 'trigger', label: 'Trigger on data arrival, not the clock', patterns: ['after (the )?cdc|on (data )?arrival|when silver|triggered|event'], importance: 'essential', why: 'Refreshing before data lands wastes a run; after is fresh.' },
		{ id: 'streaming', label: 'Near-real-time via streaming ingestion', patterns: ['streaming ingestion|stream'], importance: 'bonus', why: 'Redshift can read Kinesis directly for the anomaly dashboard.' },
		{ id: 'swap', label: 'Build-and-swap so readers never see half-built tables', patterns: ['swap|atomic'], importance: 'bonus', why: 'Users should see the old version or the new, never a mixture.' },
		{ id: 'freshness', label: 'Publish data-as-of time', patterns: ['as of|freshness|timestamp'], importance: 'bonus', why: 'Makes staleness a known number rather than a surprise.' }
	],
	leadExplanation: {
		constraint: 'The constraint is warehouse time: 200 minutes a day of full recomputes, and reports still stale when people read them.',
		reasons: [
			'Each refresh recomputes all history, so making it incremental cuts the work to the new hour or day.',
			'The three reports have different freshness needs, so each gets its own cadence triggered by data arrival.',
			'Logic moves into dbt models, because finance and fraud figures need tests and lineage.'
		],
		tradeOff: 'Incremental models are more complex: late-arriving rows need a lookback window and an occasional full rebuild.',
		switchWhen: "If a report's full refresh took seconds, I'd keep it simple and rebuild it fully rather than make it incremental."
	},
	leadSays: {
		approach: "The 20 minutes is a full recompute over history, so the fix is incremental refresh: eligible MVs, or dbt incremental models that process only the new data. Late rows need care, but the work stops growing with history.",
		cadence: "Freshness should follow how each report is used, so the scorecard refreshes hourly after the CDC merge, profitability nightly, and anomalies through streaming ingestion. Refreshing everything hourly would waste capacity on reports nobody opens until tomorrow.",
		where: 'Finance and fraud figures need tests and lineage, so the logic lives in dbt incremental models, with simple MVs on top only where they help. It needs orchestration, which we already have for the hourly CDC.'
	},
	leadPhrases: [
		'"The cost of a refresh should grow with new data, not with history."',
		'"Freshness follows use: hourly, nightly or streaming, per report."',
		'"Refresh when the data arrives, not when the clock says."',
		'"The trade-off is late-arriving rows, so we keep a lookback and a periodic full rebuild."',
		'"Every report shows its data-as-of time."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll just add more nodes so refreshes finish faster."',
			problem: 'Pays more to repeat unnecessary work. The refresh is recomputing history.'
		},
		{
			sounds: '"Everything will be real time."',
			problem: 'Most reports are read once a day. Real time everywhere multiplies cost for no decision benefit.'
		}
	],
	watchOutFor: [
		'One refresh schedule for every report.',
		'Saying "incremental" without saying how late or corrected rows are handled.',
		'Forgetting that materialised view refresh may silently be full, not incremental.',
		'Not saying how users know how fresh a report is.'
	],
	sixtySecond:
		"The constraint is 200 minutes of daily warehouse time spent on full recomputes, with reports still stale. So refresh becomes incremental: dbt incremental models process only the new hour or day, with tests and lineage, and simple MVs sit on top where useful. Cadence follows use: the fraud scorecard refreshes hourly after the CDC merge, profitability nightly, and executive anomalies through Redshift streaming ingestion. Every report shows its data-as-of time. The trade-off is handling late rows, so we keep a lookback window and a periodic full rebuild. If a report rebuilt in seconds, I'd keep it simple.",
	defend: [
		{
			question: "How do you know an MV's refresh is actually incremental?",
			answer:
				"Redshift reports the refresh type for each materialised view in its system tables, and EXPLAIN on the definition shows whether it qualifies. If a view isn't eligible, I'd move that logic into a dbt incremental model."
		},
		{
			question: 'What about corrections to last month\'s data?',
			answer:
				'The incremental model reprocesses a lookback window (for example the last 7 days), and a scheduled full rebuild, say weekly, catches anything older. Large corrections trigger a targeted rebuild of the affected partitions.'
		},
		{
			question: 'Why not Spark for everything?',
			answer:
				'Spark suits heavy Python transformations; most Gold logic is SQL aggregation over Redshift-resident data. Keeping it in dbt avoids copying data out of and back into the warehouse.'
		}
	],
	juniorVsLead: {
		junior: "We'd refresh all the materialised views every hour on a bigger cluster so everything is real time and modern.",
		lead: "The constraint is 200 minutes a day spent recomputing history. So refresh becomes incremental in dbt models, processing only new data, and cadence follows use: the scorecard hourly after CDC, profitability nightly, anomalies through streaming ingestion. The trade-off is handling late rows, so we keep a lookback and periodic full rebuilds. If a report rebuilt in seconds, I'd keep it simple.",
		whyBetter: [
			'Diagnoses why refresh is slow before buying capacity',
			'Sets freshness per report from how it is used',
			'Puts logic where it can be tested',
			'Names the incremental trade-off'
		]
	},
	relatedSets: [
		{ id: 'gold', label: 'Gold' },
		{ id: 'toolset', label: 'Toolset reference' }
	]
};

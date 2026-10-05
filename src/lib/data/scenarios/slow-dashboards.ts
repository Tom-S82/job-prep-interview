import type { ArchitectureScenario } from '../scenarios.ts';

export const slowDashboards: ArchitectureScenario = {
	id: 'slow-dashboards',
	title: 'Slow Power BI dashboards',
	summary: "Finance's monthly revenue dashboard takes 30 seconds. It queries raw Silver tables.",
	leadExplanation: {
		constraint:
			'The constraint is that finance needs this dashboard to be fast and correct at month end, and right now it computes revenue from row-level Silver data on every click.',
		reasons: [
			'Measuring first (Performance Analyzer, warehouse query logs) shows which visuals and queries are slow, so we fix the cause rather than guess.',
			'The cause is computing aggregates at query time; a Gold table shaped for the question computes them once, and Redshift materialised views keep it refreshed.',
			'Moving revenue logic out of DAX and into Gold also means every other report gets the same, tested number.'
		],
		tradeOff:
			'Pre-aggregated data is less flexible: questions it was not designed for still need the detailed tables, and there is one more model to maintain.',
		switchWhen:
			'If the dashboard needed only yesterday\'s numbers and nothing more, Power BI import mode with a scheduled refresh might be enough on its own, as long as the logic still lives in Gold.'
	},
	leadSays: {
		measure:
			"Before fixing anything, we find out what's slow. Performance Analyzer shows which visuals take the time, and Redshift's query history shows the queries behind them. It takes an afternoon, and it stops us paying for capacity we don't need.",
		fix: "The constraint is that every click recomputes revenue from row-level data. So we build a Gold table at the grain the dashboard needs, refreshed by a materialised view. It's less flexible than querying Silver, but the dashboard only needs that grain.",
		owner:
			"If it's only BI's problem or only data's, it comes back. So the data team owns the Gold model and its performance, BI owns report design, and they agree the target together. It needs a conversation, but it ends the blame loop.",
		prevent:
			"New reports will hit the same problem unless something changes. So reports build on certified Gold datasets, slow queries alert, and new reports get a quick design review. It adds a step, but it's cheaper than fixing each dashboard after finance complains."
	},
	leadPhrases: [
		'"Before we fix it, let\'s measure what\'s actually slow."',
		'"The constraint is that every click recomputes revenue from row-level data."',
		'"Compute it once, in Gold, and every report gets the same number."',
		'"The trade-off is flexibility: Gold answers the questions it was designed for."',
		'"Data owns the model\'s performance; BI owns the report. We agree the target together."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll just scale up Redshift."',
			problem: 'Sounds decisive, but spends money to hide a design problem. The next slow dashboard needs another upgrade.'
		},
		{
			sounds: '"Power BI is slow; let\'s move to a better BI tool."',
			problem: 'Blames the tool for a data-model problem. The new tool would run the same row-level queries.'
		}
	],
	watchOutFor: [
		'Jumping to a fix before saying how you would measure the problem.',
		'Saying "add indexes": Redshift does not have indexes. Its equivalents are sort keys and distribution keys.',
		'Forgetting the people side: who owns dashboard performance after you fix it.',
		'Fixing only this dashboard. Say how you stop the next one.'
	],
	sixtySecond:
		"The constraint is that finance needs this fast and correct at month end, and today every click recomputes revenue from row-level Silver data. First we measure, with Performance Analyzer and Redshift query history, to find the slow visuals. Then we compute revenue once, in a Gold table at the grain the dashboard needs, refreshed by a materialised view, and move the logic out of DAX. Data owns the model's performance; BI owns the report. The trade-off is less flexibility. To stop it recurring: certified datasets, slow-query alerts and a design review for new reports.",
	defend: [
		{
			question: 'Why not just turn on Power BI import mode?',
			answer:
				"It can help, and might be part of the answer, but if the revenue logic stays in DAX, every other report recalculates it differently. I'd put the logic in Gold first, then choose import or DirectQuery based on how fresh finance needs it."
		},
		{
			question: 'What if finance needs to drill into individual transactions?',
			answer:
				'The dashboard stays fast on the aggregate, and drill-through goes to a detail page that queries the transaction fact with filters applied, so it only fetches the rows needed.'
		},
		{
			question: 'How do you prove it worked?',
			answer: 'Before-and-after timings from Performance Analyzer and query history, plus a reconciliation that the Gold revenue matches what finance signs off.'
		}
	],
	context: `Finance's **monthly revenue dashboard takes about 30 seconds** to respond to each filter. It queries **raw Silver tables** (row-level transactions) and computes revenue in **DAX measures**. Month end is a week away, and the finance director has escalated.

Other reports are starting to show the same symptoms.`,
	businessContext:
		'Slow dashboards erode trust in the data team quickly, especially in finance. The panel wants to see diagnosis before treatment, a fix at the right layer, and a way to stop it recurring.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'How do you find out what is actually slow?',
		'Which layer should do the heavy work: Silver, Gold or Power BI?',
		'Who owns the fix, and who owns it afterwards?',
		'How do you prevent the next slow dashboard?'
	],
	level1Expert: `**Measure, fix at the right layer, prevent recurrence.**

- **Measure**: Power BI **Performance Analyzer** to find the slow visuals; Redshift query history to see the queries behind them.
- **Fix at the data layer**: a **Gold aggregate** at the grain the dashboard needs (e.g. revenue by day, product and region), kept fresh with a **Redshift materialised view**; move the revenue logic out of DAX into that model.
- **Tune what remains**: sort and distribution keys on the detail fact for drill-through; consider Power BI import mode or aggregations if freshness allows.
- **Ownership**: data owns the Gold model and its performance target; BI owns report design.
- **Prevent recurrence**: certified Gold datasets for reporting, slow-query alerts, and a short design review for new reports.`,
	level2: [
		{
			id: 'measure',
			question: 'What do you do first?',
			options: [
				{ id: 'A', text: 'Scale up the Redshift cluster', verdict: 'weak', feedback: 'Expensive and only treats the symptom; the queries are still doing unnecessary work.' },
				{
					id: 'B',
					text: 'Measure: Performance Analyzer plus Redshift query history',
					verdict: 'best',
					feedback: 'Finds which visuals and queries are slow, so the fix targets the cause.'
				},
				{ id: 'C', text: 'Rebuild the dashboard in QuickSight', verdict: 'weak', feedback: 'A new tool would run the same row-level queries; the problem is the data model.' }
			],
			expert: `**Measure first.** It usually takes an afternoon, and it often shows that one or two visuals cause most of the delay.`
		},
		{
			id: 'fix',
			question: 'What is the main fix?',
			options: [
				{ id: 'A', text: 'Add sort keys and distribution keys to the Silver tables', verdict: 'ok', feedback: 'Helps scans and joins, but the dashboard still aggregates millions of rows per click.' },
				{
					id: 'B',
					text: 'A Gold aggregate at the dashboard\'s grain, refreshed by a materialised view',
					verdict: 'best',
					feedback: 'Computes revenue once instead of on every click, with logic tested in one place.'
				},
				{ id: 'C', text: 'Switch Power BI to import mode with a nightly refresh', verdict: 'ok', feedback: 'Fast, but the logic stays in DAX and the data is up to a day old.' }
			],
			expert: `**Shape the data for the question.** A Gold table at day, product and region grain turns a scan of millions of rows into a lookup of thousands. Sort keys and import mode are useful extras, not the main fix.`
		},
		{
			id: 'owner',
			question: 'Who owns dashboard performance?',
			options: [
				{ id: 'A', text: 'The BI team: it is their dashboard', verdict: 'weak', feedback: 'They can\'t fix a data model they don\'t own.' },
				{ id: 'B', text: 'The data team: it is their data', verdict: 'weak', feedback: 'They can\'t control how reports are designed.' },
				{
					id: 'C',
					text: 'Shared: data owns the Gold model\'s performance, BI owns report design, with an agreed target',
					verdict: 'best',
					feedback: 'Each team owns what it controls, and the target is agreed with finance.'
				}
			],
			expert: `**Split by what each team controls.** Agree a target with finance (for example, under 3 seconds per interaction at month end) and track it.`
		},
		{
			id: 'prevent',
			question: 'How do you stop the next slow dashboard?',
			options: [
				{ id: 'A', text: 'Review every new report by hand', verdict: 'ok', feedback: 'Catches problems, but does not scale and becomes a bottleneck.' },
				{
					id: 'B',
					text: 'Certified Gold datasets, slow-query alerts and a short design review',
					verdict: 'best',
					feedback: 'Makes the fast path the default and catches regressions automatically.'
				},
				{ id: 'C', text: 'Block Power BI from querying Silver at all', verdict: 'weak', feedback: 'Too blunt: some legitimate drill-through needs detail.' }
			],
			expert: `**Make the right thing the easy thing.** Reports built on certified Gold are fast by default; alerts on slow queries catch the rest early.`
		}
	],
	level3: [
		{
			id: 'stale',
			prompt: 'After your fix, finance says the dashboard shows yesterday\'s numbers at 9am on the last day of the month. Where does your design break?',
			expert:
				"The materialised view's refresh doesn't match finance's month-end timing. So we agree a freshness target with them, refresh the Gold table straight after the overnight load (event-driven, not just scheduled), and show a 'data as of' timestamp on the dashboard. If they need intraday figures at month end, we add a more frequent refresh for those days.",
			lookFor: ['refresh|schedule|event', 'freshness|as of|timestamp|stale', 'agree|target|sla']
		},
		{
			id: 'new-question',
			prompt: 'Finance now wants revenue by customer segment, which your Gold table does not have. What do you do?',
			expert:
				"That's the flexibility trade-off I named. We add segment as a dimension to the Gold model if it's a lasting need, after checking it doesn't make the table too detailed to be fast. For a one-off, they can use the detailed fact with a drill-through page. Either way, the logic stays in Gold, not DAX.",
			lookFor: ['dimension|add (segment|it)|extend', 'trade-?off|flexib', 'one[- ]off|drill|detail', 'dax|gold']
		},
		{
			id: 'cost',
			prompt: 'Your materialised views have doubled the Redshift bill. Defend or change your design.',
			expert:
				"First check what's driving it: refresh frequency, or views nobody uses. I'd refresh on data arrival rather than on a timer, drop unused views, and compare the cost against what slow dashboards cost the business. If it's still too high, Redshift Serverless or import mode for the least-used reports are the next options.",
			lookFor: ['cost|bill', 'refresh|frequency|unused', 'compare|value|business', 'serverless|import']
		}
	],
	concepts: [
		{ id: 'measure', label: 'Measure before fixing', patterns: ['measure|profil|performance analy|query (log|history|plan)|diagnos|find (out )?what'], importance: 'essential', why: 'Without measurement you fix the wrong thing or overspend.' },
		{ id: 'gold', label: 'Pre-aggregate in Gold at the right grain', patterns: ['gold', 'aggregat', 'grain|pre-?comput'], importance: 'essential', why: 'Computing revenue once beats computing it on every click.' },
		{ id: 'logic', label: 'Move business logic out of DAX', patterns: ['dax', 'logic (out|into)|business logic|one (place|definition)'], importance: 'essential', why: 'Logic in DAX is re-implemented per report and can\'t be tested.' },
		{ id: 'ownership', label: 'Clear shared ownership between data and BI', patterns: ['own', 'bi team|data team|together|shared'], importance: 'essential', why: 'Without ownership, the next slow dashboard has nobody to fix it.' },
		{ id: 'prevent', label: 'Prevent recurrence (certified datasets, alerts, review)', patterns: ['prevent|recur|next (one|dashboard)', 'certif|alert|monitor|review|standard'], importance: 'essential', why: 'Fixing one dashboard without changing the process means fixing them forever.' },
		{ id: 'mv', label: 'Materialised views or scheduled refresh', patterns: ['materiali[sz]ed|refresh'], importance: 'bonus', why: 'Keeps pre-aggregated data fresh without manual work.' },
		{ id: 'keys', label: 'Sort and distribution keys (not "indexes")', patterns: ['sort key|dist(ribution)? key'], importance: 'bonus', why: "The correct Redshift tuning vocabulary; Redshift doesn't have indexes." },
		{ id: 'target', label: 'An agreed performance target', patterns: ['target|sla|seconds|\\d+ ?s\\b'], importance: 'bonus', why: 'A target turns "it\'s slow" into something you can track.' }
	],
	juniorVsLead: {
		junior: "We'd add indexes and scale up Redshift so the dashboard is faster. Maybe also switch to import mode, which is best practice.",
		lead: "The constraint is that finance needs this fast at month end, and every click recomputes revenue from row-level data. So first I'd measure which visuals are slow, then compute revenue once in a Gold table at the dashboard's grain, refreshed by a materialised view, with the logic moved out of DAX. The trade-off is less flexibility. Data owns the model's performance, BI owns the report.",
		whyBetter: [
			'Diagnoses before prescribing',
			'Explains the cause, so the fix makes sense',
			'Uses correct vocabulary (no "indexes" in Redshift)',
			'Names ownership and the trade-off'
		]
	},
	relatedSets: [
		{ id: 'gold', label: 'Gold' },
		{ id: 'apis', label: 'Consumers' }
	]
};

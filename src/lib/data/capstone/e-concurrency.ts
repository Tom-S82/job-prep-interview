import type { CapstonePart } from './index.ts';

export const partE: CapstonePart = {
	id: 'medallion-e-concurrency',
	letter: 'E',
	nodes: ['redshift', 'wlm', 'bi'],
	title: 'E · Warehouse capacity: workload management and concurrency scaling',
	summary: 'Two base nodes, a 10am rush and self-serve analysts. Keep the important queries fast without a blank cheque.',
	context: `Redshift runs on **2 base nodes**. Normal BI load is fine, but mornings are not:

- **09:30** the nightly materialised view refresh is still running.
- **10:00** finance runs **5 reports** at once.
- **10:15** self-serve analysts open their SQL notebooks.

Queues build up. Redshift can add temporary capacity (**concurrency scaling**), but it costs money.`,
	businessContext:
		'This tests whether you can protect the queries that matter without overspending, and whether you fix scheduling problems before buying capacity.',
	primer: `**Workload management (WLM).** Queries are routed to queues. With **automatic WLM** you assign **query priorities** (e.g. highest for executive dashboards, low for exploratory SQL) and Redshift manages memory and concurrency. **Query monitoring rules** can log, move or abort runaway queries. **Short query acceleration** lets quick queries jump the queue.

**Concurrency scaling.** When queries queue in a WLM queue that has concurrency scaling enabled, Redshift adds transient clusters to run them. You enable it **per queue** and cap the number of scaling clusters. The scaling clusters read the **same data** as the main cluster.

**Cost model.** Scaling is billed per second while in use. Each cluster earns **free credits** (about one hour per day of main-cluster runtime, accumulating up to 30 hours), which covers typical short peaks. Usage beyond credits is billed, so set a usage limit and alert on it.

**Fix the schedule first.** A heavy refresh overlapping the morning peak is a scheduling problem, not a capacity problem.

**Serverless alternative.** Redshift Serverless scales capacity automatically and bills per use, with a base and maximum capacity you set.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Is the 10am problem capacity, or scheduling?',
		'Which queries matter most, and how do you tell Redshift that?',
		'When should extra capacity appear, and what caps the cost?',
		'How would you know scaling happened?'
	],
	level1Expert: `**Fix the schedule, prioritise the workload, scale only the queue that matters, cap the cost.**

- **Move the heavy refresh** so it finishes before people arrive (after the overnight load, done by 07:00), and make it incremental (Part C) so it is short.
- **Automatic WLM with priorities**: executive and finance dashboards highest, scheduled transformations normal, self-serve SQL low with **query monitoring rules** that abort or log runaway queries; enable short query acceleration.
- **Concurrency scaling on the dashboard queue only**, in auto mode, capped at a small number of clusters, with a **usage limit** and an alert when free credits run out.
- **Self-serve** gets predictable rather than instant: low priority, timeouts, and guidance on when the warehouse is busy.
- **Observe**: CloudWatch metrics for queue wait time and concurrency scaling usage, alerting to Slack; review monthly against cost.`,
	level2: [
		{
			id: 'queues',
			question: 'How do you organise the workload?',
			options: [
				{ id: 'A', text: 'One queue for everything', verdict: 'weak', feedback: 'An analyst\'s runaway query can block the finance director\'s dashboard.' },
				{
					id: 'B',
					text: 'Automatic WLM with priorities: dashboards highest, scheduled jobs normal, self-serve low with query monitoring rules',
					verdict: 'best',
					feedback: 'The queries that matter go first, and runaway queries are contained.'
				},
				{ id: 'C', text: 'A separate cluster for each team', verdict: 'ok', feedback: 'Strong isolation, but multiplies cost; data sharing makes it possible later if needed.' }
			],
			expert: `**Priorities, not separate clusters.** Tell the warehouse what matters; contain what can run away.`
		},
		{
			id: 'scaling',
			question: 'How do you configure concurrency scaling?',
			options: [
				{ id: 'A', text: 'Enable it on every queue with no limit', verdict: 'weak', feedback: 'Every exploratory query can trigger paid capacity.' },
				{
					id: 'B',
					text: 'Enable it on the dashboard queue only, cap the clusters, set a usage limit and alert on credit use',
					verdict: 'best',
					feedback: 'Peak protection for important queries, with a known maximum cost.'
				},
				{ id: 'C', text: 'Leave it off; users wait', verdict: 'ok', feedback: 'Cheapest, and fine if peaks are short, but finance waiting at month end is a real cost too.' }
			],
			expert: `**Scale the queue that matters, with a ceiling.** Free credits usually cover short daily peaks; the limit and alert stop surprises.`
		},
		{
			id: 'morning',
			question: 'What do you do about the 09:30 refresh overlapping the 10:00 reports?',
			options: [
				{ id: 'A', text: 'Leave the schedule; concurrency scaling will absorb it', verdict: 'weak', feedback: 'Pays every day for a scheduling mistake.' },
				{
					id: 'B',
					text: 'Finish the refresh before 07:00 and make it incremental, so 10:00 is reads only',
					verdict: 'best',
					feedback: 'Removes the collision instead of paying to tolerate it.'
				},
				{ id: 'C', text: 'Cancel the refresh when reports start', verdict: 'weak', feedback: 'Reports then show stale or half-refreshed data.' }
			],
			expert: `**Fix the schedule first.** Capacity is for peaks you can't avoid, not for collisions you can.`
		}
	],
	level3: [
		{
			id: 'worth-it',
			prompt: 'Concurrency scaling costs extra. When is it worth it versus telling users to wait?',
			expert:
				"It's worth it for the queries where waiting has a business cost: finance at month end, executive dashboards before a board meeting. Free credits usually cover those short peaks, so the real cost is small. For exploratory SQL, waiting is acceptable, so that queue doesn't scale. I'd check monthly: if scaling runs for hours every day, that's the trigger to resize the base cluster or move to Serverless.",
			lookFor: ['business cost|month end|finance|executive', 'credit', 'explorat|self-serve|wait', 'resize|serverless|base cluster', 'monthly|review']
		},
		{
			id: 'fairness',
			prompt: 'If low-priority queries wait two hours, is that fair?',
			expert:
				"Not if it happens without warning. Low priority should mean slower, not starved: query monitoring rules stop runaway queries that hog the queue, analysts can see warehouse load, and we agree a target such as most self-serve queries starting within a few minutes. If they regularly wait hours, the warehouse is undersized or the dashboards need better Gold tables, and I'd fix that rather than blame the analysts.",
			lookFor: ['warning|visible|see', 'starv|runaway|monitoring rule', 'target|agree', 'undersized|gold|fix']
		}
	],
	concepts: [
		{ id: 'priorities', label: 'Workload priorities (WLM)', patterns: ['wlm|workload|priorit|queue'], importance: 'essential', why: 'The warehouse needs to know which queries matter.' },
		{ id: 'schedule', label: 'Fix scheduling before buying capacity', patterns: ['schedul|before 0?7|move the refresh|finish (it )?before|earlier'], importance: 'essential', why: 'A refresh colliding with the morning peak is not a capacity problem.' },
		{ id: 'scaling', label: 'Concurrency scaling on the important queue only', patterns: ['concurrency scaling|scal'], importance: 'essential', why: 'Paid capacity should protect important queries, not every query.' },
		{ id: 'cost-cap', label: 'Cost controls: caps, usage limits, credits', patterns: ['cap|usage limit|limit|credit'], importance: 'essential', why: 'Without a ceiling, scaling is a blank cheque.' },
		{ id: 'qmr', label: 'Query monitoring rules for runaway queries', patterns: ['monitoring rule|runaway|abort|timeout'], importance: 'bonus', why: 'One bad query should not hold up everyone else.' },
		{ id: 'observe', label: 'Observe queue wait and scaling usage', patterns: ['cloudwatch|alert|metric|slack'], importance: 'bonus', why: 'You need to know when scaling happens and what it costs.' },
		{ id: 'serverless', label: 'Know when to resize or move to Serverless', patterns: ['serverless|resize'], importance: 'bonus', why: 'Constant scaling means the base capacity is wrong.' }
	],
	leadExplanation: {
		constraint:
			"The constraint is that finance and executive dashboards must stay fast at peak, and we can't give the warehouse a blank cheque to make that happen.",
		reasons: [
			'The 09:30 refresh colliding with the 10:00 rush is a scheduling problem, so the refresh moves earlier and becomes incremental.',
			'WLM priorities tell Redshift which queries matter, and query monitoring rules contain runaway self-serve queries.',
			'Concurrency scaling runs only on the dashboard queue, capped, with a usage limit, because free credits cover short peaks.'
		],
		tradeOff: 'Self-serve analysts accept slower queries at peak, and someone has to review scaling usage against cost every month.',
		switchWhen:
			"If scaling ran for hours every day, I'd treat that as the trigger to resize the base cluster or move to Redshift Serverless."
	},
	leadSays: {
		queues: 'An analyst\'s exploratory query should never block the finance dashboard, so we use automatic WLM with priorities and query monitoring rules for runaways. Separate clusters would isolate better, but at several times the cost.',
		scaling: "Scaling should protect the queries where waiting costs the business, so it's enabled only on the dashboard queue, capped, with a usage limit and an alert. Free credits usually cover the short daily peak.",
		morning: "The overlap is a scheduling problem, so the refresh moves to finish before 07:00 and becomes incremental. Paying for capacity every morning to tolerate a collision we can remove would be the wrong fix."
	},
	leadPhrases: [
		'"Fix the schedule before buying capacity."',
		'"Priorities tell the warehouse what matters."',
		'"Scale the queue where waiting has a business cost, with a ceiling."',
		'"Low priority means slower, not starved."',
		'"If scaling runs for hours every day, that\'s the trigger to resize."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll turn on auto-scaling so nobody ever waits."',
			problem: 'Hides the cost and the real cause. Most morning queues are scheduling collisions.'
		},
		{
			sounds: '"We\'ll give every team its own cluster."',
			problem: 'Solves contention by multiplying cost; priorities and query rules usually suffice.'
		}
	],
	watchOutFor: [
		'Jumping to concurrency scaling before questioning the 09:30 refresh.',
		'No cost ceiling or monitoring for scaling.',
		'Ignoring self-serve users entirely: say what they experience.',
		'Not knowing that scaling clusters see the same data as the main cluster.'
	],
	sixtySecond:
		"The constraint is keeping finance and executive dashboards fast at peak without a blank cheque. First, the 09:30 refresh is a scheduling problem, so it moves to finish before 07:00 and becomes incremental. Then automatic WLM sets priorities: dashboards highest, scheduled jobs normal, self-serve low with query monitoring rules. Concurrency scaling runs only on the dashboard queue, capped, with a usage limit, because free credits cover short peaks. The trade-off is slower self-serve at peak and a monthly cost review. If scaling ran for hours every day, I'd resize or move to Serverless.",
	defend: [
		{
			question: 'Do the scaling clusters see up-to-date data?',
			answer: 'Yes. Concurrency scaling clusters read the same data as the main cluster, so dashboards get consistent results whichever cluster runs them.'
		},
		{
			question: 'How would you know scaling is costing too much?',
			answer:
				'A usage limit on concurrency scaling with an alert, plus a monthly look at scaling seconds against free credits. Persistent use beyond credits means the base capacity is wrong.'
		},
		{
			question: 'Why not just move to Redshift Serverless now?',
			answer:
				"It's a good option for spiky workloads and removes capacity planning. I'd compare a month of real usage on both before switching, because steady heavy workloads can cost more on Serverless."
		}
	],
	juniorVsLead: {
		junior: "We'd enable concurrency scaling so it's fully scalable and nobody waits, maybe with more nodes too.",
		lead: "The constraint is keeping dashboards fast at peak without a blank cheque. So the refresh moves to finish before 07:00, WLM priorities put dashboards first and contain runaway queries, and concurrency scaling runs only on the dashboard queue, capped with a usage limit. The trade-off is slower self-serve at peak. If scaling ran for hours daily, I'd resize or move to Serverless.",
		whyBetter: [
			'Removes the collision before paying for capacity',
			'Protects specific queries rather than all of them',
			'Puts a ceiling on cost',
			'Says what would trigger a bigger change'
		]
	},
	relatedSets: [
		{ id: 'gold', label: 'Gold' },
		{ id: 'toolset', label: 'Toolset reference' }
	]
};

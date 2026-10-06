import type { CapstonePart } from './index.ts';

export const partG: CapstonePart = {
	id: 'medallion-g-operations',
	letter: 'G',
	nodes: ['ops', 'dbt', 'spark'],
	title: 'G · Operations: Terraform, dbt, orchestration, CI/CD and monitoring',
	summary: 'Kinesis, Firehose, Lambda, Spark, Redshift, S3 tiers, dbt. Define, deploy, run and observe all of it.',
	context: `The platform now has **Kinesis, Firehose, Lambda, Spark/Glue, Redshift, S3 tiers, dbt** and the SSIS CDC that already exists.

You need to define it, deploy it safely, run it on schedule and know when it breaks. The team has used **GoCD** and **Terraform** before, knows **SSIS** well, and is new to **dbt**.

A first draft of the schedule reads: *00:00 nightly CDC extract, 01:00 CDC loaded, 01:15 Spark merge, 01:30 dbt, 01:45 MV refresh, 02:00 archive, 02:15 reconciliation.* But the CDC runs **hourly**, not nightly.`,
	businessContext:
		'Operations is where good designs fail. The panel wants to see infrastructure as code, a schedule that matches how data actually arrives, and monitoring that catches wrong data, not just failed jobs.',
	primer: `**Terraform modules and state.** Group resources into modules by component (streaming, lake, warehouse, orchestration), with **separate state per environment** so a dev change can't touch production. Promotion goes dev → QA → prod through the pipeline.

**dbt project layout.** \`staging\` models clean each source, \`intermediate\` models join them, \`marts\` are Gold. Tests live next to the models; **source freshness** checks run before models.

**Orchestration options.** **Step Functions**: AWS-native, serverless, good retries and error branches, visual execution history. **Managed Airflow (MWAA)**: richer DAG features and community operators, more to run. **dbt Cloud**: schedules dbt only.

**Event-driven, not clock-driven.** Run the next step when the previous one commits (e.g. "CDC load for hour 13 complete"), so a late load delays the chain rather than causing a stale run.

**Monitor data, not just jobs.** Freshness, row counts, reconciliation between stream and CDC, failure rates and cost. A job can succeed and still produce wrong data.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'What does the schedule look like when CDC is hourly, not nightly?',
		'How is infrastructure split so a change cannot break everything?',
		'What triggers each step: the clock, or the previous step finishing?',
		'What would tell you the data is wrong even though every job succeeded?'
	],
	level1Expert: `**Everything as code, triggered by data arrival, monitored on data as well as jobs.**

- **Terraform modules** per component (streaming, lake, warehouse, orchestration, monitoring), **separate state per environment**, promoted dev → QA → prod with a reviewed plan at each gate.
- **dbt** project: staging (from Bronze/Silver sources), intermediate, marts (Gold), tests next to models, source freshness first.
- **Hourly chain, event-driven** (Step Functions): CDC load for the hour commits → Spark/Glue merge into Silver → dbt incremental Gold → MV refresh for the hourly reports → checks. **Nightly**: full-rebuild windows, compaction, snapshot expiry, archive and lifecycle jobs, profitability report.
- **CI/CD on GoCD** (it works and the team knows it): Terraform plan, dbt build and tests in CI against a dev schema, manual approval to production.
- **Monitoring**: freshness per dataset, row counts against source, **reconciliation drift** between decision events and CDC, job failures, cost; routed by severity to Slack, paging only for the decision API.`,
	level2: [
		{
			id: 'terraform',
			question: 'How do you structure Terraform?',
			options: [
				{ id: 'A', text: 'One root module for everything', verdict: 'weak', feedback: 'Every plan touches everything; one mistake has a platform-wide blast radius.' },
				{
					id: 'B',
					text: 'Modules per component, separate state per environment, promoted through gated environments',
					verdict: 'best',
					feedback: 'Small, reviewable plans; dev changes cannot touch production state.'
				},
				{ id: 'C', text: 'Terraform for dev, console changes in production', verdict: 'weak', feedback: 'Production drifts from code, and nothing is reproducible.' }
			],
			expert: `**Small blast radius.** Separate state per environment and per component means a plan shows only what it can change.`
		},
		{
			id: 'orchestration',
			question: 'How is the pipeline orchestrated?',
			options: [
				{ id: 'A', text: 'Cron jobs at fixed times, as in the draft schedule', verdict: 'weak', feedback: 'A late CDC load means the next steps run on stale data and report success.' },
				{
					id: 'B',
					text: 'Step Functions triggered by data arrival: CDC commit → merge → dbt → refresh → checks, with retries and alerts',
					verdict: 'best',
					feedback: 'Each step runs when its input is ready; failures stop the chain visibly.'
				},
				{ id: 'C', text: 'Managed Airflow (MWAA)', verdict: 'ok', feedback: 'Richer DAG tooling and a familiar model for many teams, but more to run than the pipeline needs today.' }
			],
			expert: `**Event-driven chain.** The draft schedule assumed nightly CDC; with hourly CDC, each hour's chain runs when that hour's load commits.`
		},
		{
			id: 'cicd',
			question: 'What CI/CD do you use?',
			options: [
				{ id: 'A', text: 'Switch to GitHub Actions now', verdict: 'ok', feedback: 'A fine tool, but switching costs time and there is no specific problem it solves here.' },
				{
					id: 'B',
					text: 'Keep GoCD; add Terraform plan, dbt build and tests as stages with approval gates',
					verdict: 'best',
					feedback: 'Reuses what works and the team knows, while adding the stages this platform needs.'
				},
				{ id: 'C', text: 'Deploy from engineers\' laptops', verdict: 'weak', feedback: 'No review, no audit trail, no reproducibility.' }
			],
			expert: `**Evolve what works.** The question is fit with existing tooling, not which product is newest.`
		},
		{
			id: 'monitor',
			question: 'What do you monitor?',
			options: [
				{ id: 'A', text: 'Job failures only', verdict: 'weak', feedback: 'A job can succeed and still load wrong or no data.' },
				{
					id: 'B',
					text: 'Freshness, row counts against source, stream-vs-CDC reconciliation drift, failures and cost, routed by severity',
					verdict: 'best',
					feedback: 'Catches wrong data as well as broken jobs, without paging people for everything.'
				},
				{ id: 'C', text: 'A dashboard someone checks each morning', verdict: 'weak', feedback: 'Problems are found hours late, and only if someone looks.' }
			],
			expert: `**Monitor the data.** Reconciliation drift between decision events and CDC is the metric that tells you the two paths disagree.`
		}
	],
	level3: [
		{
			id: 'dbt-vs-ssis',
			prompt: 'dbt is elegant but new to the team; SSIS is what they know. Migrate transformations or stay?',
			expert:
				"Migrate transformations gradually, and keep SSIS for extraction. dbt gives tests, lineage and reviewable SQL, which the fragile SSIS transformations lack. The trade-off is learning time, so we pair, start with one domain, and keep SSIS packages running until each dbt model reconciles. If the team couldn't make time to learn, I'd slow the migration rather than force it.",
			lookFor: ['gradual|domain|incremental', 'test|lineage|review', 'learn|train|pair', 'reconcil|parallel', 'trade-?off']
		},
		{
			id: 'stepfunctions-vs-airflow',
			prompt: 'Step Functions is AWS-native but less familiar to many data engineers than Airflow. Which fits your team?',
			expert:
				"Step Functions for now, because the chain is short, AWS-native and event-driven, and there's no scheduler to run. Its execution history gives good visibility per run. If the number of pipelines and cross-dependencies grew a lot, or we needed backfills across many DAGs, that's the trigger to move to managed Airflow.",
			lookFor: ['step functions', 'short|simple|native|serverless', 'visib|history', 'airflow|mwaa', 'trigger|grew|if']
		},
		{
			id: 'gocd',
			prompt: 'GitHub Actions is popular. Is it worth switching from GoCD?',
			expert:
				"Not as a priority. GoCD already runs gated deployments the team trusts, so switching costs time without solving a problem. I'd add the stages this platform needs to GoCD. If GoCD became a maintenance burden, or the organisation standardised on GitHub, I'd plan a move then.",
			lookFor: ['gocd', 'works|trust|already', 'stage|gate', 'if|burden|standardis']
		}
	],
	concepts: [
		{ id: 'iac', label: 'Infrastructure as code with modules and per-environment state', patterns: ['terraform', 'module|state|environment'], importance: 'essential', why: 'Reproducible, reviewable infrastructure with a small blast radius.' },
		{ id: 'dbt', label: 'dbt with tests for Silver and Gold', patterns: ['\\bdbt\\b', 'test'], importance: 'essential', why: 'Transformations need tests and lineage.' },
		{ id: 'event-driven', label: 'Event-driven, hourly chain (not a nightly clock)', patterns: ['hourly', 'event|trigger|arrival|commit'], importance: 'essential', why: 'CDC is hourly; steps should run when their inputs are ready.' },
		{ id: 'orchestrator', label: 'A named orchestrator with retries', patterns: ['step functions|airflow|mwaa|orchestrat'], importance: 'essential', why: 'Something must own sequencing, retries and failure.' },
		{ id: 'data-monitoring', label: 'Monitor data: freshness, row counts, reconciliation drift', patterns: ['fresh|row count|reconcil|drift'], importance: 'essential', why: 'Jobs can succeed and still produce wrong data.' },
		{ id: 'cicd', label: 'CI/CD with gates (keep GoCD)', patterns: ['gocd|ci\\/?cd|pipeline|approval|gate'], importance: 'bonus', why: 'Changes should be tested and approved before production.' },
		{ id: 'nightly', label: 'Separate nightly maintenance (compaction, archive, full rebuilds)', patterns: ['nightly|compaction|snapshot expir'], importance: 'bonus', why: 'Heavy housekeeping should not sit in the hourly chain.' }
	],
	leadExplanation: {
		constraint:
			'The constraint is a small team running many services, so everything has to be code, triggered by data arrival, and observable without anyone watching it.',
		reasons: [
			'Terraform modules with separate state per environment keep each change small and reviewable.',
			'An event-driven hourly chain in Step Functions runs each step when its input commits, because the CDC is hourly, not nightly.',
			'Monitoring covers the data itself, so reconciliation drift between the two paths is caught even when every job succeeds.'
		],
		tradeOff: 'More moving parts to learn at once, especially dbt, so the migration of transformations is gradual and paired.',
		switchWhen: 'If pipelines and their cross-dependencies multiplied, I would move orchestration to managed Airflow.'
	},
	leadSays: {
		terraform: 'One bad plan should not be able to touch everything, so Terraform is split into modules per component with separate state per environment, promoted through gated environments.',
		orchestration: "CDC lands hourly, not nightly, so the chain is event-driven: when an hour's load commits, Step Functions runs the merge, dbt, the refresh and the checks. A clock-driven schedule would happily run on stale data.",
		cicd: 'GoCD already runs gated deployments the team trusts, so we keep it and add Terraform plan and dbt tests as stages. Switching tools would cost time without solving a problem.',
		monitor: "A job can succeed and still load the wrong data, so we monitor freshness, row counts and reconciliation drift between decision events and CDC, routed by severity. Only the decision API pages out of hours."
	},
	leadPhrases: [
		'"Everything is code, and every change is a small, reviewed plan."',
		'"Steps run when their data arrives, not when the clock says."',
		'"Monitor the data, not just the jobs."',
		'"We keep GoCD because it works; we add the stages we need."',
		'"If pipelines multiplied, that\'s the trigger for Airflow."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll use Airflow, Kubernetes and GitHub Actions because they\'re industry standard."',
			problem: 'Lists tools instead of needs, and replaces things that already work without a reason.'
		},
		{
			sounds: '"Monitoring will alert us if any job fails."',
			problem: 'The dangerous failures are jobs that succeed with wrong or missing data.'
		}
	],
	watchOutFor: [
		'Accepting the draft nightly schedule when CDC is hourly.',
		'No mention of separate Terraform state per environment.',
		'Monitoring that only covers job failures.',
		'Replacing GoCD or SSIS without naming a problem it solves.'
	],
	sixtySecond:
		"The constraint is a small team running many services, so everything is code and runs on data arrival. Terraform is split into modules with separate state per environment and promoted through GoCD with approval gates. Because CDC is hourly, Step Functions runs an event-driven chain each hour: merge into Silver, dbt incremental Gold, refresh, checks. Heavy housekeeping runs nightly. Monitoring covers freshness, row counts and reconciliation drift, not just job failures. The trade-off is a lot to learn, so dbt arrives domain by domain. If pipelines multiplied, I'd move orchestration to Airflow.",
	defend: [
		{
			question: 'What happens if the 13:00 CDC load is late?',
			answer:
				"Nothing downstream runs for that hour until it commits, so no step reports success on stale data. A freshness alarm fires if the load is later than the agreed threshold, and the next hour's chain processes both hours' data."
		},
		{
			question: 'How do you test dbt changes before production?',
			answer:
				'CI builds only the changed models and their children into a dev schema against representative data, runs their tests, and posts the results to the pull request; production deploy needs approval in GoCD.'
		},
		{
			question: 'Who gets paged at 3am?',
			answer:
				'Only for the decision API and the stream feeding it, because customers are affected. Batch failures alert the team channel in working hours, with the hourly chain catching up automatically.'
		}
	],
	juniorVsLead: {
		junior: "We'd use Terraform, dbt, Airflow and GitHub Actions, which are all industry standard, and run everything nightly with alerts on failures.",
		lead: "The constraint is a small team running many services, so everything is code and runs on data arrival. Terraform modules have separate state per environment, GoCD promotes them through gates, and because CDC is hourly, Step Functions runs an event-driven chain each hour. Monitoring covers reconciliation drift and freshness, not just failures. The trade-off is learning dbt, so it arrives domain by domain. If pipelines multiplied, I'd move to Airflow.",
		whyBetter: [
			'Matches the schedule to how data actually arrives',
			'Keeps tools that work instead of replacing them',
			'Monitors data correctness, not just job status',
			'Names the learning trade-off'
		]
	},
	relatedSets: [
		{ id: 'cicd', label: 'CI/CD' },
		{ id: 'terraform', label: 'Terraform' }
	]
};

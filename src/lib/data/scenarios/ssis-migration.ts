import type { ArchitectureScenario } from '../scenarios.ts';

export const ssisMigration: ArchitectureScenario = {
	id: 'ssis-migration',
	title: 'Migrate legacy SSIS (keep what works)',
	summary: 'About 400 SSIS packages: some rock-solid, many fragile. 18 months and a budget.',
	leadExplanation: {
		constraint:
			"The constraint is that reports and regulatory returns can't break during the move, and we don't yet know what most of the 400 packages do.",
		reasons: [
			"You can't plan 18 months without a map of what exists, what fails and who uses it.",
			'The CDC packages already work, so replacing them adds risk without value. Changing only where they land is enough.',
			'Migrating domain by domain with a parallel run gives evidence that the numbers match before anyone switches.'
		],
		tradeOff:
			'It is slower to start: the first two months produce an inventory and monitoring rather than new pipelines, and we pay to run old and new side by side.',
		switchWhen:
			'If SQL Server moved to RDS or the SSIS skills left the team, we would replace CDC with DMS, using the same parallel-run playbook.'
	},
	leadSays: {
		first:
			"The constraint is that we don't know what we have yet. So the first two months produce an inventory, a keep, migrate or retire label for every package, and monitoring on SSIS. It delays visible progress, but it stops us rewriting packages nobody uses.",
		cdc: "These packages are the part that works. We keep them and change only the destination, to S3 Bronze. If SQL Server moved to RDS or the skills left, that's the trigger for DMS.",
		target:
			'Most of the logic is SQL, and the problem today is that it has no tests or lineage. dbt fixes exactly that, with Spark only where Python or scale demands it. The trade-off is a new tool for the team, so we invest in training early.',
		cutover:
			"The constraint is that finance and regulatory numbers can't change silently. So each domain runs old and new in parallel with automated reconciliation, and we cut over only when they match. It costs running both for a while. A big bang would save that and risk everything."
	},
	leadPhrases: [
		'"The constraint is that nothing downstream can break during the move."',
		'"First we find out what we have, then we decide what to move."',
		'"We keep what works and change only where it lands."',
		'"The trade-off is a slower start for a safer middle."',
		'"If SSIS becomes the bottleneck, we\'d switch to DMS, and here\'s what would trigger that."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll modernise the whole stack."',
			problem:
				"Sounds ambitious, but hides that you don't know what you're modernising. Modernise which packages, and why those first?"
		},
		{
			sounds: '"SSIS is legacy, so it has to go."',
			problem: "Age isn't a reason. Say what problem it causes. If it works, keeping it is the senior call."
		}
	],
	juniorVsLead: {
		junior:
			"I'd migrate all the SSIS packages to AWS Glue and dbt, because SSIS is legacy and the cloud is more modern and scalable.",
		lead: "The constraint is that reports can't break, and we don't know what half the packages do. So I'd inventory first, keep the CDC that works, retire what nobody uses, and migrate the rest domain by domain with a parallel run. The trade-off is a slower start. If SSIS itself became the bottleneck, we'd move CDC to DMS.",
		whyBetter: [
			'Starts from risk, not from technology',
			'Says what stays as well as what moves',
			'Gives a method (parallel run) that produces evidence',
			'Replaces "legacy" and "modern" with reasons'
		]
	},
	context: `thinkmoney runs **about 400 SSIS packages**. The **CDC packages from SQL Server are reliable**. Many others are fragile: complex transformations, business logic buried in data flows, no tests and little monitoring. Nobody is sure which packages are still needed.

You have **18 months** and a budget to move to the new platform (S3/Iceberg medallion, dbt, streaming for new events). The business can't tolerate broken reports or regulatory returns during the move.`,
	businessContext:
		'The JD says "evolve and reuse what works; do not rebuild for the sake of rebuilding". The panel wants to see judgement about what to keep, a safe migration method, and how you would bring the team with you.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'What do you need to know before moving anything?',
		'What stays, what moves, and what can simply be switched off?',
		'In what order, and how do you avoid breaking reports?',
		'How do you prove the new version is right?'
	],
	level1Expert: `**Know before you move, keep what works, migrate domain by domain, prove equivalence.**

- **Inventory and classify first (first 6–8 weeks)**: every package, what it reads and writes, how often it fails, and who uses its output (Power BI usage data). Classify each as **keep**, **migrate** or **retire**. Claude Code speeds this up a lot by reading .dtsx XML and stored procedures. Add basic **monitoring to SSIS now**: a quick win while the migration is planned.
- **Keep the CDC packages**, repointed to land in S3 Bronze. They work; replacing them adds risk with no business value. DMS stays a documented fallback with clear triggers.
- **Retire before migrating**: packages whose output nobody uses are switched off (with notice), not rewritten. It's typically a meaningful share.
- **Migrate transformations domain by domain** (customers/accounts first) into **dbt** for SQL logic, with **Glue/Spark** only for heavy Python work, with tests from day one.
- **Parallel run and reconcile** each domain: old and new side by side, automated reconciliation of counts and financial totals, cut over when they match for an agreed period, keep the old path as rollback, then decommission.
- **Streaming only for new event sources**, not as a replacement for CDC.
- **Bring the team**: training on dbt and the new stack, pairing, and a decision log so choices outlive individuals.`,
	level2: [
		{
			id: 'first',
			question: 'What do you do in the first two months?',
			options: [
				{
					id: 'A',
					text: 'Start rewriting the most fragile packages straight away',
					verdict: 'ok',
					feedback:
						'Fixes visible pain quickly, but without an inventory you may rewrite packages nobody uses, or miss hidden dependencies.'
				},
				{
					id: 'B',
					text: 'Inventory and classify every package (keep / migrate / retire) and add monitoring',
					verdict: 'best',
					feedback: 'You cannot plan 18 months without knowing what exists, what fails and who depends on it. Monitoring is an immediate win.'
				},
				{
					id: 'C',
					text: 'Lift and shift all SSIS to cloud VMs or a hosted SSIS runtime',
					verdict: 'weak',
					feedback: 'Moves the problem rather than solving it: the fragile logic, missing tests and poor monitoring all come along.'
				}
			],
			expert: `**Inventory, classify, monitor.** The first deliverable is a map: packages → tables → reports → owners, with failure rates and usage. That tells you what to retire, what to keep and the order to migrate. Adding monitoring to SSIS straight away reduces risk while you plan, and builds credibility with stakeholders.`
		},
		{
			id: 'cdc',
			question: 'What happens to the CDC packages?',
			options: [
				{
					id: 'A',
					text: 'Keep them; repoint their output to S3 Bronze',
					verdict: 'best',
					feedback: 'They work. Changing only the destination delivers the new platform with minimal risk.'
				},
				{
					id: 'B',
					text: 'Replace them with AWS DMS now',
					verdict: 'ok',
					feedback: 'A valid tool (and one you know), but replacing a working component now adds risk without business value. Keep it as a fallback with triggers.'
				},
				{
					id: 'C',
					text: 'Replace them with Kinesis',
					verdict: 'weak',
					feedback: 'Kinesis transports events; it does not capture changes from SQL Server. You would still need a CDC tool in front of it.'
				}
			],
			expert: `**Keep them and change the destination.** This is the clearest example of "evolve what works". Write down what would make you revisit it (SQL Server moving to RDS, latency needs batch can't meet, SSIS skills leaving), so the decision is deliberate, not inertia.`
		},
		{
			id: 'target',
			question: 'Where do the migrated transformations go?',
			options: [
				{
					id: 'A',
					text: 'dbt for SQL logic, Glue/Spark only for heavy Python work',
					verdict: 'best',
					feedback: 'Most SSIS transformation logic is SQL-shaped; dbt makes it versioned, tested and documented with lineage.'
				},
				{
					id: 'B',
					text: 'Rewrite everything in PySpark',
					verdict: 'ok',
					feedback: 'Plays to PySpark skills and scales well, but SQL logic is harder to review and test in Spark, and analysts can no longer read it.'
				},
				{
					id: 'C',
					text: 'Redshift stored procedures',
					verdict: 'weak',
					feedback: 'Familiar, but hard to test, review and trace lineage. It recreates the "logic in a black box" problem.'
				}
			],
			expert: `**dbt first, Spark where it earns its place.** dbt gives tests, documentation and lineage as part of each model, which is exactly what the fragile packages lack. Use Glue or EMR Spark for heavy reprocessing or Python-specific logic. I'd be honest that dbt at scale is a growth area for me, which is why I'd invest in team training and patterns early.`
		},
		{
			id: 'cutover',
			question: 'How do you cut over without breaking reports?',
			options: [
				{
					id: 'A',
					text: 'Big-bang switch over a long weekend',
					verdict: 'weak',
					feedback: 'Too much changes at once; when numbers differ on Monday you cannot tell which of 400 packages is to blame.'
				},
				{
					id: 'B',
					text: 'Parallel run per domain, automated reconciliation, cut over when it matches, keep rollback',
					verdict: 'best',
					feedback: 'Proves equivalence with evidence, limits blast radius and gives stakeholders confidence.'
				},
				{
					id: 'C',
					text: 'Switch consumers immediately and fix issues as they appear',
					verdict: 'weak',
					feedback: 'Users find the bugs, and in a regulated firm that can mean wrong figures in a regulatory return.'
				}
			],
			expert: `**Parallel run, reconcile, then cut over, domain by domain.** Automated reconciliation (row counts, financial totals per day and product, agreed tolerance: zero for money) runs every day of the parallel period, and results are visible to stakeholders. Where numbers differ, the old platform is sometimes the one that's wrong, so differences need a business decision, recorded.`
		}
	],
	concepts: [
		{
			id: 'inventory',
			label: 'Inventory and classify before moving anything',
			patterns: ['inventor', 'audit', 'classif', 'catalog', 'map (the|all|every)', 'assess'],
			importance: 'essential',
			why: 'Without a map of packages, dependencies and usage, an 18-month plan is guesswork.'
		},
		{
			id: 'keep-cdc',
			label: 'Keep the working CDC packages',
			patterns: ['keep.{0,40}cdc', 'cdc.{0,40}(keep|stay|retain|works)', 'evolve', 'what works'],
			importance: 'essential',
			why: 'The CDC packages work. Replacing them is risk without value, and the JD says to evolve what works.'
		},
		{
			id: 'incremental',
			label: 'Migrate incrementally, domain by domain',
			patterns: ['domain', 'incremental', 'phase', 'wave', 'one at a time', 'prioriti'],
			importance: 'essential',
			why: 'Incremental delivery limits risk and shows value early.'
		},
		{
			id: 'parallel',
			label: 'Parallel run with reconciliation before cutover',
			patterns: ['parallel', 'reconcil', 'side by side', 'equivalen', 'compare'],
			importance: 'essential',
			why: 'Evidence that numbers match is what lets the business accept the cutover.'
		},
		{
			id: 'retire',
			label: 'Retire unused packages instead of migrating them',
			patterns: ['retire', 'decommission', 'switch off', 'turn off', 'unused', 'nobody uses'],
			importance: 'bonus',
			why: 'The cheapest migration is the one you do not do.'
		},
		{
			id: 'dbt',
			label: 'Modern, tested transformations (dbt / Spark)',
			patterns: ['\\bdbt\\b', 'glue', 'spark', 'test'],
			importance: 'bonus',
			why: 'The target should fix what made the old packages fragile: no tests, no lineage.'
		},
		{
			id: 'monitoring',
			label: 'Monitoring and observability',
			patterns: ['monitor', 'alert', 'observab', 'cloudwatch'],
			importance: 'bonus',
			why: 'Fragile packages with no monitoring are a risk today, not just after migration.'
		},
		{
			id: 'rollback',
			label: 'Rollback plan',
			patterns: ['rollback', 'roll back', 'fallback', 'fall back'],
			importance: 'bonus',
			why: 'Every cutover needs a way back.'
		},
		{
			id: 'team',
			label: 'Bring the team with you (skills, training, Claude Code)',
			patterns: ['team', 'train', 'skill', 'pair', 'claude'],
			importance: 'bonus',
			why: 'This is a lead role: the migration succeeds or fails on the team.'
		}
	],
	watchOutFor: [
		'Saying "SSIS is legacy" as if that were a reason. Name the problem it causes.',
		'Listing target tools without a sequence. The panel wants to know what happens in month one.',
		'Forgetting the people: who knows these packages, and how the team learns dbt.',
		'No proof step. Without reconciliation, "it works" is an opinion.'
	],
	sixtySecond:
		'The constraint is that reports and regulatory returns can\'t break, and we don\'t know what most of the 400 packages do. So the first two months are an inventory: keep, migrate or retire every package, plus monitoring on SSIS. The CDC packages stay and simply land in S3. Unused packages get switched off. The rest move domain by domain to dbt, with a parallel run and automated reconciliation before each cutover. The trade-off is a slower start. If SSIS itself became the bottleneck, we\'d move CDC to DMS.',
	defend: [
		{
			question: 'A business-critical package fails mid-migration and only one person understands it.',
			answer:
				'Fix it in place first, with that person, and pair someone else on it while they do. Then move it up the migration order, because a single point of knowledge is a risk in its own right. The inventory should already flag packages with one owner.'
		},
		{
			question: 'Finance says the new numbers differ by 0.3%.',
			answer:
				'We don\'t cut over. We trace the difference to the rows and rules causing it. Often the old logic was wrong or undocumented, so the fix is a business decision, which we record. Money reconciles to zero tolerance unless finance signs off otherwise.'
		},
		{
			question: 'How would you use Claude Code here?',
			answer:
				'To read the .dtsx XML and stored procedures and produce a first draft of the inventory and lineage, and to draft dbt models from SSIS logic. Engineers review and test everything; it speeds up the reading, not the judgement.'
		},
		{
			question: 'How do you report progress over 18 months?',
			answer:
				'By domain: packages retired, migrated and reconciled; incidents before and after; and the date each old path was decommissioned. Not lines of code.'
		}
	],
	level3: [
		{
			id: 'one-person',
			prompt: 'Halfway through, the only engineer who understands the core banking packages resigns. Where does your plan break?',
			expert:
				'The risk was single-person knowledge, and it existed before the resignation. During the notice period, that engineer pairs with two others and records walkthroughs of the critical packages, and we use Claude Code to document the logic from the package XML. Then those packages move up the migration order, because a package nobody understands is the riskiest thing to leave in SSIS.',
			lookFor: ['pair|knowledge|document', 'notice|handover', 'prioriti|move (it|them) up|order|first', 'claude']
		},
		{
			id: 'parallel-cost',
			prompt: 'Finance asks why you\'re paying to run two platforms in parallel. How do you defend it?',
			expert:
				'The parallel run is the cost of proving the numbers before regulatory reports depend on them. It\'s time-boxed per domain, usually a few weeks, and ends when reconciliation matches for an agreed period. The alternative is finding the error in a regulatory return, which costs far more than a few weeks of compute.',
			lookFor: ['prove|evidence|reconcil', 'time[- ]box|weeks|per domain', 'regulat|risk']
		},
		{
			id: 'dms-trigger',
			prompt: 'Infrastructure announces SQL Server is moving to RDS next year. What changes?',
			expert:
				'That\'s the trigger I named for revisiting CDC. On RDS, DMS becomes the natural option, so we plan it as its own migration: run DMS alongside SSIS CDC into Bronze, reconcile, cut over, and keep SSIS warm as rollback. The rest of the plan doesn\'t change, because Bronze is the contract between ingestion and everything downstream.',
			lookFor: ['\\bdms\\b', 'parallel|alongside|reconcil', 'rollback|warm', 'bronze|contract']
		}
	],
	relatedSets: [
		{ id: 'stack', label: 'Technology stack' },
		{ id: 'validation', label: 'Validation' },
		{ id: 'cicd', label: 'CI/CD' }
	]
};

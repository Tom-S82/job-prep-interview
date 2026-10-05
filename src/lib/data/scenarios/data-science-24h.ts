import type { ArchitectureScenario } from '../scenarios.ts';

export const dataScience24h: ArchitectureScenario = {
	id: 'data-science-24h',
	title: 'Clean data for a data scientist in 24 hours',
	summary: 'A new data scientist needs cleaned transaction data by tomorrow. The medallion is not ready.',
	leadExplanation: {
		constraint:
			"The constraint is time: 24 hours, on a platform that can't deliver this properly yet. The risk is that today's quick fix becomes next year's shadow pipeline.",
		reasons: [
			'A documented, versioned extract from the best available layer unblocks the data scientist without touching production.',
			'Writing down what "clean" means (grain, deduplication, exclusions, known gaps) turns a one-off favour into the start of a data contract.',
			'Their needs then go into the medallion backlog as a tested model with an owner, so the extract can be retired.'
		],
		tradeOff:
			'The quick extract has known gaps and is not tested to production standard, so we label it clearly and accept some rework later.',
		switchWhen:
			'If the model were going straight into a customer-facing decision, I would not hand over a quick extract. I would push back on the deadline and build it properly, because the risk changes.'
	},
	leadSays: {
		quick:
			"The constraint is the 24-hour deadline. So I'd build a documented, versioned SQL view over the best available layer, in a sandbox, with known caveats written down. It's not production quality, and we say so, but it unblocks them without anyone querying the core banking database.",
		clean:
			"\"Clean\" means different things to different people. So we agree it in writing: one row per what, how duplicates are resolved, what's excluded, how fresh it is. It takes half an hour, and it stops the model being trained on an assumption nobody shared.",
		longterm:
			"A quick extract that nobody owns becomes a shadow pipeline. So the agreed definition becomes a tested dbt model in Silver or Gold with an owner, and the extract is retired. It's extra work next sprint, and it's the price of not accumulating debt.",
		privacy:
			"The requirement is to use the minimum personal data for the purpose. So they get pseudonymised keys and only the columns the model needs, in a governed sandbox, and we check whether the use needs a DPIA. It's less convenient than full access, and that's the point."
	},
	leadPhrases: [
		'"The constraint is 24 hours on a platform that isn\'t ready, so we separate the quick fix from the real fix."',
		'"Let\'s write down what \'clean\' means before anyone cleans anything."',
		'"This extract has an expiry date: it\'s replaced by a tested model."',
		'"Minimum data for the purpose: pseudonymised keys, only the columns the model needs."',
		'"If this were feeding a customer decision, I\'d push back on the deadline."'
	],
	antiPatterns: [
		{
			sounds: '"I\'ll just get them whatever they need by tomorrow."',
			problem: 'Sounds helpful, but hides the risks: production load, PII exposure, and an undocumented extract that quietly becomes permanent.'
		},
		{
			sounds: '"They should wait for the new platform."',
			problem: 'Sounds principled, but blocks the business. A Lead finds a safe quick path and a proper long-term one.'
		}
	],
	watchOutFor: [
		'Describing only the quick fix. The panel wants to hear how it becomes part of the platform.',
		'Skipping the definition of "clean". It is the most important conversation in this scenario.',
		'Forgetting personal data: a new ML use of customer data may need a DPIA and minimised columns.',
		'Not saying who owns the extract after Tuesday.'
	],
	sixtySecond:
		"The constraint is 24 hours on a platform that isn't ready, so I'd separate the quick fix from the real fix. Quick fix: a documented, versioned SQL view over the best available layer, in a sandbox, with pseudonymised keys and only the columns they need, and the caveats written down. Before that, we agree in writing what 'clean' means. Real fix: that definition becomes a tested dbt model with an owner, and the extract is retired. If the model fed a customer-facing decision, I'd push back on the deadline.",
	defend: [
		{
			question: 'Why not just query the core banking SQL Server directly?',
			answer: 'Production load and risk: an analytical query on the OLTP database can slow customer transactions. We use the best analytical copy available, even if it is a day old.'
		},
		{
			question: 'What if the data scientist finds problems in your extract?',
			answer: "That's good: it is exactly the feedback the medallion needs. We log the issue against the agreed definition, fix it in the extract if it blocks them, and make sure the tested model handles it."
		},
		{
			question: 'Who owns the cleanness contract?',
			answer: 'The data team owns the model and its tests; the data scientist (and their manager) own the requirement and sign off the definition. Both are named in the catalogue.'
		}
	],
	context: `A **new data scientist joined on Monday** and needs **cleaned transaction data for an ML model by Tuesday**. The current medallion is slow and incomplete: Silver has gaps, Gold doesn't cover transactions at the grain they need, and nobody has written down what "clean" means.

Constraints:
- Transaction data is personal and financial.
- Production SQL Server must not be slowed down.
- The team is already busy with the platform rebuild.`,
	businessContext:
		'This tests whether you can unblock someone quickly without creating the kind of undocumented shadow pipeline that made the current platform unfit for purpose.',
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'What can you safely deliver by tomorrow?',
		'What does "clean" actually mean here, and who decides?',
		'How does this become part of the platform rather than a one-off?',
		'What about personal data?'
	],
	level1Expert: `**Quick fix and real fix, deliberately separated.**

- **Agree "clean" in writing** (30 minutes with the data scientist): grain (one row per transaction?), deduplication rule, exclusions (test accounts, reversals?), freshness, known gaps.
- **Quick path by tomorrow**: a **versioned SQL view** over the best available analytical layer (not production), in a **sandbox**, with **pseudonymised keys and only the needed columns**, and a short README listing caveats.
- **Check privacy**: a new ML use of customer data may need a **DPIA**; involve the DPO early rather than late.
- **Real fix**: the agreed definition becomes a **tested dbt model** in Silver/Gold with an **owner**, and the extract is retired on a date.
- **Feedback loop**: issues the data scientist finds become tests in the real model.`,
	level2: [
		{
			id: 'quick',
			question: 'How do you get them data by tomorrow?',
			options: [
				{ id: 'A', text: 'Let them query the production SQL Server directly', verdict: 'weak', feedback: 'Fast, but risks slowing customer transactions and exposes full PII.' },
				{
					id: 'B',
					text: 'A documented, versioned SQL view over the best available layer, in a sandbox',
					verdict: 'best',
					feedback: 'Unblocks them safely, keeps production untouched, and the documentation makes the caveats explicit.'
				},
				{ id: 'C', text: 'Ask them to wait for the new platform', verdict: 'weak', feedback: 'Principled, but blocks the business for months.' },
				{ id: 'D', text: 'Copy the raw data to S3 and let them clean it in a notebook', verdict: 'ok', feedback: 'Quick, but cleaning logic ends up in a notebook nobody else can see or reuse.' }
			],
			expert: `**A documented view in a sandbox.** It's quick, it doesn't touch production, and because it's versioned SQL rather than a notebook, the logic can be reviewed and later moved into dbt.`
		},
		{
			id: 'clean',
			question: 'What does "clean" mean, and who decides?',
			options: [
				{ id: 'A', text: 'Whatever the data scientist decides in their notebook', verdict: 'weak', feedback: 'The definition stays private, so nobody else can rely on or test it.' },
				{
					id: 'B',
					text: 'Agree a written definition together: grain, deduplication, exclusions, freshness',
					verdict: 'best',
					feedback: 'A shared, testable definition: the first version of a data contract.'
				},
				{ id: 'C', text: 'Use the existing Gold definitions as they are', verdict: 'ok', feedback: 'Fine if they fit, but here Gold does not cover the grain they need.' }
			],
			expert: `**A short written definition, agreed together.** It's the most valuable 30 minutes in this scenario: it prevents a model trained on an unspoken assumption, and it becomes the spec for the tested model.`
		},
		{
			id: 'longterm',
			question: 'What happens after Tuesday?',
			options: [
				{ id: 'A', text: 'Leave the extract running; it works', verdict: 'weak', feedback: 'This is how shadow pipelines start: untested, unowned, and depended on.' },
				{
					id: 'B',
					text: 'Turn the definition into a tested dbt model with an owner, then retire the extract',
					verdict: 'best',
					feedback: 'The quick fix becomes platform work with tests and ownership, and the debt is paid down on a date.'
				},
				{ id: 'C', text: 'The data science team maintains its own pipeline', verdict: 'ok', feedback: 'Gives them control, but duplicates platform work and splits ownership of the same data.' }
			],
			expert: `**Promote it, then retire it.** Put a retirement date on the extract the day you create it. The real model gets tests built from whatever issues the data scientist found.`
		},
		{
			id: 'privacy',
			question: 'What data do they get?',
			options: [
				{ id: 'A', text: 'Everything, including names and contact details, in case it helps', verdict: 'weak', feedback: 'Breaks data minimisation and widens exposure for no modelling benefit.' },
				{
					id: 'B',
					text: 'Pseudonymised keys and only the needed columns, in a governed sandbox, with a DPIA check',
					verdict: 'best',
					feedback: 'Minimum data for the purpose, with the privacy question asked early.'
				},
				{ id: 'C', text: 'A small anonymised sample only', verdict: 'ok', feedback: 'Very safe, but may be too small or too altered to build a useful model.' }
			],
			expert: `**Minimum data for the purpose.** Models rarely need names or contact details. Pseudonymised keys let them join what they need, and a DPIA check early avoids a model that has to be withdrawn later.`
		}
	],
	level3: [
		{
			id: 'permanent',
			prompt: 'Six months later, the "temporary" extract feeds three dashboards and the production model. Where did your design break?',
			expert:
				"The quick fix outlived its expiry because nobody owned retiring it. That's a process failure, not a technical one. The fix: the extract gets an owner and a retirement date in the catalogue from day one, and the tested model is scheduled in the next sprint. Now, I'd migrate the three dashboards and the model onto the tested version and switch the extract off.",
			lookFor: ['owner|ownership', 'retire|expiry|date|switch off', 'process', 'migrat|move']
		},
		{
			id: 'leakage',
			prompt: 'The model scores brilliantly in testing. The data scientist then realises the training data included a column set after the outcome happened. What went wrong and how do you prevent it?',
			expert:
				"That's target leakage: a field that's only known after the event slipped into training. It went wrong because the definition didn't say 'as known at the time'. Preventing it means point-in-time data: Silver keeps change history (SCD2), so the model is trained on what was known at each moment, and the definition says so explicitly.",
			lookFor: ['leak', 'point[- ]in[- ]time|as (known|of)|history|scd', 'definition|contract']
		},
		{
			id: 'deadline',
			prompt: 'Their manager says the model will decide credit limits next week. Does your answer change?',
			expert:
				"Yes. A customer-facing credit decision changes the risk completely: Consumer Duty, explainability and fairness all apply. I'd push back on the timeline, and insist on the tested model, documented features and a model review before it affects anyone's credit limit. The quick extract is fine for exploration, not for decisions.",
			lookFor: ['push back|timeline|deadline', 'consumer duty|fair|explain|bias|risk', 'test|review|properly']
		}
	],
	concepts: [
		{ id: 'split', label: 'Separate the quick fix from the real fix', patterns: ['quick (fix|path|win)|short[- ]term|tactical', 'long[- ]term|real fix|strategic|later|properly'], importance: 'essential', why: 'Without the separation, the quick fix silently becomes permanent.' },
		{ id: 'define', label: 'Agree what "clean" means in writing', patterns: ['defin', 'contract', 'agree', 'grain', 'dedup'], importance: 'essential', why: 'An unspoken definition leads to a model trained on wrong assumptions.' },
		{ id: 'safe', label: 'Keep production untouched (sandbox / analytical copy)', patterns: ['sandbox', 'production|prod\\b|replica|copy|not (the )?(core|oltp)'], importance: 'essential', why: 'Analytical queries on the OLTP database risk slowing customer transactions.' },
		{ id: 'model', label: 'Promote to a tested model with an owner', patterns: ['\\bdbt\\b|model|test', 'owner|ownership'], importance: 'essential', why: 'Tests and ownership are what stop it becoming a shadow pipeline.' },
		{ id: 'privacy', label: 'Minimise personal data (pseudonymise, DPIA)', patterns: ['pii|personal|pseudonym|minimi|dpia|gdpr|privacy'], importance: 'essential', why: 'A new ML use of customer data needs minimisation and possibly a DPIA.' },
		{ id: 'document', label: 'Document caveats and version the extract', patterns: ['document|readme|caveat|known (gap|issue)|version'], importance: 'bonus', why: 'Users of a quick extract need to know its limits.' },
		{ id: 'retire', label: 'Retire the extract on a date', patterns: ['retire|expiry|expire|decommission|switch off'], importance: 'bonus', why: 'A temporary fix needs an end date, or it never ends.' },
		{ id: 'feedback', label: 'Feed issues back as tests', patterns: ['feedback|issues? (they|found)|become tests?'], importance: 'bonus', why: 'The data scientist is your best early tester.' }
	],
	juniorVsLead: {
		junior: "I'd get them whatever data they need by tomorrow, probably straight from the database, and clean it up for them so they're not blocked.",
		lead: "The constraint is 24 hours on a platform that isn't ready, so I'd separate the quick fix from the real fix. Tomorrow they get a documented view in a sandbox, with pseudonymised keys and the caveats written down, after we agree what 'clean' means. Then that definition becomes a tested model with an owner, and the extract is retired. If this fed a credit decision, I'd push back on the deadline.",
		whyBetter: [
			'Separates the quick fix from the real one',
			'Defines "clean" before cleaning',
			'Protects production and personal data',
			'Says when the answer would change'
		]
	},
	relatedSets: [
		{ id: 'silver', label: 'Silver' },
		{ id: 'sources', label: 'Sources (data contracts)' }
	]
};

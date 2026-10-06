import type { CapstonePart } from './index.ts';

export const partF: CapstonePart = {
	id: 'medallion-f-lifecycle',
	letter: 'F',
	nodes: ['bronze', 'silver', 'tiers', 'redshift'],
	title: 'F · Lifecycle: hot, warm and cold without breaking queries',
	summary: '10 years of history, queries rarely past 6 months. Cut storage cost without losing what regulators need.',
	context: `thinkmoney holds **10 years** of transaction history. Bronze and Silver currently keep 2 years online. **Queries almost never touch data older than 6 months**, yet storage cost keeps growing.

Some records must be kept for years by law (for example, anti-money-laundering rules require customer records for **5 years after the relationship ends**), while UK GDPR says personal data shouldn't be kept longer than needed.`,
	businessContext:
		'Lifecycle design is where cost, query performance and regulation meet. The panel wants to see tiers that save money without silently breaking queries or retention duties.',
	primer: `**S3 storage classes** (from hot to cold):
- **Standard**: frequent access.
- **Standard-IA**: cheaper storage, a retrieval fee, still millisecond access.
- **Glacier Instant Retrieval**: cheaper again, **millisecond access**, so still queryable by Athena and Spectrum.
- **Glacier Flexible Retrieval**: restore takes minutes to hours.
- **Glacier Deep Archive**: cheapest, restore within about 12 hours.

**Athena and Spectrum cannot read Flexible Retrieval or Deep Archive objects** until they are restored. So "query cold data with Athena" only works for Instant Retrieval or restored data.

**Iceberg tables and lifecycle rules.** An Iceberg table's metadata points at specific data files. If a lifecycle rule moves files the table still references into Flexible Retrieval or Deep Archive, queries over that period **fail or hang**. Archive by expiring old partitions out of the live table first (or by keeping archived data in a separate archive location), not by moving live files underneath it.

**Intelligent-Tiering** moves objects between access tiers automatically based on use, for a small monitoring fee per object.

**Redshift RA3** separates compute from managed storage, and **Spectrum** reads S3 directly, so the warehouse only needs to hold what is queried interactively.

**Retention is per dataset.** Some data must be kept (regulatory), some must be deleted (no lawful basis). Lifecycle rules should encode both.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'What do people query, and how fast do they need it?',
		'Which storage classes are still queryable, and which need a restore?',
		'How do you archive data out of an Iceberg table without breaking it?',
		'Which data must be kept, and which must be deleted?'
	],
	level1Expert: `**Tier by access, keep queryable data queryable, archive by design, encode retention.**

- **Hot (0–13 months)**: Gold marts and recent Silver loaded in **Redshift** for interactive BI; the same months in S3 Standard as Iceberg.
- **Warm (13 months–2 years)**: still in the **live Iceberg tables**, on **Standard-IA or Glacier Instant Retrieval** (or Intelligent-Tiering), queried through **Athena or Spectrum**. Slower, still interactive.
- **Cold (2–10 years)**: **expired out of the live tables** into a separate archive location as compliance snapshots in **Deep Archive**, with a documented retrieval process (restore takes hours).
- **Retention encoded**: lifecycle rules by dataset and tag, including **deletion** when the legal basis ends (for example, 5 years after the relationship ends for customer due-diligence records).
- **Tell users**: queries over warm data are slower; cold data needs a request. Query routing goes through the Glue Data Catalog, so users don't need to know where data lives.`,
	level2: [
		{
			id: 'hot',
			question: 'What does Redshift hold?',
			options: [
				{ id: 'A', text: 'All 10 years', verdict: 'weak', feedback: 'Pays warehouse-class storage and maintenance for data nobody queries.' },
				{ id: 'B', text: 'The last 13 months or so: what BI queries interactively', verdict: 'best', feedback: 'Covers year-on-year comparisons while keeping the warehouse lean; older data stays reachable via Spectrum.' },
				{ id: 'C', text: 'Nothing: Spectrum over S3 for everything', verdict: 'ok', feedback: 'Cheapest, but daily dashboards would be slower and less predictable.' }
			],
			expert: `**Hold what BI queries interactively.** Thirteen months covers year-on-year; Spectrum reaches the rest.`
		},
		{
			id: 'warm',
			question: 'Where does 13 months to 2 years live?',
			options: [
				{ id: 'A', text: 'Glacier Flexible Retrieval', verdict: 'weak', feedback: 'Not queryable without a restore taking minutes to hours, and moving live Iceberg files there breaks queries.' },
				{
					id: 'B',
					text: 'Still in the live Iceberg tables, on Standard-IA or Glacier Instant Retrieval, queried via Athena/Spectrum',
					verdict: 'best',
					feedback: 'Cheaper storage, still millisecond access, and the tables keep working.'
				},
				{ id: 'C', text: 'Delete it to save money', verdict: 'weak', feedback: 'Breaks retention duties and year-on-year analysis.' }
			],
			expert: `**Cheaper but still queryable.** Instant Retrieval and Standard-IA keep millisecond access, so the Iceberg tables need no special handling.`
		},
		{
			id: 'cold',
			question: 'What happens to data older than 2 years?',
			options: [
				{
					id: 'A',
					text: 'Expire it from the live tables into archive snapshots in Deep Archive, with a retrieval process and retention-based deletion',
					verdict: 'best',
					feedback: 'Cheapest storage, live tables keep working, and retention is enforced both ways.'
				},
				{ id: 'B', text: 'Leave it in the live Iceberg tables and let lifecycle rules move the files to Deep Archive', verdict: 'weak', feedback: 'The table still references those files, so queries over that period fail or hang.' },
				{ id: 'C', text: 'Glacier Instant Retrieval for everything old', verdict: 'ok', feedback: 'Stays queryable, but pays more than needed for data almost nobody reads.' }
			],
			expert: `**Archive by design, not by moving files underneath a live table.** And encode deletion as well as retention.`
		}
	],
	level3: [
		{
			id: 'retrieval',
			prompt: 'Deep Archive saves a lot of storage cost but takes hours to retrieve. When is that acceptable?',
			expert:
				"When the only realistic reader is a regulator, auditor or complaints investigation, which works in days, not seconds. So compliance snapshots older than two years go there, with a documented restore runbook. Anything an analyst might query this quarter stays in a queryable tier. The trade-off is that an unexpected deep-history question takes a day to answer, and that's acceptable if we've agreed it with the business.",
			lookFor: ['regulator|audit|complain|compliance', 'runbook|restore|retriev', 'queryable|analyst', 'trade-?off|agreed|day']
		},
		{
			id: 'tell-users',
			prompt: 'Queries over older data are slow. Do you warn self-serve users, or hide old data?',
			expert:
				"Warn, don't hide. Hiding data makes people think it doesn't exist and they build their own copies. The catalogue labels each table's tiers, the query tool shows when a query reaches warm data and will be slower, and cold data has a clear request route. If warm queries became common, that's the signal to extend the hot window.",
			lookFor: ['warn|label|show|transparen', 'hide|hidden|copies', 'catalog', 'request|route', 'extend|hot window|signal']
		}
	],
	concepts: [
		{ id: 'tiers', label: 'Hot / warm / cold tiers by access pattern', patterns: ['hot', 'warm|cold'], importance: 'essential', why: 'Storage should match how often and how fast data is read.' },
		{ id: 'queryable', label: 'Know which tiers stay queryable (Instant Retrieval vs Flexible / Deep Archive)', patterns: ['instant retrieval|standard-ia|infrequent|queryable'], importance: 'essential', why: 'Athena and Spectrum cannot read Flexible Retrieval or Deep Archive objects without a restore.' },
		{ id: 'iceberg-safe', label: "Archive without moving files a live table still references", patterns: ['expir|archive location|separate|snapshot|live table'], importance: 'essential', why: 'Moving live Iceberg files to Deep Archive breaks queries.' },
		{ id: 'retention', label: 'Retention and deletion encoded per dataset', patterns: ['retention|retain|delet'], importance: 'essential', why: 'Regulation requires keeping some data and deleting other data.' },
		{ id: 'redshift-hot', label: 'Redshift holds only interactively-queried data', patterns: ['redshift', 'month'], importance: 'essential', why: 'Warehouse storage is for what BI queries, not for history.' },
		{ id: 'spectrum', label: 'Spectrum / Athena for warm data', patterns: ['spectrum|athena'], importance: 'bonus', why: 'Older data stays reachable without loading it into the warehouse.' },
		{ id: 'communicate', label: 'Tell users where data lives and how fast it is', patterns: ['catalog|label|warn|tell'], importance: 'bonus', why: 'Users should know why a query is slow, not discover it.' }
	],
	leadExplanation: {
		constraint:
			'The constraint is cutting the cost of 10 years of history without breaking queries or the retention rules regulators expect.',
		reasons: [
			'Almost nobody queries past 6 months, so Redshift holds about 13 months and the rest is reached through Spectrum.',
			'Warm data stays in the live Iceberg tables on Instant Retrieval or Standard-IA, because those classes keep millisecond access.',
			'Cold data is expired from the live tables into Deep Archive snapshots, because moving files a table still references would break its queries.'
		],
		tradeOff: 'Old questions get slower: warm queries take longer, and cold data takes hours to restore.',
		switchWhen:
			"If analysts started querying warm data every week, I'd extend the hot window rather than make everyone wait."
	},
	leadSays: {
		hot: 'BI queries the last year or so, so Redshift holds about 13 months, enough for year-on-year. Spectrum reaches anything older without loading it.',
		warm: 'Warm data still gets queried occasionally, so it stays in the live Iceberg tables on Instant Retrieval or Standard-IA, which keep millisecond access. Flexible Retrieval would need a restore and break the tables.',
		cold: "A live Iceberg table points at specific files, so we can't just move them to Deep Archive. Cold data is expired out of the table into archive snapshots, with a restore runbook and deletion when retention ends."
	},
	leadPhrases: [
		'"Tier by how data is read, not by how old it is alone."',
		'"Instant Retrieval stays queryable; Flexible and Deep Archive need a restore."',
		'"We archive out of the table, not underneath it."',
		'"Retention works both ways: keep what the law needs, delete what it doesn\'t."',
		'"Warn users about slow tiers; don\'t hide the data."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll move everything older than 6 months to Glacier and query it with Athena."',
			problem: 'Athena cannot read Flexible Retrieval or Deep Archive without a restore, and moving live Iceberg files breaks the table.'
		},
		{
			sounds: '"Storage is cheap, so we keep everything forever."',
			problem: 'Ignores the cost curve and the duty under UK GDPR not to keep personal data longer than needed.'
		}
	],
	watchOutFor: [
		'Treating all Glacier classes as the same.',
		'Lifecycle rules that move files a live Iceberg table still references.',
		'Forgetting deletion: retention is a maximum as well as a minimum.',
		'Not saying how users find out that old data is slower.'
	],
	sixtySecond:
		"The constraint is cutting the cost of 10 years of history without breaking queries or retention. Redshift holds about 13 months, because that's what BI queries. From 13 months to 2 years, data stays in the live Iceberg tables on Instant Retrieval or Standard-IA, so Athena and Spectrum can still read it. Older data is expired out of the tables into Deep Archive snapshots, because moving files a table still references would break it, with a restore runbook and deletion when retention ends. The trade-off is slower answers to old questions. If analysts queried warm data weekly, I'd extend the hot window.",
	defend: [
		{
			question: 'Why not Intelligent-Tiering for everything?',
			answer:
				"It's a good default for unpredictable access, and I'd use it for warm data. For data we know is cold and compliance-only, an explicit move to Deep Archive is cheaper, and the per-object monitoring fee adds up across many small files."
		},
		{
			question: 'How do lifecycle rules know what to delete?',
			answer:
				'Datasets carry tags for their retention basis and end date; a scheduled job expires Iceberg snapshots and partitions past retention, and S3 lifecycle rules delete archive objects whose retention tag has passed. Erasure requests use the identity vault and crypto-shredding.'
		},
		{
			question: 'What does it save?',
			answer:
				"I'd model it from the bucket inventory: bytes per tier times price, before and after. The saving comes mostly from the cold years; the bigger risk to get right is not breaking queries."
		}
	],
	juniorVsLead: {
		junior: "We'd just move old data to Glacier and use Athena for anything old. Storage is cheap so it's fine to keep everything.",
		lead: "The constraint is cutting the cost of 10 years of history without breaking queries or retention. Redshift holds about 13 months; warm data stays in the live Iceberg tables on Instant Retrieval, so it remains queryable; cold data is expired into Deep Archive snapshots with a restore runbook and deletion when retention ends. The trade-off is slower answers to old questions. If warm queries became weekly, I'd extend the hot window.",
		whyBetter: [
			'Knows which storage classes are queryable',
			'Archives without breaking live tables',
			'Treats retention as both keep and delete',
			'States what would change the design'
		]
	},
	relatedSets: [
		{ id: 'bronze', label: 'Bronze' },
		{ id: 'governance', label: 'Masking, quarantine & redaction' }
	]
};

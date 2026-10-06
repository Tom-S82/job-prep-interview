import type { CapstonePart } from './index.ts';

export const partB: CapstonePart = {
	id: 'medallion-b-layout',
	letter: 'B',
	nodes: ['silver', 'gold', 'redshift'],
	title: 'B · Query layout: partitioning, sorting and aggregates',
	summary: 'Make date-range queries and per-customer queries both fast without duplicating Silver.',
	context: `Silver transactions are **partitioned by transaction date**. "All transactions for customer X in October" is fast. **"Top 100 customers by lifetime spend"** scans every partition and takes minutes.

You want both access patterns to perform well **without keeping two full copies** of a table that grows by up to 50 million rows an hour at peak.`,
	businessContext:
		'Layout decisions are cheap to make early and expensive to change later. The panel wants to see that you know which problems layout solves and which it cannot.',
	primer: `**Partitioning** splits a table into separate folders by a value (e.g. one per day). A query filtering on that value skips whole partitions. Too many partitions (e.g. one per customer) creates millions of tiny files and slows everything.

**Sorting / clustering** orders rows *within* files. Parquet keeps min/max statistics per file and row group, so a query for one customer can skip files whose range doesn't include them. Iceberg sets this with a **sort order** and a compaction job (\`rewrite_data_files\`, optionally Z-order across several columns). Parquet **bloom filters** help with exact-match lookups on high-cardinality columns.

**Iceberg hidden partitioning**: partition by \`day(transaction_ts)\` and queries filtering on the timestamp benefit automatically. **Partition evolution** is a metadata change: old files keep the old layout, new writes use the new one. Rewriting old data is a separate, optional job.

**Redshift** tables have no partitions and no secondary indexes. They use a **distribution key** (which node holds a row; good for joins) and a **sort key** (zone maps skip blocks). Partitions exist only on Spectrum external tables.

**Some queries are not layout problems.** "Top 100 by lifetime spend" reads all of history whatever the layout. The fix is a **pre-aggregated table**, maintained incrementally.`,
	level1Prompt: "You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?",
	level1Hints: [
		'Which query is a partitioning problem, which is a sorting problem, and which is neither?',
		'What is the difference between partitioning by date and sorting by customer?',
		'How does the same idea translate to Redshift, which has no partitions?',
		'What would you pre-compute instead of trying to make a scan fast?'
	],
	level1Expert: `**Partition for time, sort for customers, aggregate for history.**

- **Partition Silver by day(transaction_ts)**: most queries and all lifecycle rules are time-based, and Iceberg's hidden partitioning means users just filter on the timestamp.
- **Sort within partitions by customer_id** (compaction with a sort order, Z-order on customer_id and merchant if both are common filters), so per-customer queries skip most files using min/max statistics. Add a bloom filter on customer_id for exact lookups.
- **"Top 100 by lifetime spend" is not a layout problem**: it reads all history. Maintain **gold.customer_spend** incrementally from each hour's delta, so the query reads one small table.
- **In Redshift**, the transaction fact uses **DISTKEY(customer_id)** for joins and a **SORTKEY on transaction_date** so date filters skip blocks; no indexes exist to add.
- **Measure before changing**: query history shows which patterns matter; partition evolution is cheap, rewrites are not.`,
	level2: [
		{
			id: 'partition',
			question: 'How do you partition the Silver transactions table?',
			options: [
				{ id: 'A', text: 'By day(transaction_ts)', verdict: 'best', feedback: 'Matches most filters and all lifecycle rules, with a manageable number of partitions.' },
				{ id: 'B', text: 'By customer_id', verdict: 'weak', feedback: 'Millions of tiny partitions and files; date-range queries scan everything.' },
				{ id: 'C', text: 'By both date and customer_id', verdict: 'weak', feedback: 'Partition explosion: days × customers, each with a handful of rows.' }
			],
			expert: `**Partition by day.** Partitions should be few and large. Time is the dimension almost every query and every retention rule uses.`
		},
		{
			id: 'within',
			question: 'How is data ordered inside each partition?',
			options: [
				{ id: 'A', text: 'Leave it in arrival order', verdict: 'weak', feedback: 'Every file contains every customer, so per-customer queries cannot skip anything.' },
				{
					id: 'B',
					text: 'Sort by customer_id via compaction (Z-order if several columns), plus a bloom filter on customer_id',
					verdict: 'best',
					feedback: 'File statistics let per-customer queries skip most files without duplicating data.'
				},
				{ id: 'C', text: 'Add bucket(16, customer_id) as a second partition field', verdict: 'ok', feedback: 'Helps some joins, but multiplies files per day; sorting usually gives the same benefit more cheaply.' }
			],
			expert: `**Sort within partitions.** Partitioning decides which folders a query reads; sorting decides how many files inside them it can skip.`
		},
		{
			id: 'lifetime',
			question: 'How do you make "top 100 customers by lifetime spend" fast?',
			options: [
				{ id: 'A', text: 'Run it on a bigger cluster', verdict: 'weak', feedback: 'Pays to scan all history every time; the cost grows forever.' },
				{
					id: 'B',
					text: 'Maintain a Gold customer_spend aggregate, updated incrementally from each hour\'s delta',
					verdict: 'best',
					feedback: 'The query reads one small table; the work is done once per hour on new data only.'
				},
				{ id: 'C', text: 'Keep a second copy of Silver partitioned by customer', verdict: 'ok', feedback: 'Works, but duplicates the largest table and doubles maintenance.' }
			],
			expert: `**Aggregate it.** A query that needs all of history is a modelling problem, not a layout problem. Pre-compute it incrementally in Gold.`
		},
		{
			id: 'redshift',
			question: 'How do you lay out the transaction fact in Redshift?',
			options: [
				{
					id: 'A',
					text: 'DISTKEY(customer_id) and SORTKEY(transaction_date), or AUTO with those as starting hints',
					verdict: 'best',
					feedback: 'Customer joins stay on one node; date filters skip blocks via zone maps.'
				},
				{ id: 'B', text: 'Add indexes on customer_id and transaction_date', verdict: 'weak', feedback: 'Redshift has no secondary indexes; sort keys and zone maps play that role.' },
				{ id: 'C', text: 'DISTSTYLE ALL', verdict: 'weak', feedback: 'Copies the whole table to every node: fine for small dimensions, not for a large fact.' }
			],
			expert: `**Distribution for joins, sort key for filters.** The vocabulary matters: in Redshift you tune distribution and sort keys, not partitions or indexes.`
		}
	],
	level3: [
		{
			id: 'which-matters',
			prompt: 'If you partition by customer_id you fix "lifetime spend" but break date-range queries. Which matters more?',
			expert:
				"Date-range queries, because they are most of the workload and every retention rule is time-based. Partitioning by customer would also create millions of tiny partitions. So I keep day partitions, sort by customer within them, and solve lifetime spend with a Gold aggregate. The trade-off is one more incremental model to maintain.",
			lookFor: ['date|time|day', 'tiny|small files|millions', 'sort|cluster', 'aggregat|gold', 'trade-?off']
		},
		{
			id: 'redshift-partitions',
			prompt: 'Someone says "Redshift sort keys work within a table but not across partitions." How do you respond?',
			expert:
				'I would correct the premise gently: Redshift local tables have no partitions. Sort keys and zone maps already let a query skip blocks across the whole table; partitions only exist on Spectrum external tables over S3. So the design question is the distribution and sort key for the fact table, and partitioning for the Iceberg data Spectrum reads.',
			lookFor: ['no partitions|don.?t have partitions|not partitioned', 'zone map|skip', 'spectrum|external', 'distribution|distkey']
		},
		{
			id: 'evolution',
			prompt: 'Iceberg lets you change partitioning later. When would you rewrite existing data, given the volume?',
			expert:
				"Partition evolution itself is a metadata change: old files keep the old layout, new writes use the new one, and queries handle both. I'd only rewrite old data if query history showed the old layout was hurting important queries, and then rewrite recent, frequently read partitions in the background, not all ten years.",
			lookFor: ['metadata', 'old (files|data)|existing', 'query history|measure|evidence', 'recent|background|not all']
		}
	],
	concepts: [
		{ id: 'partition-date', label: 'Partition by date (few, large partitions)', patterns: ['partition', 'day|date|time'], importance: 'essential', why: 'Time is what most queries and all lifecycle rules filter on.' },
		{ id: 'sort', label: 'Sort or cluster within partitions by customer', patterns: ['sort|cluster|z-?order'], importance: 'essential', why: 'Sorting lets per-customer queries skip files without a second copy.' },
		{ id: 'aggregate', label: 'Pre-aggregate whole-history questions in Gold', patterns: ['aggregat', 'gold|lifetime'], importance: 'essential', why: 'Queries over all history are a modelling problem, not a layout problem.' },
		{ id: 'redshift-keys', label: 'Redshift distribution and sort keys (no indexes)', patterns: ['distkey|distribution|sort ?key|zone map'], importance: 'essential', why: 'The correct Redshift vocabulary; there are no partitions or secondary indexes.' },
		{ id: 'stats', label: 'File statistics, bloom filters, file skipping', patterns: ['statistic|min/max|bloom|skip'], importance: 'bonus', why: 'This is the mechanism that makes sorting pay off.' },
		{ id: 'evolution', label: 'Partition evolution is metadata-only', patterns: ['evolution|metadata'], importance: 'bonus', why: 'Knowing changes are cheap removes fear of getting it slightly wrong.' },
		{ id: 'measure', label: 'Decide from query history', patterns: ['query history|measure|access pattern'], importance: 'bonus', why: 'Layout should follow real queries, not guesses.' }
	],
	leadExplanation: {
		constraint: 'The constraint is two access patterns on one very large table, without paying for two full copies of it.',
		reasons: [
			'Partitioning by day matches most queries and every retention rule, with partitions that stay large.',
			'Sorting by customer inside each day lets per-customer queries skip most files, because Parquet keeps min/max statistics.',
			'Whole-history questions such as lifetime spend read everything whatever the layout, so they belong in an incrementally maintained Gold aggregate.'
		],
		tradeOff: 'Compaction jobs to keep files sorted, and one more Gold model to maintain incrementally.',
		switchWhen:
			"If per-customer lookups became the dominant, latency-critical pattern (say, a customer-facing API), I'd serve them from an operational store keyed by customer rather than reshape the lake."
	},
	leadSays: {
		partition: 'Partitions should be few and large, and almost every query and retention rule uses time, so Silver is partitioned by day. Per-customer speed comes from sorting, not partitioning.',
		within: 'Partitioning only decides which folders a query reads, so inside each day we sort by customer through compaction, with a bloom filter for exact lookups. That costs a compaction job, but avoids a second copy.',
		lifetime: "Lifetime spend reads all of history however we lay it out, so I'd stop trying to make the scan fast and maintain a Gold aggregate incrementally from each hour's delta. The query then reads one small table.",
		redshift: 'Redshift has no partitions or indexes, so the levers are distribution and sort keys: customer_id as the distribution key for joins, transaction date as the sort key so zone maps skip blocks.'
	},
	leadPhrases: [
		'"Partition for time, sort for customers, aggregate for history."',
		'"That\'s not a layout problem; it reads all of history, so we pre-aggregate it."',
		'"In Redshift the levers are distribution and sort keys, not partitions or indexes."',
		'"Partition evolution is a metadata change; rewriting old data is a separate decision."',
		'"Let the query history decide the layout."'
	],
	antiPatterns: [
		{
			sounds: '"We\'ll partition by customer and date so every query is fast."',
			problem: 'Creates millions of tiny partitions and makes most queries slower. Partitions must be few and large.'
		},
		{
			sounds: '"We\'ll add indexes to Redshift."',
			problem: 'Redshift has no secondary indexes. Using the wrong vocabulary signals you have not tuned it.'
		}
	],
	watchOutFor: [
		'Treating every slow query as a partitioning problem.',
		'Using "partition" and "cluster" interchangeably. Explain the difference.',
		'Proposing a duplicate table before considering sort order and aggregates.',
		'Saying "indexes" for Redshift or Iceberg.'
	],
	sixtySecond:
		"The constraint is two access patterns on one huge table without paying for two copies. Silver is partitioned by day, because time is what most queries and every retention rule use. Inside each day, data is sorted by customer through compaction, so per-customer queries skip most files using Parquet statistics. Lifetime spend reads all history whatever the layout, so it's a Gold aggregate maintained incrementally. In Redshift that becomes a distribution key on customer and a sort key on date. The trade-off is compaction and one more model. If per-customer lookups became latency-critical, I'd serve them from an operational store.",
	defend: [
		{
			question: "Why not Z-order on everything?",
			answer:
				'Z-ordering on many columns dilutes the benefit for each one and makes compaction expensive. Pick the one or two columns that real queries filter on, from query history.'
		},
		{
			question: 'How often does compaction run?',
			answer:
				"Hourly CDC creates many small files, so compaction runs on recently written partitions, for example nightly for yesterday's partitions. Old partitions rarely change, so they rarely need rewriting."
		},
		{
			question: 'Would you use interleaved sort keys in Redshift?',
			answer:
				'Rarely: they cost more to maintain and suit tables queried equally on several columns. A compound sort key on date, plus AUTO tuning, is the usual starting point.'
		}
	],
	juniorVsLead: {
		junior: "We'd partition by customer and date and add indexes, so every query is fast and it's scalable.",
		lead: "The constraint is two access patterns on one huge table without two copies. So I partition by day, sort by customer within each day so per-customer queries skip files, and put lifetime spend in a Gold aggregate, because that reads all history whatever the layout. In Redshift that's a customer distribution key and a date sort key. The trade-off is compaction. If customer lookups became latency-critical, I'd serve them from an operational store.",
		whyBetter: [
			'Separates partitioning, sorting and aggregation',
			'Uses the correct Redshift vocabulary',
			'Recognises a query that layout cannot fix',
			'Names the trade-off and when it would change'
		]
	},
	relatedSets: [
		{ id: 'silver', label: 'Silver' },
		{ id: 'gold', label: 'Gold' }
	]
};

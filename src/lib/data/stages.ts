import {
	ingestionQuestions,
	validationQuestions,
	bronzeQuestions,
	silverQuestions,
	goldQuestions
} from './questions.ts';

export type StageStatus = 'keep' | 'rebuild' | 'new';

export interface InterviewQuestion {
	q: string;
	a?: string; // TODO: model answers
}

export interface Stage {
	id: string;
	label: string;
	sub: string;
	status: StageStatus;
	problem: string;
	good: string[];
	implementation: string[];
	pitfalls: string[];
	questions: InterviewQuestion[];
	oneLiner: string;
}

export const statusMeta: Record<StageStatus, { label: string; color: string }> = {
	keep: { label: 'Keep & evolve', color: '#34d399' },
	rebuild: { label: 'Re-architect', color: '#fbbf24' },
	new: { label: 'New build', color: '#38bdf8' }
};

export const stages: Stage[] = [
	{
		id: 'sources',
		label: 'Sources',
		sub: 'SQL Server · Kinesis events · S3 files',
		status: 'keep',
		problem:
			'Data originates in many systems with different shapes, latencies and owners. Without a clear inventory you cannot reason about freshness, PII or blast radius.',
		good: [
			'A catalogued list of every source with owner, SLA, volume and PII classification',
			'Clear split between transactional (SQL Server OLTP) and event (app / card auth) sources',
			'Source teams agree data contracts before schema changes ship'
		],
		implementation: [
			'SQL Server 2019 OLTP stays the system of record — do not touch what works',
			'Card authorisations, app clickstream and payment events identified as streaming candidates',
			'Third-party feeds (bureau, fraud vendors) landed as files to S3 with manifests'
		],
		pitfalls: [
			'Undocumented upstream schema changes silently breaking pipelines',
			'Card PAN data leaking into analytics sources (PCI-DSS scope creep)'
		],
		questions: [
			{ q: 'How would you audit the existing sources in your first 30 days?' },
			{ q: 'How do you agree data contracts with upstream product teams?' }
		],
		oneLiner: 'Know every source, its owner and its sensitivity before you move a single row.'
	},
	{
		id: 'ingestion',
		label: 'Ingestion',
		sub: 'SSIS CDC (batch) + Kinesis (stream)',
		status: 'keep',
		problem:
			'Getting data out of operational systems reliably, incrementally and without hurting production — at both batch and real-time latency.',
		good: [
			'Incremental, idempotent loads: replays never duplicate',
			'Batch and streaming paths land in the same Bronze contract',
			'Lag, throughput and failure metrics visible on one dashboard'
		],
		implementation: [
			'Keep SSIS CDC for SQL Server batch — it works; wrap it with monitoring and alerting',
			'Add Kinesis Data Streams for card/app events; Firehose to S3 for durable landing',
			'Consider DMS CDC as a later migration path, not a day-one rewrite'
		],
		pitfalls: [
			'Rebuilding SSIS just because it is old — contradicts "evolve and reuse"',
			'CDC LSN gaps after log truncation causing silent data loss',
			'Kinesis shard hot-spotting on a skewed partition key'
		],
		questions: ingestionQuestions,
		oneLiner: 'Keep the CDC that works, add streaming beside it — not instead of it.'
	},
	{
		id: 'validation',
		label: 'Validation',
		sub: 'Schema · quality · quarantine',
		status: 'new',
		problem:
			'Bad data that reaches Gold destroys trust in every report and model. In a regulated firm it can also mean wrong regulatory returns.',
		good: [
			'Schema, null, range and referential checks run on every load',
			'Failing records quarantined, not dropped — with reason codes',
			'Quality SLAs per dataset, reported to owners'
		],
		implementation: [
			'dbt tests + Great Expectations / Soda on Silver models',
			'Dead-letter queue for streaming records that fail schema validation',
			'Reconciliation checks: row counts and balances vs SQL Server source'
		],
		pitfalls: [
			'Tests that only check not-null and give false confidence',
			'Alert fatigue — every check paging someone at 3am'
		],
		questions: validationQuestions,
		oneLiner: 'Quarantine, don’t delete — bad data is evidence.'
	},
	{
		id: 'bronze',
		label: 'Bronze',
		sub: 'Raw, immutable, replayable',
		status: 'rebuild',
		problem:
			'You need a faithful, append-only copy of source data so you can reprocess history when logic changes or bugs are found.',
		good: [
			'Immutable, append-only, partitioned by ingest date',
			'Source metadata on every row (load id, source LSN, ingest timestamp)',
			'Encrypted at rest; PCI data tokenised before landing'
		],
		implementation: [
			'S3 (or Iceberg tables) as Bronze, replacing ad-hoc SQL Server staging tables',
			'Lifecycle rules for retention aligned to FCA record-keeping requirements',
			'Lake Formation / IAM to restrict raw access to engineers only'
		],
		pitfalls: [
			'Transforming in Bronze — you lose the ability to replay',
			'Unbounded retention creating GDPR right-to-erasure headaches'
		],
		questions: bronzeQuestions,
		oneLiner: 'Bronze is your time machine — never edit it.'
	},
	{
		id: 'silver',
		label: 'Silver',
		sub: 'Cleaned, conformed, deduped',
		status: 'rebuild',
		problem:
			'Raw data is duplicated, inconsistently typed and keyed per source. Silver produces one trustworthy, conformed version of each entity.',
		good: [
			'One row per business entity version (SCD2 where history matters)',
			'Conformed keys: one customer id across banking, cards and app',
			'Transformations in version-controlled dbt models with tests'
		],
		implementation: [
			'dbt models over Bronze; incremental merges keyed on CDC LSN / event id',
			'Customer identity resolution as the foundation of the Customer Data Platform',
			'PII columns tagged and masked by policy'
		],
		pitfalls: [
			'Business logic leaking into Silver instead of Gold',
			'Late-arriving streaming events breaking incremental models'
		],
		questions: silverQuestions,
		oneLiner: 'Silver answers "what is true?" — Gold answers "what does it mean?"'
	},
	{
		id: 'gold',
		label: 'Gold',
		sub: 'Business-ready marts · staged & aggregated',
		status: 'rebuild',
		problem:
			'Analysts and executives need performant, well-named datasets that map to business questions, not source tables.',
		good: [
			'Star schemas / marts per domain: customers, payments, risk, finance',
			'Each mart has an owner, documentation and freshness SLA',
			'Power BI reads from Gold only — no direct source queries'
		],
		implementation: [
			'dbt marts with exposures documenting which Power BI reports depend on them',
			'Migrate high-value SSIS-built reports first; retire duplicates',
			'Regulatory datasets (FCA returns) given stricter tests and sign-off'
		],
		pitfalls: [
			'Mart sprawl — five definitions of "active customer"',
			'Big-bang migration of every report at once'
		],
		questions: goldQuestions,
		oneLiner: 'Gold is a product with customers — give it owners and SLAs.'
	},
	{
		id: 'semantic',
		label: 'Semantic',
		sub: 'Metrics layer · MCP server',
		status: 'new',
		problem:
			'Metrics are defined inside individual Power BI reports, so numbers disagree — and there is no governed way for Claude/LLMs to query data.',
		good: [
			'Each metric defined once (e.g. dbt Semantic Layer / Cube) and reused everywhere',
			'MCP server exposes governed metrics, not raw tables, to Claude',
			'Row-level security and PII masking enforced at this layer'
		],
		implementation: [
			'Define core metrics in the semantic layer: balances, active customers, arrears',
			'Build an MCP server offering read-only metric tools with audit logging',
			'Power BI and Claude both consume the same definitions'
		],
		pitfalls: [
			'Giving an LLM raw SQL access to card or PII data',
			'No audit trail of what the AI queried — an FCA problem'
		],
		questions: [
			{ q: 'How would you safely expose data to Claude via MCP in an FCA-regulated firm?' },
			{ q: 'What is a semantic layer and why does thinkmoney need one now?' }
		],
		oneLiner: 'Define the metric once; let humans and AI ask the same question and get the same answer.'
	},
	{
		id: 'apis',
		label: 'Consumers',
		sub: 'Power BI · self-serve AI (Claude via MCP)',
		status: 'new',
		problem:
			'Data only creates value when it reaches decisions — dashboards, product features, models and AI assistants.',
		good: [
			'Every consumer reads through governed interfaces (semantic layer, APIs)',
			'Usage is measured so unused assets can be retired',
			'Feedback loop from consumers to data owners'
		],
		implementation: [
			'Power BI on the semantic layer; Claude via MCP; real-time APIs for fraud / app features',
			'Data science gets Silver/Gold access in a sandboxed account',
			'Claude Code used by the engineering team to build and test pipelines faster'
		],
		pitfalls: [
			'Consumers bypassing layers and querying sources directly',
			'Shipping dashboards nobody uses'
		],
		questions: [
			{ q: 'How do you measure the value the data platform delivers?' },
			{ q: 'How would your team use Claude Code day-to-day?' }
		],
		oneLiner: 'If no one consumes it, it isn’t a data product — it’s a cost.'
	}
];

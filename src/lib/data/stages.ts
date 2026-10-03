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
	governance: Governance;
}

export const statusMeta: Record<StageStatus, { label: string; color: string }> = {
	keep: { label: 'Keep & evolve', color: '#34d399' },
	rebuild: { label: 'Re-architect', color: '#fbbf24' },
	new: { label: 'New build', color: '#38bdf8' }
};

const baseStages: Omit<Stage, 'governance'>[] = [
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

// --- Governance (cross-cutting lenses) ---

export type LensId = 'security' | 'lifecycle' | 'lineage' | 'compliance';
export type Level = 'high' | 'medium' | 'low' | 'none';

export interface LensInfo {
	level: Level;
	tag: string; // short label shown on the diagram
	detail: string;
}

export interface Governance {
	security: LensInfo;
	lifecycle: LensInfo;
	lineage: LensInfo;
	compliance: LensInfo;
	handlesPII: boolean;
	retention: string | null;
	erasure: string; // how a right-to-erasure request is applied at this stage
}

export const lenses: {
	id: LensId;
	label: string;
	question: string;
	legend: Record<Level, { label: string; color: string }>;
}[] = [
	{
		id: 'security',
		label: 'Security',
		question: 'How sensitive is the data here, and who can see it?',
		legend: {
			high: { label: 'Raw PII / PCI', color: '#f87171' },
			medium: { label: 'PII tagged & masked', color: '#fbbf24' },
			low: { label: 'Pseudonymised / governed', color: '#34d399' },
			none: { label: 'No customer data', color: '#64748b' }
		}
	},
	{
		id: 'lifecycle',
		label: 'Lifecycle',
		question: 'How long is it kept, where does it go cold, and when is it deleted?',
		legend: {
			high: { label: 'Long-term + archive tiers', color: '#60a5fa' },
			medium: { label: 'Retained with expiry', color: '#a78bfa' },
			low: { label: 'Short-lived / cache', color: '#94a3b8' },
			none: { label: 'Not stored', color: '#475569' }
		}
	},
	{
		id: 'lineage',
		label: 'Lineage',
		question: 'Can we trace any value here back to its source record?',
		legend: {
			high: { label: 'Row/column-level lineage', color: '#34d399' },
			medium: { label: 'Dataset-level lineage', color: '#fbbf24' },
			low: { label: 'Catalogue entry only', color: '#f87171' },
			none: { label: 'Untracked', color: '#475569' }
		}
	},
	{
		id: 'compliance',
		label: 'Compliance',
		question: 'Which obligations bite here: GDPR, PCI-DSS, FCA, audit?',
		legend: {
			high: { label: 'Primary control point', color: '#f472b6' },
			medium: { label: 'Supporting control', color: '#a78bfa' },
			low: { label: 'Inherits controls', color: '#64748b' },
			none: { label: 'Out of scope', color: '#475569' }
		}
	}
];

const governance: Record<string, Governance> = {
	sources: {
		security: {
			level: 'high',
			tag: 'Full PII · PAN',
			detail:
				'SQL Server holds names, addresses, DOB and contact details. Card PANs stay with the card processor inside the PCI zone and are never extracted.'
		},
		lifecycle: {
			level: 'medium',
			tag: 'System of record',
			detail:
				'Retention is owned by the source application. Financial and KYC records are kept 5 years after the relationship ends (MLR 2017).'
		},
		lineage: {
			level: 'low',
			tag: 'Catalogue + owner',
			detail:
				'Each source table is catalogued with an owner, a data contract and a PII classification. This is where lineage starts.'
		},
		compliance: {
			level: 'high',
			tag: 'GDPR · PCI scope',
			detail:
				'Erasure in the system of record is an operational process. The data platform must mirror it, not replace it.'
		},
		handlesPII: true,
		retention: 'Owned by source system (MLR: 5y after relationship end)',
		erasure: 'Ops process in the system of record; emits an erasure event the platform subscribes to'
	},
	ingestion: {
		security: {
			level: 'high',
			tag: 'TLS · KMS · tokenise',
			detail:
				'PAN-like fields are tokenised before entering Kinesis. Streams are KMS-encrypted, and producers and consumers have separate IAM roles.'
		},
		lifecycle: {
			level: 'low',
			tag: 'Stream TTL 24h–7d',
			detail: 'Kinesis retention is short by design. Firehose lands everything in S3 Bronze, which is the durable copy.'
		},
		lineage: {
			level: 'high',
			tag: 'LSN · seq · load_id',
			detail:
				'Every record gets its CDC LSN or Kinesis sequence number and a load_id linking it back to the orchestration run.'
		},
		compliance: {
			level: 'high',
			tag: 'PCI boundary',
			detail: 'Tokenising at ingestion keeps the whole analytics platform out of PCI-DSS cardholder-data scope.'
		},
		handlesPII: true,
		retention: 'Kinesis 24h (max 7d); SSIS staging truncated per run',
		erasure: 'Expires naturally; no action needed beyond the stream TTL'
	},
	validation: {
		security: {
			level: 'high',
			tag: 'PII in quarantine',
			detail: 'Quarantined payloads are raw and can contain PII, so the DLQ gets the same access controls as Bronze.'
		},
		lifecycle: {
			level: 'medium',
			tag: 'DLQ 30d',
			detail: 'Quarantined records are replayed or purged within 30 days. Nothing is kept "just in case".'
		},
		lineage: {
			level: 'high',
			tag: 'Rule id · load_id',
			detail: 'Each reject records the rule that failed, the load_id and the source key, so it can be traced and replayed.'
		},
		compliance: {
			level: 'medium',
			tag: 'Audit trail',
			detail: 'The quarantine log is evidence of data-quality controls for audit and the FCA.'
		},
		handlesPII: true,
		retention: '30 days',
		erasure: 'Purge matching records from the DLQ / quarantine table'
	},
	bronze: {
		security: {
			level: 'high',
			tag: 'Raw · engineers only',
			detail:
				'Raw, append-only data. Lake Formation limits access to the platform team, with a KMS key per domain. Direct identifiers are split into an identity vault.'
		},
		lifecycle: {
			level: 'high',
			tag: 'Std → IA → Glacier',
			detail:
				'S3 Standard for 90 days, Infrequent Access until 1 year, then Glacier Deep Archive. Expired 6 years after the relationship ends.'
		},
		lineage: {
			level: 'high',
			tag: 'Row-level envelope',
			detail:
				'Every row carries its source, LSN or event id, operation type, event and ingest times, load_id, schema version and a payload hash.'
		},
		compliance: {
			level: 'high',
			tag: 'Art.17 vs MLR',
			detail:
				'Erasure is in tension with immutability and legal retention. It is handled with Iceberg row deletes for hot data and crypto-shredding of identity-vault keys for archives.'
		},
		handlesPII: true,
		retention: '6 years after relationship end; archive tiers after 90d / 1y',
		erasure: 'Iceberg row delete (hot) · crypto-shred identity key (archived) · legal hold if MLR applies'
	},
	silver: {
		security: {
			level: 'medium',
			tag: 'Tagged + masked',
			detail:
				'PII columns are tagged in the catalogue and masked by default. Only roles with a recorded justification can unmask.'
		},
		lifecycle: {
			level: 'medium',
			tag: 'SCD2 · 6y',
			detail: 'Change history is kept for 6 years. Rebuildable from Bronze, so it does not need archiving.'
		},
		lineage: {
			level: 'high',
			tag: 'Column-level (dbt)',
			detail: 'The dbt graph gives column-level lineage from each Silver column back to its Bronze fields.'
		},
		compliance: {
			level: 'high',
			tag: 'Consent applied',
			detail: 'Consent and erasure flags are applied here, so everything downstream inherits them.'
		},
		handlesPII: true,
		retention: '6 years (rebuildable from Bronze)',
		erasure: 'Delete or pseudonymise rows for the subject, then rebuild affected incremental models'
	},
	gold: {
		security: {
			level: 'low',
			tag: 'Pseudonymised',
			detail: 'Marts use a surrogate customer_key. Direct identifiers exist only in a restricted CRM mart.'
		},
		lifecycle: {
			level: 'medium',
			tag: 'Snapshots → Glacier',
			detail:
				'Regulatory snapshots move to Glacier after 1 year and are kept 7 years. Other marts are rebuilt rather than archived.'
		},
		lineage: {
			level: 'high',
			tag: 'dbt exposures',
			detail: 'Exposures link each mart to the Power BI reports and MCP tools that depend on it.'
		},
		compliance: {
			level: 'medium',
			tag: 'FCA · Consumer Duty',
			detail:
				'Regulatory datasets are signed off. Historic submitted snapshots are frozen: if a subject is erased, they are pseudonymised, never altered.'
		},
		handlesPII: true,
		retention: '7 years for regulatory snapshots; others rebuilt',
		erasure: 'Rebuild from Silver; frozen regulatory snapshots keep only the surrogate key'
	},
	semantic: {
		security: {
			level: 'low',
			tag: 'RLS · no raw PII',
			detail:
				'Exposes metrics and dimensions, not rows. Row-level security is applied per role. MCP tools cannot select PII columns.'
		},
		lifecycle: {
			level: 'none',
			tag: 'Definitions only',
			detail: 'Stores metric definitions, not data, apart from short-lived query caches.'
		},
		lineage: {
			level: 'high',
			tag: 'Metric → model',
			detail: 'Every metric resolves to the dbt models and columns it is built from.'
		},
		compliance: {
			level: 'medium',
			tag: 'AI access policy',
			detail:
				'Decides what Claude is allowed to ask. Aggregates only, with minimum group sizes to prevent re-identification.'
		},
		handlesPII: false,
		retention: null,
		erasure: 'Nothing stored, so changes upstream flow through automatically; caches are invalidated'
	},
	apis: {
		security: {
			level: 'low',
			tag: 'Role-based · audited',
			detail: 'Power BI uses RLS. Every MCP tool call is logged with the user, the prompt context and the query.'
		},
		lifecycle: {
			level: 'low',
			tag: 'Cache · logs 1y',
			detail:
				'Power BI dataset caches refresh daily. MCP audit logs are kept 1 year with personal identifiers redacted.'
		},
		lineage: {
			level: 'medium',
			tag: 'Usage tracked',
			detail: 'Usage stats and exposures show who consumes what, which also tells us what can be retired.'
		},
		compliance: {
			level: 'high',
			tag: 'Audit every AI query',
			detail:
				'Audit logs of AI access are a control in their own right. Personal data in prompts or responses is redacted in the logs.'
		},
		handlesPII: false,
		retention: 'BI cache 24h · MCP audit logs 1 year',
		erasure: 'Refresh BI datasets; redact the subject from MCP logs and cached exports'
	}
};

export const stages: Stage[] = baseStages.map((s) => ({ ...s, governance: governance[s.id] }));

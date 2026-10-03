// Right-to-erasure (GDPR Art.17) scenarios, traced backwards through the platform.
// Key principle: erasure is not absolute. Art.17(3)(b) exempts data we are legally obliged
// to keep (e.g. MLR 2017: customer due diligence and transaction records for 5 years after
// the business relationship ends). The platform must delete what it can, restrict what it
// must keep, and schedule the rest for deletion when the legal basis expires.

export type ErasureAction = 'delete' | 'crypto-shred' | 'pseudonymise' | 'retain' | 'schedule' | 'none';

export const actionMeta: Record<ErasureAction, { label: string; color: string }> = {
	delete: { label: 'Delete', color: '#f87171' },
	'crypto-shred': { label: 'Crypto-shred', color: '#e879f9' },
	pseudonymise: { label: 'Pseudonymise', color: '#fbbf24' },
	retain: { label: 'Retain (legal hold)', color: '#60a5fa' },
	schedule: { label: 'Schedule deletion', color: '#a78bfa' },
	none: { label: 'No action', color: '#64748b' }
};

export type TraceTarget =
	| 'apis'
	| 'semantic'
	| 'gold'
	| 'silver'
	| 'bronze'
	| 'glacier'
	| 'validation'
	| 'ingestion'
	| 'sources';

export interface TraceItem {
	object: string;
	fields: string[];
	action: ErasureAction;
	note?: string;
}

export interface TraceStep {
	target: TraceTarget;
	title: string;
	items: TraceItem[];
}

export interface RtbfScenario {
	id: string;
	label: string;
	customer: string;
	situation: string;
	legalPosition: string;
	outcome: string;
	steps: TraceStep[];
}

export const traceOrder: TraceTarget[] = [
	'apis',
	'semantic',
	'gold',
	'silver',
	'bronze',
	'glacier',
	'validation',
	'ingestion',
	'sources'
];

export const rtbfScenarios: RtbfScenario[] = [
	{
		id: 'closed-expired',
		label: 'Closed 7 years ago',
		customer: 'Customer #4521',
		situation: 'Account closed June 2019. Customer requests erasure of all personal data.',
		legalPosition:
			'MLR 2017 retention (5 years after the relationship ended) expired in June 2024. No open complaint, dispute or regulatory hold. Art.17 applies in full.',
		outcome:
			'Full erasure. Every live copy is deleted. Archives become anonymous by crypto-shredding the identity key, so no restore is needed. Backups age out within their 35-day window and are not restored in the meantime.',
		steps: [
			{
				target: 'apis',
				title: 'Consumers: Power BI & Claude (MCP)',
				items: [
					{ object: 'Power BI dataset cache', fields: ['customer_key rows'], action: 'delete', note: 'Forced dataset refresh after Gold rebuild' },
					{ object: 'MCP audit logs', fields: ['caller prompts mentioning #4521'], action: 'pseudonymise', note: 'The log entry stays as a control record; personal data is redacted' }
				]
			},
			{
				target: 'semantic',
				title: 'Semantic layer',
				items: [{ object: 'Query caches', fields: ['all'], action: 'delete', note: 'Invalidated; metric definitions hold no personal data' }]
			},
			{
				target: 'gold',
				title: 'Gold marts',
				items: [
					{ object: 'gold.dim_customer', fields: ['customer_key', 'segment', 'region'], action: 'delete' },
					{ object: 'gold.fct_daily_transactions', fields: ['customer_key'], action: 'delete', note: 'Removed by incremental rebuild from Silver' },
					{ object: 'reg_snapshot_2019Q2 (FCA return)', fields: ['customer_key'], action: 'pseudonymise', note: 'Submitted figures stay frozen; the key no longer resolves to a person' }
				]
			},
			{
				target: 'silver',
				title: 'Silver models',
				items: [
					{ object: 'silver.customer (SCD2)', fields: ['all versions'], action: 'delete' },
					{ object: 'silver.customer_transactions', fields: ['rows for customer_key'], action: 'delete' },
					{ object: 'identity.crosswalk', fields: ['source ids → customer_key'], action: 'delete' }
				]
			},
			{
				target: 'bronze',
				title: 'Bronze (hot, Iceberg)',
				items: [
					{ object: 'bronze.core_banking__customers', fields: ['rows where customer_sk = cust_7f2c19e0'], action: 'delete', note: 'Iceberg row-level delete, then snapshot expiry so time travel cannot bring it back' },
					{ object: 'identity vault', fields: ['name', 'dob', 'address', 'email', 'phone'], action: 'crypto-shred', note: 'The per-subject key is destroyed, so every archived reference becomes anonymous' }
				]
			},
			{
				target: 'glacier',
				title: 'Cold storage: Glacier Deep Archive',
				items: [
					{ object: 'bronze archive 2019 partitions', fields: ['customer_sk references'], action: 'none', note: 'No restore needed: archives hold only surrogate keys, already made anonymous by the shred' },
					{ object: 'Expired partitions (> 6y)', fields: ['whole objects'], action: 'delete', note: 'Glacier objects CAN be deleted directly; the lifecycle rule usually already has' },
					{ object: 'RDS / SQL Server backups', fields: ['full rows'], action: 'schedule', note: 'Not edited. Kept out of use and aged out (35-day window). If ever restored, the erasure is re-applied' }
				]
			},
			{
				target: 'validation',
				title: 'Quarantine / DLQ',
				items: [{ object: 'quarantine payloads', fields: ['records for subject'], action: 'delete' }]
			},
			{
				target: 'ingestion',
				title: 'Ingestion',
				items: [{ object: 'Kinesis / SSIS staging', fields: ['—'], action: 'none', note: 'Stream TTL and staging truncation mean nothing persists here' }]
			},
			{
				target: 'sources',
				title: 'System of record',
				items: [
					{ object: 'SQL Server core banking', fields: ['customer record'], action: 'delete', note: 'Done by the operations erasure process; CDC carries the delete downstream' },
					{ object: 'Erasure certificate', fields: ['request id', 'objects touched', 'timestamps'], action: 'retain', note: 'Evidence for the DPO/ICO. Holds no personal data beyond the request reference' }
				]
			}
		]
	},
	{
		id: 'closed-hold',
		label: 'Closed 2 years ago',
		customer: 'Customer #1177',
		situation: 'Account closed September 2024. Customer requests erasure.',
		legalPosition:
			'MLR 2017 requires due-diligence and transaction records to be kept until September 2029, so Art.17(3)(b) (legal obligation) applies to those. Everything else must go now.',
		outcome:
			'Partial erasure now: marketing, app telemetry and analytics profiles are deleted. Financial and KYC records are placed under legal hold, restricted to compliance, and tagged for automatic deletion in September 2029.',
		steps: [
			{
				target: 'apis',
				title: 'Consumers: Power BI & Claude (MCP)',
				items: [
					{ object: 'Marketing & CRM reports', fields: ['customer rows'], action: 'delete' },
					{ object: 'MCP access', fields: ['customer_key'], action: 'retain', note: 'Excluded from every AI tool by a restriction flag' }
				]
			},
			{
				target: 'semantic',
				title: 'Semantic layer',
				items: [{ object: 'Row-level security policy', fields: ['restricted_subjects'], action: 'retain', note: 'Subject added; only compliance roles can resolve them' }]
			},
			{
				target: 'gold',
				title: 'Gold marts',
				items: [
					{ object: 'gold.marketing_audience', fields: ['all'], action: 'delete' },
					{ object: 'gold.fct_daily_transactions', fields: ['customer_key'], action: 'retain', note: 'Legal hold until 2029-09; hidden from general roles' }
				]
			},
			{
				target: 'silver',
				title: 'Silver models',
				items: [
					{ object: 'silver.app_events', fields: ['clickstream', 'device ids'], action: 'delete' },
					{ object: 'silver.customer (SCD2)', fields: ['marketing_prefs', 'email', 'phone'], action: 'delete' },
					{ object: 'silver.customer (SCD2)', fields: ['name', 'address history', 'KYC refs'], action: 'retain', note: 'Required for CDD record-keeping' }
				]
			},
			{
				target: 'bronze',
				title: 'Bronze (hot, Iceberg)',
				items: [
					{ object: 'bronze.kinesis__app_events', fields: ['rows for subject'], action: 'delete', note: 'Iceberg row delete + snapshot expiry' },
					{ object: 'bronze.core_banking__*', fields: ['rows for subject'], action: 'schedule', note: 'Tagged erase_after=2029-09-30; a daily job enforces it' }
				]
			},
			{
				target: 'glacier',
				title: 'Cold storage: Glacier Deep Archive',
				items: [
					{ object: 'Archived core-banking partitions', fields: ['customer_sk references'], action: 'schedule', note: 'Identity key crypto-shredded in 2029, so the archive never needs restoring' },
					{ object: 'Archived app-event partitions', fields: ['customer_sk references'], action: 'crypto-shred', note: 'App data has no retention basis, so its identity link is shredded now' }
				]
			},
			{
				target: 'validation',
				title: 'Quarantine / DLQ',
				items: [{ object: 'quarantine payloads', fields: ['records for subject'], action: 'delete' }]
			},
			{
				target: 'ingestion',
				title: 'Ingestion',
				items: [{ object: 'Kinesis / SSIS staging', fields: ['—'], action: 'none', note: 'Nothing persists beyond the TTL' }]
			},
			{
				target: 'sources',
				title: 'System of record',
				items: [
					{ object: 'SQL Server core banking', fields: ['KYC + transactions'], action: 'retain', note: 'Under legal hold with restricted access; deletion due 2029-09' },
					{ object: 'Response to customer', fields: ['—'], action: 'none', note: 'Explain what was erased, what is retained, why (MLR 2017) and until when, within one month' }
				]
			}
		]
	},
	{
		id: 'active-marketing',
		label: 'Active customer',
		customer: 'Customer #8830',
		situation: 'Active account. Customer objects to marketing and asks for "all my data to be deleted".',
		legalPosition:
			'The data is still needed to run the account (contract) and to meet MLR duties, so full erasure does not apply. The objection to marketing is absolute under Art.21(3), so marketing processing must stop.',
		outcome:
			'Marketing profile and optional analytics data deleted; opt-out applied permanently in Silver so it propagates downstream. The account data stays. The response explains why.',
		steps: [
			{
				target: 'apis',
				title: 'Consumers: Power BI & Claude (MCP)',
				items: [
					{ object: 'Campaign audiences', fields: ['customer_key'], action: 'delete' },
					{ object: 'Operational dashboards', fields: ['account rows'], action: 'retain', note: 'Needed to service the account' }
				]
			},
			{
				target: 'semantic',
				title: 'Semantic layer',
				items: [{ object: 'Marketing metrics', fields: ['subject excluded'], action: 'none', note: 'Inherits the opt-out flag from Silver automatically' }]
			},
			{
				target: 'gold',
				title: 'Gold marts',
				items: [
					{ object: 'gold.marketing_audience', fields: ['row'], action: 'delete' },
					{ object: 'gold.customer_propensity_scores', fields: ['scores'], action: 'delete', note: 'Profiling for marketing, so it stops' }
				]
			},
			{
				target: 'silver',
				title: 'Silver models',
				items: [
					{ object: 'silver.consent', fields: ['marketing_opt_out = true'], action: 'retain', note: 'Suppression must be kept, or they could be re-added later' },
					{ object: 'silver.app_events', fields: ['marketing attribution'], action: 'delete' }
				]
			},
			{
				target: 'bronze',
				title: 'Bronze (hot, Iceberg)',
				items: [{ object: 'bronze.*', fields: ['account data'], action: 'retain', note: 'Contract + MLR basis; normal lifecycle applies' }]
			},
			{
				target: 'glacier',
				title: 'Cold storage: Glacier Deep Archive',
				items: [{ object: 'Archived partitions', fields: ['—'], action: 'none', note: 'Normal lifecycle; erasure re-evaluated when the account closes' }]
			},
			{
				target: 'validation',
				title: 'Quarantine / DLQ',
				items: [{ object: 'quarantine payloads', fields: ['—'], action: 'none' }]
			},
			{
				target: 'ingestion',
				title: 'Ingestion',
				items: [{ object: 'Kinesis marketing events', fields: ['subject'], action: 'none', note: 'Producers honour the opt-out at source' }]
			},
			{
				target: 'sources',
				title: 'System of record',
				items: [
					{ object: 'CRM consent record', fields: ['opt-out'], action: 'retain' },
					{ object: 'Response to customer', fields: ['—'], action: 'none', note: 'Confirm marketing stopped; explain why account data must stay' }
				]
			}
		]
	}
];

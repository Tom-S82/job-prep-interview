// Illustrative metadata a well-governed platform would hold for each stage.
// Paths, ARNs and counts are realistic examples, not real thinkmoney systems.

export interface MetadataExample {
	title: string; // what this JSON represents
	json: Record<string, unknown>;
}

const LOAD_ID = 'ld_20261003_1542_cdc_core';

export const metadataExamples: Record<string, MetadataExample> = {
	sources: {
		title: 'Catalogue entry: source table',
		json: {
			source: 'sqlserver.core_banking.dbo.customer_transactions',
			owner: 'core-banking-team',
			data_contract: { version: '1.4.0', notice_period_days: 14 },
			ingestion: { method: 'SSIS CDC', cdc_capture_instance: 'dbo_customer_transactions' },
			pii_classification: {
				customer_id: 'indirect_identifier',
				account_number: 'direct_identifier',
				counterparty_name: 'personal_data',
				amount: 'financial'
			},
			pci_scope: false,
			retention_basis: 'MLR 2017 reg.40: 5y after business relationship ends'
		}
	},
	ingestion: {
		title: 'Load manifest: one CDC run',
		json: {
			load_id: LOAD_ID,
			pipeline: 'ssis_cdc_core_banking',
			source_table: 'dbo.customer_transactions',
			lsn_from: '0x0000A1F3000004C80003',
			lsn_to: '0x0000A1F3000007B20001',
			started_at: '2026-10-03T15:40:02Z',
			finished_at: '2026-10-03T15:42:31Z',
			rows: { inserted: 48210, updated: 2209, deleted: 13 },
			landed_to: 's3://tm-platform-bronze/core_banking/customer_transactions/ingest_date=2026-10-03/',
			encryption: { in_transit: 'TLS 1.2+', at_rest: 'SSE-KMS', kms_key: 'alias/tm-bronze-core-banking' },
			tokenised_fields: ['card_pan → card_token']
		}
	},
	validation: {
		title: 'Quarantine record (Iceberg quarantine table)',
		json: {
			quarantine_id: 'q_8f3a91',
			table: 'quarantine.core_banking (iceberg)',
			load_id: LOAD_ID,
			source: 'sqlserver.core_banking.dbo.customer_transactions',
			source_key: { txn_id: 99120488 },
			original_payload: { txn_id: 99120488, amount: 125000.0, currency: 'GBP', product: 'basic_current' },
			failed_rule: { id: 'amount_within_product_limits', owner: 'core-banking-team', severity: 'error' },
			first_seen: '2026-10-03T15:42:29Z',
			triage: {
				status: 'triaged',
				lifecycle: 'new → triaged → fixed_at_source → replayed | discarded',
				assignee: 'core-banking-team',
				sla_due: '2026-10-06T17:00:00Z',
				root_cause: 'Decimal shift in upstream export (pence sent as pounds)'
			},
			contains_pii: true,
			access: ['data-platform-engineers'],
			expires_at: '2026-11-02T00:00:00Z (30d; unresolved items escalate, not drop)'
		}
	},
	bronze: {
		title: 'Bronze row envelope (one CDC change)',
		json: {
			_source: 'sqlserver.core_banking.dbo.customer_transactions',
			_op: 'U',
			_lsn: '0x0000A1F3000005D10002',
			_event_time: '2026-10-03T15:39:58.214Z',
			_ingest_time: '2026-10-03T15:42:11Z',
			_load_id: LOAD_ID,
			_schema_version: 7,
			_payload_hash: 'sha256:9c1e…b04d',
			customer_sk: 'cust_7f2c19e0',
			payload: { txn_id: 99120311, amount: 42.5, currency: 'GBP', merchant: 'TFL TRAVEL' },
			identity_ref: 'vault://identity/cust_7f2c19e0',
			table_format: 'iceberg',
			storage: {
				current: 'S3 Standard',
				lifecycle: ['Standard-IA @ 90d', 'Glacier Deep Archive @ 365d'],
				expiry: '6y after relationship end (tag-driven)'
			}
		}
	},
	silver: {
		title: 'Silver model metadata (dbt)',
		json: {
			model: 'silver.customer_transactions',
			materialisation: 'incremental (merge on txn_id, _lsn)',
			upstream: ['bronze.core_banking__customer_transactions', 'bronze.kinesis__card_auth_events'],
			column_lineage: {
				amount_gbp: ['bronze.core_banking__customer_transactions.payload.amount', 'fx_rates.rate'],
				customer_key: ['identity.crosswalk.customer_key']
			},
			pii_columns: { counterparty_name: 'masked_by_default', customer_key: 'pseudonymous' },
			tests: { passed: 14, warned: 1, failed: 0 },
			consent_filter: 'applied (marketing_opt_out, erasure_requested)',
			last_built: '2026-10-03T15:51:07Z'
		}
	},
	gold: {
		title: 'Gold mart metadata',
		json: {
			lineage: {
				source_table: 'sqlserver.core_banking.dbo.customer_transactions',
				bronze_path: 's3://tm-platform-bronze/core_banking/customer_transactions/ingest_date=2026-10-03/',
				silver_model: 'silver.customer_transactions',
				gold_path: 's3://tm-platform-gold/finance/fct_daily_transactions/',
				built_at: '2026-10-03T15:58:44Z',
				record_count: 50432,
				contains_pii: ['customer_key (pseudonymous)'],
				retention_years: 7,
				erasure_policy: 'Rebuilt from Silver; frozen regulatory snapshots keep surrogate key only'
			},
			security: {
				classification: 'Internal - Confidential',
				encryption: 'SSE-KMS (AES-256)',
				iam_access: ['data-engineers', 'analytics-team'],
				audit_logged: true
			},
			lifecycle: {
				current_storage: 'S3 Standard',
				transition_to_glacier: 'Regulatory snapshots after 1 year',
				lifecycle_policy: 'arn:aws:s3:::tm-platform-gold (rule: reg-snapshots-to-glacier)'
			},
			exposures: ['powerbi://Finance/Daily Transactions', 'mcp://tools/get_transaction_metrics']
		}
	},
	semantic: {
		title: 'Metric definition (semantic layer)',
		json: {
			metric: 'active_customers_30d',
			version: 2,
			owner: 'head-of-analytics',
			definition:
				'Customers with ≥1 customer-initiated transaction in trailing 30 days, excluding fees, interest and internal transfers, on an open account',
			certified: true,
			lineage: {
				models: ['gold.dim_customer', 'gold.fct_daily_transactions'],
				source_columns: ['silver.customer_transactions.txn_type', 'silver.customer.account_status']
			},
			dimensions: [
				{ name: 'product', tag: 'internal', ai_allowed: true },
				{ name: 'region', tag: 'internal', ai_allowed: true },
				{ name: 'postcode', tag: 'pii_indirect', ai_allowed: false },
				{ name: 'customer_key', tag: 'pseudonymous', ai_allowed: false }
			],
			exposed_to: ['Power BI', 'MCP'],
			ai_policy: { aggregates_only: true, min_group_size: 10 },
			deprecates: { metric: 'active_customers_30d@v1', retiring_on: '2026-12-31' }
		}
	},
	apis: {
		title: 'MCP audit log entry',
		json: {
			event: 'mcp.tool_call',
			tool: 'get_metric',
			arguments: { metric: 'active_customers', group_by: 'product', period: '2026-09' },
			caller: { user: 'analyst@thinkmoney (SSO)', role: 'analytics-team', client: 'Claude', session: 's_41b7' },
			purpose: 'Monthly product performance pack (prompt summary, personal data redacted)',
			metric_version: 'active_customers_30d@v2',
			rls_applied: 'analytics-team: all products, no customer-level rows',
			rows_returned: 6,
			pii_returned: false,
			policy_checks: ['aggregates_only: pass', 'min_group_size: pass', 'pii_dimensions: none requested'],
			timestamp: '2026-10-03T16:04:12Z',
			retention: '1 year, personal identifiers redacted'
		}
	}
};

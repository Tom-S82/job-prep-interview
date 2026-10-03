# Build Step 003: Add Governance & Metadata Layers

## Scope
Layer governance concerns (Security, Data Lifecycle, PII Traceability, GDPR/RTBF) into the pipeline visualization.

## Approach
Two tracks:

### Track A: Cross-Cutting Concerns Hover/Toggle
Above the main pipeline, add a toggle bar:
- [ ] Security (PII classification, encryption, IAM)
- [ ] Lifecycle (retention, Glacier archival, RTBF deletion)
- [ ] Lineage & Metadata (what can track this data back to source?)
- [ ] Compliance (GDPR, PCI-DSS, audit trail)

When toggled ON, the pipeline dims slightly and an overlay shows:
- Which stages are governed
- Which stages handle PII
- Which have retention policies
- Which support redaction

### Track B: Metadata Tooltip Examples
For each stage, add a subtle icon (info, or "{ }" JSON icon) over a dot, square or diamond that reveals example metadata JSON:

**Example: Gold stage metadata**
```json
{
  "lineage": {
    "source_table": "SSIS.customer_transactions",
    "bronze_path": "s3://platform/bronze/2026-10/customer_txn/",
    "silver_path": "s3://platform/silver/2026-10/customer_txn_cleaned/",
    "gold_path": "s3://platform/gold/2026-10/financial_transactions/",
    "timestamp": "2026-10-03T15:42:31Z",
    "record_count": 50432,
    "contains_pii": ["customer_id", "account_number","phone"],
    "retention_years": 7,
    "deletion_policy": "RTBF eligible after 90 days inactive"
  },
  "security": {
    "classification": "Internal - Confidential",
    "encryption": "AES-256",
    "iam_access": ["data-engineers", "analytics-team"],
    "audit_logged": true
  },
  "lifecycle": {
    "current_storage": "S3 Standard",
    "transition_to_glacier": "After 1 year",
    "lifecycle_policy_id": "arn:aws:s3:platform-gold-lifecycle"
  }
}
```

### Track C: Redaction/RTBF Flow Visual
Add an optional "Redaction Request" scenario:
- Simulate a GDPR deletion request arriving at Consumers
- Show how it traces back through Semantic → Gold → Silver → Bronze
- Show which tables/fields need redaction
- Show quarantine (records deleted, not archived)
- Show Glacier/cold storage (what can/can't be deleted retroactively)

Example: "Customer #4521 requests RTBF. Trace which data is affected, which is deletable, which needs archival flag."

## Interview Value
This demonstrates:
- Understanding of governed platforms (not just pipes)
- Regulatory/compliance thinking (critical for fintech)
- Data traceability design (essential for AI safety + PII governance)
- Cost optimization (lifecycle transitions)
- Honesty about constraints (you can't delete from Glacier; you can flag for deletion)

## Output
- Updated `src/lib/components/Pipeline.svelte` with:
  - Governance toggle bar (Security, Lifecycle, Lineage, Compliance)
  - Metadata tooltip icons per stage
  - JSON example reveal on click/hover
  - Optional RTBF scenario visualizer
- Updated `src/lib/data/stages.ts` with governance metadata per stage
- New file: `src/lib/data/metadata-examples.ts` (JSON examples by stage)
- New file: `src/lib/data/rtbf-scenarios.ts` (redaction request examples)

## Success Criteria
- [ ] Toggle bar is visible, each option reveals/hides governance overlay
- [ ] Metadata tooltip shows realistic S3 paths, timestamps, PII flags
- [ ] RTBF scenario can be selected and traced
- [ ] All 5 e2e tests still pass
- [ ] No performance degradation
# Build Step 007: Add Tech Stack & Toolset Reference

## Part A: Toolset Q&A Per Stage (Interview Mode)

Add a toolset question to each of these stages in questions.ts:

### Ingestion
Q: "What would you use to ingest data from SQL Server into your platform? Why that choice? What are your backups?"
A: Primary: AWS DMS (managed, handles CDC via SSIS), why: CDC already proven, low migration risk. Secondary: Firehose (if you wanted to start fresh), why: simpler for new data sources, managed scaling, but requires rewriting SSIS logic. Tertiary: Kinesis → Lambda (if sub-second latency critical for specific feeds), why: overkill for batch ingestion, added ops complexity.

### Bronze
Q: "How would you store Bronze data? Why that choice over alternatives?"
A: Primary: S3 + Iceberg, why: schema evolution without rewrites, ACID transactions, Spark-compatible, unlimited scale, cost-effective. Secondary: Redshift + Redshift Spectrum (if query latency matters more than flexibility), why: tighter integration with Power BI, but schema changes are painful. Tertiary: Delta Lake (if Databricks is your compute), why: thinkmoney isn't there yet, so adds complexity.

### Silver
Q: "Storage for Silver? How do you decide between Iceberg in S3 vs Redshift tables vs both?"
A: Primary: Iceberg in S3 (version control, lineage, cost). Redshift queries via Spectrum or Athena. Why: cheaper than Redshift storage alone, version history for audits. Secondary: Both (critical datasets in Redshift for performance), why: dual-write for low-latency dashboards, but adds complexity. Tertiary: Just Redshift (legacy approach), why: doesn't scale cost-effectively, loses version history.

### Gold
Q: "What's your approach to Gold dataset access? Redshift, Iceberg, or something else?"
A: Primary: Redshift (denormalized, optimized for BI), backed by Iceberg in S3 (history), why: Power BI loves Redshift, version control in S3, cost-effective. Secondary: Iceberg only (if Redshift costs are too high), why: Athena queries work, slower for interactive BI, need caching layer. Tertiary: Data Warehouse appliance (if scale demands it), why: thinkmoney won't need this for years.

### Semantic
Q: "How would you expose the semantic layer to BI and AI tools? Redshift views? MCP server? Both?"
A: Primary: Both. Redshift views + MCP server. Why: Power BI queries Redshift directly (fast), Claude/AI queries MCP (audited, safe, with row-level security). Secondary: Redshift views only (simpler), why: works for BI, but LLMs need custom logic for access control. Tertiary: MCP only (if AI is primary use case), why: slower for BI dashboards, Redshift still needed for compliance.

### Consumers
Q: "How do you serve different consumer types (BI, self-serve SQL, AI)? What tooling?"
A: Primary: Power BI + Redshift for BI, managed Redshift Query Editor for self-serve SQL (IAM-gated), MCP for AI. Why: least privilege, audit everything, separate concerns. Secondary: All through semantic layer views (simpler), why: easier to manage, but harder to enforce row-level security per user. Tertiary: All through MCP (if cloud-native), why: no Redshift needed, but training users to query via Claude API is a big shift.

---

## Part B: Tech Stack Reference Section

Create a new standalone section in questions.ts: `techStackReferenceQuestions`.

This is a **matrix-style reference**, not per-stage.

Questions (roughly 8–10):

### Data Ingestion
Q: "What's your primary tooling for data ingestion? Why? When would you switch?"
A: [matrix format, as shown above for Ingestion]

### Data Storage
Q: "Storage architecture for Bronze/Silver/Gold?"
A: [matrix format, as shown above for Bronze/Silver/Gold]

### Compute & Transformation
Q: "How would you run transformations? Spark, Redshift, Glue?"
A: Primary: Spark on Glue (serverless, Iceberg-native, Python/Scala). Why: schema evolution, cost-per-job, notebook-friendly for dbt. Secondary: Redshift managed tables (if already in Redshift), why: no data movement, but limited to SQL. Tertiary: dbt on Redshift (if you're dbt-first), why: elegant, but adds another tool to the stack.

### Access Control & Governance
Q: "How would you enforce row-level security and column masking?"
A: Primary: Redshift row-level security + column-level encryption (Iceberg, S3). MCP server enforces additional masking. Why: defense in depth, audit trail. Secondary: Application layer masking (slow, error-prone), why: legacy approach, not scalable. Tertiary: Tag-based governance (Apache Ranger), why: overkill for thinkmoney, more suited to larger data platforms.

### Reporting & BI
Q: "BI tooling for thinkmoney?"
A: Primary: Power BI (existing, familiar). Gradually add QuickSight for cloud-native dashboards. Why: Power BI works, QuickSight integrates with Redshift/Athena, no Tableau licensing. Secondary: Tableau (if existing investment), why: premium, not needed for thinkmoney's scale. Tertiary: Custom dashboards in Claude via MCP, why: novel but not a BI replacement.

### Monitoring & Alerting
Q: "How would you monitor the platform? CloudWatch, custom dashboards, PagerDuty?"
A: Primary: CloudWatch (Firehose, Lambda metrics) + custom Redshift monitoring (stale data detection). Why: native to AWS, low cost, extensible. Secondary: DataDog (if multi-cloud), why: better cross-service visibility, but adds cost. Tertiary: Custom Spark jobs for data quality, why: powerful but operationally heavy.

### Security & Compliance
Q: "How would you secure the platform? IAM, VPC, encryption?"
A: Primary: VPC (all services private), IAM (least privilege per role), encryption in transit (TLS) and at rest (KMS). Why: GDPR-compliant, AWS-native, auditable. Secondary: Secrets management (AWS Secrets Manager for DB creds), why: rotation, audit, replaces SSH keys. Tertiary: Custom CA for mTLS, why: necessary only if inter-service encryption is paramount.

---

## Output

- Updated `src/lib/data/questions.ts`:
  - Add toolset questions to: ingestionQuestions, bronzeQuestions, silverQuestions, goldQuestions, semanticQuestions, consumersQuestions
  - New export: `techStackReferenceQuestions` (8–10 matrix-style Q&A)
- Interview Mode automatically picks up all new questions
- Updated stages.ts (if needed for display)
- All tests pass
- Type-checking clean

## Success Criteria
- [ ] Ingestion, Bronze, Silver, Gold, Semantic, Consumers each have a toolset question
- [ ] Tech Stack Reference section has 8+ matrix Q&A
- [ ] Interview Mode displays all new questions
- [ ] Answers are concrete (primary, secondary, tertiary with reasoning)
- [ ] All tests pass
- [ ] You can study toolset decisions holistically
# Build Step 006: Enrich Questions + Add Missing Layers

## Part A: Add Missing Q&A Layers (CRITICAL)

### Semantic Layer Questions
The Semantic layer currently has 2 placeholder questions. Add 6 real ones:

Questions should cover:
- Why a semantic layer is necessary (governance, governed self-serve, AI safety)
- Metric definitions (what is "active customer"?)
- MCP server design (how Claude/LLMs access data safely)
- Column tagging (PII, sensitivity levels)
- Metric versioning (how to handle breaking changes)
- Conformed dimensions (why one customer view matters)

Example Q: "How would you design a semantic layer that both BI and Claude can query safely?"
Answer should reference: metric definitions, PII masking, audit logging, MCP constraints, lineage.

### Consumers Layer Questions
Currently 2 placeholders. Add 6 real ones:

Questions should cover:
- Difference between Power BI (visual exploration) and MCP (structured API access)
- Self-serve analytics (enabling analysts to write SQL safely)
- AI integration (Claude querying data, constraints, examples)
- Report templating (your 2013 story: report IDs, data dictionaries, wireframing)
- Alerting and monitoring (who owns alerts on a Gold dataset?)
- Consumer feedback loop (how to iterate on metrics)

## Part B: Add High-Value Q&A Sections

### New: Technology Stack & Migration (Ingestion or separate?)
Q: "If you were building this platform from scratch, what would be primary, secondary and tertiary systems?"

Answer structure:
- **Primary (keep)**: SQL Server CDC via SSIS (works, no rewrite)
- **Secondary (move to)**: Kinesis for new real-time events, Firehose to S3/Iceberg for durability
- **Tertiary (fallback)**: DMS for a later phase if SSIS becomes unmaintainable, Flink if windowed aggregations at scale become critical
- Context: trade-offs, when you'd pivot to tertiary

### New: Data Masking & Encryption (Validation or Governance?)
Q: "How would you mask or encrypt sensitive data in Bronze/Silver, and make it only available to authorised users?"

Answer should cover:
- Column-level encryption (AES-256 in Iceberg) vs tokenization vs masking
- Role-based access (IAM + Redshift row-level security, or semantic layer filtering)
- Performance impact (encrypted columns can't be indexed; filtering happens post-decrypt)
- Examples: masking postcodes (AB1 2CD → AB1 ***), tokenizing PANs, encrypting SSNs

### New: Quarantine Design (Validation section)
Deepen the existing quarantine answer with a full Q&A:

Q: "Design a quarantine system for your platform. What service? How administered? How do you prevent it from becoming a data graveyard?"

Answer should cover:
- Service choice (S3 + Iceberg vs DynamoDB table vs separate schema)
- Triage process (who reviews, when, SLA?)
- Feedback loop (root cause analysis, prevent recurrence)
- Retention (old quarantine records expire after 30 days)
- Metrics (quarantine rate per source, which rules fire most)

### New: QuickSight + Report Templating (Consumers section)
Q: "You mentioned translating SSRS reports to QuickSight via YAML. Walk us through that approach."

Answer (YOUR story, 2013 + recent work):
- SSRS reports as XML → parse, extract layout/calculations
- Convert to YAML (schema: report ID, title, data dictionary, metric definitions, visual layout)
- YAML → QuickSight API (or manual) to rebuild reports
- Benefit: **reports become code**, version-controlled in GitHub, easily reviewed
- Benefit: **data dictionary is built-in**, not a PDF or Word doc
- Benefit: **CI/CD integration**: update metrics → all reports using them get tested automatically

## Part C: Optional Enhancements

### Redaction Direction (Advanced Q&A)
Q: "Should you redact data backwards (from Consumers → Bronze) or forwards (from Bronze → Consumers), or both?"

Discuss: forward masking (cheaper, applied once at Bronze) vs backward tracing (complex, finds all consumers), hybrid approach.

### S3/Iceberg + Polyglot Databases (Architecture Q&A)
Q: "Would you use S3/Iceberg for all three medallion layers, or add polyglot stores (Redshift, Neptune, DynamoDB, Elasticsearch)?"

Answer: explain when each fits. Bronze/Silver in Iceberg (schema evolution, history), Gold in both Iceberg (analytics) and Redshift (performance). Neptune for lineage/metadata. DynamoDB for quarantine state. Elasticsearch for full-text search on documents. Advise on how Iceberg is used as this is currently unknown to the main user.

## Part D: Visual Enhancement (Optional)

### Metadata Tooltips Expansion
The governance layer already shows metadata JSON examples. Add more detailed examples:
- Semantic layer metadata (metric definitions, lineage, column tags)
- Quarantine record example (original payload, rule failed, timestamp, triage status)
- Audit log entry (who accessed what, when, why)

These enrich the existing tool without major refactoring.

## Output
- Updated `src/lib/data/questions.ts`:
  - `semanticQuestions`: 6 Q&A on semantic layer
  - `consumersQuestions`: 6 Q&A on consumers (include QuickSight story)
  - New section: technologyStackQuestions (3–4 Q on primary/secondary/tertiary)
  - New section: dataGovernanceQuestions (masking, encryption, quarantine design)
- Updated Pipeline.svelte (if adding more metadata tooltip examples)
- All 14+ e2e tests pass
- Type-checking clean

## Success Criteria
- [ ] Semantic layer has 6 real questions with answers
- [ ] Consumers layer has 6 real questions (including QuickSight story)
- [ ] Technology stack question answers the primary/secondary/tertiary question
- [ ] Data masking/encryption question added
- [ ] Quarantine design question added
- [ ] All tests pass
- [ ] Interview Mode works with new questions
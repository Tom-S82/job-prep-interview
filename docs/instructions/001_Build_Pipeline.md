# Build Instructions: D3 Pipeline Component

## Context
This app is an interactive interview prep tool for a **Data Team Lead** role at **thinkmoney** (fintech, Manchester).
See `CLAUDE.md` for full project context.

**Job Description:** `.gitignore/thinkmoney_jd.pdf`  
**Candidate Notes:** `.gitignore/candidate_notes.txt`

## Task: Build the Pipeline Component

### Requirements
- **Visualization:** Animated D3 data flow through pipeline stages
- **Stages:** Sources → Ingestion → Validation → Bronze → Silver → Gold → Semantic → APIs
- **Animation:** Smooth, looping data particle flow (visual = "watch internals of a factory machine")
- **Interactivity:** Click any stage to expand it sideways
- **Expand Reveals:**
  - Problem it solves
  - What good looks like
  - How to implement (thinkmoney-specific)
  - Interview questions (placeholder for now)
  - One-liner to remember
- **Styling:** Tailwind CSS, dark theme (factory/industrial feel)
- **Responsive:** Works on mobile

### Specifics for thinkmoney
- Current platform: SQL Server 2019 + SSIS (keep what works)
- New capabilities: Real-time streaming, semantic layer with MCP access
- Context: Candidate has built AWS pipelines, knows medallion architecture, interviewing for Lead role
- Visual metaphor: "Look inside the watch mechanism" or "factory production line"

### Output
- `src/lib/components/Pipeline.svelte`
- TypeScript, D3, Tailwind styling
- Animated and clickable (state management welcome)

### Success Criteria
- [ ] Pipeline renders without errors
- [ ] Data particles animate smoothly
- [ ] Click a stage → it expands
- [ ] Click again → collapses
- [ ] Looks professional (not placeholder)


## Company Context (from JD)

### Current Platform (Possibly Broken but that would need to be assessed)
- SQL Server 2019 + SSIS
- Bronze/Silver/Gold exists but not fit for purpose
- No streaming support
- No semantic layer
- Can't serve AI/Claude access

### What Works (Keep)
- SSIS CDC for batch ingestion

### What's New (Build)
- Real-time streaming (Kinesis?)
- Semantic layer with MCP exposure
- AI-safe governance (PCI-DSS, FCA)

## Candidate Context
- AWS infra: 8/10 (production DMS, RDS, S3, Kinesis, Lambda, Step Functions)
- SQL: 9/10 (complex ETL, migrations)
- dbt: 3/10 (understand medallion, not hands-on)
- AI/MCP: 4/10 (never built MCP; conceptual understanding)

Interview positioning: Keep SSIS CDC, add streaming for new events, rebuild medallion architecture, build semantic layer for BI + AI access.
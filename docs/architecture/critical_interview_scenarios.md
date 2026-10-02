
## Critical Interview Scenarios (Prepare for These)

1. **"Why did our platform fail? What would you do?"**
   - SSIS CDC works; keep it. Add Kinesis/Flink for streaming. Redesign medallion. Build semantic layer + MCP. Don't rip out SSIS.

2. **"How would you use Claude Code in this role?"**
   - Infrastructure as code (Terraform), test generation, documentation. Show quality/security maintained.

3. **"You've migrated from SQL Server before—walk us through."**
   - Audit first. SSIS reliability = competitive advantage. Real-time streams are new. Lakehouse alongside. Migrate cautiously.

4. **"Tell us about mentoring someone."**
   - [Have a specific story ready about encouraging learning + public speaking prep]

5. **"Architecture Challenge: thinkmoney has a new real-time event stream + legacy batch jobs. Design the pipeline."**
   - [Practice: identify what stays (SSIS CDC), what's added (Kinesis ingestion), medallion design, semantic layer]

## Leadership Positioning
- Audit before changing ("what actually needs improvement?")
- Business outcomes first ("which improvement moves the needle most?")
- Mentoring through growth projects (not just direction)
- Clear communication on constraints + trade-offs

## Development Workflow
- **Web Claude (this conversation):** Architecture, strategy, content guidance
- **Claude Code (terminal):** Scaffolding, component generation, debugging
- **Test locally:** `npm run dev` at localhost:5173
- **Push daily:** Backup + version control

## Do NOT
- Build the full app in one sprint; iterate daily
- Add every feature at once; start with Pipeline + one component
- Optimize prematurely; get it working first
- Assume AI/MCP expertise; frame honestly ("I understand the concept; haven't built this yet")

## Current Status
- **SvelteKit scaffold:** ✅ Complete (TypeScript, Tailwind, D3 ready)
- **GitHub repo:** ✅ Linked
- **D3 pipeline component:** ⏳ Next (tomorrow AM)
- **Q&A content:** ⏳ Loading iteratively
- **Interview Mode:** ⏳ Following

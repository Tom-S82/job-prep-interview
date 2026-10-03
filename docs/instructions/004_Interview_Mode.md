# Build Step 004: Interview Mode + Fix Text Formatting

## Issue
The answer text in Pipeline.svelte shows markdown syntax literally (stars for bold instead of bold text).
This affects both the Pipeline detail panel and will affect Interview Mode.

## Solution
In Interview Mode AND Pipeline.svelte, parse markdown to HTML before display:
- Bold: **text** → <strong>text</strong>
- Keep it simple (just bold, not full markdown)
- Use a tiny markdown-to-HTML utility or regex

## Scope

### Part A: Fix Pipeline.svelte Styling
- Find where answers are displayed in the detail panel
- Replace literal `{answer}` text with markdown parsing
- Test: bold text now appears bold, not as **text**

### Part B: Build Interview Mode
Build a new SvelteKit route `/interview` with:

**Features**:
1. **Stage selector**: buttons/dropdown to pick a stage (Ingestion, Validation, Bronze, Silver, Gold, Terraform, CI/CD, PySpark, etc.)
2. **Random question**: display one random question from selected stage
3. **Question display**: show the question, nothing else (user thinks first)
4. **Show answer button**: reveals the full answer with markdown formatting
5. **Confidence rating**: three buttons (🟢 Green, 🟡 Amber, 🔴 Red)
6. **Progress tracker**: shows % green per stage (stored in Svelte store)
7. **Next question button**: loop to another random Q
8. **Back to pipeline**: return to main view

**Styling**:
- Dark theme (match Pipeline)
- Question readable and prominent
- Answer styled with bold/hierarchy
- Progress visible (progress bar or % per stage)
- Mobile responsive

**Output**:
- `src/routes/interview/+page.svelte`: main Interview Mode page
- `src/lib/components/InterviewMode.svelte`: the component
- `src/lib/stores/progress.ts`: progress tracking (stage → % green)
- Updated `src/lib/data/questions.ts` reference for all question sets
- `src/lib/utils/markdown.ts`: simple markdown-to-HTML parser
- Updated `src/lib/components/Pipeline.svelte`: use the markdown parser for answers
- All e2e tests pass

**Success Criteria**:
- [ ] Pipeline answers now display bold text (not **text**)
- [ ] Interview Mode loads, lets you pick a stage
- [ ] Random Q appears
- [ ] Answer reveals and shows formatted text (bold working)
- [ ] Confidence buttons work
- [ ] Progress is stored and visible
- [ ] Can loop to next question
- [ ] Mobile responsive
- [ ] No console errors
- [ ] All tests pass
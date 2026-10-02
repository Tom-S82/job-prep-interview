# Build Step 003: Interview Mode Component

## Scope
Build a separate SvelteKit page/modal where:
- User selects a stage (Ingestion, Validation, Medallion, etc.)
- System serves one random interview question
- User thinks about answer
- User clicks "Reveal answer"
- Answer shows with model response
- User rates confidence: 🟢 Green (comfortable), 🟡 Amber (need practice), 🔴 Red (don't understand yet)
- System tracks progress (% green per stage)

## Features
- Can practice in "Isolation Mode" (one component at a time) or "Mixed Mode" (random across all)
- Progress dashboard: which topics need more practice?
- "Time me" mode: how long do you take to answer? (optional timer)
- Export/print interview notes

## Output
- `src/lib/components/InterviewMode.svelte` (or split into multiple files)
- `src/routes/interview/+page.svelte`
- State management in `src/lib/stores/` (progress tracking)
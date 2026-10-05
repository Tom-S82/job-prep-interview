# Enhancement: Interview Mode Recall Scaffolding

## Problem
Users read answers but can't recall them under pressure. The answers are too long to recall. There should be an intermediate stage in between fully hidden and fully revealed. This extra stage should break down the full answer into shortened bitesize chunks as key points or prompts.

## Solution
Three-stage answer reveal for better active recall practice:

### Stage 1: Key Concepts (User Attempts)
Show 3–5 bullet points extracted from the answer.
User tries to construct their own answer using these prompts.
Button: "Show Model Answer"

### Stage 2: Full Answer (Compare)
Reveal the complete answer.
User compares their attempt to the model.
Button: "Score Accuracy"

### Stage 3: Self-Score
Three buttons:
- ✅ Nailed it (I said that)
- ⚠️ Close (I got the ideas but phrased it differently)
- ❌ Missed it (I couldn't recall that)

Store "accuracy score" separately from "confidence" in progress.ts.

## Implementation
- Extract key concepts from each answer using regex/string parsing
- Add a progressiveReveal boolean to InterviewQuestion type
- Update Interview Mode component to show stages sequentially
- Update progress tracking to show both confidence % and accuracy %
- Make sure I can toggle forwards and backwards between the stages.

## Output
- Updated `src/lib/data/questions.ts`: add keyPoints to each answer
- Updated `src/lib/components/InterviewMode.svelte`: three-stage reveal
- Updated `src/lib/stores/progress.ts`: track accuracy separately
- All tests pass
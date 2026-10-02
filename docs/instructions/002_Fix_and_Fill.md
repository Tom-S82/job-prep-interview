# Build Step 002: Fix Particle Bugs & Fill Interview Questions

## Bug Fixes (Priority)
1. Particles glitch and stay in boxes instead of exiting smoothly
   - Investigate: are they reaching the end of path?
   - Fix: ensure particles reset/recycle properly
   - Test: watch for 2+ minutes without glitches

2. Particle lifespan: should particles "arrive" at Gold/Semantic/Consumers before going to cold storage?
   - Feature: add optional "staging" phase where particles linger
   - Visual: maybe show a temporary "batch ready" indicator?

## Features (Add to Same Conversation)
1. **Clumping at Gold layer:** Show 2×2 grids of gold particles (emphasize aggregation)
2. **Multiple sources:** Instead of generic "Sources," show:
   - SQL Server (legacy, CDC via SSIS)
   - Kinesis events (real-time)
   - S3 data (batch files)
3. **Quarantine feedback:** Rejected particles (quarantine tray) should flow back to Sources for correction
4. **Self-serve consumers:** Gold layer should have two consumer paths:
   - BI/Analytics (Power BI)
   - Self-serve AI (Claude via MCP)

## Interview Questions (Critical)

Fill in **real model answers** (not "coming soon") for:

### Ingestion Stage
- Q1: "How would you migrate from SSIS to Kinesis without losing data?"
- Q2: "Your system has both batch CDC and streaming real-time events. How do you reconcile them?"
- Q3–6: [Add 4 more based on candidate experience]

Model answers should reference:
- Candidate's actual migration experience (AWS DMS, SQL Server to RDS)
- Specific to thinkmoney (keep SSIS CDC, add Kinesis for new events)
- Interview-level depth (shows thinking, not just memorization)

### Validation Stage
- Q1: "What's the difference between schema validation and data quality testing?"
- Q2: "How would you handle data that's technically valid but suspicious (e.g., implausible values)?"
- [etc.]

### Medallion (Bronze/Silver/Gold)
- Q1: "Why separate Bronze/Silver/Gold instead of just landing raw data and transforming once?"
- Q2: "When would you break medallion architecture? What's a case where one-layer is better?"
- [etc.]

## Output
- Updated `src/lib/data/stages.ts` with real interview Q&A
- Updated `src/lib/components/Pipeline.svelte` with:
  - Particle glitch fix
  - Clumping at gold
  - Multiple sources
  - Quarantine feedback loop
  - Self-serve consumers
- All tests pass
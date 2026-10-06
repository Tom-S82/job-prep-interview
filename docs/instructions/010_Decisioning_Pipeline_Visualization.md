# Build Step 010: Decisioning Pipeline Visualization

## Vision
Expand the interview prep app with a new route `/decisioning-pipeline` that shows **how real-time fraud decisioning flows through the platform architecture**.

Mirrors the existing Pipeline component but specialized for Track 2 (decisioning):
- Application enters → Lambda scores → Feature Store updates → Kinesis publishes → Bronze captures

User can say in interview: *"This is the theory (the medallion architecture). This is how I'd integrate real-time decisioning into it."*

## Scope

### New Route: `/decisioning-pipeline`
Similar layout to `/pipeline` but focused on fraud scoring flow.

### Stages (Left → Right)
1. **Application** (entry point)
2. **Lambda Scorer** (rules engine)
3. **Feature Store** (real-time lookup & record)
4. **Decision** (approve/decline/manual review)
5. **Kinesis** (publish for durability)
6. **Bronze** (eventual arrival)
7. **Silver/Gold** (batch analysis)

### Visual Elements

**Applications (particles, like existing Pipeline):**
- Enter from the left (Application stage)
- Each carries: customer_id, amount, device, location, income

**Lambda Stage (scoring box):**
- Application enters
- 7 rules evaluate in sequence (animated):
  - `new_account`: fires? show +0.25
  - `velocity_spike`: fires? show +0.35
  - `sca_fail`: fires? show +0.30
  - `device_new`: fires? show +0.15
  - `income_consistency`: fires? show +0.20
  - `dormant_reactivation`: fires? show +0.20
  - `location_unusual`: fires? show +0.10
- Rules light up as they fire
- Running score displayed (0.00 → 0.25 → 0.60 → 0.80 etc.)

**Decision Stage:**
- Score converts to decision:
  - >0.75: RED (decline)
  - 0.50-0.75: YELLOW (manual review)
  - <0.50: GREEN (approve)
- Application colors based on decision
- Shows reasoning (which rules fired)

**Feature Store & Kinesis:**
- Application flows to Feature Store (recorded, support staff can query)
- Also published to Kinesis (red arrow, async)

**Bronze/Silver/Gold:**
- Like existing pipeline, shows eventual batch processing
- Applications eventually arrive in Bronze, merge in Silver, analyzed in Gold

### Interactive

**Scenario Picker (top):**
- Dropdown: select one of your 4 scenarios:
  1. New customer, low risk (score 0.40, approve)
  2. High velocity, new device (score 1.00, decline)
  3. Dormant reactivation (score 0.55, manual review)
  4. Established customer (score 0.00, approve)

**Clickable Stages (like existing Pipeline):**
- Click a stage to expand and see details
- Lambda stage expands to show each rule, evidence, contribution
- Feature Store expands to show what was recorded
- Decision stage expands to show reasoning + support staff view

**Animation Loop:**
- Application enters every ~2 seconds
- Rules fire in sequence (300ms each)
- Score updates live
- Application exits to Decision
- Repeats or shows new scenario

### Design Consistency

**Reuse from existing Pipeline:**
- Same dark theme (slate-950)
- Same particle/circle metaphor
- Same D3 library
- Same metadata JSON panels (show decision data)
- Same keyboard shortcuts (pause, speed, etc.)

**Differences:**
- Narrower focus (one application flow, not multiple sources)
- Emphasis on rule firing (visual clarity on why decisions happen)
- Feature Store + Kinesis (Track 2 specifics)
- Decision coloring (red/yellow/green by outcome)

### Output

**Files:**
- `src/routes/decisioning-pipeline/+page.svelte`: new page
- `src/lib/components/DecisioningPipeline.svelte`: component (mirrors Pipeline.svelte)
- `src/lib/data/fraud-scenarios.ts`: the 4 scenarios + rules
- `src/routes/decisioning-pipeline.e2e.ts`: tests

**Tests:**
- Page renders
- Scenario picker works (4 scenarios)
- Rules fire with correct contributions (all 4 scenarios score correctly: 0.40, 1.00, 0.55, 0.00)
- Clickable stages expand/collapse
- Animation loop runs (no stuck applications)

**Success Criteria:**
- [ ] Route loads at `/decisioning-pipeline`
- [ ] Default scenario auto-plays
- [ ] Rules fire in sequence, contributions display correctly
- [ ] Final scores match the Lambda output (0.40, 1.00, 0.55, 0.00)
- [ ] Decisions color correctly (green/yellow/red)
- [ ] Scenario picker changes the flow
- [ ] Clickable stages show details
- [ ] Mobile responsive
- [ ] All tests pass
- [ ] No console errors

---

## Interview Usage

User can say:

> "I designed this platform with a dual-track architecture: Track 1 ingests data (the medallion layers), Track 2 makes real-time decisions. This visualization shows Track 1 [click Pipeline]. This shows Track 2: how a fraud decision flows through the system [click Decisioning Pipeline]. Application enters the Lambda scorer, rules evaluate, a decision is made, it's recorded in the Feature Store for support visibility, published to Kinesis for durability, and eventually arrives in Bronze for batch analysis. Same architecture, different concern."

Or:

> "The platform isn't just about data movement. It's about decisions flowing through the same layers. Here's the ingestion pipeline. Here's how I'd integrate real-time fraud decisioning into it."

**Impressive because:**
- Shows you understand the full system (data + decisions)
- Demonstrates the dual-track design concretely
- You built it (not just talked about it)
- Visual clarity on how everything connects
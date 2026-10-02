# Inside the Data Platform: Job Prep Interview Tool

## Project Overview
Building an interactive learning tool for a **Data Team Lead** interview at **thinkmoney** (Manchester, fintech, FCA-regulated).

**Interview Date:** October 8, 2026 (7 days)  
**Role:** Lead Data Engineer (hands-on + line management)  
**Stack:** SvelteKit, TypeScript, Tailwind CSS, D3.js

## Candidate Context
- **AWS (8/10):** Production DMS migrations, RDS, S3, Kinesis, Lambda, Step Functions
- **SQL (9/10):** Complex ETL, query optimization, SQL Server to Redshift migrations
- **ETL (9/10):** Built scalable pipelines with Talend, Matillion, PySpark
- **Streaming (6/10):** Kinesis/Firehose experience
- **dbt (3/10):** Understand medallion architecture, not production-deep
- **Testing (4/10):** Leveling up; has built robust ETL, testing strategy is growth area
- **AI/MCP (4/10):** Never built MCP servers; seen Bedrock LLMs; no hands-on

**Leadership:** Mentored juniors at previous role (encouraging learning, public speaking prep). Never formally managed.

## thinkmoney Context
**Current Platform (Broken):**
- SQL Server 2019 + SSIS + Power BI
- Bronze/Silver/Gold medallion architecture exists but not fit for purpose
- No streaming support
- No semantic layer
- Can't serve AI/Claude access
- Previous Data Lead resigned; chance to audit & redesign

**What Works (Keep):**
- SSIS CDC for batch data ingestion from SQL Server

**What's New (Build):**
- Real-time streaming (Kinesis → Flink?)
- Semantic layer with MCP exposure to Claude/LLMs
- AI-safe governance (PCI-DSS, FCA regulation)
- Customer Data Platform design

**Job Description Key Points:**
- "Claude Code as a core part of how they engineer"
- "Evolve and reuse what works. Do not rebuild for sake of rebuilding."
- "Semantic layer over data exposed via MCP"
- Line-manage small data engineering team

## App Architecture

### Core Concept
"Factory floor" metaphor: visual system showing how data moves through a modern platform.

### Main Flow
Sources → Ingestion → Validation & Quality → Bronze → Silver → Gold → Semantic Layer → APIs/BI/Data Science/ML/Claude

### Cross-Cutting Concerns (Hover Overlays)
Security, Governance, Metadata & Lineage, Testing, Monitoring, CI/CD, Infrastructure as Code, Retention & Data Lifecycle

### Interactive Features
1. **Pipeline View:** Animated D3 diagram with clickable components
2. **Component Details:** Click any component to reveal:
   - Problem it solves
   - What good looks like
   - How to implement it (thinkmoney-specific)
   - What can go wrong
   - 6 interview questions + model answers
   - One-liner to remember
3. **Interview Mode:** Random question from selected component, reveal answer after thinking
4. **Architecture Challenge:** thinkmoney scenario—design/improve platform

### Component Tiers (Priority)

**Tier 1 (Deep detail):**
- Ingestion (batch CDC + streaming)
- Data Quality & Validation
- Medallion Architecture (Bronze/Silver/Gold)

**Tier 2 (Well-covered):**
- Semantic Layer
- Metadata & Lineage
- Infrastructure & Security (AWS VPC, IAM, encryption)

**Tier 3 (Sketched):**
- CI/CD & Testing
- Iceberg/Flink (acknowledge complexity, know use cases)

## Tech Stack
- **Frontend:** SvelteKit + TypeScript
- **Styling:** Tailwind CSS + @tailwindcss/typography + forms
- **Visualization:** D3.js (animated data flows)
- **Dev:** Node.js, npm, Tailwind CLI
- **Version Control:** GitHub
- **Deployment:** (TBD after interview—Vercel + Render plan)

## File paths
- **docs/architecture:** Instructions of tasks and source documentation. This should be read whenever relevant.
- **docs/architecture/private_input:** Specific job descriptions and company profiles for the particular interview preparation. Success is when the project overfits to the requirements in these files.


## Code Structure (Emerging)

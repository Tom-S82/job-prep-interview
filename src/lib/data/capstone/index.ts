import type { ArchitectureScenario } from '../scenarios.ts';
import { partA } from './a-flow.ts';
import { partB } from './b-layout.ts';
import { partC } from './c-refresh.ts';
import { partD } from './d-validation.ts';
import { partE } from './e-concurrency.ts';
import { partF } from './f-lifecycle.ts';
import { partG } from './g-operations.ts';
import { partH } from './h-fraud-path.ts';
import { partI } from './i-synthesis.ts';

// Capstone: one integrated medallion design, built up part by part.
// Each part is a full challenge (Levels 1–3, feedback, history); the diagram grows as parts are completed.

export type NodeId =
	| 'app'
	| 'api'
	| 'features'
	| 'kinesis'
	| 'firehose'
	| 'ssis'
	| 'bronze'
	| 'quarantine'
	| 'spark'
	| 'silver'
	| 'dbt'
	| 'gold'
	| 'redshift'
	| 'wlm'
	| 'bi'
	| 'tiers'
	| 'model'
	| 'ops';

export interface CapstonePart extends ArchitectureScenario {
	letter: string; // A–I
	nodes: NodeId[]; // components this part designs (highlighted in the diagram)
}

export interface DiagramNode {
	id: NodeId;
	label: string;
	sub: string;
	x: number;
	y: number;
	path: 'hot' | 'batch' | 'serve' | 'ops';
}

export const diagramNodes: DiagramNode[] = [
	{ id: 'app', label: 'App / fraud API caller', sub: 'customer on the phone', x: 80, y: 50, path: 'hot' },
	{ id: 'api', label: 'API Gateway + Lambda', sub: 'scores in < 2 s', x: 250, y: 50, path: 'hot' },
	{ id: 'features', label: 'Feature store', sub: 'DynamoDB, ms lookups', x: 250, y: 150, path: 'hot' },
	{ id: 'kinesis', label: 'Kinesis Data Streams', sub: 'decision events', x: 420, y: 50, path: 'hot' },
	{ id: 'firehose', label: 'Firehose', sub: 'batches to S3', x: 590, y: 50, path: 'hot' },
	{ id: 'model', label: 'Model training', sub: 'from Silver history', x: 420, y: 150, path: 'batch' },
	{ id: 'ssis', label: 'SSIS CDC', sub: 'hourly, SQL Server', x: 80, y: 250, path: 'batch' },
	{ id: 'bronze', label: 'Bronze (Iceberg)', sub: 'system of record', x: 590, y: 150, path: 'batch' },
	{ id: 'quarantine', label: 'Quarantine', sub: 'rejects + replay', x: 760, y: 150, path: 'batch' },
	{ id: 'spark', label: 'Spark / Glue merge', sub: 'hourly, idempotent', x: 590, y: 250, path: 'batch' },
	{ id: 'silver', label: 'Silver (Iceberg)', sub: 'day partitions, sorted', x: 760, y: 250, path: 'batch' },
	{ id: 'tiers', label: 'S3 tiers', sub: 'IA · Glacier IR · Deep Archive', x: 420, y: 250, path: 'batch' },
	{ id: 'dbt', label: 'dbt models', sub: 'incremental Gold + tests', x: 760, y: 350, path: 'serve' },
	{ id: 'gold', label: 'Gold', sub: 'atomic facts + aggregates', x: 590, y: 350, path: 'serve' },
	{ id: 'redshift', label: 'Redshift', sub: 'hot 13 months, MVs', x: 420, y: 350, path: 'serve' },
	{ id: 'wlm', label: 'WLM + concurrency scaling', sub: 'priorities, capped', x: 250, y: 350, path: 'serve' },
	{ id: 'bi', label: 'Power BI / reports', sub: '10 daily reports', x: 80, y: 350, path: 'serve' },
	{ id: 'ops', label: 'Terraform · Step Functions', sub: 'GoCD · CloudWatch · dbt CI', x: 420, y: 440, path: 'ops' }
];

export const diagramEdges: [NodeId, NodeId, string?][] = [
	['app', 'api', 'sync'],
	['api', 'features', 'lookup'],
	['api', 'kinesis', 'decision'],
	['kinesis', 'firehose'],
	['firehose', 'bronze'],
	['ssis', 'bronze', 'hourly CDC'],
	['bronze', 'quarantine'],
	['bronze', 'spark'],
	['spark', 'silver', 'MERGE'],
	['silver', 'dbt'],
	['dbt', 'gold'],
	['gold', 'redshift'],
	['redshift', 'wlm'],
	['wlm', 'bi'],
	['silver', 'tiers', 'lifecycle'],
	['spark', 'model'],
	['model', 'features', 'refresh']
];

export interface Capstone {
	id: string;
	title: string;
	summary: string;
	context: string; // markdown
	constraint: string;
	parts: CapstonePart[];
}

export const capstone: Capstone = {
	id: 'medallion-capstone',
	title: 'Capstone: real-time + batch medallion under constraints',
	summary:
		'Design one platform that makes fraud decisions in 2 seconds, merges hourly CDC, serves fast reports, tiers 10 years of data and runs itself. 8 parts plus a 5-minute synthesis.',
	context: `thinkmoney wants one platform that does all of this at once:

- **Real-time fraud decisions** in under 2 seconds, while a customer is on the phone applying for a card.
- **Hourly batch CDC** from SQL Server via SSIS, up to 50 million rows per run at peak.
- **Both landing in the same medallion** (Bronze → Silver → Gold).
- **Query performance** that holds up for date-range queries and per-customer queries alike.
- **10 daily reports** whose materialised views currently take 20 minutes each to refresh.
- **Cost control**: 10 years of history, but queries almost never touch anything older than 6 months.
- **Operational sanity**: dbt, Terraform, CI/CD, orchestration and monitoring.`,
	constraint:
		'Firehose batches records before writing them to S3, but a fraud decision is needed within 2 seconds. Squaring "now" with "eventually" is the thread through every part.',
	parts: [partA, partB, partC, partD, partE, partF, partG, partH, partI]
};

export const isCapstonePart = (id: string | null | undefined) => !!id && capstone.parts.some((p) => p.id === id);

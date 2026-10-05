// Architecture Challenge scenarios. Each scenario lives in ./scenarios/<id>.ts.
// Feedback is deterministic: what the user wrote is matched against each scenario's key
// concepts and articulation patterns; every Level 2 option carries its own verdict.

import { fraud } from './scenarios/fraud.ts';
import { selfServe } from './scenarios/self-serve.ts';
import { ssisMigration } from './scenarios/ssis-migration.ts';
import { dataScience24h } from './scenarios/data-science-24h.ts';
import { slowDashboards } from './scenarios/slow-dashboards.ts';
import { gdprErasure } from './scenarios/gdpr-erasure.ts';
import { clickstream } from './scenarios/clickstream.ts';
import { apiFreshness } from './scenarios/api-freshness.ts';

export type OptionVerdict = 'best' | 'ok' | 'weak';

export interface ChallengeOption {
	id: string; // 'A' | 'B' | ...
	text: string;
	verdict: OptionVerdict;
	feedback: string; // why this option is strong/acceptable/weak
}

export interface Level2Question {
	id: string;
	question: string;
	options: ChallengeOption[];
	expert: string; // markdown: the Lead's detailed reasoning
}

/** Level 3: "where would this break, and what would you do then?" */
export interface Level3Prompt {
	id: string;
	prompt: string;
	expert: string; // how the Lead would answer, spoken style
	lookFor: string[]; // case-insensitive regex sources for the key idea(s)
}

export interface Concept {
	id: string;
	label: string; // shown in feedback ("Separate hot and cold paths")
	patterns: string[]; // case-insensitive regex sources; any match counts
	importance: 'essential' | 'bonus';
	why: string; // shown when missed
}

/** How a Lead would *say* it: the articulation model for this scenario. */
export interface Articulation {
	leadExplanation: {
		constraint: string; // opening statement: the constraint that shapes everything
		reasons: string[]; // "Here's why"
		tradeOff: string; // what you give up
		switchWhen: string; // when you'd do it differently
	};
	leadSays: Record<string, string>; // Level 2 question id → spoken one-paragraph answer
	leadPhrases: string[]; // "Key phrases you should use"
	antiPatterns: { sounds: string; problem: string }[];
	watchOutFor: string[]; // rambling, omissions and habits specific to this scenario
	sixtySecond: string; // the elevator-pitch version
	defend: { question: string; answer: string }[]; // likely follow-ups and how to defend the choice
	juniorVsLead: { junior: string; lead: string; whyBetter: string[] };
}

export interface ArchitectureScenario extends Articulation {
	id: string;
	title: string;
	summary: string; // one line for the picker
	context: string; // markdown
	businessContext: string; // why it matters
	level1Prompt: string;
	level1Hints: string[];
	level1Expert: string; // markdown: the full design
	level2: Level2Question[];
	level3: Level3Prompt[];
	concepts: Concept[];
	relatedSets: { id: string; label: string }[]; // Interview Mode question sets
}

export const LEVEL1_PROMPT =
	"You have 2 minutes. Sketch your approach in 3–5 bullet points. Don't worry about tools yet: what's your strategy?";

export const scenarios: ArchitectureScenario[] = [
	fraud,
	selfServe,
	ssisMigration,
	dataScience24h,
	slowDashboards,
	gdprErasure,
	clickstream,
	apiFreshness
];

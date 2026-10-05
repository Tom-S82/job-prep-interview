import type { ArchitectureScenario, ChallengeOption, Concept } from '#lib/data/scenarios.ts';

export interface ChallengeAnswers {
	level1: string;
	choices: Record<string, string>; // level2 question id → option id
	reasons: Record<string, string>; // level2 question id → free-text why
	level3: Record<string, string>; // level3 prompt id → free-text answer
}

export const emptyAnswers = (): ChallengeAnswers => ({ level1: '', choices: {}, reasons: {}, level3: {} });

/** Everything the user wrote, as one text (used for concept and articulation matching). */
export const allText = (a: ChallengeAnswers) =>
	[a.level1, ...Object.values(a.reasons), ...Object.values(a.level3 ?? {})].join('\n');

export interface FeedbackItem {
	text: string;
	detail?: string;
	quote?: string; // the user's own words this item refers to
}

export interface ChallengeFeedback {
	nailed: FeedbackItem[];
	consider: FeedbackItem[];
	gaps: FeedbackItem[];
	conceptsMatched: Concept[];
	choiceResults: { questionId: string; chosen?: ChallengeOption; best: ChallengeOption }[];
}

export const MIN_REASON_LENGTH = 15;

export function conceptMatched(concept: Concept, text: string): boolean {
	return concept.patterns.some((p) => new RegExp(p, 'i').test(text));
}

/**
 * Deterministic feedback:
 * - Concepts are matched against everything the user wrote (Level 1 + all reasoning).
 *   Missing essentials → gaps; missing bonus concepts → "consider".
 * - Level 2 choices are judged by each option's verdict; thin reasoning → "consider".
 */
export function evaluateChallenge(scenario: ArchitectureScenario, answers: ChallengeAnswers): ChallengeFeedback {
	const text = allText(answers);
	const nailed: FeedbackItem[] = [];
	const consider: FeedbackItem[] = [];
	const gaps: FeedbackItem[] = [];
	const conceptsMatched: Concept[] = [];

	for (const c of scenario.concepts) {
		if (conceptMatched(c, text)) {
			conceptsMatched.push(c);
			nailed.push({ text: c.label });
		} else if (c.importance === 'essential') {
			gaps.push({ text: c.label, detail: c.why });
		} else {
			consider.push({ text: c.label, detail: c.why });
		}
	}

	const thinReasons: number[] = [];
	const choiceResults = scenario.level2.map((q, qi) => {
		const chosen = q.options.find((o) => o.id === answers.choices[q.id]);
		const best = q.options.find((o) => o.verdict === 'best') ?? q.options[0];
		if (chosen) {
			const item = { text: `${q.question} You chose ${chosen.id}: ${chosen.text}`, detail: chosen.feedback };
			if (chosen.verdict === 'best') nailed.push(item);
			else if (chosen.verdict === 'ok') consider.push(item);
			else gaps.push(item);
		}
		if ((answers.reasons[q.id] ?? '').trim().length < MIN_REASON_LENGTH) thinReasons.push(qi + 1);
		return { questionId: q.id, chosen, best };
	});

	if (thinReasons.length) {
		consider.push({
			text: `Explain your reasoning for ${thinReasons.map((n) => `Q${n}`).join(', ')}`,
			detail: 'The "why" is what the panel is really assessing, not the pick itself.'
		});
	}

	return { nailed, consider, gaps, conceptsMatched, choiceResults };
}

export interface Level3Result {
	promptId: string;
	answered: boolean;
	matched: number; // key ideas found
	total: number;
}

/** Level 3: how many of each prompt's key ideas the answer touches. */
export function evaluateLevel3(scenario: ArchitectureScenario, answers: ChallengeAnswers): Level3Result[] {
	return scenario.level3.map((p) => {
		const text = (answers.level3?.[p.id] ?? '').trim();
		const matched = p.lookFor.filter((re) => new RegExp(re, 'i').test(text)).length;
		return { promptId: p.id, answered: text.length >= 20, matched, total: p.lookFor.length };
	});
}

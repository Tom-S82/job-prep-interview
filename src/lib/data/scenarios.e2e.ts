import { expect, test } from '@playwright/test';
import { scenarios, type ArchitectureScenario } from './scenarios.ts';
import { evaluateChallenge, evaluateLevel3, type ChallengeAnswers } from '../utils/challengeFeedback.ts';
import { evaluateArticulation, scoreChallenge } from '../utils/articulation.ts';
import { markdownToHtml } from '../utils/markdown.ts';

// Data-only checks (no browser)

const bestChoices = (s: ArchitectureScenario) =>
	Object.fromEntries(s.level2.map((q) => [q.id, q.options.find((o) => o.verdict === 'best')!.id]));

/** What a Lead would write: their spoken answer, the Lead-says reasons, and the Level 3 model answers. */
const leadAnswers = (s: ArchitectureScenario): ChallengeAnswers => ({
	level1: s.juniorVsLead.lead.split('. ').join('.\n'),
	choices: bestChoices(s),
	reasons: s.leadSays,
	level3: Object.fromEntries(s.level3.map((p) => [p.id, p.expert]))
});

const juniorAnswers = (s: ArchitectureScenario): ChallengeAnswers => ({
	level1: s.juniorVsLead.junior,
	choices: bestChoices(s),
	reasons: {},
	level3: {}
});

test('all 8 scenarios are complete and well-formed', () => {
	expect(scenarios.map((s) => s.id)).toEqual([
		'fraud',
		'self-serve',
		'ssis-migration',
		'data-science-24h',
		'slow-dashboards',
		'gdpr-erasure',
		'clickstream',
		'api-freshness'
	]);
	for (const s of scenarios) {
		expect(s.level2.length, s.id).toBeGreaterThanOrEqual(3);
		for (const q of s.level2) {
			expect(q.options.filter((o) => o.verdict === 'best').length, `${s.id}/${q.id} needs exactly one best option`).toBe(1);
			expect(s.leadSays[q.id], `${s.id}/${q.id} leadSays`).toBeTruthy();
		}
		expect(s.level3.length, s.id).toBeGreaterThanOrEqual(2);
		const patterns = [...s.concepts.flatMap((c) => c.patterns), ...s.level3.flatMap((p) => p.lookFor)];
		for (const p of patterns) expect(() => new RegExp(p, 'i'), `${s.id}: ${p}`).not.toThrow();
		for (const md of [s.context, s.level1Expert, ...s.level2.map((q) => q.expert)]) {
			expect(markdownToHtml(md), s.id).not.toContain('**');
		}
		// Phase 2 expert sections
		expect(s.leadExplanation.constraint, s.id).toMatch(/constraint/i);
		expect(s.leadPhrases.length, s.id).toBeGreaterThanOrEqual(3);
		expect(s.watchOutFor.length, s.id).toBeGreaterThanOrEqual(3);
		expect(s.antiPatterns.length, s.id).toBeGreaterThanOrEqual(1);
		expect(s.sixtySecond.length, s.id).toBeGreaterThan(200);
		expect(s.defend.length, s.id).toBeGreaterThanOrEqual(3);
		expect(s.juniorVsLead.whyBetter.length, s.id).toBeGreaterThanOrEqual(2);
	}
});

test("the expert's full answer covers every essential concept (content patterns are calibrated)", () => {
	for (const s of scenarios) {
		const fb = evaluateChallenge(s, {
			level1: s.level1Expert,
			choices: bestChoices(s),
			reasons: Object.fromEntries(s.level2.map((q) => [q.id, `${s.leadSays[q.id]}\n${q.expert}`])),
			level3: Object.fromEntries(s.level3.map((p) => [p.id, p.expert]))
		});
		expect(fb.gaps.map((g) => g.text), s.id).toEqual([]);
	}
});

test('each Level 3 model answer hits at least half of its own key ideas', () => {
	for (const s of scenarios) {
		for (const r of evaluateLevel3(s, leadAnswers(s))) {
			expect(r.matched, `${s.id}/${r.promptId}`).toBeGreaterThanOrEqual(Math.ceil(r.total / 2));
		}
	}
});

test('you can hear the difference: the lead answer scores high, the junior answer scores low', () => {
	for (const s of scenarios) {
		const lead = scoreChallenge(s, leadAnswers(s));
		expect(lead.structure.value, `${s.id} structure ${lead.structure.reasons}`).toBe(5);
		expect(lead.clarity.value, `${s.id} clarity ${lead.clarity.reasons}`).toBeGreaterThanOrEqual(4);
		expect(lead.depth.value, `${s.id} depth ${lead.depth.reasons}`).toBeGreaterThanOrEqual(4);
		expect(evaluateArticulation(s, leadAnswers(s)).gaps.map((g) => g.text), `${s.id} lead gaps`).toEqual([]);

		const junior = scoreChallenge(s, juniorAnswers(s));
		const total = (x: typeof lead) => x.structure.value + x.clarity.value + x.depth.value;
		expect(junior.structure.value, `${s.id} junior structure`).toBeLessThanOrEqual(2);
		expect(total(lead) - total(junior), `${s.id} lead vs junior`).toBeGreaterThanOrEqual(5);
	}
});

test('a buried constraint and buzzwords are called out with the user’s own words', () => {
	const s = scenarios[0];
	const answers: ChallengeAnswers = {
		level1: '- Use Kinesis and Lambda, best practice and scalable\n- The constraint is the 2 second budget for warnings\n- Store verdicts',
		choices: {},
		reasons: {},
		level3: {}
	};
	const fb = evaluateArticulation(s, answers);
	expect(fb.sharpen.find((i) => /buried it in point 2/.test(i.text))?.quote).toMatch(/2 second budget/);
	expect(fb.sharpen.some((i) => /opened with a tool/.test(i.text))).toBe(true);
	expect(fb.sharpen.some((i) => /Buzzwords/.test(i.text) && /scalable/.test(i.text))).toBe(true);
	const scores = scoreChallenge(s, answers);
	expect(scores.structure.value).toBe(2); // 1 + buried constraint
	expect(scores.clarity.value).toBe(3); // buzzwords + tool-first
});

test('following the next-star advice actually raises the score', async () => {
	const { nextStarAdvice } = await import('../utils/articulation.ts');
	const s = scenarios.find((x) => x.id === 'fraud')!;
	const weak: ChallengeAnswers = {
		level1: '- Lambda for fast detection, Spark for investigation\n- The constraint is 2 seconds',
		choices: { compute: 'A', features: 'B', verdicts: 'A', rules: 'B' },
		reasons: {},
		level3: {}
	};
	const before = scoreChallenge(s, weak);
	const advice = nextStarAdvice(s, weak);
	expect(advice.structure.join(' ')).toMatch(/move the constraint/);
	expect(advice.structure.join(' ')).toMatch(/trade-off/);
	expect(advice.clarity.join(' ')).toMatch(/open with the problem/);
	expect(advice.depth.length).toBeGreaterThan(0);

	// Apply the structure + clarity advice: constraint first, name a trade-off and a switch condition
	const improved: ChallengeAnswers = {
		...weak,
		level1:
			'- The constraint is 2 seconds\n- Lambda for fast detection, Spark for investigation\n' +
			"- The trade-off is two paths. If rules needed state, we'd move to Flink"
	};
	const after = scoreChallenge(s, improved);
	expect(after.structure.value).toBe(5);
	expect(after.structure.value).toBeGreaterThan(before.structure.value);
	expect(after.clarity.value).toBeGreaterThan(before.clarity.value);
	expect(nextStarAdvice(s, improved).structure).toEqual([]);

	// Apply the top depth advice (answer the Level 3 questions with the key ideas)
	const deeper: ChallengeAnswers = { ...improved, level3: Object.fromEntries(s.level3.map((p) => [p.id, p.expert])) };
	expect(scoreChallenge(s, deeper).depth.value).toBeGreaterThan(after.depth.value);
});

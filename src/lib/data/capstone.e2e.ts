import { expect, test } from '@playwright/test';
import { capstone, diagramNodes, diagramEdges } from './capstone/index.ts';
import { findScenario, type ArchitectureScenario } from './scenarios.ts';
import { evaluateChallenge, evaluateLevel3, type ChallengeAnswers } from '../utils/challengeFeedback.ts';
import { evaluateArticulation, scoreChallenge } from '../utils/articulation.ts';
import { markdownToHtml } from '../utils/markdown.ts';
import { analyseSpeech, type SpokenAnswer } from '../speech/analysis.ts';

// Data-only checks for the capstone: structure, and the same calibration every scenario passes.

const parts = capstone.parts;
const bestChoices = (s: ArchitectureScenario) =>
	Object.fromEntries(s.level2.map((q) => [q.id, q.options.find((o) => o.verdict === 'best')!.id]));
const leadAnswers = (s: ArchitectureScenario): ChallengeAnswers => ({
	level1: s.juniorVsLead.lead.split('. ').join('.\n'),
	choices: bestChoices(s),
	reasons: s.leadSays,
	level3: Object.fromEntries(s.level3.map((p) => [p.id, p.expert]))
});
function spokenCleanly(transcript: string): SpokenAnswer {
	const words = transcript.split(/\s+/);
	const segments = [];
	let t = 1000;
	for (let i = 0; i < words.length; i += 12) {
		const text = words.slice(i, i + 12).join(' ');
		const start = t;
		t += text.split(' ').length * 400;
		segments.push({ text, start, end: t });
	}
	return { transcript, segments, pauses: [], durationMs: t + 500, voiceStart: 1000, voiceEnd: t, typed: false };
}

test('capstone has parts A–I, each a complete, well-formed challenge', () => {
	expect(parts.map((p) => p.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
	const nodeIds = new Set(diagramNodes.map((n) => n.id));
	for (const [a, b] of diagramEdges) {
		expect(nodeIds.has(a) && nodeIds.has(b), `${a}→${b}`).toBe(true);
	}
	for (const p of parts) {
		expect(findScenario(p.id), p.id).toBe(p); // resolvable for history and pages
		expect(p.primer?.length ?? 0, `${p.id} primer`).toBeGreaterThan(300);
		for (const n of p.nodes) expect(nodeIds.has(n), `${p.id} node ${n}`).toBe(true);
		expect(p.level2.length, p.id).toBeGreaterThanOrEqual(3);
		for (const q of p.level2) {
			expect(q.options.filter((o) => o.verdict === 'best').length, `${p.id}/${q.id}`).toBe(1);
			expect(p.leadSays[q.id], `${p.id}/${q.id} leadSays`).toBeTruthy();
		}
		expect(p.level3.length, p.id).toBeGreaterThanOrEqual(2);
		for (const re of [...p.concepts.flatMap((c) => c.patterns), ...p.level3.flatMap((l) => l.lookFor)]) {
			expect(() => new RegExp(re, 'i'), `${p.id}: ${re}`).not.toThrow();
		}
		for (const md of [p.context, p.primer ?? '', p.level1Expert, ...p.level2.map((q) => q.expert)]) {
			expect(markdownToHtml(md), p.id).not.toContain('**');
		}
		expect(p.leadExplanation.constraint, p.id).toMatch(/constraint/i);
		expect(p.leadPhrases.length, p.id).toBeGreaterThanOrEqual(3);
		expect(p.watchOutFor.length, p.id).toBeGreaterThanOrEqual(3);
		expect(p.defend.length, p.id).toBeGreaterThanOrEqual(3);
		expect(p.sixtySecond.length, p.id).toBeGreaterThan(200);
	}
});

test("each part's full expert answer covers its essential concepts", () => {
	for (const p of parts) {
		const fb = evaluateChallenge(p, {
			level1: p.level1Expert,
			choices: bestChoices(p),
			reasons: Object.fromEntries(p.level2.map((q) => [q.id, `${p.leadSays[q.id]}\n${q.expert}`])),
			level3: Object.fromEntries(p.level3.map((l) => [l.id, l.expert]))
		});
		expect(fb.gaps.map((g) => g.text), p.id).toEqual([]);
	}
});

test('each Level 3 model answer hits at least half of its own key ideas', () => {
	for (const p of parts) {
		for (const r of evaluateLevel3(p, leadAnswers(p))) {
			expect(r.matched, `${p.id}/${r.promptId}`).toBeGreaterThanOrEqual(Math.ceil(r.total / 2));
		}
	}
});

test('lead answers score high and junior answers score low, for every part', () => {
	for (const p of parts) {
		const lead = scoreChallenge(p, leadAnswers(p));
		expect(lead.structure.value, `${p.id} structure ${lead.structure.reasons}`).toBe(5);
		expect(lead.clarity.value, `${p.id} clarity ${lead.clarity.reasons}`).toBeGreaterThanOrEqual(4);
		expect(lead.depth.value, `${p.id} depth ${lead.depth.reasons}`).toBeGreaterThanOrEqual(4);
		expect(evaluateArticulation(p, leadAnswers(p)).gaps.map((g) => g.text), `${p.id} lead gaps`).toEqual([]);

		const junior = scoreChallenge(p, { level1: p.juniorVsLead.junior, choices: bestChoices(p), reasons: {}, level3: {} });
		const total = (x: typeof lead) => x.structure.value + x.clarity.value + x.depth.value;
		expect(junior.structure.value, `${p.id} junior structure`).toBeLessThanOrEqual(2);
		expect(total(lead) - total(junior), `${p.id} lead vs junior`).toBeGreaterThanOrEqual(5);
	}
});

test("each part's 60-second version, spoken cleanly, sounds Lead-like", () => {
	for (const p of parts) {
		const fb = analyseSpeech(p, spokenCleanly(p.sixtySecond));
		const msg = `${p.id}: ${JSON.stringify({ c: fb.clarity, f: fb.confidence, p: fb.precision, l: fb.leadLike })}`;
		expect(fb.clarity.stars, msg).toBeGreaterThanOrEqual(4);
		expect(fb.confidence.stars, msg).toBeGreaterThanOrEqual(4);
		expect(fb.precision.stars, msg).toBeGreaterThanOrEqual(4);
		expect(fb.leadLike.stars, msg).toBeGreaterThanOrEqual(4);
	}
});

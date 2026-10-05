import { expect, test } from '@playwright/test';
import { questionSets } from './questions.ts';
import { markdownToHtml } from '../utils/markdown.ts';

// Data-only checks (no browser): every question set is complete and renders cleanly.

test('every registered question has an answer and 2–5 recall cues', () => {
	for (const set of questionSets) {
		expect(set.questions.length, set.id).toBeGreaterThan(0);
		for (const q of set.questions) {
			expect(q.a?.length ?? 0, q.q).toBeGreaterThan(200);
			expect(q.keyPoints?.length ?? 0, q.q).toBeGreaterThanOrEqual(2);
			expect(q.keyPoints?.length ?? 0, q.q).toBeLessThanOrEqual(5);
		}
	}
});

test('no answer renders stray markdown (unbalanced ** or backslash escapes)', () => {
	for (const set of questionSets) {
		for (const q of set.questions) {
			const html = markdownToHtml(q.a!);
			expect(html, q.q).not.toContain('**');
			expect(html, q.q).not.toContain('\\*');
			expect(html, q.q).not.toContain('`');
		}
	}
});

test('step 005 sets exist with the required coverage', () => {
	const count = (id: string) => questionSets.find((s) => s.id === id)?.questions.length ?? 0;
	expect(count('semantic')).toBeGreaterThanOrEqual(6);
	expect(count('apis')).toBeGreaterThanOrEqual(6);
	expect(count('stack')).toBeGreaterThanOrEqual(3);
	const consumers = questionSets.find((s) => s.id === 'apis')!.questions.map((q) => q.q).join(' ');
	expect(consumers).toContain('QuickSight');
	const governance = questionSets.find((s) => s.id === 'governance')!.questions.map((q) => q.q).join(' ');
	expect(governance).toMatch(/mask or encrypt/);
	expect(governance).toMatch(/quarantine system/);
	const stack = questionSets.find((s) => s.id === 'stack')!.questions[0].a!;
	expect(stack).toMatch(/Primary/);
	expect(stack).toMatch(/Secondary/);
	expect(stack).toMatch(/Tertiary/);
});

test('step 007: each pipeline stage has a toolset question and the reference has 8+', () => {
	const tiered = (a: string) => /\*\*Primary/.test(a) && /\*\*Secondary/.test(a) && /\*\*Tertiary/.test(a);
	for (const id of ['ingestion', 'bronze', 'silver', 'gold', 'semantic', 'apis']) {
		const set = questionSets.find((s) => s.id === id)!;
		expect(
			set.questions.some((q) => tiered(q.a!)),
			`${id} needs a primary/secondary/tertiary toolset question`
		).toBe(true);
	}
	const toolset = questionSets.find((s) => s.id === 'toolset')!;
	expect(toolset.tier).toBe('Architecture');
	expect(toolset.questions.length).toBeGreaterThanOrEqual(8);
	// Every matrix answer except the one-minute summary names primary and secondary options
	for (const q of toolset.questions.slice(1)) expect(q.a, q.q).toMatch(/primary/i);
});

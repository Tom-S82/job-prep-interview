import { expect, test } from '@playwright/test';
import { scenarios } from '../data/scenarios.ts';
import { analyseSpeech, coachingTips, findRestarts, type SpokenAnswer } from './analysis.ts';

// Data-only checks for speech analysis (no browser, no microphone)

const fraud = scenarios.find((s) => s.id === 'fraud')!;

const typed = (transcript: string): SpokenAnswer => ({
	transcript,
	segments: [],
	pauses: [],
	durationMs: 0,
	voiceStart: null,
	voiceEnd: null,
	typed: true
});

/** A spoken answer with even pacing (~150 wpm) and no pauses, split into recogniser-like segments. */
function spokenCleanly(transcript: string): SpokenAnswer {
	const words = transcript.split(/\s+/);
	const chunks: string[] = [];
	for (let i = 0; i < words.length; i += 12) chunks.push(words.slice(i, i + 12).join(' '));
	const msPerWord = 400;
	let t = 1000;
	const segments = chunks.map((c) => {
		const start = t;
		t += c.split(' ').length * msPerWord;
		return { text: c, start, end: t };
	});
	return { transcript, segments, pauses: [], durationMs: t + 500, voiceStart: 1000, voiceEnd: t, typed: false };
}

test("the spec's fraud example reads like the spec: clear, slightly hesitant, precise", () => {
	const tr =
		"okay so the constraint is is latency we need fraud verdicts in 2 seconds I'd use Kinesis and Lambda for the immediate for the immediate response to product but then Spark at Silver does the deeper investigation the trade-off is two paths to run and if rules needed state we'd move to Flink";
	const fb = analyseSpeech(fraud, {
		transcript: tr,
		typed: false,
		durationMs: 40000,
		voiceStart: 1500,
		voiceEnd: 38000,
		segments: [
			{ text: 'okay so the constraint is is latency', start: 1600, end: 4000 },
			{ text: 'we need fraud verdicts in 2 seconds', start: 7800, end: 10000 },
			{
				text: "I'd use Kinesis and Lambda for the immediate for the immediate response to product but then Spark at Silver does the deeper investigation",
				start: 10500,
				end: 25000
			},
			{ text: "the trade-off is two paths to run and if rules needed state we'd move to Flink", start: 26000, end: 37000 }
		],
		pauses: [
			{ start: 4200, end: 7600 },
			{ start: 25100, end: 25900 }
		]
	});
	expect(fb.clarity.stars).toBeGreaterThanOrEqual(4);
	expect(fb.confidence.stars).toBe(3);
	expect(fb.confidence.summary).toContain('1 long pause, 2 restarts');
	expect(fb.precision.stars).toBe(5);
	expect(fb.leadLike.stars).toBeGreaterThanOrEqual(4);

	const flat = fb.transcript.map((t) => (t.type === 'word' ? t.text : `[${t.label}]`)).join(' ');
	expect(flat).toContain('constraint is [restart] is latency [good opening] [pause 3.4s] we need');
	expect(flat).toContain('for the immediate [restart] for the immediate');
	expect(flat).toContain('two paths to run [trade-off named]');
	expect(flat).toContain('Flink [edge case]');
	expect(fb.metrics.recoveredFromStumbles).toBe(true);
});

test('restart detection finds repeated phrases but ignores legitimate repeats', () => {
	expect(findRestarts('for the immediate for the immediate response'.split(' '))).toEqual([[0, 3, 3]]);
	expect(findRestarts('is is latency'.split(' '))).toEqual([[0, 1, 1]]);
	expect(findRestarts('we had had enough'.split(' '))).toEqual([]);
});

test('typed answers skip pause and pace analysis', () => {
	const fb = analyseSpeech(fraud, typed('The constraint is two seconds, so we score on the stream. The trade-off is two paths.'));
	expect(fb.metrics.wpm).toBeNull();
	expect(fb.metrics.longPauses).toBe(0);
	expect(fb.confidence.summary).toContain('typed: no pause analysis');
	expect(fb.transcript.some((t) => t.type === 'marker' && t.kind === 'pause')).toBe(false);
});

test("every scenario's Lead 60-second version, spoken cleanly, sounds Lead-like", () => {
	for (const s of scenarios) {
		const fb = analyseSpeech(s, spokenCleanly(s.sixtySecond));
		const msg = `${s.id}: ${JSON.stringify({ c: fb.clarity, f: fb.confidence, p: fb.precision, l: fb.leadLike })}`;
		expect(fb.clarity.stars, msg).toBeGreaterThanOrEqual(4);
		expect(fb.confidence.stars, msg).toBeGreaterThanOrEqual(4);
		expect(fb.precision.stars, msg).toBeGreaterThanOrEqual(4);
		expect(fb.leadLike.stars, msg).toBeGreaterThanOrEqual(4);
	}
});

test('a hesitant, vague, rambling answer scores low and gets actionable tips', () => {
	const ramble =
		"um so basically I think we'd maybe use Kinesis and then and then also Lambda and stuff and then probably some kind of database and also things like Spark and then it's scalable and best practice and so on";
	const ans = spokenCleanly(ramble);
	ans.pauses = [
		{ start: 3000, end: 6500 },
		{ start: 9000, end: 12500 },
		{ start: 15000, end: 18000 }
	];
	const fb = analyseSpeech(fraud, ans);
	expect(fb.clarity.stars).toBeLessThanOrEqual(2);
	expect(fb.confidence.stars).toBeLessThanOrEqual(2);
	expect(fb.precision.stars).toBeLessThanOrEqual(2);
	expect(fb.leadLike.stars).toBeLessThanOrEqual(2);
	const tips = coachingTips(fb).join(' ');
	expect(tips).toMatch(/constraint/i);
	expect(tips).toMatch(/thinking time|signpost/i);
});

test('stumbling never scores full confidence, even with a good recovery', () => {
	const ans = spokenCleanly(
		"the constraint is is the two second budget so I'd score events in Lambda for the immediate for the immediate warning the trade-off is two paths and if rules needed state we'd move to Flink"
	);
	const fb = analyseSpeech(fraud, ans);
	expect(fb.metrics.restarts).toBe(2);
	expect(fb.metrics.recoveredFromStumbles).toBe(true);
	expect(fb.confidence.stars).toBe(4);
});

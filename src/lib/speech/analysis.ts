// Analysis of a spoken (or typed "thinking out loud") answer.
// Pure functions: given a transcript, timed segments and measured pauses, produce
// delivery metrics, four narrative ratings and an annotated transcript.

import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
import { evaluateChallenge } from '#lib/utils/challengeFeedback.ts';
import { BUZZWORDS, CONSTRAINT, HEDGES, SWITCH, TOOLS, TRADE_OFF, WHY } from '#lib/utils/articulation.ts';

export interface SpeechSegment {
	text: string;
	start: number; // ms since recording started (first interim result)
	end: number; // ms (final result)
}

export interface Pause {
	start: number; // ms
	end: number; // ms
}

export interface SpokenAnswer {
	transcript: string;
	segments: SpeechSegment[];
	pauses: Pause[]; // silences measured from the microphone, ≥ 700 ms
	durationMs: number;
	voiceStart: number | null; // first moment of speech (ms)
	voiceEnd: number | null; // last moment of speech (ms)
	typed: boolean; // typed instead of spoken: no pause or pace analysis
}

export interface Rating {
	stars: number; // 1–5
	summary: string; // short parenthetical, e.g. "1 long pause, 2 restarts"
	notes: string[]; // what moved the rating up or down
}

export interface DeliveryMetrics {
	words: number;
	speakingSeconds: number;
	wpm: number | null;
	openingSilenceSeconds: number | null;
	longPauses: number; // ≥ 2.5 s, between first and last speech
	hesitations: number; // 1.2–2.5 s
	restarts: number;
	fillers: string[];
	hedges: string[];
	buzzwords: string[];
	vague: string[];
	recoveredFromStumbles: boolean | null; // null when there were no stumbles
}

export interface SpeechFeedback {
	metrics: DeliveryMetrics;
	clarity: Rating;
	confidence: Rating;
	precision: Rating;
	leadLike: Rating;
	transcript: TranscriptToken[];
}

export type MarkerKind = 'pause' | 'restart' | 'good-opening' | 'late-constraint' | 'trade-off' | 'edge-case';
export type WordFlag = 'hedge' | 'buzzword' | 'filler' | 'vague' | 'abandoned';
export type TranscriptToken =
	| { type: 'word'; text: string; flags: WordFlag[] }
	| { type: 'marker'; kind: MarkerKind; label: string };

export const LONG_PAUSE_MS = 2500;
export const HESITATION_MS = 1200;

const FILLERS = /\b(u+m+|u+h+|e+r+m*|ah+|you know|i mean|basically|literally)\b/gi;
const VAGUE = /\b(stuff|things?|something like|some kind of|a bit|various|and so on|whatever|somehow|a lot of)\b/gi;
const DECISIVE = /\b(i'?d|we'?d|i would|we would|my recommendation|i recommend|the decision|i'?ll|we will|we'?ll)\b/i;
const RAMBLE_CHAIN = /\band (then|also|so)\b/gi;
const STRICT_TRADE_OFF = /\b(trade-?offs?|downside|the cost|give up|at the expense|in exchange|the catch)\b/i;
const SPECIFIC = /\b\d+(\.\d+)?\s?(%|percent|seconds?|minutes?|hours?|days?|months?|years?|ms|mb|gb|tb|k\b)|\b\d{2,}\b/i;
const REPEAT_OK = new Set(['had', 'that', 'very', 'no', 'bye']);

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
const uniqueLower = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()))];
const allMatches = (re: RegExp, text: string) => uniqueLower(text.match(new RegExp(re.source, 'gi')) ?? []);

/** Words with their character offsets in the lower-cased transcript. */
function tokenize(text: string): { word: string; start: number; end: number }[] {
	const out: { word: string; start: number; end: number }[] = [];
	const re = /[a-z0-9'’]+(?:-[a-z0-9'’]+)*/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) out.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
	return out;
}

/** Immediately repeated phrases ("is is", "for the immediate for the immediate"). Returns [firstStart, repeatStart, n]. */
export function findRestarts(words: string[]): [number, number, number][] {
	const found: [number, number, number][] = [];
	let i = 0;
	while (i < words.length) {
		let hit = 0;
		for (let n = 4; n >= 1; n--) {
			if (i + 2 * n > words.length) continue;
			const a = words.slice(i, i + n).join(' ');
			const b = words.slice(i + n, i + 2 * n).join(' ');
			if (a === b && !(n === 1 && REPEAT_OK.has(words[i]))) {
				hit = n;
				break;
			}
		}
		if (hit) {
			found.push([i, i + hit, hit]);
			i += hit * 2;
		} else i++;
	}
	return found;
}

function innerPauses(a: SpokenAnswer): Pause[] {
	if (a.typed || a.voiceStart === null || a.voiceEnd === null) return [];
	return a.pauses.filter((p) => p.start >= a.voiceStart! && p.end <= a.voiceEnd!);
}

export function analyseSpeech(scenario: ArchitectureScenario, answer: SpokenAnswer): SpeechFeedback {
	const text = answer.transcript.trim();
	const toks = tokenize(text);
	const words = toks.map((t) => t.word);
	const n = words.length;
	const pauses = innerPauses(answer);
	const restarts = findRestarts(words);

	// --- Delivery metrics ---
	const pausedMs = pauses.reduce((s, p) => s + (p.end - p.start), 0);
	const spanMs = answer.voiceStart !== null && answer.voiceEnd !== null ? answer.voiceEnd - answer.voiceStart : 0;
	const speakingMs = answer.typed ? 0 : Math.max(0, spanMs - pausedMs);
	const metrics: DeliveryMetrics = {
		words: n,
		speakingSeconds: Math.round(speakingMs / 100) / 10,
		wpm: !answer.typed && speakingMs > 5000 ? Math.round(n / (speakingMs / 60000)) : null,
		openingSilenceSeconds: !answer.typed && answer.voiceStart !== null ? Math.round(answer.voiceStart / 100) / 10 : null,
		longPauses: pauses.filter((p) => p.end - p.start >= LONG_PAUSE_MS).length,
		hesitations: pauses.filter((p) => p.end - p.start >= HESITATION_MS && p.end - p.start < LONG_PAUSE_MS).length,
		restarts: restarts.length,
		fillers: allMatches(FILLERS, text),
		hedges: allMatches(HEDGES, text),
		buzzwords: allMatches(BUZZWORDS, text),
		vague: allMatches(VAGUE, text),
		recoveredFromStumbles: null
	};
	const fillerCount = (text.match(new RegExp(FILLERS.source, 'gi')) ?? []).length;
	const vagueCount = (text.match(new RegExp(VAGUE.source, 'gi')) ?? []).length;

	// Structure signals (position-aware)
	const lower = text.toLowerCase();
	const wordIndexAt = (charIdx: number) => {
		const i = toks.findIndex((t) => t.end > charIdx);
		return i < 0 ? n : i;
	};
	const constraintMatch = CONSTRAINT.exec(lower);
	const constraintWord = constraintMatch ? wordIndexAt(constraintMatch.index) : -1;
	const constraintEarly = constraintWord >= 0 && constraintWord <= Math.max(12, n * 0.25);
	const tradeOff = TRADE_OFF.test(lower);
	const strictTradeOff = STRICT_TRADE_OFF.test(lower);
	const switchWhen = SWITCH.test(lower);
	const reasons = (lower.match(new RegExp(WHY.source, 'gi')) ?? []).length;
	const toolCount = (lower.match(new RegExp(TOOLS.source, 'gi')) ?? []).length;
	const rambleChains = (lower.match(RAMBLE_CHAIN) ?? []).length;
	const content = evaluateChallenge(scenario, { level1: text, choices: {}, reasons: {}, level3: {} });
	const essentials = scenario.concepts.filter((c) => c.importance === 'essential');
	const essentialShare = essentials.length ? essentials.filter((c) => content.conceptsMatched.includes(c)).length / essentials.length : 0;

	// Recovery: after the first stumble, did the answer still reach a trade-off or switch condition?
	const firstStumbleWord = restarts.length ? restarts[0][1] : -1;
	const stumbles = restarts.length + metrics.longPauses;
	if (stumbles > 0) {
		const after = firstStumbleWord >= 0 ? toks.slice(firstStumbleWord).map((t) => t.word).join(' ') : lower;
		metrics.recoveredFromStumbles = TRADE_OFF.test(after) || SWITCH.test(after) || WHY.test(after);
	}

	// --- Clarity: structured and easy to follow, or rambling? ---
	const cn: string[] = [];
	let clarity = 5;
	if (!constraintEarly) {
		clarity -= 1;
		cn.push(constraintWord >= 0 ? 'constraint came late' : 'no constraint stated');
	} else cn.push('opened with the constraint');
	if (!tradeOff) {
		clarity -= 1;
		cn.push('no trade-off');
	}
	if (n > 320 || rambleChains >= 4) {
		clarity -= 1;
		cn.push(n > 320 ? `long (${n} words)` : `"and then / and also" chains (${rambleChains})`);
	}
	if (n < 40) {
		clarity -= 1;
		cn.push(`very short (${n} words)`);
	}
	if (toolCount >= 4 && reasons <= 1) {
		clarity -= 1;
		cn.push('tools listed without reasons');
	}
	const claritySummary = constraintEarly && tradeOff && clarity >= 4 ? 'structured, easy to follow' : cn.slice(0, 2).join(', ');

	// --- Confidence: steady delivery or hesitant? ---
	const fn: string[] = [];
	let confidence = 5;
	if (!answer.typed) {
		if (metrics.longPauses >= 3) confidence -= 2;
		else if (metrics.longPauses >= 1) confidence -= 1;
		if (metrics.hesitations >= 5) confidence -= 1;
		if (metrics.wpm !== null && (metrics.wpm < 100 || metrics.wpm > 190)) {
			confidence -= 1;
			fn.push(metrics.wpm < 100 ? `slow pace (${metrics.wpm} wpm)` : `rushed pace (${metrics.wpm} wpm)`);
		}
	}
	if (restarts.length >= 4) confidence -= 2;
	else if (restarts.length >= 2) confidence -= 1;
	const minutes = Math.max(1, (answer.typed ? n / 150 : speakingMs / 60000) || 1);
	if (fillerCount / minutes > 4) {
		confidence -= 1;
		fn.push(`fillers (${metrics.fillers.join(', ')})`);
	}
	if (metrics.hedges.length >= 2) {
		confidence -= 1;
		fn.push(`hedging (${metrics.hedges.join(', ')})`);
	}
	if (stumbles > 0 && metrics.recoveredFromStumbles) {
		// Recovery softens a heavy penalty; it never restores full marks after stumbling
		if (confidence <= 3) confidence += 0.5;
		fn.push('recovered well after stumbling');
	}
	const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
	const confidenceParts = answer.typed
		? [plural(restarts.length, 'restart'), 'typed: no pause analysis']
		: [plural(metrics.longPauses, 'long pause'), plural(restarts.length, 'restart'), ...(metrics.wpm ? [`${metrics.wpm} wpm`] : [])];

	// --- Precision: specific or vague? ---
	const pn: string[] = [];
	let precision = 1;
	if (constraintWord >= 0) {
		precision += 1;
		pn.push('named the constraint');
	}
	if (tradeOff) {
		precision += 1;
		pn.push('named a trade-off');
	}
	if (switchWhen) {
		precision += 1;
		pn.push('gave an edge case');
	}
	if (SPECIFIC.test(lower)) {
		precision += 0.5;
		pn.push('used specific numbers');
	}
	if (essentialShare >= 0.5) {
		precision += 1;
		pn.push(`${Math.round(essentialShare * 100)}% of key ideas`);
	}
	if (vagueCount >= 3) {
		precision -= 1;
		pn.push(`vague words (${metrics.vague.join(', ')})`);
	}
	if (metrics.buzzwords.length) {
		precision -= 1;
		pn.push(`buzzwords (${metrics.buzzwords.join(', ')})`);
	}

	// --- Lead-like: sounds like someone who has done this ---
	const ln: string[] = [];
	let lead = 1;
	if (constraintEarly) {
		lead += 1;
		ln.push('leads with the constraint');
	}
	if (strictTradeOff || tradeOff) {
		lead += 1;
		ln.push('owns the trade-off');
	}
	if (switchWhen) {
		lead += 1;
		ln.push("knows when they'd change course");
	}
	if (DECISIVE.test(lower) && metrics.hedges.length < 2) {
		lead += 1;
		ln.push('decisive ("I\'d", "we\'d")');
	} else if (metrics.hedges.length >= 2) ln.push('hedging undercuts authority');
	if (metrics.buzzwords.length === 0 && restarts.length < 3) {
		lead += 0.5;
	}

	return {
		metrics,
		clarity: { stars: clamp(clarity), summary: claritySummary, notes: cn },
		confidence: {
			stars: clamp(confidence),
			summary: [...confidenceParts, ...fn.filter((x) => !x.startsWith('recovered'))].slice(0, 4).join(', '),
			notes: fn
		},
		precision: { stars: clamp(precision), summary: pn.filter((x) => !/vague|buzz/.test(x)).slice(0, 3).join(', ') || 'mostly general statements', notes: pn },
		leadLike: {
			stars: clamp(lead),
			summary: clamp(lead) >= 4 ? "sounds like someone who's done this" : ln.slice(0, 2).join(', ') || 'more description than decision',
			notes: ln
		},
		transcript: annotate(answer, toks, restarts, constraintWord, constraintEarly)
	};
}

/** Builds the annotated transcript: words with flags plus inline markers. */
function annotate(
	answer: SpokenAnswer,
	toks: { word: string; start: number; end: number }[],
	restarts: [number, number, number][],
	constraintWord: number,
	constraintEarly: boolean
): TranscriptToken[] {
	const text = answer.transcript.trim();
	const lower = text.toLowerCase();
	const n = toks.length;
	const flags: WordFlag[][] = toks.map(() => []);
	const before: { kind: MarkerKind; label: string }[][] = toks.map(() => []);
	const after: { kind: MarkerKind; label: string }[][] = toks.map(() => []);
	const wordIndexAt = (charIdx: number) => {
		const i = toks.findIndex((t) => t.end > charIdx);
		return i < 0 ? n - 1 : i;
	};
	const flagMatches = (re: RegExp, flag: WordFlag) => {
		for (const m of lower.matchAll(new RegExp(re.source, 'gi'))) {
			const a = wordIndexAt(m.index ?? 0);
			const b = wordIndexAt((m.index ?? 0) + m[0].length - 1);
			for (let i = a; i <= b && i < n; i++) if (!flags[i].includes(flag)) flags[i].push(flag);
		}
	};
	// Last word of each recognised segment (speech recognisers give phrases, not punctuation)
	const segmentEnds = new Set<number>();
	if (!answer.typed) {
		let acc = 0;
		for (const s of answer.segments) {
			acc += tokenize(s.text).length;
			segmentEnds.add(acc - 1);
		}
	}
	// End of the clause containing a word: punctuation, a joining word after ≥3 words,
	// the end of a recognised segment, or 10 words, whichever comes first
	const JOINERS = new Set(['and', 'but', 'so', 'then', 'if', 'because', 'which', 'while']);
	const clauseEnd = (from: number) => {
		for (let i = from; i < Math.min(n, from + 10); i++) {
			const nextChar = text[toks[i].end];
			if (nextChar && /[.?!,;—–]/.test(nextChar)) return i;
			if (segmentEnds.has(i)) return i;
			if (i + 1 < n && i - from >= 3 && JOINERS.has(toks[i + 1].word)) return i;
		}
		return Math.min(n - 1, from + 9);
	};

	flagMatches(HEDGES, 'hedge');
	flagMatches(BUZZWORDS, 'buzzword');
	flagMatches(FILLERS, 'filler');
	flagMatches(VAGUE, 'vague');

	for (const [first, repeat, len] of restarts) {
		for (let i = first; i < first + len; i++) flags[i].push('abandoned');
		before[repeat].push({ kind: 'restart', label: 'restart' });
	}
	if (constraintWord >= 0 && n) {
		after[clauseEnd(constraintWord)].push(
			constraintEarly ? { kind: 'good-opening', label: 'good opening' } : { kind: 'late-constraint', label: 'constraint came late: lead with it' }
		);
	}
	const t = STRICT_TRADE_OFF.exec(lower) ?? TRADE_OFF.exec(lower);
	if (t && n) after[clauseEnd(wordIndexAt(t.index))].push({ kind: 'trade-off', label: 'trade-off named' });
	const sw = SWITCH.exec(lower);
	if (sw && n) after[clauseEnd(wordIndexAt(sw.index))].push({ kind: 'edge-case', label: 'edge case' });

	// Pauses: place each before the first segment that started after the pause began
	if (!answer.typed && answer.segments.length) {
		const segStartWord: number[] = [];
		let acc = 0;
		for (const s of answer.segments) {
			segStartWord.push(acc);
			acc += tokenize(s.text).length;
		}
		for (const p of innerPauses(answer)) {
			const ms = p.end - p.start;
			if (ms < HESITATION_MS) continue;
			const si = answer.segments.findIndex((s) => s.start >= p.start);
			const w = si < 0 ? -1 : segStartWord[si];
			if (w > 0 && w < n) before[w].unshift({ kind: 'pause', label: `pause ${(ms / 1000).toFixed(1)}s` });
		}
	}

	const out: TranscriptToken[] = [];
	toks.forEach((tk, i) => {
		for (const m of before[i]) out.push({ type: 'marker', ...m });
		out.push({ type: 'word', text: text.slice(tk.start, tk.end), flags: flags[i] });
		for (const m of after[i]) out.push({ type: 'marker', ...m });
	});
	return out;
}

export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** The 2–3 most useful things to work on next, phrased as actions. */
export function coachingTips(fb: SpeechFeedback): string[] {
	const m = fb.metrics;
	const tips: string[] = [];
	if (fb.clarity.notes.some((n) => /constraint came late|no constraint/.test(n)))
		tips.push('Open with the constraint: "The constraint is…". It gives every choice after it a reason.');
	if (m.longPauses >= 1)
		tips.push(
			'When you need thinking time, say it: "Let me take that in three parts." Signposting sounds confident; silence sounds stuck.'
		);
	if (m.restarts >= 2)
		tips.push('Finish the sentence you started. A slightly clumsy sentence costs less than a restart.');
	if (fb.clarity.notes.includes('no trade-off')) tips.push('Name what your design gives up: "The trade-off is…".');
	if (m.hedges.length >= 2) tips.push(`Drop the hedges (${m.hedges.join(', ')}). State the decision, then the condition: "I'd do X. If Y, I'd switch to Z."`);
	if (m.buzzwords.length) tips.push(`Swap buzzwords (${m.buzzwords.join(', ')}) for specifics: which scale, which practice, compliant with what.`);
	if (fb.clarity.notes.some((n) => /long \(|chains/.test(n)))
		tips.push('Cut it down: aim for 60–90 seconds and 3–4 points. "And then… and also…" is the sound of rambling.');
	if (m.wpm !== null && m.wpm > 190) tips.push(`Slow down (${m.wpm} wpm). Around 140–160 sounds measured.`);
	if (m.wpm !== null && m.wpm < 100) tips.push(`Pick up the pace a little (${m.wpm} wpm). Around 140–160 sounds measured.`);
	if (!tips.length) tips.push('Strong delivery. Practise the same answer in 45 seconds to make it even sharper.');
	if (m.recoveredFromStumbles) tips.push('Good recovery: you stumbled but still finished the structure. Keep doing that.');
	return tips.slice(0, 3);
}

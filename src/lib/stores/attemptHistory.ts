import { writable, derived } from 'svelte/store';
import { browser } from '$app/env';
import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
import { evaluateChallenge, type ChallengeAnswers } from '#lib/utils/challengeFeedback.ts';
import { evaluateArticulation, nextStarAdvice, scoreChallenge, type NextStarAdvice } from '#lib/utils/articulation.ts';

// Every Architecture Challenge submission, with the answers and a snapshot of the feedback
// as it was given. Stored in localStorage; survives refreshes.

export type ScoreKey = 'structure' | 'clarity' | 'depth';

export interface Attempt {
	id: string;
	scenarioId: string;
	scenarioTitle: string;
	timestamp: string; // ISO
	answers: ChallengeAnswers;
	scores: Record<ScoreKey, number>;
	scoreReasons: Record<ScoreKey, string[]>;
	feedback: {
		strengths: string[]; // explained well
		sharpen: string[];
		gaps: string[]; // missing the why
		covered: string[]; // key ideas covered
		missed: string[]; // essential ideas missed
		nextStar: NextStarAdvice;
		summary: string; // one line for the journal
	};
	selfRating: number | null; // 1–5, how it felt
}

export interface AttemptFilter {
	scenarioId: string | 'all';
	range: 'all' | 'today' | '7d' | '30d';
	sort: 'newest' | 'score';
}

const STORAGE_KEY = 'challenge-attempts-v1';
const MAX_ATTEMPTS = 300;

export const average = (a: Pick<Attempt, 'scores'>) => Math.round(((a.scores.structure + a.scores.clarity + a.scores.depth) / 3) * 10) / 10;

const firstSentence = (s: string) => s.replace(/\.$/, '').split(/\.\s/)[0];

/** Builds the stored record for a submission (pure: also used by tests). */
export function buildAttempt(scenario: ArchitectureScenario, answers: ChallengeAnswers, now = new Date()): Attempt {
	const scores = scoreChallenge(scenario, answers);
	const artic = evaluateArticulation(scenario, answers);
	const content = evaluateChallenge(scenario, answers);
	const missed = scenario.concepts.filter((c) => c.importance === 'essential' && !content.conceptsMatched.includes(c)).map((c) => c.label);
	const good = artic.strengths[0]?.text;
	const bad = missed[0] ?? artic.gaps[0]?.text ?? artic.sharpen[0]?.text;
	const summary = [good && `Good: ${firstSentence(good)}`, bad && `Missing: ${firstSentence(bad)}`].filter(Boolean).join(' · ') || 'Submitted';
	return {
		id: `ch_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		scenarioId: scenario.id,
		scenarioTitle: scenario.title,
		timestamp: now.toISOString(),
		answers: plainCopy(answers),
		scores: { structure: scores.structure.value, clarity: scores.clarity.value, depth: scores.depth.value },
		scoreReasons: { structure: scores.structure.reasons, clarity: scores.clarity.reasons, depth: scores.depth.reasons },
		feedback: {
			strengths: artic.strengths.map((i) => i.text),
			sharpen: artic.sharpen.map((i) => (i.quote ? `${i.text} You wrote: "${i.quote}"` : i.text)),
			gaps: artic.gaps.map((i) => i.text),
			covered: content.conceptsMatched.map((c) => c.label),
			missed,
			nextStar: nextStarAdvice(scenario, answers),
			summary
		},
		selfRating: null
	};
}

/** Plain-object copy (answers may be a Svelte state proxy). */
function plainCopy(a: ChallengeAnswers): ChallengeAnswers {
	return JSON.parse(JSON.stringify(a)) as ChallengeAnswers;
}

export function filterAttempts(list: Attempt[], f: AttemptFilter, now = Date.now()): Attempt[] {
	const day = 86_400_000;
	const since =
		f.range === 'today'
			? new Date(new Date(now).toDateString()).getTime()
			: f.range === '7d'
				? now - 7 * day
				: f.range === '30d'
					? now - 30 * day
					: 0;
	const out = list.filter((a) => (f.scenarioId === 'all' || a.scenarioId === f.scenarioId) && Date.parse(a.timestamp) >= since);
	return out.sort((a, b) =>
		f.sort === 'score'
			? average(b) - average(a) || Date.parse(b.timestamp) - Date.parse(a.timestamp)
			: Date.parse(b.timestamp) - Date.parse(a.timestamp)
	);
}

function load(): Attempt[] {
	if (!browser) return [];
	try {
		const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
		return Array.isArray(v) ? (v as Attempt[]) : [];
	} catch {
		return [];
	}
}

function createHistory() {
	const store = writable<Attempt[]>(load());
	store.subscribe((v) => {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
		} catch {
			// storage unavailable or full: history lasts for this session only
		}
	});
	return {
		subscribe: store.subscribe,
		add: (attempt: Attempt) => store.update((all) => [...all, attempt].slice(-MAX_ATTEMPTS)),
		setSelfRating: (id: string, rating: number | null) =>
			store.update((all) => all.map((a) => (a.id === id ? { ...a, selfRating: rating } : a))),
		remove: (id: string) => store.update((all) => all.filter((a) => a.id !== id)),
		reset: () => store.set([])
	};
}

export const attemptHistory = createHistory();

export type Trend = 'up' | 'flat' | 'down';

/** Averages and trends per score: earlier half of your attempts vs the later half. */
export const historyStats = derived(attemptHistory, ($a) => {
	const chrono = [...$a].sort((x, y) => Date.parse(x.timestamp) - Date.parse(y.timestamp));
	const keys: ScoreKey[] = ['structure', 'clarity', 'depth'];
	const avg = (xs: Attempt[], k: ScoreKey) => (xs.length ? Math.round((xs.reduce((n, a) => n + a.scores[k], 0) / xs.length) * 10) / 10 : 0);
	const half = Math.floor(chrono.length / 2);
	const early = chrono.slice(0, half);
	const late = chrono.slice(half);
	const per = Object.fromEntries(
		keys.map((k) => {
			const d = chrono.length >= 2 ? avg(late, k) - avg(early, k) : 0;
			const trend: Trend = d >= 0.3 ? 'up' : d <= -0.3 ? 'down' : 'flat';
			return [k, { average: avg(chrono, k), trend, change: Math.round(d * 10) / 10 }];
		})
	) as Record<ScoreKey, { average: number; trend: Trend; change: number }>;
	// What to revisit: a declining score first, otherwise the lowest average
	const declining = keys.filter((k) => per[k].trend === 'down');
	const revisit = chrono.length ? (declining.length ? declining : [...keys].sort((a, b) => per[a].average - per[b].average).slice(0, 1)) : [];
	const byScenario = new Map<string, Attempt[]>();
	for (const a of chrono) byScenario.set(a.scenarioId, [...(byScenario.get(a.scenarioId) ?? []), a]);
	return { total: chrono.length, per, revisit, byScenario: [...byScenario.entries()] };
});

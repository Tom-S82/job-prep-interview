import { writable, derived } from 'svelte/store';
import { browser } from '$app/env';
import { capstone, scenarios } from '#lib/data/scenarios.ts';

export interface AttemptResult {
	structure: number; // 1–5
	clarity: number; // 1–5
	depth: number; // 1–5
	coverage: number; // % of key ideas covered
	choices: number; // % of Level 2 choices matching the Lead's
	at: string; // ISO timestamp
}

export interface ScenarioProgress {
	attempts: number;
	last: AttemptResult;
	best: AttemptResult; // highest total of structure + clarity + depth
}

const STORAGE_KEY = 'challenge-progress-v1';
const total = (r: AttemptResult) => r.structure + r.clarity + r.depth;

function load(): Record<string, ScenarioProgress> {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, ScenarioProgress>;
	} catch {
		return {};
	}
}

function createChallengeProgress() {
	const store = writable<Record<string, ScenarioProgress>>(load());
	store.subscribe((v) => {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
		} catch {
			// storage unavailable: progress lasts for this session only
		}
	});

	return {
		subscribe: store.subscribe,
		record: (scenarioId: string, result: AttemptResult) =>
			store.update((all) => {
				const prev = all[scenarioId];
				const best = !prev || total(result) >= total(prev.best) ? result : prev.best;
				return { ...all, [scenarioId]: { attempts: (prev?.attempts ?? 0) + 1, last: result, best } };
			}),
		reset: () => store.set({})
	};
}

export const challengeProgress = createChallengeProgress();

const mainIds = new Set(scenarios.map((s) => s.id));

/** Averages across the main scenarios (latest attempt each); capstone parts are summarised separately. */
export const challengeSummary = derived(challengeProgress, ($p) => {
	const done = Object.entries($p)
		.filter(([id]) => mainIds.has(id))
		.map(([, v]) => v);
	const avg = (f: (r: AttemptResult) => number) =>
		done.length ? Math.round((done.reduce((n, d) => n + f(d.last), 0) / done.length) * 10) / 10 : 0;
	return {
		completed: done.length,
		structure: avg((r) => r.structure),
		clarity: avg((r) => r.clarity),
		depth: avg((r) => r.depth),
		coverage: Math.round(avg((r) => r.coverage))
	};
});

/** Capstone progress: parts completed, and averages across them. */
export const capstoneSummary = derived(challengeProgress, ($p) => {
	const done = capstone.parts.filter((part) => $p[part.id]);
	const avg = (f: (r: AttemptResult) => number) =>
		done.length ? Math.round((done.reduce((n, part) => n + f($p[part.id].last), 0) / done.length) * 10) / 10 : 0;
	const next = capstone.parts.find((part) => !$p[part.id]) ?? capstone.parts[0];
	return {
		completed: done.length,
		total: capstone.parts.length,
		doneIds: done.map((part) => part.id),
		nextId: next.id,
		structure: avg((r) => r.structure),
		clarity: avg((r) => r.clarity),
		depth: avg((r) => r.depth)
	};
});

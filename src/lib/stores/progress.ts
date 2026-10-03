import { writable, derived } from 'svelte/store';
import { browser } from '$app/env';
import { questionSets } from '#lib/data/questions.ts';

export type Confidence = 'green' | 'amber' | 'red';

// questionKey → latest confidence rating
type Ratings = Record<string, Confidence>;

const STORAGE_KEY = 'interview-progress-v1';

export const questionKey = (setId: string, question: string) => `${setId}::${question}`;

function load(): Ratings {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Ratings;
	} catch {
		return {};
	}
}

function createProgress() {
	const store = writable<Ratings>(load());

	store.subscribe((value) => {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		} catch {
			// storage unavailable (private mode etc.): progress lives for this session only
		}
	});

	return {
		subscribe: store.subscribe,
		rate: (setId: string, question: string, c: Confidence) =>
			store.update((r) => ({ ...r, [questionKey(setId, question)]: c })),
		reset: () => store.set({})
	};
}

export const ratings = createProgress();

export interface SetProgress {
	total: number;
	green: number;
	amber: number;
	red: number;
	pctGreen: number;
}

// Stage/set id → counts and % green
export const progress = derived(ratings, ($r) => {
	const out: Record<string, SetProgress> = {};
	for (const set of questionSets) {
		const p: SetProgress = { total: set.questions.length, green: 0, amber: 0, red: 0, pctGreen: 0 };
		for (const q of set.questions) {
			const c = $r[questionKey(set.id, q.q)];
			if (c) p[c]++;
		}
		p.pctGreen = p.total ? Math.round((p.green / p.total) * 100) : 0;
		out[set.id] = p;
	}
	return out;
});

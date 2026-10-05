import { writable, derived } from 'svelte/store';
import { browser } from '$app/env';
import { questionSets } from '#lib/data/questions.ts';

export type Confidence = 'green' | 'amber' | 'red';
export type Accuracy = 'nailed' | 'close' | 'missed';

export const questionKey = (setId: string, question: string) => `${setId}::${question}`;

// questionKey → latest rating, persisted to localStorage (falls back to in-memory)
function createRatingStore<T extends string>(storageKey: string) {
	let initial: Record<string, T> = {};
	if (browser) {
		try {
			initial = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, T>;
		} catch {
			initial = {};
		}
	}
	const store = writable<Record<string, T>>(initial);

	store.subscribe((value) => {
		if (!browser) return;
		try {
			localStorage.setItem(storageKey, JSON.stringify(value));
		} catch {
			// storage unavailable (private mode etc.): progress lives for this session only
		}
	});

	return {
		subscribe: store.subscribe,
		rate: (setId: string, question: string, value: T) =>
			store.update((r) => ({ ...r, [questionKey(setId, question)]: value })),
		reset: () => store.set({})
	};
}

/** How confident you felt (self-assessed). */
export const ratings = createRatingStore<Confidence>('interview-progress-v1');
/** How closely your attempt matched the model answer. Tracked separately from confidence. */
export const accuracy = createRatingStore<Accuracy>('interview-accuracy-v1');

export function resetAll() {
	ratings.reset();
	accuracy.reset();
}

export interface SetProgress {
	total: number;
	green: number;
	amber: number;
	red: number;
	pctGreen: number;
	nailed: number;
	close: number;
	missed: number;
	/** Nailed = 100%, close = 50%, missed or unscored = 0%, averaged over all questions */
	pctAccuracy: number;
}

// Stage/set id → confidence and accuracy summary
export const progress = derived([ratings, accuracy], ([$r, $a]) => {
	const out: Record<string, SetProgress> = {};
	for (const set of questionSets) {
		const p: SetProgress = {
			total: set.questions.length,
			green: 0,
			amber: 0,
			red: 0,
			pctGreen: 0,
			nailed: 0,
			close: 0,
			missed: 0,
			pctAccuracy: 0
		};
		for (const q of set.questions) {
			const key = questionKey(set.id, q.q);
			const c = $r[key];
			if (c) p[c]++;
			const acc = $a[key];
			if (acc) p[acc]++;
		}
		if (p.total) {
			p.pctGreen = Math.round((p.green / p.total) * 100);
			p.pctAccuracy = Math.round(((p.nailed + p.close * 0.5) / p.total) * 100);
		}
		out[set.id] = p;
	}
	return out;
});

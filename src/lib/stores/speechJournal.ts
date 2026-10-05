import { writable, derived } from 'svelte/store';
import { browser } from '$app/env';
import type { SpeechFeedback } from '#lib/speech/analysis.ts';
import { MAX_RECORDINGS, pruneRecordings } from '#lib/speech/recordings.ts';

export type PracticeMode = 'speak' | 'simulation';

export interface JournalEntry {
	id: string;
	at: string; // ISO timestamp
	mode: PracticeMode;
	simulationId?: string;
	scenarioId: string;
	typed: boolean;
	hasRecording: boolean;
	durationSec: number;
	words: number;
	wpm: number | null;
	longPauses: number;
	restarts: number;
	fillers: number;
	rambled: boolean;
	ratings: { clarity: number; confidence: number; precision: number; leadLike: number };
	transcript: string;
}

/** Your own read-through of the Lead's 60-second answer, used as a pacing reference. */
export interface ReferenceReading {
	at: string;
	durationSec: number;
	wpm: number | null;
	longPauses: number;
	restarts: number;
}

interface JournalState {
	entries: JournalEntry[]; // newest last
	references: Record<string, ReferenceReading>;
}

const STORAGE_KEY = 'speak-journal-v1';
const MAX_ENTRIES = 200;

function load(): JournalState {
	const empty: JournalState = { entries: [], references: {} };
	if (!browser) return empty;
	try {
		return { ...empty, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<JournalState>) };
	} catch {
		return empty;
	}
}

export const newAttemptId = () => `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export function toEntry(
	fb: SpeechFeedback,
	base: { id: string; mode: PracticeMode; scenarioId: string; typed: boolean; hasRecording: boolean; durationMs: number; transcript: string; simulationId?: string }
): JournalEntry {
	return {
		id: base.id,
		at: new Date().toISOString(),
		mode: base.mode,
		simulationId: base.simulationId,
		scenarioId: base.scenarioId,
		typed: base.typed,
		hasRecording: base.hasRecording,
		durationSec: Math.round(base.durationMs / 1000),
		words: fb.metrics.words,
		wpm: fb.metrics.wpm,
		longPauses: fb.metrics.longPauses,
		restarts: fb.metrics.restarts,
		fillers: fb.metrics.fillers.length,
		rambled: fb.clarity.notes.some((n) => /long \(|chains/.test(n)),
		ratings: { clarity: fb.clarity.stars, confidence: fb.confidence.stars, precision: fb.precision.stars, leadLike: fb.leadLike.stars },
		transcript: base.transcript
	};
}

function createJournal() {
	const store = writable<JournalState>(load());
	store.subscribe((v) => {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
		} catch {
			// storage unavailable or full: the journal lasts for this session only
		}
	});

	return {
		subscribe: store.subscribe,
		add: (entry: JournalEntry) =>
			store.update((s) => {
				const entries = [...s.entries, entry].slice(-MAX_ENTRIES);
				// Keep audio only for the most recent attempts that have recordings
				const keep = new Set(entries.filter((e) => e.hasRecording).slice(-MAX_RECORDINGS).map((e) => e.id));
				pruneRecordings(keep).catch(() => {});
				return { ...s, entries: entries.map((e) => (e.hasRecording && !keep.has(e.id) ? { ...e, hasRecording: false } : e)) };
			}),
		setReference: (scenarioId: string, ref: ReferenceReading) =>
			store.update((s) => ({ ...s, references: { ...s.references, [scenarioId]: ref } })),
		reset: () => {
			store.update((st) => ({ entries: [], references: st.references }));
			pruneRecordings(new Set()).catch(() => {}); // attempt audio goes; Lead read-throughs stay
		}
	};
}

export const journal = createJournal();

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

export const journalStats = derived(journal, ($j) => {
	const e = $j.entries;
	const first = e.slice(0, 3);
	const last = e.slice(-3);
	const trend = (k: keyof JournalEntry['ratings']) => ({
		first: avg(first.map((x) => x.ratings[k])),
		last: avg(last.map((x) => x.ratings[k])),
		delta: Math.round((avg(last.map((x) => x.ratings[k])) - avg(first.map((x) => x.ratings[k]))) * 10) / 10
	});
	const byScenario = new Map<string, JournalEntry[]>();
	for (const x of e) byScenario.set(x.scenarioId, [...(byScenario.get(x.scenarioId) ?? []), x]);
	const scenarios = [...byScenario.entries()].map(([scenarioId, xs]) => ({
		scenarioId,
		attempts: xs.length,
		clarity: avg(xs.map((x) => x.ratings.clarity)),
		confidence: avg(xs.map((x) => x.ratings.confidence)),
		rambleRate: Math.round((xs.filter((x) => x.rambled).length / xs.length) * 100)
	}));
	// Weak = lowest clarity, then most rambling; only where there is evidence (2+ attempts or clarity ≤ 3)
	const weak = [...scenarios]
		.filter((s) => s.attempts >= 2 || s.clarity <= 3)
		.sort((a, b) => a.clarity - b.clarity || b.rambleRate - a.rambleRate)
		.slice(0, 3);
	return {
		total: e.length,
		clarity: trend('clarity'),
		confidence: trend('confidence'),
		precision: trend('precision'),
		leadLike: trend('leadLike'),
		scenarios,
		weak
	};
});

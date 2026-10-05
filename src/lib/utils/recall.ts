import type { InterviewQuestion } from '#lib/data/stages.ts';

const MAX_POINTS = 5;
const MAX_LEN = 60;

/**
 * Recall cues for a question: hand-written `keyPoints` when present, otherwise
 * extracted from the answer. Bold phrases are the author's own emphasis, so they
 * are preferred; if there are too few, fall back to the opening clause of each paragraph.
 */
export function keyPointsFor(q: InterviewQuestion): string[] {
	if (q.keyPoints?.length) return q.keyPoints;
	if (!q.a) return [];
	return extractKeyPoints(q.a);
}

export function extractKeyPoints(answer: string): string[] {
	const seen = new Set<string>();
	const points: string[] = [];
	const add = (raw: string) => {
		const p = tidy(raw);
		const key = p.toLowerCase();
		if (p.length < 3 || seen.has(key) || points.length >= MAX_POINTS) return;
		seen.add(key);
		points.push(p);
	};

	for (const m of answer.matchAll(/\*\*(.+?)\*\*/g)) add(m[1]);

	if (points.length < 3) {
		for (const para of answer.split(/\n\s*\n/)) {
			const first = para.replace(/\*\*/g, '').split(/(?<=[.:?!])\s/)[0];
			add(first);
		}
	}
	return points;
}

/** Whether to show the key-points stage for this question. */
export function usesScaffold(q: InterviewQuestion): boolean {
	return q.progressiveReveal !== false && keyPointsFor(q).length > 0;
}

function tidy(s: string): string {
	let t = s.replace(/\s+/g, ' ').replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, '').trim();
	if (t.length > MAX_LEN) t = t.slice(0, MAX_LEN).replace(/\s+\S*$/, '') + '…';
	return t.charAt(0).toUpperCase() + t.slice(1);
}

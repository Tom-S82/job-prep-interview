import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
import {
	allText,
	evaluateChallenge,
	evaluateLevel3,
	type ChallengeAnswers,
	type FeedbackItem
} from '#lib/utils/challengeFeedback.ts';

// Deterministic checks on HOW something was explained: constraint first, reasons, trade-off,
// "when we'd switch", and the habits that weaken an answer (hedging, buzzwords, tool lists).
// One set of signals drives both the written feedback and the 1–5 scores.

export interface ArticulationFeedback {
	strengths: FeedbackItem[];
	sharpen: FeedbackItem[];
	gaps: FeedbackItem[];
}

export interface Score {
	value: number; // 1–5
	reasons: string[]; // why it got this score
}

export interface ChallengeScores {
	structure: Score;
	clarity: Score;
	depth: Score;
}

export const CONSTRAINT =
	/\b(constraint|requirement|the problem|the risk|the goal|must|can'?t|cannot|need(s)? to|has to|have to|budget|deadline|within|under \d|\d+\s?(seconds?|secs?|s|minutes?|months?|days?|years?))\b/i;
// "So" counts when it links a reason to a decision: "…, so we…" or a sentence opening "So…"
export const WHY = /\b(because|so that|which means|since|this means|that'?s why|in order to|otherwise|so (we|it|the|that))\b|(?:^|[.;:!?,]\s+)so\b/i;
export const TRADE_OFF = /\b(trade-?offs?|downside|the cost|costs? (us|more)|at the expense|in exchange|the catch|instead of|give up|but\b|however)/i;
export const SWITCH = /\b(if\b.{0,80}\b(we'?d|i'?d|would|switch|move|change)|unless|would switch|we'?d switch|trigger)/i;
export const HEDGES = /\b(maybe|perhaps|i think|i guess|probably|kind of|sort of|hopefully|etc\.?|might)\b/gi;
export const BUZZWORDS =
	/\b(best practices?|scalable|robust|modern(ise|ize|isation|ization)?|leverage|cutting[- ]edge|seamless(ly)?|synergy|future[- ]proof|industry[- ]standard|state[- ]of[- ]the[- ]art|fully compliant|democratis(e|ing)|democratiz(e|ing))\b/gi;
export const TOOLS =
	/\b(kinesis|lambda|dynamo\w*|flink|spark|glue|dbt|redshift|s3|iceberg|athena|ssis|dms|kafka|msk|emr|sagemaker|power bi|quicksight|airflow|step functions|terraform|machine learning|ml|ai)\b/gi;

const lines = (s: string) =>
	s
		.split('\n')
		.map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
		.filter(Boolean);
const clip = (s: string, n = 90) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const unique = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()))];
const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

interface Signals {
	l1: string[];
	reasons: string[];
	constraintLine: number; // -1 if never stated
	toolFirst: string | null;
	whyLines: number;
	toolCount: number;
	toolSoup: boolean;
	tradeOff: boolean;
	switchWhen: boolean;
	hedges: string[];
	buzzwords: string[];
	wallOfText: boolean;
}

function signals(scenario: ArchitectureScenario, answers: ChallengeAnswers): Signals {
	const l1 = lines(answers.level1);
	const reasons = scenario.level2.map((q) => (answers.reasons[q.id] ?? '').trim());
	const all = allText(answers);
	const constraintLine = l1.findIndex((l) => CONSTRAINT.test(l));
	const firstTools = l1[0]?.match(TOOLS);
	const whyLines = all.split('\n').filter((l) => WHY.test(l)).length;
	const toolCount = (all.match(TOOLS) ?? []).length;
	return {
		l1,
		reasons,
		constraintLine,
		toolFirst: firstTools && constraintLine !== 0 ? firstTools[0] : null,
		whyLines,
		toolCount,
		toolSoup: toolCount >= 4 && whyLines <= 1,
		tradeOff: TRADE_OFF.test(all),
		switchWhen: SWITCH.test(all),
		hedges: unique(all.match(HEDGES) ?? []),
		buzzwords: unique(all.match(BUZZWORDS) ?? []),
		wallOfText: l1.length < 3 && answers.level1.length > 300
	};
}

export function evaluateArticulation(scenario: ArchitectureScenario, answers: ChallengeAnswers): ArticulationFeedback {
	const s = signals(scenario, answers);
	const strengths: FeedbackItem[] = [];
	const sharpen: FeedbackItem[] = [];
	const gaps: FeedbackItem[] = [];

	// 1. Lead with the constraint
	if (s.constraintLine === 0) {
		strengths.push({ text: 'You led with the constraint.', detail: 'Everything after it now has a reason to exist.', quote: clip(s.l1[0]) });
	} else if (s.constraintLine > 0) {
		sharpen.push({
			text: `You said the constraint, but buried it in point ${s.constraintLine + 1}. Lead with it.`,
			detail: 'Open with "The constraint is…" so the listener can judge every choice against it.',
			quote: clip(s.l1[s.constraintLine])
		});
	} else {
		gaps.push({
			text: 'You never stated the constraint.',
			detail: `Without it, the listener can't tell why your choices fit. Try: ${scenario.leadExplanation.constraint}`
		});
	}

	// 2. Tool-first opening
	if (s.toolFirst) {
		sharpen.push({
			text: `You opened with a tool (${s.toolFirst}). Open with the problem.`,
			detail: 'Tools are the answer, not the framing. Naming one first sounds like you chose it before understanding the problem.',
			quote: clip(s.l1[0])
		});
	}

	// 3. Reasons ("why")
	if (s.toolSoup) {
		gaps.push({
			text: 'This reads as a list of tools without reasons.',
			detail: 'A Lead answer explains why each piece is there. Add "because…" or "so that…" after each choice.'
		});
	} else if (s.whyLines >= 2) {
		strengths.push({ text: 'You explained your reasons, not just your choices.', detail: 'Words like "because" and "so that" turn a design into an argument.' });
	} else {
		sharpen.push({
			text: 'Most of your points are statements, not reasons.',
			detail: 'For each one, add the "because". "Use DynamoDB" becomes "Use DynamoDB, because scoring needs answers in milliseconds".'
		});
	}

	// 4. Trade-off
	if (s.tradeOff) {
		strengths.push({ text: 'You named a trade-off.', detail: 'Saying what you give up is the clearest signal of senior judgement.' });
	} else {
		gaps.push({
			text: "You didn't say what your design gives up.",
			detail: `Every design has a cost; naming it shows judgement. For example: ${scenario.leadExplanation.tradeOff}`
		});
	}

	// 5. When you'd do it differently
	if (s.switchWhen) {
		strengths.push({ text: "You said when you'd do it differently.", detail: 'That shows you understand the conditions your design depends on.' });
	} else {
		sharpen.push({
			text: "Add when you'd change your mind.",
			detail: `End with a condition and a switch. For example: ${scenario.leadExplanation.switchWhen}`
		});
	}

	// 6. Level 2: a "why" that actually explains
	scenario.level2.forEach((q, i) => {
		const r = s.reasons[i];
		if (r.length < 15) {
			gaps.push({
				text: `Q${i + 1}: you picked an option but didn't explain why.`,
				detail: `The pick is the easy part. A Lead would say: "${scenario.leadSays[q.id]}"`
			});
		} else if (!WHY.test(r) && !CONSTRAINT.test(r)) {
			sharpen.push({
				text: `Q${i + 1}: that's a claim, not a reason.`,
				detail: 'Say what it is better than, and why that matters for this problem.',
				quote: clip(r)
			});
		} else if (TRADE_OFF.test(r)) {
			strengths.push({ text: `Q${i + 1}: a reason and a trade-off. That's how the Lead says it.`, quote: clip(r) });
		}
	});

	// 7. Habits that weaken an answer
	if (s.hedges.length >= 2) {
		sharpen.push({
			text: `You hedged (${s.hedges.map((h) => `"${h}"`).join(', ')}).`,
			detail: "State the decision, then qualify it with a condition: \"We'd use X. If Y happens, we'd switch to Z.\""
		});
	}
	if (s.buzzwords.length) {
		sharpen.push({
			text: `Buzzwords that sound good but say nothing: ${s.buzzwords.map((b) => `"${b}"`).join(', ')}.`,
			detail: 'Replace each with the specific: what scale, which practice, compliant with what.'
		});
	}
	if (s.l1.length >= 3) {
		strengths.push({ text: 'Clear structure: separate points rather than one block.', detail: 'Easier to follow out loud, and easier for the panel to probe.' });
	} else if (s.wallOfText) {
		sharpen.push({ text: 'One long block is hard to follow out loud.', detail: 'Break it into 3–5 points: constraint, approach, trade-off, when you would switch.' });
	}

	return { strengths, sharpen, gaps };
}

/**
 * Articulation-focused scores (1–5):
 * - Structure: constraint first, then a trade-off, then "when we'd switch".
 * - Clarity: starts at 5, loses points for hedging, buzzwords, tool-first, tool lists, walls of text.
 * - Depth: key ideas covered, Level 2 reasons that explain, Level 3 answers that engage, best choices.
 */
export function scoreChallenge(scenario: ArchitectureScenario, answers: ChallengeAnswers): ChallengeScores {
	const s = signals(scenario, answers);

	// Structure
	const st: string[] = [];
	let structure = 1;
	if (s.constraintLine === 0) {
		structure += 2;
		st.push('+2 led with the constraint');
	} else if (s.constraintLine > 0) {
		structure += 1;
		st.push('+1 stated the constraint (but not first)');
	} else st.push('no constraint stated');
	if (s.tradeOff) {
		structure += 1;
		st.push('+1 named a trade-off');
	} else st.push('no trade-off named');
	if (s.switchWhen) {
		structure += 1;
		st.push("+1 said when you'd switch");
	} else st.push("didn't say when you'd switch");

	// Clarity
	const cl: string[] = [];
	let clarity = 5;
	const penalise = (cond: boolean, why: string) => {
		if (cond) {
			clarity -= 1;
			cl.push(`−1 ${why}`);
		}
	};
	penalise(s.hedges.length >= 2, `hedging (${s.hedges.join(', ')})`);
	penalise(s.buzzwords.length > 0, `buzzwords (${s.buzzwords.join(', ')})`);
	penalise(!!s.toolFirst, `opened with a tool (${s.toolFirst})`);
	penalise(s.toolSoup, 'tools listed without reasons');
	penalise(s.wallOfText, 'one long block instead of points');
	if (!cl.length) cl.push('no hedging, buzzwords or tool-first opening');

	// Depth
	const content = evaluateChallenge(scenario, answers);
	const essentials = scenario.concepts.filter((c) => c.importance === 'essential');
	const essFrac = essentials.length ? essentials.filter((c) => content.conceptsMatched.includes(c)).length / essentials.length : 0;
	const reasonFrac = s.reasons.length
		? s.reasons.filter((r) => r.length >= 15 && (WHY.test(r) || CONSTRAINT.test(r))).length / s.reasons.length
		: 0;
	const l3 = evaluateLevel3(scenario, answers);
	const l3Frac = l3.length ? l3.reduce((n, r) => n + (r.answered ? Math.min(1, r.matched / Math.max(1, r.total / 2)) : 0), 0) / l3.length : 0;
	const bestFrac = content.choiceResults.filter((r) => r.chosen?.verdict === 'best').length / Math.max(1, scenario.level2.length);
	const depth = 1 + 4 * (0.35 * essFrac + 0.25 * reasonFrac + 0.25 * l3Frac + 0.15 * bestFrac);
	const pct = (n: number) => `${Math.round(n * 100)}%`;
	const dp = [
		`${pct(essFrac)} of the essential ideas covered`,
		`${pct(reasonFrac)} of Level 2 reasons explain the "why"`,
		`${pct(l3Frac)} Level 3 engagement with the key failure modes`,
		`${pct(bestFrac)} of choices matched the Lead's`
	];

	return {
		structure: { value: clamp(structure), reasons: st },
		clarity: { value: clamp(clarity), reasons: cl },
		depth: { value: clamp(depth), reasons: dp }
	};
}

export interface NextStarAdvice {
	structure: string[];
	clarity: string[];
	depth: string[];
	depthGap: number; // depth points needed for the next star (0 if already 5)
}

/**
 * "What would the next star need?" Concrete changes per score, each with its value,
 * derived from the same signals as scoreChallenge so it always agrees with the score.
 */
export function nextStarAdvice(scenario: ArchitectureScenario, answers: ChallengeAnswers): NextStarAdvice {
	const s = signals(scenario, answers);
	const scores = scoreChallenge(scenario, answers);

	const structure: string[] = [];
	if (s.constraintLine < 0) structure.push('+2: open with the constraint ("The constraint is…")');
	else if (s.constraintLine > 0) structure.push(`+1: move the constraint from point ${s.constraintLine + 1} to your first point`);
	if (!s.tradeOff) structure.push('+1: name what your design gives up ("The trade-off is…")');
	if (!s.switchWhen) structure.push('+1: say when you\'d change course ("If…, we\'d…")');

	const clarity: string[] = [];
	if (s.hedges.length >= 2) clarity.push(`+1: drop the hedges (${s.hedges.join(', ')}); state the decision, then the condition`);
	if (s.buzzwords.length) clarity.push(`+1: replace buzzwords (${s.buzzwords.join(', ')}) with specifics`);
	if (s.toolFirst) clarity.push(`+1: open with the problem, not a tool (${s.toolFirst})`);
	if (s.toolSoup) clarity.push('+1: give a "because" for each tool you name');
	if (s.wallOfText) clarity.push('+1: break the answer into 3–5 separate points');

	// Depth: estimate what each improvement is worth (same weights as scoreChallenge)
	const content = evaluateChallenge(scenario, answers);
	const essentials = scenario.concepts.filter((c) => c.importance === 'essential');
	const actions: { points: number; text: string }[] = [];
	for (const c of essentials) {
		if (!content.conceptsMatched.includes(c)) actions.push({ points: (4 * 0.35) / essentials.length, text: `mention: ${c.label}. ${c.why}` });
	}
	scenario.level2.forEach((q, i) => {
		const r = s.reasons[i];
		if (!(r.length >= 15 && (WHY.test(r) || CONSTRAINT.test(r))))
			actions.push({ points: (4 * 0.25) / scenario.level2.length, text: `give a real "because" for Q${i + 1} (${q.question})` });
	});
	evaluateLevel3(scenario, answers).forEach((r, i) => {
		const got = r.answered ? Math.min(1, r.matched / Math.max(1, r.total / 2)) : 0;
		if (got < 1)
			actions.push({
				points: ((4 * 0.25) / scenario.level3.length) * (1 - got),
				text: r.answered ? `go deeper on Level 3 T${i + 1}: name the failure and your response` : `answer Level 3 T${i + 1} (where it breaks)`
			});
	});
	content.choiceResults.forEach((c, i) => {
		if (c.chosen?.verdict !== 'best')
			actions.push({ points: (4 * 0.15) / scenario.level2.length, text: `revisit Q${i + 1}: the Lead chose ${c.best.id} (${c.best.text})` });
	});
	actions.sort((a, b) => b.points - a.points);

	// Raw depth is rounded to stars, so the next star needs raw ≥ value + 0.5
	const rawDepth =
		1 +
		4 *
			(0.35 * (essentials.length ? essentials.filter((c) => content.conceptsMatched.includes(c)).length / essentials.length : 0) +
				0.25 * (s.reasons.length ? s.reasons.filter((r) => r.length >= 15 && (WHY.test(r) || CONSTRAINT.test(r))).length / s.reasons.length : 0) +
				0.25 *
					(scenario.level3.length
						? evaluateLevel3(scenario, answers).reduce((n, r) => n + (r.answered ? Math.min(1, r.matched / Math.max(1, r.total / 2)) : 0), 0) /
							scenario.level3.length
						: 0) +
				0.15 * (content.choiceResults.filter((r) => r.chosen?.verdict === 'best').length / Math.max(1, scenario.level2.length)));
	const depthGap = scores.depth.value >= 5 ? 0 : Math.max(0.1, Math.round((scores.depth.value + 0.5 - rawDepth) * 10) / 10);
	const depth: string[] = [];
	let acc = 0;
	for (const a of actions) {
		depth.push(`+${a.points.toFixed(1)}: ${a.text}`);
		acc += a.points;
		if (acc >= depthGap && depth.length >= 2) break;
		if (depth.length >= 5) break;
	}

	return { structure, clarity, depth, depthGap };
}

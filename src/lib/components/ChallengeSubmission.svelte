<script lang="ts">
	import type { ArchitectureScenario, OptionVerdict } from '#lib/data/scenarios.ts';
	import {
		evaluateChallenge,
		evaluateLevel3,
		type ChallengeAnswers,
		type FeedbackItem
	} from '#lib/utils/challengeFeedback.ts';
	import { evaluateArticulation, nextStarAdvice, scoreChallenge, type Score } from '#lib/utils/articulation.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';
	import SelfRating from './SelfRating.svelte';

	let {
		scenario,
		answers,
		attemptId,
		onretry,
		nextHref
	}: {
		scenario: ArchitectureScenario;
		answers: ChallengeAnswers;
		attemptId?: string;
		onretry: () => void;
		nextHref: string | null;
	} = $props();

	const next = $derived(nextStarAdvice(scenario, answers));

	const feedback = $derived(evaluateChallenge(scenario, answers));
	const articulation = $derived(evaluateArticulation(scenario, answers));
	const scores = $derived(scoreChallenge(scenario, answers));
	const level3 = $derived(evaluateLevel3(scenario, answers));
	const lead = $derived(scenario.leadExplanation);
	const narrative = $derived(
		`${lead.constraint} Here's why: ${lead.reasons.join(' ')} The trade-off: ${lead.tradeOff} ${lead.switchWhen}`
	);

	const scoreRows = $derived<{ key: string; label: string; hint: string; score: Score; next: string[] }[]>([
		{ key: 'structure', label: 'Structure', hint: 'constraint → trade-off → when you’d switch', score: scores.structure, next: next.structure },
		{ key: 'clarity', label: 'Clarity', hint: 'no hedging, buzzwords or tool lists', score: scores.clarity, next: next.clarity },
		{ key: 'depth', label: 'Depth', hint: 'key ideas, real reasons, failure modes', score: scores.depth, next: next.depth }
	]);

	const verdictMeta: Record<OptionVerdict, { icon: string; label: string; cls: string }> = {
		best: { icon: '✅', label: 'Same as the Lead', cls: 'border-emerald-700 bg-emerald-950/30 text-emerald-200' },
		ok: { icon: '⚠️', label: 'Defensible, with trade-offs', cls: 'border-amber-700 bg-amber-950/30 text-amber-200' },
		weak: { icon: '❌', label: 'Would not work well here', cls: 'border-rose-700 bg-rose-950/30 text-rose-200' }
	};

	const card = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6';
	const kicker = 'font-mono text-xs tracking-widest uppercase';
	const prose =
		'prose prose-sm prose-invert max-w-none prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300 prose-code:text-sky-300';
</script>

{#snippet itemList(items: FeedbackItem[], empty: string)}
	<ul class="space-y-2.5 text-sm text-slate-200">
		{#each items as item, i (i)}
			<li>
				{item.text}
				{#if item.quote}<span class="mt-1 block border-l-2 border-slate-600 pl-2 text-xs text-slate-400 italic">You wrote: “{item.quote}”</span>{/if}
				{#if item.detail}<span class="mt-1 block text-xs text-slate-500">{item.detail}</span>{/if}
			</li>
		{:else}
			<li class="text-slate-500">{empty}</li>
		{/each}
	</ul>
{/snippet}

{#snippet sectionTitle(n: number, title: string)}
	<h3 class="mb-3 flex items-baseline gap-2 text-base font-semibold text-slate-100">
		<span class="rounded-md bg-amber-400 px-1.5 font-mono text-xs text-slate-950">{n}</span>{title}
	</h3>
{/snippet}

<div class="challenge-feedback space-y-6" aria-live="polite">
	<!-- Scores + how you explained it -->
	<header class={card}>
		<p class="{kicker} text-amber-400/80">Expert feedback · {scenario.title}</p>
		<h2 class="text-xl font-semibold text-slate-50 sm:text-2xl">How you explained it</h2>

		<div class="scores mt-4 grid gap-3 sm:grid-cols-3">
			{#each scoreRows as r (r.key)}
				<div class="score rounded-xl border border-slate-700 bg-slate-950/60 p-3" data-score={r.key}>
					<div class="flex items-baseline justify-between">
						<p class="text-sm font-semibold text-slate-200">{r.label}</p>
						<p class="font-mono text-lg text-amber-300"><span class="value">{r.score.value}</span><span class="text-xs text-slate-500">/5</span></p>
					</div>
					<div class="mt-1 flex gap-1" aria-hidden="true">
						{#each [1, 2, 3, 4, 5] as i (i)}
							<span class="h-1.5 flex-1 rounded-full {i <= r.score.value ? 'bg-amber-400' : 'bg-slate-800'}"></span>
						{/each}
					</div>
					<p class="mt-1 text-[11px] text-slate-500">{r.hint}</p>
					<ul class="mt-2 space-y-0.5 text-xs text-slate-400">
						{#each r.score.reasons as reason (reason)}<li>{reason}</li>{/each}
					</ul>
					{#if r.score.value < 5}
						<div class="next-star mt-2 border-t border-slate-800 pt-2">
							<p class="text-[11px] font-semibold text-sky-300">To reach {r.score.value + 1}/5:</p>
							<ul class="mt-0.5 space-y-0.5 text-xs text-slate-300">
								{#each r.next.slice(0, 3) as n (n)}<li>{n}</li>{:else}<li class="text-slate-500">refine the points you made</li>{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if attemptId}
			<div class="mt-4 flex flex-wrap items-center justify-between gap-3">
				<SelfRating {attemptId} />
				<a href="?view=history&a={attemptId}" class="text-xs text-sky-400 hover:text-sky-300">Saved to Attempt History →</a>
			</div>
		{/if}

		<div class="mt-4 grid gap-3 md:grid-cols-3">
			<section class="artic-strengths rounded-xl border border-emerald-900 bg-emerald-950/20 p-3">
				<h3 class="mb-2 text-sm font-semibold text-emerald-300">✅ Explained well ({articulation.strengths.length})</h3>
				{@render itemList(articulation.strengths, 'Nothing yet. See the Lead version below.')}
			</section>
			<section class="artic-sharpen rounded-xl border border-amber-900 bg-amber-950/20 p-3">
				<h3 class="mb-2 text-sm font-semibold text-amber-300">⚠️ Sharpen ({articulation.sharpen.length})</h3>
				{@render itemList(articulation.sharpen, 'Nothing to sharpen.')}
			</section>
			<section class="artic-gaps rounded-xl border border-rose-900 bg-rose-950/20 p-3">
				<h3 class="mb-2 text-sm font-semibold text-rose-300">❌ Missing the why ({articulation.gaps.length})</h3>
				{@render itemList(articulation.gaps, 'No gaps in your explanation.')}
			</section>
		</div>
		<p class="mt-3 text-xs text-slate-500">
			Scores and feedback are pattern-based: they look for structure, reasons, trade-offs, filler words and the scenario's key
			ideas. Use them as a coach's checklist, not a grade.
		</p>
	</header>

	<!-- 1. How the Lead explains this -->
	<section class="{card} section-lead">
		{@render sectionTitle(1, "Here's how the Lead explains this")}
		<div class="grid gap-4 md:grid-cols-2">
			<div class="your-level1 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
				<p class="{kicker} mb-2 text-[10px] text-slate-500">Your approach</p>
				<p class="text-sm whitespace-pre-line text-slate-300">{answers.level1}</p>
			</div>
			<div class="lead-explanation rounded-xl border border-amber-900/60 bg-amber-950/10 p-4 text-sm">
				<p class="{kicker} mb-2 text-[10px] text-amber-400/80">The Lead, out loud</p>
				<p class="lead-narrative leading-relaxed text-slate-100 italic">“{narrative}”</p>
				<details class="mt-3 border-t border-amber-900/40 pt-3">
					<summary class="cursor-pointer text-xs text-amber-300/80 hover:text-amber-200">See the structure behind it</summary>
					<dl class="mt-2 space-y-2">
						<div><dt class="{kicker} text-[10px] text-amber-400/70">The constraint</dt><dd class="text-slate-200">{lead.constraint}</dd></div>
						<div>
							<dt class="{kicker} text-[10px] text-amber-400/70">Here's why</dt>
							<dd><ol class="list-decimal space-y-1 pl-5 text-slate-300">{#each lead.reasons as r (r)}<li>{r}</li>{/each}</ol></dd>
						</div>
						<div><dt class="{kicker} text-[10px] text-amber-400/70">The trade-off</dt><dd class="text-slate-300">{lead.tradeOff}</dd></div>
						<div><dt class="{kicker} text-[10px] text-amber-400/70">When we'd do it differently</dt><dd class="text-slate-300">{lead.switchWhen}</dd></div>
					</dl>
				</details>
				<details class="expert-level1 mt-2">
					<summary class="cursor-pointer text-xs text-amber-300/80 hover:text-amber-200">See the full design</summary>
					<div class="mt-2 {prose}">{@html markdownToHtml(scenario.level1Expert)}</div>
				</details>
			</div>
		</div>
	</section>

	<!-- 2 + 3. Key phrases, what to watch out for -->
	<section class="grid gap-4 md:grid-cols-2">
		<div class="lead-phrases {card}">
			{@render sectionTitle(2, 'Key phrases you should use')}
			<ul class="space-y-2 text-sm text-slate-200">
				{#each scenario.leadPhrases as p (p)}<li class="border-l-2 border-sky-700 pl-3">{p}</li>{/each}
			</ul>
		</div>
		<div class="watch-out {card}">
			{@render sectionTitle(3, 'What to watch out for')}
			<ul class="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
				{#each scenario.watchOutFor as w (w)}<li>{w}</li>{/each}
			</ul>
			<h4 class="{kicker} mt-4 mb-2 text-[10px] text-rose-300/80">Sounds good, hides weak thinking</h4>
			<ul class="anti-patterns space-y-3 text-sm">
				{#each scenario.antiPatterns as a (a.sounds)}
					<li>
						<p class="text-slate-200 line-through decoration-rose-500/60">{a.sounds}</p>
						<p class="mt-0.5 text-slate-400">{a.problem}</p>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<section class="junior-vs-lead {card}">
		<p class="{kicker} text-slate-500">Same content, different level</p>
		<div class="mt-3 grid gap-4 md:grid-cols-2">
			<blockquote class="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm">
				<p class="{kicker} mb-2 text-[10px] text-slate-500">Junior answer</p>
				<p class="text-slate-400 italic">“{scenario.juniorVsLead.junior}”</p>
			</blockquote>
			<blockquote class="rounded-xl border border-emerald-900/70 bg-emerald-950/10 p-4 text-sm">
				<p class="{kicker} mb-2 text-[10px] text-emerald-400/80">Lead answer</p>
				<p class="text-slate-100 italic">“{scenario.juniorVsLead.lead}”</p>
			</blockquote>
		</div>
		<h4 class="mt-4 text-sm font-semibold text-slate-300">Why the Lead version lands</h4>
		<ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-400">
			{#each scenario.juniorVsLead.whyBetter as w (w)}<li>{w}</li>{/each}
		</ul>
	</section>

	<!-- 4. 60-second version -->
	<section class="sixty-second {card}">
		{@render sectionTitle(4, '60-second version')}
		<p class="rounded-xl border border-amber-900/60 bg-amber-950/10 p-4 text-base leading-relaxed text-slate-100 italic">
			“{scenario.sixtySecond}”
		</p>
		<p class="mt-2 text-xs text-slate-500">Read it aloud and time yourself. Then say it again in your own words without looking.</p>
	</section>

	<!-- 5. Defend the choice -->
	<section class="defend {card}">
		{@render sectionTitle(5, "When you'd defend this choice")}
		<p class="mb-3 text-sm text-slate-400">Likely follow-ups. Answer each out loud first, then reveal how the Lead defends it.</p>
		<ul class="space-y-2">
			{#each scenario.defend as d (d.question)}
				<li class="rounded-lg border border-slate-800 bg-slate-950/50">
					<details>
						<summary class="cursor-pointer px-3 py-2 text-sm text-slate-200 hover:bg-slate-900">“{d.question}”</summary>
						<p class="border-t border-slate-800 px-3 py-2 text-sm text-slate-300">{d.answer}</p>
					</details>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Level 2 decisions -->
	<section class={card}>
		<p class="{kicker} text-slate-500">Level 2 · Design decisions</p>
		<ol class="mt-3 space-y-5">
			{#each scenario.level2 as q, qi (q.id)}
				{@const r = feedback.choiceResults[qi]}
				{@const v = r.chosen ? verdictMeta[r.chosen.verdict] : null}
				<li class="decision border-t border-slate-800 pt-4 first:border-t-0 first:pt-0" data-question={q.id}>
					<h3 class="text-base font-semibold text-slate-100"><span class="font-mono text-slate-500">Q{qi + 1}</span> {q.question}</h3>
					<div class="mt-3 grid gap-4 md:grid-cols-2">
						<div class="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm">
							<p class="font-semibold text-slate-300">You chose {r.chosen?.id}: {r.chosen?.text}</p>
							{#if v && r.chosen}
								<p class="verdict mt-2 rounded-md border px-2 py-1 text-xs {v.cls}" data-verdict={r.chosen.verdict}>
									{v.icon} {v.label}: {r.chosen.feedback}
								</p>
							{/if}
							<p class="mt-2 text-slate-400">
								<span class="text-slate-500">You said:</span>
								{answers.reasons[q.id]?.trim() || '(no reason given)'}
							</p>
						</div>
						<div class="rounded-xl border border-amber-900/60 bg-amber-950/10 p-4 text-sm">
							<p class="font-semibold text-amber-300">The Lead chooses {r.best.id}: {r.best.text}</p>
							<p class="lead-says mt-2 border-l-2 border-amber-600 pl-3 text-slate-100 italic">“{scenario.leadSays[q.id]}”</p>
							<details class="mt-2">
								<summary class="cursor-pointer text-xs text-amber-300/80 hover:text-amber-200">More detail</summary>
								<div class="mt-2 {prose}">{@html markdownToHtml(q.expert)}</div>
							</details>
						</div>
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Level 3 -->
	<section class={card}>
		<p class="{kicker} text-slate-500">Level 3 · Trade-offs and failure modes</p>
		<ol class="mt-3 space-y-5">
			{#each scenario.level3 as p, pi (p.id)}
				{@const r = level3[pi]}
				<li class="tradeoff border-t border-slate-800 pt-4 first:border-t-0 first:pt-0" data-prompt={p.id}>
					<h3 class="text-base font-semibold text-slate-100"><span class="font-mono text-slate-500">T{pi + 1}</span> {p.prompt}</h3>
					<div class="mt-3 grid gap-4 md:grid-cols-2">
						<div class="rounded-xl border border-slate-700 bg-slate-950/60 p-4 text-sm">
							<p class="mb-1 {kicker} text-[10px] text-slate-500">Your answer</p>
							<p class="whitespace-pre-line text-slate-300">{answers.level3[p.id]?.trim() || '(not answered)'}</p>
							{#if r.answered}
								<p class="l3-match mt-2 text-xs text-slate-500">Touched {r.matched} of {r.total} key ideas the Lead covers.</p>
							{/if}
						</div>
						<div class="rounded-xl border border-amber-900/60 bg-amber-950/10 p-4 text-sm">
							<p class="mb-1 {kicker} text-[10px] text-amber-400/80">How the Lead answers</p>
							<p class="text-slate-100 italic">“{p.expert}”</p>
						</div>
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Content checklist -->
	<section class={card}>
		<p class="{kicker} text-slate-500">What you covered</p>
		<p class="mt-1 text-xs text-slate-500">The ideas a Lead would mention for this scenario, checked against everything you wrote.</p>
		<div class="mt-3 grid gap-3 md:grid-cols-3">
			<section class="feedback-nailed rounded-xl border border-emerald-900 bg-emerald-950/20 p-3">
				<h3 class="mb-2 text-sm font-semibold text-emerald-300">✅ Covered ({feedback.nailed.length})</h3>
				{@render itemList(feedback.nailed, 'Nothing matched yet.')}
			</section>
			<section class="feedback-consider rounded-xl border border-amber-900 bg-amber-950/20 p-3">
				<h3 class="mb-2 text-sm font-semibold text-amber-300">⚠️ Worth adding ({feedback.consider.length})</h3>
				{@render itemList(feedback.consider, 'Nothing to add.')}
			</section>
			<section class="feedback-gaps rounded-xl border border-rose-900 bg-rose-950/20 p-3">
				<h3 class="mb-2 text-sm font-semibold text-rose-300">❌ Missed ({feedback.gaps.length})</h3>
				{@render itemList(feedback.gaps, 'No major gaps.')}
			</section>
		</div>
	</section>

	<section class={card}>
		<h3 class="{kicker} mb-2 text-sky-300/80">Related interview questions</h3>
		<ul class="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
			{#each scenario.relatedSets as s (s.id)}
				<li><a class="text-sky-400 hover:text-sky-300" href="/interview?set={s.id}">{s.label} →</a></li>
			{/each}
		</ul>
	</section>

	<div class="flex flex-wrap gap-3">
		<button
			type="button"
			class="retry rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
			onclick={onretry}>← Rewrite my explanation</button
		>
		{#if nextHref}
			<a class="next-scenario rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300" href={nextHref}
				>Next scenario →</a
			>
		{/if}
		<a class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500" href="/challenge"
			>All scenarios</a
		>
	</div>
</div>

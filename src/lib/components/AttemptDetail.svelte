<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
	import { attemptHistory, average, type Attempt, type ScoreKey } from '#lib/stores/attemptHistory.ts';
	import { stars } from '#lib/speech/analysis.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';
	import SelfRating from './SelfRating.svelte';

	let { attempt, scenario }: { attempt: Attempt; scenario: ArchitectureScenario | undefined } = $props();

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const rows: { key: ScoreKey; label: string }[] = [
		{ key: 'structure', label: 'Structure' },
		{ key: 'clarity', label: 'Clarity' },
		{ key: 'depth', label: 'Depth' }
	];
	const optionText = (qId: string, optId: string | undefined) =>
		scenario?.level2.find((q) => q.id === qId)?.options.find((o) => o.id === optId)?.text ?? '';
	const card = 'rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5';
	const h = 'mb-2 font-mono text-xs tracking-widest uppercase';
	const lead = $derived(scenario?.leadExplanation);
	const next = $derived(attempt.feedback.nextStar);

	function remove() {
		if (confirm('Delete this attempt from your history?')) {
			attemptHistory.remove(attempt.id);
			goto('?view=history');
		}
	}
</script>

<article class="attempt-detail space-y-4" data-attempt={attempt.id}>
	<header class={card}>
		<p class="{h} text-amber-400/80">Attempt</p>
		<h2 class="text-xl font-semibold text-slate-50">{attempt.scenarioTitle}</h2>
		<p class="text-sm text-slate-400">{fmtDate(attempt.timestamp)} · average {average(attempt)}/5</p>
		<div class="mt-3"><SelfRating attemptId={attempt.id} /></div>
	</header>

	<!-- Scores + what the next star needs -->
	<section class={card}>
		<h3 class="{h} text-slate-500">Feedback</h3>
		<dl class="detail-scores space-y-3">
			{#each rows as r (r.key)}
				<div class="score-row" data-score={r.key}>
					<div class="flex flex-wrap items-baseline gap-x-3">
						<dt class="w-24 font-mono text-sm text-slate-300">{r.label}:</dt>
						<dd class="font-mono text-lg tracking-wider text-amber-300" data-value={attempt.scores[r.key]}>{stars(attempt.scores[r.key])}</dd>
						<dd class="text-xs text-slate-500">{attempt.scoreReasons[r.key].join(' · ')}</dd>
					</div>
				</div>
			{/each}
		</dl>

		<div class="next-star mt-4 rounded-xl border border-sky-900/60 bg-sky-950/20 p-3">
			<h4 class="mb-2 text-sm font-semibold text-sky-200">What the next star needs</h4>
			{#each rows as r (r.key)}
				{@const items = next[r.key]}
				<div class="mb-2 last:mb-0" data-next={r.key}>
					<p class="text-xs font-semibold text-slate-300">
						{r.label}
						{attempt.scores[r.key]}/5 →
						{#if attempt.scores[r.key] >= 5}
							<span class="font-normal text-emerald-400">already full marks</span>
						{:else}
							{attempt.scores[r.key] + 1}/5
							{#if r.key === 'depth' && next.depthGap}<span class="font-normal text-slate-500">(about +{next.depthGap} depth points)</span>{/if}
						{/if}
					</p>
					{#if attempt.scores[r.key] < 5}
						<ul class="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-slate-200">
							{#each items as it (it)}<li>{it}</li>{:else}<li class="text-slate-500">Nothing specific: refine the existing points.</li>{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- What you got right / what to sharpen -->
	<section class="grid gap-4 md:grid-cols-2">
		<div class="got-right {card}">
			<h3 class="{h} text-emerald-300/80">What you got right</h3>
			<ul class="list-disc space-y-1 pl-5 text-sm text-slate-200">
				{#each [...attempt.feedback.strengths, ...attempt.feedback.covered.map((c) => `Covered: ${c}`)] as s (s)}<li>{s}</li>{:else}<li class="text-slate-500">Nothing yet.</li>{/each}
			</ul>
		</div>
		<div class="to-sharpen {card}">
			<h3 class="{h} text-amber-300/80">What to sharpen</h3>
			<ul class="list-disc space-y-1 pl-5 text-sm text-slate-200">
				{#each [...attempt.feedback.gaps, ...attempt.feedback.sharpen, ...attempt.feedback.missed.map((c) => `Missed: ${c}`)] as s (s)}<li>{s}</li>{:else}<li class="text-slate-500">Nothing to sharpen.</li>{/each}
			</ul>
		</div>
	</section>

	<!-- Your answer -->
	<section class="your-answer {card}">
		<h3 class="{h} text-slate-500">Your answer</h3>
		<p class="text-xs text-slate-500">Level 1</p>
		<p class="mb-3 text-sm whitespace-pre-line text-slate-200">{attempt.answers.level1}</p>
		{#if scenario}
			<p class="text-xs text-slate-500">Level 2</p>
			<ol class="mb-3 space-y-1.5 text-sm">
				{#each scenario.level2 as q, i (q.id)}
					<li>
						<span class="font-mono text-slate-500">Q{i + 1}</span>
						<span class="text-slate-300">{attempt.answers.choices[q.id] ?? '–'}: {optionText(q.id, attempt.answers.choices[q.id])}</span>
						{#if attempt.answers.reasons[q.id]?.trim()}<span class="block pl-6 text-slate-400">"{attempt.answers.reasons[q.id]}"</span>{/if}
					</li>
				{/each}
			</ol>
			{#if Object.values(attempt.answers.level3 ?? {}).some((v) => v?.trim())}
				<p class="text-xs text-slate-500">Level 3</p>
				<ol class="space-y-1.5 text-sm">
					{#each scenario.level3 as p, i (p.id)}
						{#if attempt.answers.level3?.[p.id]?.trim()}
							<li><span class="font-mono text-slate-500">T{i + 1}</span> <span class="text-slate-300">{attempt.answers.level3[p.id]}</span></li>
						{/if}
					{/each}
				</ol>
			{/if}
		{/if}
	</section>

	<!-- Expert answer -->
	{#if scenario && lead}
		<section class="expert-answer rounded-2xl border border-amber-900/60 bg-amber-950/10 p-4 sm:p-5">
			<h3 class="{h} text-amber-400/80">Expert answer</h3>
			<p class="text-sm leading-relaxed text-slate-100 italic">
				“{lead.constraint} Here's why: {lead.reasons.join(' ')} The trade-off: {lead.tradeOff} {lead.switchWhen}”
			</p>
			<p class="mt-3 text-xs text-slate-500">60-second version</p>
			<p class="text-sm text-slate-200 italic">“{scenario.sixtySecond}”</p>
			<details class="mt-3">
				<summary class="cursor-pointer text-xs text-amber-300/80 hover:text-amber-200">Full design</summary>
				<div class="prose prose-sm prose-invert mt-2 max-w-none prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300">
					{@html markdownToHtml(scenario.level1Expert)}
				</div>
			</details>
		</section>
	{/if}

	<div class="flex flex-wrap gap-3">
		<a href="?view=history" class="back-to-history rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500">← Back to history</a>
		<a href="?s={attempt.scenarioId}" class="try-again rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300">Try again</a>
		<a href="?s={attempt.scenarioId}&a={attempt.id}" class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
			>Open full feedback</a
		>
		<button type="button" class="ml-auto text-xs text-slate-500 hover:text-rose-300" onclick={remove}>Delete attempt</button>
	</div>
</article>

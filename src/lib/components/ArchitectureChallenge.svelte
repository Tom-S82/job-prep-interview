<script lang="ts">
	import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
	import type { ChallengeAnswers } from '#lib/utils/challengeFeedback.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';

	let {
		scenario,
		answers = $bindable(),
		onsubmit
	}: { scenario: ArchitectureScenario; answers: ChallengeAnswers; onsubmit: () => void } = $props();

	const MIN_LEVEL1 = 20;

	const missing = $derived([
		...(answers.level1.trim().length < MIN_LEVEL1 ? ['Level 1: sketch your approach'] : []),
		...scenario.level2.flatMap((q, i) => (answers.choices[q.id] ? [] : [`Level 2, Q${i + 1}: pick an option`]))
	]);
	const ready = $derived(missing.length === 0);

	function submit(e?: Event) {
		e?.preventDefault();
		if (ready) onsubmit();
	}

	function onKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(e);
	}
</script>

<svelte:window onkeydown={onKey} />

<form class="challenge-form space-y-6" onsubmit={submit}>
	<!-- Scenario context -->
	<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
		<p class="font-mono text-xs tracking-widest text-amber-400/80 uppercase">Scenario</p>
		<h2 class="text-xl font-semibold text-slate-50 sm:text-2xl">{scenario.title}</h2>
		<div class="prose prose-sm prose-invert mt-3 max-w-none prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300">
			{@html markdownToHtml(scenario.context)}
		</div>
		<p class="mt-3 rounded-lg border border-sky-900/60 bg-sky-950/20 px-3 py-2 text-sm text-sky-100/90">
			<span class="font-semibold">Why it matters:</span>
			{scenario.businessContext}
		</p>
	</section>

	<!-- Level 1 -->
	<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
		<p class="font-mono text-xs tracking-widest text-slate-500 uppercase">Level 1 · High-level approach</p>
		<label for="level1" class="mt-1 block text-base font-semibold text-slate-100">{scenario.level1Prompt}</label>
		<p class="mt-1 text-sm text-slate-400">
			Try the Lead's shape: <span class="text-slate-200">the constraint → why → the trade-off → when you'd switch</span>.
		</p>
		<details class="mt-2 text-sm text-slate-400">
			<summary class="cursor-pointer text-slate-400 hover:text-slate-200">Prompts to consider</summary>
			<ul class="mt-2 list-disc space-y-1 pl-5">
				{#each scenario.level1Hints as h (h)}<li>{h}</li>{/each}
			</ul>
		</details>
		<textarea
			id="level1"
			class="level1 mt-3 w-full rounded-lg border-slate-700 bg-slate-950 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:ring-amber-400"
			rows="7"
			placeholder={'- My first move would be…\n- …'}
			bind:value={answers.level1}
		></textarea>
	</section>

	<!-- Level 2 -->
	<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
		<p class="font-mono text-xs tracking-widest text-slate-500 uppercase">Level 2 · Detailed design</p>
		<p class="mt-1 text-sm text-slate-400">For each decision, pick an option and explain why. The "why" matters more than the pick.</p>

		<ol class="mt-4 space-y-6">
			{#each scenario.level2 as q, qi (q.id)}
				<li class="level2-question" data-question={q.id}>
					<fieldset>
						<legend class="text-base font-semibold text-slate-100">
							<span class="mr-1 font-mono text-slate-500">Q{qi + 1}</span>
							{q.question}
						</legend>
						<div class="mt-3 grid gap-2 sm:grid-cols-2">
							{#each q.options as o (o.id)}
								<label
									class="option flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors {answers
										.choices[q.id] === o.id
										? 'border-amber-400 bg-amber-400/10'
										: 'border-slate-700 hover:border-slate-500'}"
								>
									<input
										type="radio"
										class="mt-0.5 border-slate-600 bg-slate-900 text-amber-400 focus:ring-amber-400"
										name={`q-${q.id}`}
										value={o.id}
										bind:group={answers.choices[q.id]}
									/>
									<span class="text-slate-200"><span class="font-mono text-slate-500">{o.id}</span> {o.text}</span>
								</label>
							{/each}
						</div>
						<label class="mt-3 block text-xs text-slate-500" for={`why-${q.id}`}>Why?</label>
						<textarea
							id={`why-${q.id}`}
							class="reason mt-1 w-full rounded-lg border-slate-700 bg-slate-950 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:ring-amber-400"
							rows="2"
							placeholder="Because…"
							bind:value={answers.reasons[q.id]}
						></textarea>
					</fieldset>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Level 3 -->
	<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
		<p class="font-mono text-xs tracking-widest text-slate-500 uppercase">Level 3 · Trade-offs and failure modes</p>
		<p class="mt-1 text-sm text-slate-400">
			Where would your design break, and what would you do then? Optional, but this is what panels probe hardest, and
			blank answers lower your Depth score.
		</p>
		<ol class="mt-4 space-y-5">
			{#each scenario.level3 as p, pi (p.id)}
				<li class="level3-prompt" data-prompt={p.id}>
					<label class="block text-base font-semibold text-slate-100" for={`l3-${p.id}`}>
						<span class="mr-1 font-mono text-slate-500">T{pi + 1}</span>
						{p.prompt}
					</label>
					<textarea
						id={`l3-${p.id}`}
						class="level3 mt-2 w-full rounded-lg border-slate-700 bg-slate-950 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:ring-amber-400"
						rows="3"
						placeholder="It breaks when… so we'd…"
						bind:value={answers.level3[p.id]}
					></textarea>
				</li>
			{/each}
		</ol>
	</section>

	<div class="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
		<span class="font-semibold text-slate-300">After you submit:</span> scores for Structure, Clarity and Depth (1–5), feedback
		on how you explained it, then the Lead's version: the narrative, key phrases, what to watch out for, a 60-second version,
		and how to defend it in follow-ups.
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-xs text-slate-500" aria-live="polite">
			{#if ready}
				Ready. Submit to compare with the expert answer.
			{:else}
				Still needed: {missing.join(' · ')}
			{/if}
		</p>
		<div class="flex items-center gap-3">
			<span class="hidden font-mono text-xs text-slate-500 sm:inline">Ctrl/⌘ + Enter</span>
			<button
				type="submit"
				class="submit rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
				disabled={!ready}>Submit design</button
			>
		</div>
	</div>
</form>

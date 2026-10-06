<script lang="ts">
	import { capstone, type NodeId } from '#lib/data/capstone/index.ts';
	import { challengeProgress, capstoneSummary } from '#lib/stores/challengeProgress.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';
	import CapstoneDiagram from './CapstoneDiagram.svelte';

	const doneNodes = $derived<NodeId[]>(
		capstone.parts.filter((p) => p.letter !== 'I' && $challengeProgress[p.id]).flatMap((p) => p.nodes)
	);
	const nextPart = $derived(capstone.parts.find((p) => p.id === $capstoneSummary.nextId)!);
</script>

<section class="capstone-overview space-y-5">
	<header class="rounded-2xl border border-amber-900/60 bg-amber-950/10 p-5 sm:p-6">
		<p class="font-mono text-xs tracking-widest text-amber-400/80 uppercase">Capstone · 8 parts + synthesis</p>
		<h2 class="text-xl font-semibold text-slate-50 sm:text-2xl">{capstone.title}</h2>
		<div class="prose prose-sm prose-invert mt-3 max-w-none prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300">
			{@html markdownToHtml(capstone.context)}
		</div>
		<p class="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/20 px-3 py-2 text-sm text-rose-100">
			<span class="font-semibold">The tension:</span>
			{capstone.constraint}
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-3">
			<a href="?s={nextPart.id}" class="capstone-start rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-300">
				{$capstoneSummary.completed ? `Continue: Part ${nextPart.letter} →` : 'Start Part A →'}
			</a>
			<span class="text-sm text-slate-400" data-testid="capstone-progress">{$capstoneSummary.completed}/{$capstoneSummary.total} parts done</span>
			{#if $capstoneSummary.completed}
				<span class="font-mono text-xs text-slate-500">
					average S {$capstoneSummary.structure} · C {$capstoneSummary.clarity} · D {$capstoneSummary.depth}
				</span>
			{/if}
		</div>
	</header>

	<details class="rounded-2xl border border-sky-900/60 bg-sky-950/20 p-5" open={!$capstoneSummary.completed}>
		<summary class="cursor-pointer font-semibold text-sky-100">How the capstone works</summary>
		<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
			<li>Each part designs one slice of the same platform. Parts A–H take 10–15 minutes each; do them over several sittings.</li>
			<li>Every part opens with a short <span class="text-slate-100">primer</span>: what you need to know before answering. Read it first if the topic is new.</li>
			<li>Then the usual Levels 1–3, scores, feedback and the Lead's version, all saved in Attempt History.</li>
			<li>The diagram below <span class="text-slate-100">builds up as you complete parts</span>, so by the end you have assembled the whole system.</li>
			<li>Part I asks you to explain the whole thing in 5 minutes. Practise that one out loud too.</li>
		</ul>
	</details>

	<div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
		<h3 class="mb-3 text-sm font-semibold text-slate-200">The system so far</h3>
		<CapstoneDiagram done={doneNodes} />
	</div>

	<ol class="capstone-parts grid gap-2 sm:grid-cols-2">
		{#each capstone.parts as p (p.id)}
			{@const prog = $challengeProgress[p.id]}
			<li>
				<a
					href="?s={p.id}"
					class="capstone-part flex h-full gap-3 rounded-xl border bg-slate-900/60 p-3 hover:border-amber-400/60 {prog ? 'border-emerald-900' : 'border-slate-800'}"
					data-part={p.letter}
					data-done={!!prog}
				>
					<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm {prog ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}"
						>{p.letter}</span
					>
					<span class="flex-1">
						<span class="block text-sm font-semibold text-slate-100">{p.title.replace(/^[A-I] · /, '')}</span>
						<span class="block text-xs text-slate-400">{p.summary}</span>
						{#if prog}
							<span class="mt-1 block font-mono text-[11px] text-emerald-400"
								>✓ S {prog.last.structure} · C {prog.last.clarity} · D {prog.last.depth}{prog.attempts > 1 ? ` · ×${prog.attempts}` : ''}</span
							>
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ol>
</section>

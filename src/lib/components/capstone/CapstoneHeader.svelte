<script lang="ts">
	import { capstone, type CapstonePart, type NodeId } from '#lib/data/capstone/index.ts';
	import { challengeProgress } from '#lib/stores/challengeProgress.ts';
	import CapstoneDiagram from './CapstoneDiagram.svelte';

	let { part }: { part: CapstonePart } = $props();

	const doneNodes = $derived<NodeId[]>(
		capstone.parts.filter((p) => p.letter !== 'I' && p.id !== part.id && $challengeProgress[p.id]).flatMap((p) => p.nodes)
	);
	const current = $derived<NodeId[]>(part.letter === 'I' ? [] : part.nodes);
	const doneForSynthesis = $derived<NodeId[]>(part.letter === 'I' ? part.nodes : doneNodes);
</script>

<section class="capstone-header mb-5 rounded-2xl border border-amber-900/60 bg-amber-950/10 p-4 sm:p-5" data-part={part.letter}>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<a href="?view=capstone" class="font-mono text-xs tracking-widest text-amber-400/80 uppercase hover:text-amber-300">← Capstone overview</a>
		<nav class="capstone-stepper flex flex-wrap gap-1" aria-label="Capstone parts">
			{#each capstone.parts as p (p.id)}
				<a
					href="?s={p.id}"
					class="flex h-7 w-7 items-center justify-center rounded-md border font-mono text-xs {p.id === part.id
						? 'border-amber-400 bg-amber-400 text-slate-950'
						: $challengeProgress[p.id]
							? 'border-emerald-800 bg-emerald-500/15 text-emerald-300'
							: 'border-slate-700 text-slate-400 hover:border-slate-500'}"
					aria-current={p.id === part.id ? 'step' : undefined}
					title={p.title}>{p.letter}</a
				>
			{/each}
		</nav>
	</div>
	<details class="mt-3" open>
		<summary class="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
			{part.letter === 'I' ? 'The whole system' : `Where Part ${part.letter} sits in the system`}
		</summary>
		<div class="mt-2"><CapstoneDiagram done={doneForSynthesis} {current} compact /></div>
	</details>
	{#if part.letter === 'I'}
		<p class="mt-3 text-sm text-slate-300">
			This is the question you'll most likely be asked out loud.
			<a href="/speak/score?s={part.id}" class="speak-synthesis text-sky-400 hover:text-sky-300">Practise it in Speak & Score →</a>
		</p>
	{/if}
</section>

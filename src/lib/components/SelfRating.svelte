<script lang="ts">
	import { attemptHistory } from '#lib/stores/attemptHistory.ts';

	let { attemptId }: { attemptId: string } = $props();

	const attempt = $derived($attemptHistory.find((a) => a.id === attemptId));
	const labels = ['', 'Lost', 'Shaky', 'OK', 'Good', 'Nailed it'];
</script>

{#if attempt}
	<div class="self-rating flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="How did it feel?">
		<span class="text-slate-400">How did it feel?</span>
		{#each [1, 2, 3, 4, 5] as n (n)}
			<button
				type="button"
				class="h-8 min-w-8 rounded-md border px-2 font-mono text-xs transition-colors {attempt.selfRating === n
					? 'border-amber-400 bg-amber-400 text-slate-950'
					: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
				aria-pressed={attempt.selfRating === n}
				data-rating={n}
				title={labels[n]}
				onclick={() => attemptHistory.setSelfRating(attemptId, attempt.selfRating === n ? null : n)}>{n}</button
			>
		{/each}
		{#if attempt.selfRating}<span class="text-xs text-slate-500">{labels[attempt.selfRating]}</span>{/if}
	</div>
{/if}

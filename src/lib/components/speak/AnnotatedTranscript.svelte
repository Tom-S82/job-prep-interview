<script lang="ts">
	import type { MarkerKind, TranscriptToken, WordFlag } from '#lib/speech/analysis.ts';

	let { tokens }: { tokens: TranscriptToken[] } = $props();

	const markerCls: Record<MarkerKind, string> = {
		pause: 'border-amber-700 bg-amber-950/40 text-amber-200',
		restart: 'border-rose-700 bg-rose-950/40 text-rose-200',
		'good-opening': 'border-emerald-700 bg-emerald-950/40 text-emerald-200',
		'late-constraint': 'border-amber-700 bg-amber-950/40 text-amber-200',
		'trade-off': 'border-emerald-700 bg-emerald-950/40 text-emerald-200',
		'edge-case': 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
	};
	const wordCls = (flags: WordFlag[]) =>
		[
			flags.includes('abandoned') && 'text-slate-500 line-through decoration-rose-500/60',
			flags.includes('hedge') && 'underline decoration-amber-400 decoration-wavy underline-offset-4',
			flags.includes('buzzword') && 'underline decoration-rose-400 decoration-wavy underline-offset-4',
			flags.includes('filler') && 'text-amber-300/80 italic',
			flags.includes('vague') && 'underline decoration-slate-400 decoration-dotted underline-offset-4'
		]
			.filter(Boolean)
			.join(' ');
</script>

<div class="annotated-transcript text-[15px] leading-8 text-slate-200">
	{#each tokens as t, i (i)}
		{#if t.type === 'word'}
			<span class={wordCls(t.flags)} title={t.flags.length ? t.flags.join(', ') : undefined}>{t.text}</span>{' '}
		{:else}
			<span class="marker mx-0.5 inline-block rounded border px-1.5 py-0 font-mono text-[11px] leading-5 {markerCls[t.kind]}" data-kind={t.kind}
				>[{t.label}]</span
			>{' '}
		{/if}
	{:else}
		<span class="text-slate-500">(no words captured)</span>
	{/each}
</div>
<p class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
	<span><span class="text-slate-500 line-through decoration-rose-500/60">struck</span> = abandoned before a restart</span>
	<span><span class="underline decoration-amber-400 decoration-wavy">wavy amber</span> = hedge</span>
	<span><span class="underline decoration-rose-400 decoration-wavy">wavy red</span> = buzzword</span>
	<span><span class="underline decoration-slate-400 decoration-dotted">dotted</span> = vague</span>
	<span><span class="text-amber-300/80 italic">italic</span> = filler</span>
</p>

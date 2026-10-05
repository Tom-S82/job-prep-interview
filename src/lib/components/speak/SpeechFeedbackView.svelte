<script lang="ts">
	import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
	import { coachingTips, stars, type Rating, type SpeechFeedback } from '#lib/speech/analysis.ts';
	import AnnotatedTranscript from './AnnotatedTranscript.svelte';
	import LeadReference from './LeadReference.svelte';

	let {
		scenario,
		feedback,
		audioUrl = null,
		typed = false,
		durationMs = 0,
		showLead = true
	}: {
		scenario: ArchitectureScenario;
		feedback: SpeechFeedback;
		audioUrl?: string | null;
		typed?: boolean;
		durationMs?: number;
		showLead?: boolean;
	} = $props();

	const rows = $derived<{ key: string; label: string; r: Rating }[]>([
		{ key: 'clarity', label: 'Clarity', r: feedback.clarity },
		{ key: 'confidence', label: 'Confidence', r: feedback.confidence },
		{ key: 'precision', label: 'Precision', r: feedback.precision },
		{ key: 'leadLike', label: 'Lead-like', r: feedback.leadLike }
	]);
	const tips = $derived(coachingTips(feedback));
	const m = $derived(feedback.metrics);
	const durationSec = $derived(Math.round(durationMs / 1000));
	let rate = $state(1);
	let audioEl = $state<HTMLAudioElement | null>(null);
	$effect(() => {
		if (audioEl) audioEl.playbackRate = rate;
	});
</script>

<div class="speech-feedback space-y-4">
	<!-- Narrative ratings -->
	<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
		<h3 class="mb-3 font-mono text-xs tracking-widest text-amber-400/80 uppercase">How it sounded</h3>
		<dl class="ratings space-y-2 font-mono text-sm">
			{#each rows as row (row.key)}
				<div class="rating grid grid-cols-[6.5rem_auto] items-baseline gap-x-3 sm:grid-cols-[7rem_6.5rem_1fr]" data-rating={row.key}>
					<dt class="text-slate-300">{row.label}:</dt>
					<dd class="stars text-lg tracking-wider text-amber-300" aria-label="{row.r.stars} out of 5" data-stars={row.r.stars}>{stars(row.r.stars)}</dd>
					<dd class="col-span-2 font-sans text-sm text-slate-400 sm:col-span-1">({row.r.summary})</dd>
				</div>
			{/each}
		</dl>

		<div class="tips mt-4 rounded-xl border border-sky-900/60 bg-sky-950/20 p-3">
			<h4 class="mb-1 text-sm font-semibold text-sky-200">Work on next</h4>
			<ul class="list-disc space-y-1 pl-5 text-sm text-slate-200">
				{#each tips as t (t)}<li>{t}</li>{/each}
			</ul>
		</div>

		<dl class="metrics mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
			{#if !typed}
				<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Length</dt><dd class="font-mono text-base text-slate-100">{durationSec}s</dd></div>
				<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Pace</dt><dd class="font-mono text-base text-slate-100">{m.wpm ?? '–'}<span class="text-xs text-slate-500"> wpm</span></dd></div>
				<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Long pauses</dt><dd class="font-mono text-base text-slate-100">{m.longPauses}</dd></div>
				<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Hesitations</dt><dd class="font-mono text-base text-slate-100">{m.hesitations}</dd></div>
			{/if}
			<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Words</dt><dd class="font-mono text-base text-slate-100">{m.words}</dd></div>
			<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Restarts</dt><dd class="font-mono text-base text-slate-100">{m.restarts}</dd></div>
			<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Fillers</dt><dd class="font-mono text-base text-slate-100">{m.fillers.length ? m.fillers.join(', ') : 0}</dd></div>
			{#if !typed && m.openingSilenceSeconds !== null}
				<div class="rounded-lg bg-slate-950/60 p-2"><dt class="text-slate-500">Time to start</dt><dd class="font-mono text-base text-slate-100">{m.openingSilenceSeconds}s</dd></div>
			{/if}
		</dl>
		{#if typed}
			<p class="mt-2 text-xs text-slate-500">Typed answer: pace and pauses can only be measured when you speak.</p>
		{:else}
			<p class="mt-2 text-xs text-slate-500">
				Pauses are measured from your microphone. Speech recognition often drops "um" and "uh", so the filler count may read low.
			</p>
		{/if}
	</section>

	<!-- Recording -->
	{#if audioUrl}
		<section class="recording rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h3 class="text-sm font-semibold text-slate-200">Your recording</h3>
				<label class="flex items-center gap-2 text-xs text-slate-400"
					>Speed
					<select class="rounded border-slate-700 bg-slate-950 py-0.5 text-xs text-slate-200" bind:value={rate}>
						<option value={0.75}>0.75×</option>
						<option value={1}>1×</option>
						<option value={1.25}>1.25×</option>
						<option value={1.5}>1.5×</option>
					</select>
				</label>
			</div>
			<audio class="attempt-audio mt-2 w-full" controls src={audioUrl} bind:this={audioEl}></audio>
			<p class="mt-1 text-xs text-slate-500">Listen with the transcript below: where do you stumble, and where do you sound sure?</p>
		</section>
	{/if}

	<!-- Transcript -->
	<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
		<h3 class="mb-2 text-sm font-semibold text-slate-200">Transcript for review</h3>
		<AnnotatedTranscript tokens={feedback.transcript} />
	</section>

	{#if showLead}
		<LeadReference {scenario} yours={{ ...m, durationSec }} />
	{/if}
</div>

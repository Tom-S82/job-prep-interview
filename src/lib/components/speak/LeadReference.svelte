<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { ArchitectureScenario } from '#lib/data/scenarios.ts';
	import { analyseSpeech, type DeliveryMetrics } from '#lib/speech/analysis.ts';
	import type { RecorderResult } from '#lib/speech/capture.ts';
	import { getRecording, referenceId, saveRecording } from '#lib/speech/recordings.ts';
	import { speak, ttsSupported } from '#lib/speech/sound.ts';
	import { journal } from '#lib/stores/speechJournal.ts';
	import Recorder from './Recorder.svelte';

	let { scenario, yours }: { scenario: ArchitectureScenario; yours?: DeliveryMetrics & { durationSec: number } } = $props();

	let speaking = $state(false);
	let stopSpeaking: (() => void) | null = null;
	let refUrl = $state<string | null>(null);
	let recordingRef = $state(false);
	let canSpeak = $state(false);
	const ref = $derived($journal.references[scenario.id]);

	async function loadRef() {
		const blob = await getRecording(referenceId(scenario.id));
		if (refUrl) URL.revokeObjectURL(refUrl);
		refUrl = blob ? URL.createObjectURL(blob) : null;
	}

	onMount(() => {
		canSpeak = ttsSupported();
		loadRef();
	});
	onDestroy(() => {
		stopSpeaking?.();
		if (refUrl) URL.revokeObjectURL(refUrl);
	});

	function toggleSpeak() {
		if (speaking) {
			stopSpeaking?.();
			speaking = false;
			return;
		}
		speaking = true;
		stopSpeaking = speak(scenario.sixtySecond, () => (speaking = false));
	}

	async function saveReference(r: RecorderResult) {
		recordingRef = false;
		const fb = analyseSpeech(scenario, r.answer);
		if (r.blob) await saveRecording(referenceId(scenario.id), r.blob);
		journal.setReference(scenario.id, {
			at: new Date().toISOString(),
			durationSec: Math.round(r.answer.durationMs / 1000),
			wpm: fb.metrics.wpm,
			longPauses: fb.metrics.longPauses,
			restarts: fb.metrics.restarts
		});
		await loadRef();
	}

	const fmt = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '–' : `${v}${unit}`);
</script>

<section class="lead-reference rounded-2xl border border-amber-900/60 bg-amber-950/10 p-4 sm:p-5">
	<h3 class="text-base font-semibold text-amber-200">The Lead version</h3>
	<p class="mt-2 text-sm leading-relaxed text-slate-100 italic">“{scenario.sixtySecond}”</p>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		{#if canSpeak}
			<button type="button" class="listen-lead rounded-lg border border-amber-700 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-500/10" onclick={toggleSpeak}>
				{speaking ? '■ Stop' : '▶ Listen (computer voice)'}
			</button>
		{/if}
		{#if !recordingRef}
			<button
				type="button"
				class="record-ref rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-slate-500"
				onclick={() => (recordingRef = true)}>{ref ? 'Re-record your reading' : 'Record yourself reading it'}</button
			>
		{/if}
	</div>
	<p class="mt-1 text-xs text-slate-500">
		Read it aloud once as your reference. Then compare your own answers with it for pace, pauses and restarts.
	</p>

	{#if recordingRef}
		<div class="mt-3"><Recorder compact allowTyping={false} label="Record reading" onfinish={saveReference} /></div>
	{/if}

	{#if refUrl}
		<div class="mt-3">
			<p class="text-xs text-slate-400">Your reading of the Lead version</p>
			<audio class="ref-audio mt-1 w-full" controls src={refUrl}></audio>
		</div>
	{/if}

	{#if ref && yours}
		<table class="compare mt-3 w-full text-left text-sm">
			<thead class="text-xs text-slate-500">
				<tr><th class="py-1 font-normal"></th><th class="py-1 font-normal">Your answer</th><th class="py-1 font-normal">Your Lead reading</th></tr>
			</thead>
			<tbody class="text-slate-200">
				<tr class="border-t border-slate-800"><td class="py-1 text-slate-400">Length</td><td>{yours.durationSec}s</td><td>{ref.durationSec}s</td></tr>
				<tr class="border-t border-slate-800"><td class="py-1 text-slate-400">Pace</td><td>{fmt(yours.wpm, ' wpm')}</td><td>{fmt(ref.wpm, ' wpm')}</td></tr>
				<tr class="border-t border-slate-800"><td class="py-1 text-slate-400">Long pauses</td><td>{yours.longPauses}</td><td>{ref.longPauses}</td></tr>
				<tr class="border-t border-slate-800"><td class="py-1 text-slate-400">Restarts</td><td>{yours.restarts}</td><td>{ref.restarts}</td></tr>
			</tbody>
		</table>
	{/if}
</section>

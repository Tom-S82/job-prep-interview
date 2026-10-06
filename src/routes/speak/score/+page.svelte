<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { findScenario, scenarios } from '#lib/data/scenarios.ts';
	import { analyseSpeech, type SpeechFeedback } from '#lib/speech/analysis.ts';
	import type { RecorderResult } from '#lib/speech/capture.ts';
	import { saveRecording } from '#lib/speech/recordings.ts';
	import { journal, newAttemptId, toEntry } from '#lib/stores/speechJournal.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';
	import SpeakNav from '#lib/components/speak/SpeakNav.svelte';
	import Recorder from '#lib/components/speak/Recorder.svelte';
	import SpeechFeedbackView from '#lib/components/speak/SpeechFeedbackView.svelte';

	const scenarioId = $derived(page.url.searchParams.get('s'));
	const scenario = $derived(findScenario(scenarioId) ?? null);

	let ready = $state(false);
	let result = $state<{ feedback: SpeechFeedback; audioUrl: string | null; typed: boolean; durationMs: number } | null>(null);
	let attemptKey = $state(0); // remounts the recorder for a fresh attempt

	// New scenario → clear any previous result (untracked: reset reads and writes its own state)
	$effect(() => {
		void scenarioId;
		untrack(reset);
	});

	function reset() {
		if (result?.audioUrl) URL.revokeObjectURL(result.audioUrl);
		result = null;
		attemptKey++;
	}

	async function finish(r: RecorderResult) {
		if (!scenario) return;
		const feedback = analyseSpeech(scenario, r.answer);
		const id = newAttemptId();
		if (r.blob) await saveRecording(id, r.blob);
		journal.add(
			toEntry(feedback, {
				id,
				mode: 'speak',
				scenarioId: scenario.id,
				typed: r.answer.typed,
				hasRecording: !!r.blob,
				durationMs: r.answer.durationMs,
				transcript: r.answer.transcript
			})
		);
		result = { feedback, audioUrl: r.blob ? URL.createObjectURL(r.blob) : null, typed: r.answer.typed, durationMs: r.answer.durationMs };
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	onMount(() => (ready = true));
	onDestroy(() => {
		if (result?.audioUrl) URL.revokeObjectURL(result.audioUrl);
	});
</script>

<svelte:head><title>{scenario ? `${scenario.title} · ` : ''}Speak & Score</title></svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 text-slate-200 sm:px-8" data-ready={ready}>
	<div class="mx-auto max-w-3xl">
		<SpeakNav />

		{#if !scenario}
			<h1 class="text-2xl font-semibold text-slate-100">Speak & Score</h1>
			<p class="mt-1 text-sm text-slate-400">Pick a scenario. You'll explain your approach out loud in 60–90 seconds.</p>
			<ul class="mt-5 grid gap-3 sm:grid-cols-2">
				{#each scenarios as s (s.id)}
					{@const tries = $journal.entries.filter((e) => e.scenarioId === s.id).length}
					<li>
						<a href="?s={s.id}" class="speak-scenario flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-4 hover:border-amber-400/60" data-scenario={s.id}>
							<span class="font-semibold text-slate-100">{s.title}</span>
							<span class="mt-1 flex-1 text-sm text-slate-400">{s.summary}</span>
							{#if tries}<span class="mt-2 font-mono text-xs text-emerald-400">{tries} attempt{tries === 1 ? '' : 's'}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else if result}
			<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h1 class="text-xl font-semibold text-slate-100">{scenario.title}</h1>
				<div class="flex gap-2">
					<button type="button" class="try-again rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300" onclick={reset}
						>Try again</button
					>
					<a href="/speak/score" class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">Another scenario</a>
				</div>
			</div>
			<SpeechFeedbackView {scenario} feedback={result.feedback} audioUrl={result.audioUrl} typed={result.typed} durationMs={result.durationMs} />
		{:else}
			<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
				<h1 class="text-xl font-semibold text-slate-100">{scenario.title}</h1>
				<div class="prose prose-sm prose-invert mt-2 max-w-none prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300">
					{@html markdownToHtml(scenario.context)}
				</div>
			</section>

			<section class="mt-4 rounded-2xl border border-amber-900/60 bg-amber-950/10 p-4 sm:p-5">
				<h2 class="text-base font-semibold text-amber-200">Explain your approach out loud</h2>
				<p class="mt-1 text-sm text-slate-300">
					Aim for 60–90 seconds. Shape: <span class="text-slate-100">the constraint → why → the trade-off → when you'd switch</span>.
				</p>
				<details class="mt-2 text-sm text-slate-400">
					<summary class="cursor-pointer hover:text-slate-200">Prompts to consider</summary>
					<ul class="mt-2 list-disc space-y-1 pl-5">
						{#each scenario.level1Hints as h (h)}<li>{h}</li>{/each}
					</ul>
				</details>
			</section>

			<div class="mt-4">
				{#key attemptKey}
					<Recorder onfinish={finish} />
				{/key}
			</div>
		{/if}
	</div>
</main>

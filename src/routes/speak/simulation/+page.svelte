<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { scenarios, type ArchitectureScenario } from '#lib/data/scenarios.ts';
	import { analyseSpeech, stars, type SpeechFeedback } from '#lib/speech/analysis.ts';
	import type { RecorderResult } from '#lib/speech/capture.ts';
	import { saveRecording } from '#lib/speech/recordings.ts';
	import { journal, newAttemptId, toEntry } from '#lib/stores/speechJournal.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';
	import SpeakNav from '#lib/components/speak/SpeakNav.svelte';
	import Recorder from '#lib/components/speak/Recorder.svelte';
	import SpeechFeedbackView from '#lib/components/speak/SpeechFeedbackView.svelte';

	const QUESTIONS = 3;
	type Phase = 'intro' | 'answering' | 'between' | 'review';
	interface SimResult {
		scenario: ArchitectureScenario;
		feedback: SpeechFeedback;
		audioUrl: string | null;
		typed: boolean;
		durationMs: number;
	}

	let ready = $state(false);
	let phase = $state<Phase>('intro');
	let minutes = $state(5);
	let picked = $state<ArchitectureScenario[]>([]);
	let index = $state(0);
	let results = $state<SimResult[]>([]);
	let simulationId = '';

	// ?seconds=N overrides the per-question time (handy for a quick run-through)
	const overrideSeconds = $derived(Number(page.url.searchParams.get('seconds')) || 0);
	const perQuestion = $derived(overrideSeconds || minutes * 60);
	const current = $derived(picked[index]);
	const avg = (k: 'clarity' | 'confidence' | 'precision' | 'leadLike') =>
		results.length ? Math.round((results.reduce((n, r) => n + r.feedback[k].stars, 0) / results.length) * 10) / 10 : 0;

	function begin() {
		const pool = [...scenarios];
		for (let i = pool.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		picked = pool.slice(0, QUESTIONS);
		index = 0;
		results = [];
		simulationId = `sim_${Date.now().toString(36)}`;
		phase = 'answering';
	}

	async function finish(r: RecorderResult) {
		const scenario = current;
		const feedback = analyseSpeech(scenario, r.answer);
		const id = newAttemptId();
		if (r.blob) await saveRecording(id, r.blob);
		journal.add(
			toEntry(feedback, {
				id,
				mode: 'simulation',
				simulationId,
				scenarioId: scenario.id,
				typed: r.answer.typed,
				hasRecording: !!r.blob,
				durationMs: r.answer.durationMs,
				transcript: r.answer.transcript
			})
		);
		results = [...results, { scenario, feedback, audioUrl: r.blob ? URL.createObjectURL(r.blob) : null, typed: r.answer.typed, durationMs: r.answer.durationMs }];
		phase = index + 1 >= QUESTIONS ? 'review' : 'between';
		window.scrollTo({ top: 0 });
	}

	function next() {
		index++;
		phase = 'answering';
	}

	function quit() {
		if (confirm('End the simulation? Answers so far are saved to your journal.')) phase = results.length ? 'review' : 'intro';
	}

	onMount(() => (ready = true));
	onDestroy(() => results.forEach((r) => r.audioUrl && URL.revokeObjectURL(r.audioUrl)));
</script>

<svelte:head><title>Interview Simulation</title></svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 text-slate-200 sm:px-8" data-ready={ready}>
	<div class="mx-auto max-w-3xl">
		<SpeakNav />

		{#if phase === 'intro'}
			<h1 class="text-2xl font-semibold text-slate-100">Interview Simulation</h1>
			<div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300">
				<ul class="list-disc space-y-1.5 pl-5">
					<li><span class="text-slate-100">{QUESTIONS} random scenarios</span>, answered out loud, one after another.</li>
					<li>
						<span class="text-slate-100">{overrideSeconds ? `${overrideSeconds} seconds` : `${minutes} minutes`} each</span>. A soft chime
						at one minute left, a bell at time, and recording stops automatically.
					</li>
					<li>Read the scenario first; the clock starts when you press <span class="text-slate-100">Start answering</span>.</li>
					<li>No feedback until the end, as in a real interview. Then you review every recording and transcript.</li>
				</ul>
				{#if !overrideSeconds}
					<fieldset class="mt-4 flex flex-wrap items-center gap-3">
						<legend class="sr-only">Time per question</legend>
						<span class="text-slate-400">Time per question:</span>
						{#each [2, 3, 5] as m (m)}
							<label class="flex items-center gap-1.5">
								<input type="radio" name="minutes" value={m} bind:group={minutes} class="border-slate-600 bg-slate-900 text-amber-400" />
								{m} min{m === 5 ? ' (interview)' : ''}
							</label>
						{/each}
					</fieldset>
				{/if}
				<button type="button" class="begin mt-5 rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-300" onclick={begin}
					>Begin simulation</button
				>
			</div>
		{:else if phase === 'answering' && current}
			<div class="mb-3 flex items-center justify-between">
				<p class="sim-progress font-mono text-sm text-slate-400">Question {index + 1} of {QUESTIONS}</p>
				<button type="button" class="text-xs text-slate-500 hover:text-slate-300" onclick={quit}>End simulation</button>
			</div>
			<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
				<h1 class="sim-title text-xl font-semibold text-slate-100">{current.title}</h1>
				<div class="prose prose-sm prose-invert mt-2 max-w-none prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300">
					{@html markdownToHtml(current.context)}
				</div>
				<p class="mt-3 text-sm font-semibold text-amber-200">"Talk me through how you'd approach this."</p>
			</section>
			<div class="mt-4">
				{#key index}
					<Recorder maxSeconds={perQuestion} warnSeconds={60} requireSpeech label="Start answering" onfinish={finish} />
				{/key}
			</div>
		{:else if phase === 'between'}
			<section class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
				<p class="text-lg text-slate-100">Answer {index + 1} saved.</p>
				<p class="mt-1 text-sm text-slate-400">Take a breath. Feedback comes at the end.</p>
				<button type="button" class="next-question mt-4 rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-300" onclick={next}
					>Next scenario →</button
				>
			</section>
		{:else if phase === 'review'}
			<h1 class="text-2xl font-semibold text-slate-100">Simulation review</h1>
			<section class="sim-summary mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
				<table class="w-full text-left text-sm">
					<thead class="text-xs text-slate-500">
						<tr>
							<th class="py-1 font-normal">Scenario</th>
							<th class="py-1 font-normal">Clarity</th>
							<th class="hidden py-1 font-normal sm:table-cell">Confidence</th>
							<th class="hidden py-1 font-normal sm:table-cell">Precision</th>
							<th class="py-1 font-normal">Lead-like</th>
						</tr>
					</thead>
					<tbody>
						{#each results as r (r.scenario.id)}
							<tr class="border-t border-slate-800">
								<td class="py-1.5 pr-2 text-slate-200">{r.scenario.title}</td>
								<td class="font-mono text-amber-300">{stars(r.feedback.clarity.stars)}</td>
								<td class="hidden font-mono text-amber-300 sm:table-cell">{stars(r.feedback.confidence.stars)}</td>
								<td class="hidden font-mono text-amber-300 sm:table-cell">{stars(r.feedback.precision.stars)}</td>
								<td class="font-mono text-amber-300">{stars(r.feedback.leadLike.stars)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="mt-3 text-sm text-slate-400">
					Average: clarity {avg('clarity')}, confidence {avg('confidence')}, precision {avg('precision')}, Lead-like {avg('leadLike')}.
				</p>
			</section>

			<ol class="mt-4 space-y-3">
				{#each results as r, i (r.scenario.id)}
					<li class="sim-result rounded-2xl border border-slate-800 bg-slate-900/40">
						<details open={i === 0}>
							<summary class="cursor-pointer px-4 py-3 text-base font-semibold text-slate-100">{i + 1}. {r.scenario.title}</summary>
							<div class="px-3 pb-4 sm:px-4">
								<SpeechFeedbackView scenario={r.scenario} feedback={r.feedback} audioUrl={r.audioUrl} typed={r.typed} durationMs={r.durationMs} />
							</div>
						</details>
					</li>
				{/each}
			</ol>

			<div class="mt-4 flex flex-wrap gap-3">
				<button type="button" class="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300" onclick={begin}
					>Run another simulation</button
				>
				<a href="/speak/journal" class="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500">Practice journal</a>
			</div>
		{/if}
	</div>
</main>

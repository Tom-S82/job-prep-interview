<script lang="ts">
	import { onMount } from 'svelte';
	import { speechSupport } from '#lib/speech/capture.ts';
	import { journalStats } from '#lib/stores/speechJournal.ts';
	import SpeakNav from '#lib/components/speak/SpeakNav.svelte';

	let support = $state<{ record: boolean; transcribe: boolean } | null>(null);
	onMount(() => (support = speechSupport()));

	const modes = [
		{
			href: '/speak/score',
			title: 'Speak & Score',
			body: 'Pick a scenario and answer out loud. Get feedback on clarity, confidence, precision and how Lead-like you sound, with an annotated transcript and your recording.',
			time: '2–3 minutes'
		},
		{
			href: '/speak/simulation',
			title: 'Interview Simulation',
			body: 'Three random scenarios, five minutes each, answered out loud. A bell rings at time. Review all three recordings and transcripts at the end.',
			time: '15–20 minutes'
		},
		{
			href: '/speak/journal',
			title: 'Practice Journal',
			body: 'Every attempt, with trends for clarity and confidence over time, and the scenarios where you tend to ramble.',
			time: 'Review'
		}
	];
</script>

<svelte:head><title>Speaking practice · Inside the Data Platform</title></svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 text-slate-200 sm:px-8" data-ready={support !== null}>
	<div class="mx-auto max-w-4xl">
		<SpeakNav />
		<h1 class="text-2xl font-semibold text-slate-100 sm:text-3xl">Say it out loud</h1>
		<p class="mt-1 max-w-2xl text-sm text-slate-400">
			Knowing the answer isn't enough; the panel hears how you say it. Practise speaking your answers, then review how they
			sounded.
		</p>

		<ul class="mt-6 grid gap-4 md:grid-cols-3">
			{#each modes as m (m.href)}
				<li>
					<a href={m.href} class="mode-card flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5 hover:border-amber-400/60">
						<span class="text-lg font-semibold text-slate-100">{m.title}</span>
						<span class="mt-2 flex-1 text-sm text-slate-400">{m.body}</span>
						<span class="mt-3 font-mono text-xs text-slate-500">{m.time}</span>
					</a>
				</li>
			{/each}
		</ul>

		{#if $journalStats.total}
			<p class="mt-4 text-sm text-slate-400">
				{$journalStats.total} attempts so far · latest clarity {$journalStats.clarity.last}/5, confidence {$journalStats.confidence.last}/5.
				<a href="/speak/journal" class="text-sky-400 hover:text-sky-300">See your journal →</a>
			</p>
		{/if}

		<section class="support mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-300">
			<h2 class="mb-2 font-semibold text-slate-100">Before you start</h2>
			{#if support}
				<ul class="space-y-1">
					<li data-testid="support-record">
						{support.record ? '✅' : '❌'} Recording {support.record ? 'is available' : "isn't available in this browser (you can type instead)"}
					</li>
					<li data-testid="support-transcribe">
						{support.transcribe ? '✅' : '⚠️'}
						{support.transcribe ? 'Live transcription is available' : "Live transcription isn't available here: use Chrome, Edge or Safari, or type what you said"}
					</li>
				</ul>
			{/if}
			<ul class="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400">
				<li>Your recordings are stored only in this browser (the most recent 30 are kept). Nothing is uploaded by this app.</li>
				<li>
					Live transcription uses your browser's speech service. In Chrome and Edge that sends audio to the browser vendor's
					servers to be transcribed, so practise with made-up details, never real customer data.
				</li>
				<li>Use headphones or a quiet room: pause detection works from the microphone level.</li>
			</ul>
		</section>
	</div>
</main>

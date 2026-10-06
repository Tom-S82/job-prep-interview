<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { findScenario } from '#lib/data/scenarios.ts';
	import { stars } from '#lib/speech/analysis.ts';
	import { getRecording } from '#lib/speech/recordings.ts';
	import { journal, journalStats, type JournalEntry } from '#lib/stores/speechJournal.ts';
	import SpeakNav from '#lib/components/speak/SpeakNav.svelte';
	import TrendChart from '#lib/components/speak/TrendChart.svelte';

	let ready = $state(false);
	let audio = $state<Record<string, string>>({});
	onMount(() => (ready = true));
	onDestroy(() => Object.values(audio).forEach((u) => URL.revokeObjectURL(u)));

	const title = (id: string) => findScenario(id)?.title ?? id;
	const recent = $derived($journal.entries.slice(-20));
	const newestFirst = $derived([...$journal.entries].reverse());
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const delta = (d: number) => (d > 0 ? `+${d}` : `${d}`);
	const trendRows = $derived([
		{ label: 'Clarity', t: $journalStats.clarity },
		{ label: 'Confidence', t: $journalStats.confidence },
		{ label: 'Precision', t: $journalStats.precision },
		{ label: 'Lead-like', t: $journalStats.leadLike }
	]);

	async function loadAudio(e: JournalEntry) {
		const blob = await getRecording(e.id);
		if (blob) audio = { ...audio, [e.id]: URL.createObjectURL(blob) };
		else audio = { ...audio, [e.id]: '' };
	}
</script>

<svelte:head><title>Practice Journal</title></svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 text-slate-200 sm:px-8" data-ready={ready}>
	<div class="mx-auto max-w-4xl">
		<SpeakNav />
		<h1 class="text-2xl font-semibold text-slate-100">Practice Journal</h1>

		{#if !$journalStats.total}
			<p class="mt-4 text-sm text-slate-400" data-testid="journal-empty">
				No attempts yet. Try <a class="text-sky-400 hover:text-sky-300" href="/speak/score">Speak & Score</a> or an
				<a class="text-sky-400 hover:text-sky-300" href="/speak/simulation">Interview Simulation</a>.
			</p>
		{:else}
			<p class="mt-1 text-sm text-slate-400"><span data-testid="journal-total">{$journalStats.total}</span> attempts recorded.</p>

			<!-- Trend -->
			<section class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
				<h2 class="mb-3 text-sm font-semibold text-slate-200">Trend (last {recent.length} attempts)</h2>
				<TrendChart
					series={[
						{ label: 'Clarity', color: '#fbbf24', values: recent.map((e) => e.ratings.clarity) },
						{ label: 'Confidence', color: '#38bdf8', values: recent.map((e) => e.ratings.confidence) },
						{ label: 'Lead-like', color: '#34d399', values: recent.map((e) => e.ratings.leadLike) }
					]}
				/>
				{#if $journalStats.total >= 4}
					<dl class="improvement mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
						{#each trendRows as row (row.label)}
							<div class="rounded-lg bg-slate-950/60 p-2">
								<dt class="text-slate-500">{row.label}</dt>
								<dd class="font-mono text-sm text-slate-100">
									{row.t.first} → {row.t.last}
									<span class={row.t.delta > 0 ? 'text-emerald-400' : row.t.delta < 0 ? 'text-rose-400' : 'text-slate-500'}>({delta(row.t.delta)})</span>
								</dd>
							</div>
						{/each}
					</dl>
					<p class="mt-1 text-xs text-slate-500">Average of your first three attempts → your latest three.</p>
				{/if}
			</section>

			<!-- Weak scenarios -->
			{#if $journalStats.weak.length}
				<section class="weak-scenarios mt-4 rounded-2xl border border-rose-900/60 bg-rose-950/10 p-4 sm:p-5">
					<h2 class="mb-2 text-sm font-semibold text-rose-200">Where to focus</h2>
					<ul class="space-y-2 text-sm">
						{#each $journalStats.weak as w (w.scenarioId)}
							<li class="flex flex-wrap items-baseline justify-between gap-2">
								<span class="text-slate-200">{title(w.scenarioId)}</span>
								<span class="text-xs text-slate-400">
									clarity {w.clarity}/5 · confidence {w.confidence}/5 · rambled in {w.rambleRate}% of {w.attempts} attempt{w.attempts === 1 ? '' : 's'}
									<a class="ml-2 text-sky-400 hover:text-sky-300" href="/speak/score?s={w.scenarioId}">Practise →</a>
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<!-- Attempts -->
			<section class="mt-4">
				<h2 class="mb-2 text-sm font-semibold text-slate-200">All attempts</h2>
				<ul class="space-y-2">
					{#each newestFirst as e (e.id)}
						<li class="journal-entry rounded-xl border border-slate-800 bg-slate-900/50" data-mode={e.mode}>
							<details>
								<summary class="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
									<span class="font-mono text-xs text-slate-500">{fmtDate(e.at)}</span>
									<span class="text-slate-100">{title(e.scenarioId)}</span>
									<span class="rounded-full border border-slate-700 px-2 text-[11px] text-slate-400">{e.mode === 'simulation' ? 'simulation' : 'speak'}{e.typed ? ' · typed' : ''}</span>
									<span class="ml-auto font-mono text-xs text-amber-300" title="Clarity / Confidence / Precision / Lead-like">
										C{e.ratings.clarity} · Cf{e.ratings.confidence} · P{e.ratings.precision} · L{e.ratings.leadLike}
									</span>
								</summary>
								<div class="space-y-2 border-t border-slate-800 px-3 py-3 text-sm">
									<p class="font-mono text-xs text-slate-400">
										Clarity {stars(e.ratings.clarity)} · Confidence {stars(e.ratings.confidence)} · {e.durationSec}s · {e.wpm ?? '–'} wpm ·
										{e.longPauses} long pauses · {e.restarts} restarts
									</p>
									<p class="text-slate-300">{e.transcript || '(no transcript)'}</p>
									{#if e.hasRecording}
										{#if audio[e.id] === undefined}
											<button type="button" class="load-audio text-xs text-sky-400 hover:text-sky-300" onclick={() => loadAudio(e)}>▶ Load recording</button>
										{:else if audio[e.id]}
											<audio class="w-full" controls src={audio[e.id]}></audio>
										{:else}
											<p class="text-xs text-slate-500">Recording no longer available.</p>
										{/if}
									{/if}
								</div>
							</details>
						</li>
					{/each}
				</ul>
			</section>

			<button
				type="button"
				class="mt-6 text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
				onclick={() => {
					if (confirm('Delete all attempts and their recordings? Your Lead read-throughs are kept.')) journal.reset();
				}}>Reset journal</button
			>
		{/if}
	</div>
</main>

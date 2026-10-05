<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { scenarios } from '#lib/data/scenarios.ts';
	import { emptyAnswers, evaluateChallenge, type ChallengeAnswers } from '#lib/utils/challengeFeedback.ts';
	import { challengeProgress, challengeSummary } from '#lib/stores/challengeProgress.ts';
	import { attemptHistory, buildAttempt } from '#lib/stores/attemptHistory.ts';
	import ArchitectureChallenge from '#lib/components/ArchitectureChallenge.svelte';
	import ChallengeSubmission from '#lib/components/ChallengeSubmission.svelte';
	import AttemptHistory from '#lib/components/AttemptHistory.svelte';
	import AttemptDetail from '#lib/components/AttemptDetail.svelte';
	import ProgressJournal from '#lib/components/ProgressJournal.svelte';

	// URL is the source of truth, so a refresh lands you back where you were:
	//   ?s=<id>                 design form
	//   ?s=<id>&a=<attempt>     feedback for a saved attempt
	//   ?view=history[&a=…]     attempt history / one attempt in detail
	//   ?view=journal           progress journal
	const params = $derived(page.url.searchParams);
	const scenarioId = $derived(params.get('s'));
	const attemptId = $derived(params.get('a'));
	const view = $derived(params.get('view'));
	const scenario = $derived(scenarios.find((s) => s.id === scenarioId) ?? null);
	const attempt = $derived(attemptId ? $attemptHistory.find((a) => a.id === attemptId) : undefined);
	const nextHref = $derived.by(() => {
		if (!scenario) return null;
		const i = scenarios.indexOf(scenario);
		return i < scenarios.length - 1 ? `?s=${scenarios[i + 1].id}` : null;
	});

	let answers = $state<ChallengeAnswers>(emptyAnswers());
	let ready = $state(false);

	// Fresh form whenever the scenario changes
	$effect(() => {
		void scenarioId;
		untrack(() => (answers = emptyAnswers()));
	});

	function submit() {
		if (!scenario) return;
		const a = buildAttempt(scenario, answers);
		attemptHistory.add(a);
		const content = evaluateChallenge(scenario, answers);
		challengeProgress.record(scenario.id, {
			structure: a.scores.structure,
			clarity: a.scores.clarity,
			depth: a.scores.depth,
			coverage: Math.round((content.conceptsMatched.length / scenario.concepts.length) * 100),
			choices: Math.round((content.choiceResults.filter((r) => r.chosen?.verdict === 'best').length / scenario.level2.length) * 100),
			at: a.timestamp
		});
		goto(`?s=${scenario.id}&a=${a.id}`);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function editAttempt() {
		if (!scenario) return;
		if (attempt) answers = JSON.parse(JSON.stringify(attempt.answers)) as ChallengeAnswers;
		goto(`?s=${scenario.id}`);
	}

	onMount(() => (ready = true));

	const tabs = [
		{ id: null, href: '/challenge', label: 'Scenarios' },
		{ id: 'history', href: '?view=history', label: 'Attempt History' },
		{ id: 'journal', href: '?view=journal', label: 'Progress Journal' }
	];
</script>

<svelte:head>
	<title>{scenario ? `${scenario.title} · ` : ''}Architecture Challenge</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 text-slate-200 sm:px-8" data-ready={ready}>
	<div class="mx-auto max-w-5xl">
		<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
			<div>
				<p class="font-mono text-xs tracking-[0.2em] text-amber-400/80 uppercase">Architecture challenge</p>
				<h1 class="text-2xl font-semibold text-slate-100 sm:text-3xl">Design it, then say it like a Lead</h1>
				<p class="mt-1 max-w-2xl text-sm text-slate-400">
					Real thinkmoney problems. Sketch your strategy, make the key decisions, then compare how you explained it with how
					a Lead would.
				</p>
			</div>
			<div class="flex gap-2">
				<a href="/" class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500">Pipeline</a>
				<a href="/speak" class="rounded-md border border-rose-500/50 px-3 py-1.5 text-sm text-rose-200 hover:border-rose-400">Speak it →</a>
				{#if scenario}
					<a href="/challenge" class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500">← All scenarios</a>
				{/if}
			</div>
		</header>

		{#if scenario && attemptId}
			<!-- Feedback for a saved attempt (survives refresh) -->
			{#if attempt}
				<ChallengeSubmission {scenario} answers={attempt.answers} attemptId={attempt.id} {nextHref} onretry={editAttempt} />
			{:else}
				<p class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
					That attempt isn't in your history any more. <a class="text-sky-400 hover:text-sky-300" href="?s={scenario.id}">Start a new attempt →</a>
				</p>
			{/if}
		{:else if scenario}
			<ArchitectureChallenge {scenario} bind:answers onsubmit={submit} />
		{:else}
			<nav class="challenge-tabs mb-6 flex flex-wrap gap-1.5" aria-label="Challenge sections">
				{#each tabs as t (t.label)}
					<a
						href={t.href}
						class="tab rounded-full border px-3 py-1 text-sm {view === t.id
							? 'border-amber-400 bg-amber-400 text-slate-950'
							: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
						aria-current={view === t.id ? 'page' : undefined}
					>
						{t.label}{#if t.id === 'history' && $attemptHistory.length}<span class="ml-1 font-mono text-xs opacity-70">{$attemptHistory.length}</span>{/if}
					</a>
				{/each}
			</nav>

			{#if view === 'history'}
				{#if attemptId}
					{#if attempt}
						<AttemptDetail {attempt} scenario={scenarios.find((s) => s.id === attempt.scenarioId)} />
					{:else}
						<p class="text-sm text-slate-400">That attempt isn't in your history. <a class="text-sky-400" href="?view=history">Back to history</a></p>
					{/if}
				{:else}
					<AttemptHistory />
				{/if}
			{:else if view === 'journal'}
				<ProgressJournal />
			{:else}
				<!-- What to expect -->
				<details class="how-it-works mb-6 rounded-2xl border border-sky-900/60 bg-sky-950/20 p-5" open={!$challengeSummary.completed}>
					<summary class="cursor-pointer text-base font-semibold text-sky-100">What to expect</summary>
					<div class="mt-3 grid gap-5 text-sm text-slate-300 md:grid-cols-2">
						<div>
							<h3 class="mb-1 font-semibold text-slate-100">Each scenario takes 10–15 minutes</h3>
							<ol class="list-decimal space-y-1 pl-5">
								<li><span class="text-slate-100">Level 1</span>: your strategy in 3–5 bullet points (about 2 minutes).</li>
								<li><span class="text-slate-100">Level 2</span>: four design decisions. Pick an option and say why.</li>
								<li><span class="text-slate-100">Level 3</span>: where your design breaks. Optional, but it's what panels probe hardest.</li>
							</ol>
							<p class="mt-2">
								Write the way you'd speak in the room. The feedback rewards answers shaped as
								<span class="text-slate-100">constraint → why → trade-off → when you'd switch</span>.
							</p>
						</div>
						<div>
							<h3 class="mb-1 font-semibold text-slate-100">What you get back</h3>
							<ul class="list-disc space-y-1 pl-5">
								<li>
									<span class="text-slate-100">Three scores (1–5)</span>: Structure (constraint first, trade-off, switch condition),
									Clarity (no hedging, buzzwords or tool lists), Depth (key ideas, real reasons, failure modes), each with what the
									next star needs.
								</li>
								<li>Feedback on how you explained it, quoting your own words.</li>
								<li>The Lead's version: the narrative, key phrases, what to watch out for, a 60-second version, and how to defend it.</li>
								<li>Every attempt is saved in <a class="text-sky-400 hover:text-sky-300" href="?view=history">Attempt History</a>.</li>
							</ul>
							<p class="mt-2 text-xs text-slate-500">
								Feedback is pattern-based, not AI marking: it looks for structure, reasoning words and each scenario's key ideas.
								An unusually phrased good answer can score lower than it deserves. Read the Lead version either way.
							</p>
						</div>
					</div>
				</details>

				<!-- Progress summary -->
				<div class="progress-summary mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
					<p class="text-slate-400">
						<span class="font-semibold text-slate-100" data-testid="challenge-completed">{$challengeSummary.completed}/{scenarios.length}</span>
						scenarios done
						{#if $challengeSummary.completed}
							· average Structure {$challengeSummary.structure}, Clarity {$challengeSummary.clarity}, Depth {$challengeSummary.depth}
							· {$challengeSummary.coverage}% of key ideas covered
						{/if}
					</p>
					{#if $challengeSummary.completed}
						<button
							type="button"
							class="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
							onclick={() => {
								if (confirm('Reset scenario progress and attempt history?')) {
									challengeProgress.reset();
									attemptHistory.reset();
								}
							}}>Reset progress</button
						>
					{/if}
				</div>

				<ul class="scenario-list grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{#each scenarios as s, i (s.id)}
						{@const p = $challengeProgress[s.id]}
						<li>
							<a
								href="?s={s.id}"
								class="scenario-card flex h-full flex-col rounded-2xl border bg-slate-900/70 p-5 transition-colors hover:border-amber-400/60 {p
									? 'border-emerald-900'
									: 'border-slate-800'}"
								data-scenario={s.id}
								data-done={!!p}
							>
								<span class="flex items-center justify-between font-mono text-xs text-slate-500">
									Scenario {i + 1}
									{#if p}<span class="text-emerald-400">✓ done{p.attempts > 1 ? ` ×${p.attempts}` : ''}</span>{/if}
								</span>
								<span class="mt-1 text-base font-semibold text-slate-100">{s.title}</span>
								<span class="mt-2 flex-1 text-sm text-slate-400">{s.summary}</span>
								{#if p}
									<span class="card-scores mt-3 grid grid-cols-3 gap-1 text-center font-mono text-[11px]">
										<span class="rounded bg-slate-800 py-1">S {p.last.structure}</span>
										<span class="rounded bg-slate-800 py-1">C {p.last.clarity}</span>
										<span class="rounded bg-slate-800 py-1">D {p.last.depth}</span>
									</span>
									<span class="mt-1 text-[11px] text-slate-500">{p.last.coverage}% ideas · {p.last.choices}% choices matched</span>
								{/if}
								<span class="mt-3 text-sm text-amber-300">{p ? 'Try again →' : 'Start →'}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</main>

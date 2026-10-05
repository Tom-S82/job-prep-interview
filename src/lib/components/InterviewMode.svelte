<script lang="ts">
	import { onMount } from 'svelte';
	import { questionSets, type QuestionTier } from '#lib/data/questions.ts';
	import type { InterviewQuestion } from '#lib/data/stages.ts';
	import {
		ratings,
		accuracy,
		progress,
		questionKey,
		resetAll,
		type Confidence,
		type Accuracy
	} from '#lib/stores/progress.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';
	import { keyPointsFor, usesScaffold } from '#lib/utils/recall.ts';

	let { initialSet = null }: { initialSet?: string | null } = $props();

	const ALL = 'all';
	type Entry = { setId: string; setLabel: string; question: InterviewQuestion };

	// Recall stages: attempt cold → attempt with cues → compare with model → self-score
	type Stage = 0 | 1 | 2 | 3;
	const stageLabels = ['Attempt', 'Key points', 'Model answer', 'Score'] as const;

	const tiers: QuestionTier[] = ['Pipeline', 'Architecture', 'Your stories', 'Honest gaps', 'General'];
	const accuracyOptions: { id: Accuracy; emoji: string; label: string; hint: string; key: string; on: string }[] = [
		{
			id: 'nailed',
			emoji: '✅',
			label: 'Nailed it',
			hint: 'I said that',
			key: '1',
			on: 'border-emerald-400 bg-emerald-500/30 text-emerald-50 ring-2 ring-emerald-500/50'
		},
		{
			id: 'close',
			emoji: '⚠️',
			label: 'Close',
			hint: 'Right ideas, different words',
			key: '2',
			on: 'border-amber-400 bg-amber-500/30 text-amber-50 ring-2 ring-amber-500/50'
		},
		{
			id: 'missed',
			emoji: '❌',
			label: 'Missed it',
			hint: "Couldn't recall it",
			key: '3',
			on: 'border-rose-400 bg-rose-500/30 text-rose-50 ring-2 ring-rose-500/50'
		}
	];
	const confidenceOptions: { id: Confidence; emoji: string; label: string; on: string }[] = [
		{ id: 'green', emoji: '🟢', label: 'Confident', on: 'border-emerald-400 bg-emerald-500/30 text-emerald-50' },
		{ id: 'amber', emoji: '🟡', label: 'Shaky', on: 'border-amber-400 bg-amber-500/30 text-amber-50' },
		{ id: 'red', emoji: '🔴', label: 'Not yet', on: 'border-rose-400 bg-rose-500/30 text-rose-50' }
	];

	let setId = $state<string>(ALL);
	let current = $state<Entry | null>(null);
	let stage = $state<Stage>(0);
	let allGreenNotice = $state(false);

	const entries = (id: string): Entry[] =>
		questionSets
			.filter((s) => id === ALL || s.id === id)
			.flatMap((s) => s.questions.map((question) => ({ setId: s.id, setLabel: s.label, question })));

	const totalQuestions = entries(ALL).length;
	const key = $derived(current ? questionKey(current.setId, current.question.q) : '');
	const currentConfidence = $derived(current ? $ratings[key] : undefined);
	const currentAccuracy = $derived(current ? $accuracy[key] : undefined);
	const scaffold = $derived(current ? usesScaffold(current.question) : false);
	const points = $derived(current ? keyPointsFor(current.question) : []);
	const answerHtml = $derived(current?.question.a ? markdownToHtml(current.question.a) : '');

	const totals = $derived.by(() => {
		const all = Object.values($progress);
		const green = all.reduce((n, p) => n + p.green, 0);
		const score = all.reduce((n, p) => n + p.nailed + p.close * 0.5, 0);
		return { green, pctAccuracy: totalQuestions ? Math.round((score / totalQuestions) * 100) : 0 };
	});

	// Stages available for this question (the key-points stage is skipped when there's no scaffold)
	const stagesFor = (withScaffold: boolean): Stage[] => (withScaffold ? [0, 1, 2, 3] : [0, 2, 3]);
	const available = $derived(stagesFor(scaffold));
	const canBack = $derived(available.indexOf(stage) > 0);
	const canForward = $derived(available.indexOf(stage) < available.length - 1);
	const forwardLabel = $derived(
		stage === 0 ? (scaffold ? 'Show key points' : 'Show model answer') : stage === 1 ? 'Show model answer' : 'Score accuracy'
	);

	function forward() {
		const i = available.indexOf(stage);
		if (i < available.length - 1) stage = available[i + 1];
	}
	function back() {
		const i = available.indexOf(stage);
		if (i > 0) stage = available[i - 1];
	}
	function goTo(s: Stage) {
		if (available.includes(s)) stage = s;
	}

	// Random pick, avoiding an immediate repeat and favouring questions not yet nailed with confidence
	function next() {
		const pool = entries(setId).filter((e) => e.question.q !== current?.question.q);
		const candidates = pool.length ? pool : entries(setId);
		const mastered = (e: Entry) => {
			const k = questionKey(e.setId, e.question.q);
			return $ratings[k] === 'green' && $accuracy[k] !== 'missed';
		};
		const todo = candidates.filter((e) => !mastered(e));
		allGreenNotice = todo.length === 0;
		const from = todo.length ? todo : candidates;
		current = from[Math.floor(Math.random() * from.length)] ?? null;
		stage = 0;
	}

	function selectSet(id: string) {
		setId = id;
		current = null;
		next();
	}

	function scoreAccuracy(a: Accuracy) {
		if (current) accuracy.rate(current.setId, current.question.q, a);
	}
	function rateConfidence(c: Confidence) {
		if (current) ratings.rate(current.setId, current.question.q, c);
	}

	function onKey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(el.tagName)) return;
		if (e.key === ' ' || e.key === 'ArrowRight') {
			e.preventDefault();
			forward();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			back();
		} else if (stage === 3 && ['1', '2', '3'].includes(e.key)) {
			scoreAccuracy(accuracyOptions[Number(e.key) - 1].id);
		} else if (e.key === 'n' || e.key === 'N') {
			next();
		}
	}

	onMount(() => {
		if (initialSet && questionSets.some((s) => s.id === initialSet)) setId = initialSet;
		next(); // client-only, so the random pick never mismatches SSR
	});
</script>

<svelte:window onkeydown={onKey} />

<section class="text-slate-200">
	<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="font-mono text-xs tracking-[0.2em] text-amber-400/80 uppercase">Interview mode</p>
			<h1 class="text-2xl font-semibold text-slate-100 sm:text-3xl">Recall, don't reread</h1>
			<p class="mt-1 max-w-xl text-sm text-slate-400">
				Answer out loud cold. Stuck? Use the key points as prompts. Then compare with the model answer and score
				yourself honestly.
			</p>
		</div>
		<div class="flex items-center gap-4">
			<div class="text-right">
				<p class="font-mono text-xs text-slate-500">Overall</p>
				<p class="text-sm font-semibold text-emerald-300" data-testid="overall-progress">
					{totals.green}/{totalQuestions} confident
				</p>
				<p class="text-sm font-semibold text-sky-300" data-testid="overall-accuracy">
					{totals.pctAccuracy}% accuracy
				</p>
			</div>
			<a
				href="/"
				class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
				>← Back to pipeline</a
			>
		</div>
	</header>

	<!-- Stage selector -->
	<nav aria-label="Question sets" class="mb-6 space-y-3">
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="set-btn rounded-full border px-3 py-1 text-xs"
				class:border-amber-400={setId === ALL}
				class:bg-amber-400={setId === ALL}
				class:text-slate-950={setId === ALL}
				class:border-slate-700={setId !== ALL}
				aria-pressed={setId === ALL}
				onclick={() => selectSet(ALL)}>All questions · {totalQuestions}</button
			>
		</div>
		{#each tiers as tier (tier)}
			{@const sets = questionSets.filter((s) => s.tier === tier && s.questions.length)}
			{#if sets.length}
				<div class="flex flex-wrap items-center gap-2">
					<span class="w-full font-mono text-[10px] tracking-widest text-slate-500 uppercase sm:w-28">{tier}</span>
					{#each sets as s (s.id)}
						{@const p = $progress[s.id]}
						<button
							type="button"
							class="set-btn relative overflow-hidden rounded-full border px-3 py-1 text-xs"
							class:border-amber-400={setId === s.id}
							class:text-amber-200={setId === s.id}
							class:border-slate-700={setId !== s.id}
							class:text-slate-300={setId !== s.id}
							aria-pressed={setId === s.id}
							onclick={() => selectSet(s.id)}
							title="{p.pctGreen}% confident · {p.pctAccuracy}% accuracy"
						>
							<span class="absolute inset-y-0 left-0 bg-sky-500/20" style="width:{p.pctAccuracy}%" aria-hidden="true"
							></span>
							<span class="relative">{s.label} <span class="font-mono text-slate-500">{p.pctAccuracy}%</span></span>
						</button>
					{/each}
				</div>
			{/if}
		{/each}
	</nav>

	<!-- Question card -->
	<article class="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl shadow-black/40 sm:p-8" aria-live="polite">
		{#if current}
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<span class="rounded-full border border-slate-700 px-2.5 py-0.5 font-mono text-xs text-slate-400"
					>{current.setLabel}</span
				>
				<span class="font-mono text-xs text-slate-500">
					{#if currentAccuracy}
						{@const a = accuracyOptions.find((x) => x.id === currentAccuracy)!}
						last: {a.emoji} {a.label}
					{/if}
					{#if currentConfidence}
						{@const c = confidenceOptions.find((x) => x.id === currentConfidence)!}
						· {c.emoji} {c.label}
					{/if}
				</span>
			</div>

			<h2 class="question text-xl leading-snug font-semibold text-slate-50 sm:text-2xl">{current.question.q}</h2>

			{#if allGreenNotice}
				<p class="mt-3 text-xs text-emerald-400/80">You're confident on everything here, so this is a random review.</p>
			{/if}

			<!-- Stage stepper: click to jump back or forward -->
			<ol class="stepper mt-6 grid grid-cols-4 gap-1.5" aria-label="Recall stages">
				{#each stageLabels as label, i (label)}
					{@const s = i as Stage}
					{@const enabled = available.includes(s)}
					<li>
						<button
							type="button"
							class="stage-pill w-full rounded-md border px-1 py-1.5 text-[11px] leading-tight transition-colors sm:text-xs"
							class:border-amber-400={stage === s}
							class:bg-amber-400={stage === s}
							class:text-slate-950={stage === s}
							class:border-slate-700={stage !== s && enabled}
							class:text-slate-300={stage !== s && enabled && s < stage}
							class:text-slate-500={stage !== s && enabled && s > stage}
							class:border-slate-800={!enabled}
							class:text-slate-700={!enabled}
							class:line-through={!enabled}
							disabled={!enabled}
							aria-current={stage === s ? 'step' : undefined}
							data-stage={s}
							onclick={() => goTo(s)}
						>
							<span class="font-mono opacity-60">{i + 1}</span> {label}
						</button>
					</li>
				{/each}
			</ol>

			{#if stage === 0}
				<p class="mt-5 text-sm text-slate-400">
					Answer out loud first, with no help. Aim for 60–90 seconds and a clear structure.
				</p>
			{/if}

			{#if stage >= 1 && scaffold}
				<section class="key-points mt-5 rounded-xl border border-sky-900/60 bg-sky-950/20 p-4" aria-label="Key points">
					<h3 class="mb-2 font-mono text-xs tracking-widest text-sky-300/80 uppercase">Key points</h3>
					{#if stage === 1}
						<p class="mb-3 text-sm text-slate-400">Build your answer from these prompts. Say each point out loud.</p>
					{/if}
					<ol class="space-y-1.5">
						{#each points as p, i (p)}
							<li class="flex gap-3 text-sm text-slate-200 sm:text-base">
								<span class="font-mono text-sky-400/70">{i + 1}</span><span>{p}</span>
							</li>
						{/each}
					</ol>
				</section>
			{/if}

			{#if stage >= 2}
				<div
					class="answer prose prose-sm prose-invert mt-6 max-w-none border-t border-slate-800 pt-5 sm:prose-base prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300"
				>
					{@html answerHtml}
				</div>
			{/if}

			{#if stage === 3}
				<div class="scoring mt-6 space-y-5 border-t border-slate-800 pt-5">
					<div>
						<p class="mb-2 font-mono text-xs tracking-widest text-slate-500 uppercase">
							Accuracy: how close was your attempt?
						</p>
						<div class="grid gap-2 sm:grid-cols-3" role="group" aria-label="Accuracy score">
							{#each accuracyOptions as o (o.id)}
								<button
									type="button"
									class="accuracy rounded-lg border px-4 py-2.5 text-left text-sm transition-colors {currentAccuracy === o.id
										? o.on
										: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
									aria-pressed={currentAccuracy === o.id}
									data-accuracy={o.id}
									onclick={() => scoreAccuracy(o.id)}
								>
									<span class="font-semibold">{o.emoji} {o.label}</span>
									<span class="ml-1 hidden font-mono text-xs opacity-50 sm:inline">{o.key}</span>
									<span class="block text-xs opacity-70">{o.hint}</span>
								</button>
							{/each}
						</div>
					</div>
					<div>
						<p class="mb-2 font-mono text-xs tracking-widest text-slate-500 uppercase">
							Confidence: could you say this in the room?
						</p>
						<div class="flex flex-wrap gap-2" role="group" aria-label="Confidence rating">
							{#each confidenceOptions as c (c.id)}
								<button
									type="button"
									class="confidence rounded-lg border px-3 py-1.5 text-sm transition-colors {currentConfidence === c.id
										? c.on
										: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
									aria-pressed={currentConfidence === c.id}
									data-confidence={c.id}
									onclick={() => rateConfidence(c.id)}
								>
									{c.emoji} {c.label}
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<div class="mt-6 flex flex-wrap items-center justify-between gap-3">
				<div class="flex flex-wrap items-center gap-2">
					<button
						type="button"
						class="back rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-30"
						disabled={!canBack}
						onclick={back}>← Back</button
					>
					{#if canForward}
						<button
							type="button"
							class="advance rounded-lg bg-amber-400 px-5 py-2 font-semibold text-slate-950 hover:bg-amber-300"
							onclick={forward}>{forwardLabel} →</button
						>
					{/if}
					<span class="hidden font-mono text-xs text-slate-500 sm:inline">Space / ← →</span>
				</div>
				<button
					type="button"
					class="next rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 hover:text-white"
					onclick={next}>Next question <span class="hidden font-mono text-xs opacity-50 sm:inline">N</span></button
				>
			</div>
		{:else}
			<p class="text-slate-400">Loading a question…</p>
		{/if}
	</article>

	<!-- Progress tracker -->
	<section class="mt-8" aria-label="Progress by stage">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<h2 class="font-mono text-xs tracking-widest text-slate-500 uppercase">Progress by stage</h2>
			<div class="flex items-center gap-4 text-xs text-slate-500">
				<span><span class="text-emerald-400">■</span> confidence</span>
				<span><span class="text-sky-400">■</span> accuracy (close = half)</span>
				<button
					type="button"
					class="underline-offset-2 hover:text-slate-300 hover:underline"
					onclick={() => {
						if (confirm('Reset all confidence and accuracy scores?')) resetAll();
					}}>Reset</button
				>
			</div>
		</div>
		<ul class="grid gap-2 sm:grid-cols-2">
			{#each questionSets.filter((s) => s.questions.length) as s (s.id)}
				{@const p = $progress[s.id]}
				<li class="progress-row rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2" data-set={s.id}>
					<div class="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
						<span class="text-slate-300">{s.label}</span>
						<span class="font-mono text-xs text-slate-400">
							<span class="pct text-emerald-300">{p.pctGreen}%</span> conf ·
							<span class="acc text-sky-300">{p.pctAccuracy}%</span> acc
						</span>
					</div>
					<div class="flex h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
						<span class="bg-emerald-500" style="width:{(p.green / p.total) * 100}%"></span>
						<span class="bg-amber-500" style="width:{(p.amber / p.total) * 100}%"></span>
						<span class="bg-rose-500" style="width:{(p.red / p.total) * 100}%"></span>
					</div>
					<div class="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
						<span class="bg-sky-500" style="width:{(p.nailed / p.total) * 100}%"></span>
						<span class="bg-sky-500/40" style="width:{(p.close / p.total) * 100}%"></span>
						<span class="bg-rose-500/60" style="width:{(p.missed / p.total) * 100}%"></span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</section>

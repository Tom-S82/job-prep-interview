<script lang="ts">
	import { onMount } from 'svelte';
	import { questionSets, type QuestionTier } from '#lib/data/questions.ts';
	import type { InterviewQuestion } from '#lib/data/stages.ts';
	import { ratings, progress, questionKey, type Confidence } from '#lib/stores/progress.ts';
	import { markdownToHtml } from '#lib/utils/markdown.ts';

	let { initialSet = null }: { initialSet?: string | null } = $props();

	const ALL = 'all';
	type Entry = { setId: string; setLabel: string; question: InterviewQuestion };

	const tiers: QuestionTier[] = ['Pipeline', 'Your stories', 'Honest gaps', 'General'];
	const confidence: { id: Confidence; emoji: string; label: string; key: string; cls: string }[] = [
		{ id: 'green', emoji: '🟢', label: 'Nailed it', key: '1', cls: 'border-emerald-400 bg-emerald-500/30 text-emerald-50 ring-2 ring-emerald-500/50' },
		{ id: 'amber', emoji: '🟡', label: 'Shaky', key: '2', cls: 'border-amber-400 bg-amber-500/30 text-amber-50 ring-2 ring-amber-500/50' },
		{ id: 'red', emoji: '🔴', label: 'Need work', key: '3', cls: 'border-rose-400 bg-rose-500/30 text-rose-50 ring-2 ring-rose-500/50' }
	];

	let setId = $state<string>(ALL);
	let current = $state<Entry | null>(null);
	let revealed = $state(false);
	let allGreenNotice = $state(false);

	const entries = (id: string): Entry[] =>
		questionSets
			.filter((s) => id === ALL || s.id === id)
			.flatMap((s) => s.questions.map((question) => ({ setId: s.id, setLabel: s.label, question })));

	const totalQuestions = entries(ALL).length;
	const currentRating = $derived(current ? $ratings[questionKey(current.setId, current.question.q)] : undefined);
	const overallGreen = $derived(Object.values($progress).reduce((n, p) => n + p.green, 0));
	const answerHtml = $derived(current?.question.a ? markdownToHtml(current.question.a) : '');

	// Random pick, avoiding an immediate repeat and favouring questions not yet rated green
	function next() {
		const pool = entries(setId).filter((e) => e.question.q !== current?.question.q);
		const candidates = pool.length ? pool : entries(setId);
		const notGreen = candidates.filter((e) => $ratings[questionKey(e.setId, e.question.q)] !== 'green');
		allGreenNotice = notGreen.length === 0;
		const from = notGreen.length ? notGreen : candidates;
		current = from[Math.floor(Math.random() * from.length)] ?? null;
		revealed = false;
	}

	function selectSet(id: string) {
		setId = id;
		current = null;
		next();
	}

	function rate(c: Confidence) {
		if (current) ratings.rate(current.setId, current.question.q, c);
	}

	function onKey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY', 'A'].includes(el.tagName)) return;
		if (e.key === ' ' && !revealed) {
			e.preventDefault();
			revealed = true;
		} else if (revealed && ['1', '2', '3'].includes(e.key)) {
			rate(confidence[Number(e.key) - 1].id);
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
			<h1 class="text-2xl font-semibold text-slate-100 sm:text-3xl">Think first, then reveal</h1>
			<p class="mt-1 text-sm text-slate-400">
				Answer out loud before you reveal. Rate yourself honestly; questions you've nailed come up less often.
			</p>
		</div>
		<div class="flex items-center gap-3">
			<div class="text-right">
				<p class="font-mono text-xs text-slate-500">Overall</p>
				<p class="text-lg font-semibold text-emerald-300" data-testid="overall-progress">
					{overallGreen}/{totalQuestions} green
				</p>
			</div>
			<a
				href="/"
				class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
				>← Back to pipeline</a
			>
		</div>
	</header>

	<!-- Stage selector + per-stage progress -->
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
						>
							<span
								class="absolute inset-y-0 left-0 bg-emerald-500/20"
								style="width:{p.pctGreen}%"
								aria-hidden="true"
							></span>
							<span class="relative">{s.label} <span class="font-mono text-slate-500">{p.pctGreen}%</span></span>
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
				{#if currentRating}
					{@const c = confidence.find((x) => x.id === currentRating)!}
					<span class="font-mono text-xs text-slate-500">last rated {c.emoji} {c.label}</span>
				{/if}
			</div>

			<h2 class="question text-xl leading-snug font-semibold text-slate-50 sm:text-2xl">{current.question.q}</h2>

			{#if allGreenNotice}
				<p class="mt-3 text-xs text-emerald-400/80">Everything here is green, so this is a random review.</p>
			{/if}

			{#if !revealed}
				<div class="mt-8 flex flex-wrap items-center gap-3">
					<button
						type="button"
						class="reveal rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 hover:bg-amber-300"
						onclick={() => (revealed = true)}>Show answer</button
					>
					<span class="hidden font-mono text-xs text-slate-500 sm:inline">or press Space</span>
				</div>
			{:else}
				<div
					class="answer prose prose-sm prose-invert mt-6 max-w-none border-t border-slate-800 pt-5 sm:prose-base prose-p:text-slate-300 prose-strong:text-amber-200 prose-li:text-slate-300"
				>
					{@html answerHtml}
				</div>

				<div class="mt-6 border-t border-slate-800 pt-5">
					<p class="mb-2 font-mono text-xs tracking-widest text-slate-500 uppercase">How confident were you?</p>
					<div class="flex flex-wrap gap-2" role="group" aria-label="Confidence rating">
						{#each confidence as c (c.id)}
							<button
								type="button"
								class="confidence rounded-lg border px-4 py-2 text-sm transition-colors {currentRating === c.id
									? c.cls
									: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
								aria-pressed={currentRating === c.id}
								data-confidence={c.id}
								onclick={() => rate(c.id)}
							>
								{c.emoji} {c.label} <span class="ml-1 hidden font-mono text-xs opacity-50 sm:inline">{c.key}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="mt-6 flex justify-end">
				<button
					type="button"
					class="next rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 hover:text-white"
					onclick={next}>Next question → <span class="hidden font-mono text-xs opacity-50 sm:inline">N</span></button
				>
			</div>
		{:else}
			<p class="text-slate-400">Loading a question…</p>
		{/if}
	</article>

	<!-- Progress tracker -->
	<section class="mt-8" aria-label="Progress by stage">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="font-mono text-xs tracking-widest text-slate-500 uppercase">Progress by stage</h2>
			<button
				type="button"
				class="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
				onclick={() => {
					if (confirm('Reset all confidence ratings?')) ratings.reset();
				}}>Reset progress</button
			>
		</div>
		<ul class="grid gap-2 sm:grid-cols-2">
			{#each questionSets.filter((s) => s.questions.length) as s (s.id)}
				{@const p = $progress[s.id]}
				<li class="progress-row rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2" data-set={s.id}>
					<div class="mb-1.5 flex items-baseline justify-between text-sm">
						<span class="text-slate-300">{s.label}</span>
						<span class="font-mono text-xs text-slate-400"
							><span class="pct text-emerald-300">{p.pctGreen}%</span> green · {p.green + p.amber + p.red}/{p.total} rated</span
						>
					</div>
					<div class="flex h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
						<span class="bg-emerald-500" style="width:{(p.green / p.total) * 100}%"></span>
						<span class="bg-amber-500" style="width:{(p.amber / p.total) * 100}%"></span>
						<span class="bg-rose-500" style="width:{(p.red / p.total) * 100}%"></span>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</section>

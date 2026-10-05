<script lang="ts">
	import { attemptHistory, historyStats, type ScoreKey, type Trend } from '#lib/stores/attemptHistory.ts';
	import TrendChart from '#lib/components/speak/TrendChart.svelte';

	const labels: Record<ScoreKey, string> = { structure: 'Structure', clarity: 'Clarity', depth: 'Depth' };
	const keys: ScoreKey[] = ['structure', 'clarity', 'depth'];
	const arrow: Record<Trend, string> = { up: '↑', flat: '→', down: '↓' };
	const arrowCls: Record<Trend, string> = { up: 'text-emerald-400', flat: 'text-slate-400', down: 'text-rose-400' };
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const chrono = $derived([...$attemptHistory].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-30));
	const revisitTips: Record<ScoreKey, string> = {
		structure: 'lead with the constraint, then name the trade-off and when you would switch',
		clarity: 'cut hedges and buzzwords, and open with the problem rather than a tool',
		depth: 'cover the key ideas, give a "because" for each decision, and answer Level 3'
	};
</script>

<section class="progress-journal space-y-4">
	{#if !$historyStats.total}
		<p class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400" data-testid="journal-empty">
			Your journal fills up as you submit attempts. Each one adds a point to the trends below.
		</p>
	{:else}
		<div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
			<h3 class="mb-3 text-sm font-semibold text-slate-200">Your average</h3>
			<dl class="averages grid grid-cols-3 gap-2 text-center">
				{#each keys as k (k)}
					{@const p = $historyStats.per[k]}
					<div class="rounded-lg bg-slate-950/60 p-2" data-score={k} data-trend={p.trend}>
						<dt class="text-xs text-slate-500">{labels[k]}</dt>
						<dd class="font-mono text-lg text-slate-100">
							<span class="avg">{p.average}</span>
							<span class="trend {arrowCls[p.trend]}" title="Change from your earlier to your later attempts: {p.change}">{arrow[p.trend]}</span>
						</dd>
					</div>
				{/each}
			</dl>
			<p class="trend-line mt-3 text-sm text-slate-300">
				Trend: {keys.map((k) => `${labels[k]} ${arrow[$historyStats.per[k].trend]}`).join(', ')}
				{#if $historyStats.revisit.length}
					<span class="revisit text-amber-300">(revisit {$historyStats.revisit.map((k) => labels[k].toLowerCase()).join(' and ')})</span>
				{/if}
			</p>
			{#each $historyStats.revisit as k (k)}
				<p class="mt-1 text-xs text-slate-500">To lift {labels[k].toLowerCase()}: {revisitTips[k]}.</p>
			{/each}
			{#if $historyStats.total >= 2}
				<div class="mt-4">
					<TrendChart
						series={[
							{ label: 'Structure', color: '#fbbf24', values: chrono.map((a) => a.scores.structure) },
							{ label: 'Clarity', color: '#38bdf8', values: chrono.map((a) => a.scores.clarity) },
							{ label: 'Depth', color: '#34d399', values: chrono.map((a) => a.scores.depth) }
						]}
					/>
				</div>
			{/if}
			<p class="mt-1 text-xs text-slate-500">Arrows compare your earlier attempts with your later ones (±0.3 or more counts as a change).</p>
		</div>

		<ul class="space-y-3">
			{#each $historyStats.byScenario as [scenarioId, attempts] (scenarioId)}
				<li class="journal-scenario rounded-2xl border border-slate-800 bg-slate-900/50 p-4" data-scenario={scenarioId}>
					<h3 class="mb-2 font-semibold text-slate-100">{attempts[0].scenarioTitle}</h3>
					<ol class="space-y-1.5 text-sm">
						{#each attempts as a (a.id)}
							<li class="flex flex-wrap items-baseline gap-x-2">
								<a href="?view=history&a={a.id}" class="font-mono text-xs text-sky-400 hover:text-sky-300">{fmtDate(a.timestamp)}</a>
								<span class="font-mono text-amber-300">{a.scores.structure}/{a.scores.clarity}/{a.scores.depth}</span>
								<span class="text-slate-400">→ “{a.feedback.summary}”</span>
							</li>
						{/each}
					</ol>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<script lang="ts">
	import { scenarios } from '#lib/data/scenarios.ts';
	import { attemptHistory, average, filterAttempts, type AttemptFilter } from '#lib/stores/attemptHistory.ts';

	let filter = $state<AttemptFilter>({ scenarioId: 'all', range: 'all', sort: 'newest' });
	const list = $derived(filterAttempts($attemptHistory, filter));
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	const select = 'rounded-md border-slate-700 bg-slate-900 py-1 pr-8 pl-2 text-sm text-slate-200';
</script>

<section class="attempt-history">
	<div class="filters mb-4 flex flex-wrap items-end gap-3">
		<label class="flex flex-col gap-1 text-xs text-slate-500"
			>Scenario
			<select class="filter-scenario {select}" bind:value={filter.scenarioId}>
				<option value="all">All scenarios</option>
				{#each scenarios as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1 text-xs text-slate-500"
			>When
			<select class="filter-range {select}" bind:value={filter.range}>
				<option value="all">Any time</option>
				<option value="today">Today</option>
				<option value="7d">Last 7 days</option>
				<option value="30d">Last 30 days</option>
			</select>
		</label>
		<label class="flex flex-col gap-1 text-xs text-slate-500"
			>Sort
			<select class="filter-sort {select}" bind:value={filter.sort}>
				<option value="newest">Newest first</option>
				<option value="score">Highest score first</option>
			</select>
		</label>
		<p class="ml-auto text-xs text-slate-500"><span data-testid="history-count">{list.length}</span> of {$attemptHistory.length} attempts</p>
	</div>

	{#if !$attemptHistory.length}
		<p class="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400" data-testid="history-empty">
			No attempts yet. Pick a scenario and submit a design; every attempt is saved here with its feedback.
		</p>
	{:else if !list.length}
		<p class="text-sm text-slate-400">No attempts match these filters.</p>
	{:else}
		<ul class="space-y-2">
			{#each list as a (a.id)}
				<li>
					<a
						href="?view=history&a={a.id}"
						class="history-row grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 hover:border-amber-400/60 sm:grid-cols-[1.4fr_1fr_auto]"
						data-attempt={a.id}
					>
						<span class="font-semibold text-slate-100">{a.scenarioTitle}</span>
						<span class="text-right font-mono text-xs text-slate-500 sm:order-none sm:text-left">{fmtDate(a.timestamp)}</span>
						<span class="col-span-2 font-mono text-sm text-amber-300 sm:col-span-1 sm:text-right">
							<span class="row-scores">{a.scores.structure}/{a.scores.clarity}/{a.scores.depth}</span>
							<span class="text-slate-500">(avg <span class="row-avg">{average(a)}</span>)</span>
						</span>
						<span class="col-span-2 text-xs text-slate-400 sm:col-span-3">{a.feedback.summary}{a.selfRating ? ` · felt ${a.selfRating}/5` : ''}</span>
					</a>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-slate-500">Scores are Structure / Clarity / Depth, each out of 5.</p>
	{/if}
</section>

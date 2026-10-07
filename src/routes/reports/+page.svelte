<script lang="ts">
	import SiteNav from '#lib/components/SiteNav.svelte';
	import ForwardLook from '#lib/components/reports/ForwardLook.svelte';
	import {
		report,
		reportPack,
		categories,
		standards,
		type ReportMeta
	} from '#lib/data/report-standards.ts';

	type Tab = 'dictionary' | 'lineage';
	const tabs: { id: Tab; label: string }[] = [
		{ id: 'dictionary', label: 'Data Dictionary' },
		{ id: 'lineage', label: 'Lineage' }
	];
	// Tab state per report, keyed by report ID
	let tabOf = $state<Record<string, Tab>>(
		Object.fromEntries(reportPack.map((r) => [r.id, 'dictionary' as Tab]))
	);
	const PAGES = 2;
	// Let long table names wrap after _ and . rather than mid-word
	const breakable = (t: string) => t.replace(/([._])/g, '$1​'); // every report: data page first, context page last
	let hoverHour = $state<number | null>(null);

	// Hourly chart
	const CHART_W = 480;
	const CHART_H = 120;
	const DECISIONS = [
		{ key: 'approve', label: 'approve', color: '#22c55e' },
		{ key: 'manual_review', label: 'review', color: '#eab308' },
		{ key: 'decline', label: 'decline', color: '#ef4444' }
	] as const;
	type Hour = (typeof report.hourly)[number];
	const total = (h: Hour) => h.approve + h.manual_review + h.decline;
	const hourMax = Math.ceil(Math.max(...report.hourly.map(total)) / 10) * 10;
	function stack(h: Hour) {
		let y = CHART_H;
		return DECISIONS.map((d) => {
			const n = h[d.key];
			const ht = (n / hourMax) * CHART_H;
			y -= ht;
			return { key: d.key, label: d.label, color: d.color, n, y, h: ht };
		});
	}
	const applications = report.hourly.reduce((a, h) => a + total(h), 0);
	const pct = (n: number) => `${((n / applications) * 100).toFixed(1)}%`;

	const classColor: Record<string, string> = {
		Public: 'text-slate-400 border-slate-600',
		Internal: 'text-sky-300 border-sky-500/50',
		Confidential: 'text-amber-300 border-amber-500/50',
		PII: 'text-rose-300 border-rose-500/50'
	};

	function onTabKey(e: KeyboardEvent, id: string) {
		if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
		e.preventDefault();
		const i = tabs.findIndex((t) => t.id === tabOf[id]);
		tabOf[id] = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id;
		document.getElementById(`tab-${id}-${tabOf[id]}`)?.focus();
	}
</script>

<svelte:head>
	<title>Report Standards · Inside the Data Platform</title>
</svelte:head>

{#snippet reportHeader(r: ReportMeta)}
	<header
		class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700 bg-slate-900 px-5 py-4"
	>
		<div class="flex min-w-0 items-center gap-3">
			<svg viewBox="0 0 32 32" class="h-9 w-9 shrink-0" aria-label="Data platform logo" role="img">
				<rect width="32" height="32" rx="7" fill="#0f172a" stroke="#2dd4bf" stroke-width="1.5" />
				<rect x="7" y="17" width="4" height="8" rx="1" fill="#cd7f32" />
				<rect x="14" y="12" width="4" height="13" rx="1" fill="#d4d4d8" />
				<rect x="21" y="7" width="4" height="18" rx="1" fill="#facc15" />
			</svg>
			<div class="min-w-0">
				<p class="font-mono text-[11px] tracking-widest text-slate-500 uppercase">
					Data &amp; AI · {r.category.area}
				</p>
				<h2 class="text-lg font-semibold text-slate-100 sm:text-xl" data-testid="report-title">
					<span class="font-mono text-teal-300">{r.id}</span> - {r.name}
				</h2>
			</div>
		</div>
		<dl class="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
			<dt class="text-slate-500">Report date</dt>
			<dd class="font-mono text-slate-200">{r.reportDate}</dd>
			<dt class="text-slate-500">Version</dt>
			<dd class="font-mono text-slate-200">v{r.version}</dd>
		</dl>
	</header>
{/snippet}

{#snippet reportFooter(r: ReportMeta, pageNo: number)}
	<footer
		class="grid grid-cols-1 items-baseline gap-x-6 gap-y-1 border-t border-slate-700 bg-slate-900 px-5 py-3 font-mono text-[11px] text-slate-500 sm:grid-cols-[6.5rem_1fr_auto]"
		data-testid="report-footer"
	>
		<span class="mt-1 text-[10px] tracking-widest text-slate-600 uppercase sm:mt-0">Parameters</span
		>
		<span class="flex flex-wrap gap-x-4 gap-y-0.5" data-testid="report-parameters">
			{#each r.parameters as p (p.name)}
				<span>{p.name}: <span class="text-slate-400">{p.value}</span></span>
			{/each}
		</span>
		<span class="sm:text-right">Version: <span class="text-slate-400">v{r.version}</span></span>

		<span class="mt-1 text-[10px] tracking-widest text-slate-600 uppercase sm:mt-0">Ownership</span>
		<span class="flex flex-wrap gap-x-4 gap-y-0.5">
			<span>Owner: <span class="text-slate-400">{r.owner}</span></span>
			<span>Steward: <span class="text-slate-400">{r.steward}</span></span>
			<span>Semantic model: <span class="text-violet-300/80">{r.semanticModel}</span></span>
		</span>
		<span class="sm:text-right"
			>Last refresh: <span class="text-slate-400">{r.lastRefresh}</span></span
		>

		<span class="mt-1 text-[10px] tracking-widest text-slate-600 uppercase sm:mt-0">Report</span>
		<span class="flex flex-wrap gap-x-4 gap-y-0.5">
			<span
				>Category: <span class="text-slate-400">{r.category.prefix} · {r.category.area}</span></span
			>
			<span>Refresh: <span class="text-slate-400">{r.refreshCadence}</span></span>
		</span>
		<span class="text-slate-300 sm:text-right" data-testid="page-number"
			>Page {pageNo} of {PAGES}</span
		>
	</footer>
{/snippet}

{#snippet summaryPage()}
	<!-- Metrics -->
	<section>
		<h3 class="mb-2 font-mono text-xs tracking-widest text-amber-400/80 uppercase">Key metrics</h3>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each report.metrics as m (m.label)}
				<div
					class="rounded-lg border bg-slate-950/60 p-4"
					style="border-color:{m.color}55"
					data-testid="metric"
				>
					<p class="text-xs text-slate-400">{m.label}</p>
					<p class="mt-1 font-mono text-2xl font-semibold" style="color:{m.color}">
						{m.value}
					</p>
					{#if m.share !== undefined}
						<div class="mt-2 h-1.5 rounded-full bg-slate-800">
							<div
								class="h-1.5 rounded-full"
								style="width:{Math.max(2, m.share * 100)}%;background:{m.color}"
							></div>
						</div>
					{/if}
					<p class="mt-2 text-xs text-slate-500">{m.detail}</p>
					{#if report.deltas[m.label]}
						<p class="mt-1 font-mono text-[11px] text-slate-400">
							{report.deltas[m.label]}
						</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Operational KPIs -->
		<div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each report.kpis as k (k.label)}
				<div class="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3" data-testid="kpi">
					<div class="flex items-center justify-between gap-2">
						<p class="text-xs text-slate-400">{k.label}</p>
						<span
							class="h-2 w-2 rounded-full {k.ok ? 'bg-emerald-500' : 'bg-amber-500'}"
							title={k.ok ? 'Within target' : 'Below target'}
						></span>
					</div>
					<p class="mt-0.5 font-mono text-lg font-semibold text-slate-100">
						{k.value}
					</p>
					<p class="text-[11px] text-slate-500">{k.detail}</p>
				</div>
			{/each}
		</div>

		<div class="mt-3 grid gap-3 lg:grid-cols-[2fr_1fr]">
			<!-- Hourly volume, stacked by decision -->
			<figure
				class="rounded-lg border border-slate-800 bg-slate-950/40 p-4"
				data-testid="hourly-chart"
			>
				<figcaption class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
					<span class="text-xs text-slate-400"
						>Decisions by hour
						{#if hoverHour !== null}
							{@const hv = report.hourly[hoverHour]}
							<span class="ml-2 font-mono text-[11px] text-slate-200" data-testid="hour-readout"
								>{String(hoverHour).padStart(2, '0')}:00 · {total(hv)} decisions · {hv.approve}
								/ {hv.manual_review} / {hv.decline}</span
							>
						{/if}
					</span>
					<span class="flex gap-3 text-[11px] text-slate-500">
						{#each DECISIONS as d (d.key)}
							<span class="flex items-center gap-1"
								><span class="h-2 w-2 rounded-sm" style="background:{d.color}"
								></span>{d.label}</span
							>
						{/each}
					</span>
				</figcaption>
				<svg
					viewBox="0 -12 {CHART_W} {CHART_H + 28}"
					class="block w-full"
					role="img"
					aria-label="Stacked bar chart of decisions per hour"
				>
					{#each [0.5, 1] as g (g)}
						<line
							x1="0"
							x2={CHART_W}
							y1={CHART_H - CHART_H * g}
							y2={CHART_H - CHART_H * g}
							stroke="#1e293b"
						/>
						<text
							x="0"
							y={CHART_H - CHART_H * g - 3}
							fill="#475569"
							font-size="9"
							font-family="ui-monospace, monospace">{Math.round(hourMax * g)}</text
						>
					{/each}
					{#each report.hourly as h (h.hour)}
						{@const x = h.hour * (CHART_W / 24) + 2}
						{@const bw = CHART_W / 24 - 4}
						<g
							class="hour-bar"
							role="presentation"
							data-hour={h.hour}
							opacity={hoverHour === null || hoverHour === h.hour ? 1 : 0.5}
							style="transition: opacity 150ms ease"
							onmouseenter={() => (hoverHour = h.hour)}
							onmouseleave={() => (hoverHour = null)}
						>
							<rect x={x - 2} y="-12" width={bw + 4} height={CHART_H + 12} fill="transparent" />
							{#each stack(h) as seg (seg.key)}
								<rect {x} y={seg.y} width={bw} height={seg.h} rx="1" fill={seg.color}>
									<title>{String(h.hour).padStart(2, '0')}:00 · {seg.label}: {seg.n}</title>
								</rect>
							{/each}
						</g>
						{#if h.hour % 6 === 0}
							<text
								x={x + bw / 2}
								y={CHART_H + 12}
								text-anchor="middle"
								fill="#64748b"
								font-size="9"
								font-family="ui-monospace, monospace">{String(h.hour).padStart(2, '0')}</text
							>
						{/if}
					{/each}
				</svg>
			</figure>

			<!-- Top fired rules -->
			<div class="rounded-lg border border-slate-800 bg-slate-950/40 p-4" data-testid="top-rules">
				<p class="mb-2 text-xs text-slate-400">
					Top fired rules <span class="text-slate-600">· % of applications</span>
				</p>
				<ul class="space-y-1.5">
					{#each report.topRules as r (r.factor)}
						<li class="font-mono text-[11px]">
							<div class="flex justify-between text-slate-300">
								<span>{r.factor}</span><span class="text-slate-500">{r.fired} · {pct(r.fired)}</span
								>
							</div>
							<div class="mt-0.5 h-1 rounded-full bg-slate-800">
								<div
									class="h-1 rounded-full bg-amber-400/80"
									style="width:{(r.fired / report.topRules[0].fired) * 100}%"
								></div>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<p class="mt-2 text-xs text-slate-600 italic">Illustrative figures, not production data.</p>
	</section>
{/snippet}

{#snippet contextPage(r: ReportMeta)}
	<!-- Purpose -->
	<section>
		<h3 class="mb-1.5 font-mono text-xs tracking-widest text-emerald-400/80 uppercase">Purpose</h3>
		<ul class="list-disc space-y-1 pl-4 text-sm text-slate-300 marker:text-emerald-500">
			{#each r.purpose as p (p)}<li>{p}</li>{/each}
		</ul>
	</section>

	<!-- Tabs -->
	<section>
		<div class="flex gap-1 border-b border-slate-800" role="tablist" aria-label="{r.id} detail">
			{#each tabs as t (t.id)}
				<button
					id="tab-{r.id}-{t.id}"
					role="tab"
					aria-selected={tabOf[r.id] === t.id}
					aria-controls="panel-{r.id}-{t.id}"
					tabindex={tabOf[r.id] === t.id ? 0 : -1}
					class="-mb-px border-b-2 px-3 py-2 text-sm {tabOf[r.id] === t.id
						? 'border-teal-400 text-teal-200'
						: 'border-transparent text-slate-400 hover:text-slate-200'}"
					onclick={() => (tabOf[r.id] = t.id)}
					onkeydown={(e) => onTabKey(e, r.id)}>{t.label}</button
				>
			{/each}
		</div>

		{#if tabOf[r.id] === 'dictionary'}
			<div
				id="panel-{r.id}-dictionary"
				role="tabpanel"
				aria-labelledby="tab-{r.id}-dictionary"
				class="overflow-x-auto pt-3"
			>
				<table class="w-full min-w-[640px] text-left text-sm" data-testid="dictionary">
					<thead class="font-mono text-[11px] text-slate-500 uppercase">
						<tr>
							<th class="py-1.5 pr-3">Column</th>
							<th class="pr-3">Type</th>
							<th class="pr-3">Definition</th>
							<th class="pr-3">Class</th>
							<th>Source</th>
						</tr>
					</thead>
					<tbody>
						{#each r.dictionary as d (d.column)}
							<tr class="border-t border-slate-800 align-top">
								<td class="py-2 pr-3 font-mono text-xs text-slate-100">{d.column}</td>
								<td class="pr-3 font-mono text-xs text-slate-500">{d.type}</td>
								<td class="pr-3 text-slate-300">{d.description}</td>
								<td class="pr-3">
									<span
										class="rounded border px-1.5 py-0.5 text-[11px] {classColor[d.classification]}"
										>{d.classification}</span
									>
								</td>
								<td class="font-mono text-xs text-slate-400">{d.source}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="mt-2 text-xs text-slate-500">
					Definitions are generated from the semantic layer, so Power BI, this dictionary and Claude
					(via MCP) use the same wording.
				</p>
			</div>
		{:else}
			<div
				id="panel-{r.id}-lineage"
				role="tabpanel"
				aria-labelledby="tab-{r.id}-lineage"
				class="pt-4"
				data-testid="lineage"
			>
				<ol class="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-stretch">
					{#each r.lineage as n, i (n.id)}
						<li class="flex items-center gap-2 lg:flex-col lg:items-stretch">
							<div
								class="flex-1 rounded-lg border bg-slate-950/60 px-3 py-2 lg:w-36"
								style="border-color:{n.color}66"
							>
								<p class="font-mono text-[10px] tracking-widest uppercase" style="color:{n.color}">
									{n.layer}
								</p>
								<p class="font-mono text-xs text-slate-100">{breakable(n.label)}</p>
								<p class="mt-0.5 text-[11px] text-slate-500">{n.note}</p>
								{#if n.id === r.lineageSide.joinsAt}
									<p class="mt-1 border-t border-slate-800 pt-1 text-[11px] text-slate-400">
										+ <span class="font-mono text-slate-300">{r.lineageSide.label}</span>
										<span class="block text-slate-500">{r.lineageSide.note}</span>
									</p>
								{/if}
							</div>
							{#if i < r.lineage.length - 1}
								<span class="text-slate-600 lg:hidden" aria-hidden="true">↓</span>
							{/if}
						</li>
					{/each}
				</ol>
				<p class="mt-3 text-sm text-slate-400">
					When someone says <span class="text-slate-200">“the {r.id} is wrong”</span>: {r.troubleshooting}
				</p>
			</div>
		{/if}
	</section>
{/snippet}

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<SiteNav />

		<section
			class="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-200 shadow-2xl shadow-black/40 sm:p-6"
		>
			<header class="mb-5">
				<p class="font-mono text-xs tracking-[0.2em] text-teal-400/80 uppercase">
					Governance · report standards
				</p>
				<h1 class="text-xl font-semibold text-slate-100 sm:text-2xl">
					One layout, one ID, every report
				</h1>
				<p class="mt-1 max-w-3xl text-sm text-slate-400">
					A worked example of the standard report layout. Every report gets a numeric ID and the
					same frame: one header and footer on every page, the data first, and a context page
					(purpose, data dictionary, lineage) always last. Related reports share a category prefix.
				</p>
			</header>

			<div class="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
				<blockquote
					class="rounded-lg border-l-2 border-teal-400 bg-slate-900/60 px-4 py-3"
					data-testid="key-insight"
				>
					<p class="text-lg text-slate-100 italic">
						Users say “the 2501 is wrong”, not “which fraud report?”
					</p>
					<p class="mt-1 text-sm text-slate-400">
						A stable ID turns a vague complaint into a ticket you can route: the owner, the semantic
						model and the lineage are one lookup away.
					</p>
				</blockquote>
				<div class="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
					<p class="mb-1.5 font-mono text-[11px] tracking-widest text-slate-500 uppercase">
						ID scheme · AARR
					</p>
					<ul class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
						{#each categories as c (c.prefix)}
							<li class="contents">
								<span
									class={c.prefix === report.category.prefix ? 'text-teal-300' : 'text-slate-500'}
									>{c.prefix}xx</span
								>
								<span
									class={c.prefix === report.category.prefix ? 'text-slate-100' : 'text-slate-400'}
									>{c.area}</span
								>
							</li>
						{/each}
					</ul>
				</div>
			</div>

			<!-- Pack index -->
			<nav
				class="mb-6 flex flex-wrap items-center gap-2 font-mono text-xs"
				aria-label="Reports in this pack"
				data-testid="pack-index"
			>
				<span class="tracking-widest text-slate-500 uppercase"
					>Category {report.category.prefix} · {report.category.area}:</span
				>
				{#each reportPack as r (r.id)}
					<a
						href="#report-{r.id}"
						class="rounded-md border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-teal-400 hover:text-teal-200"
						><span class="text-teal-300">{r.id}</span> - {r.name}</a
					>
				{/each}
			</nav>

			{#each reportPack as r, ri (r.id)}
				{#if ri > 0}
					<!-- Separator between distinct reports -->
					<div
						class="relative my-12 overflow-hidden rounded-xl border-y-2 border-teal-500/60 bg-teal-950/30 px-4 py-5 text-center"
						role="separator"
						aria-label="End of report {reportPack[ri - 1].id}, start of report {r.id}"
						data-testid="report-separator"
					>
						<p class="font-mono text-[11px] tracking-[0.2em] text-slate-400 uppercase">
							End of {reportPack[ri - 1].id} - {reportPack[ri - 1].name}
						</p>
						<p class="mt-1 text-lg font-semibold text-teal-200">
							Report {ri + 1} of {reportPack.length} in category {r.category.prefix}:
							<span class="font-mono text-teal-300">{r.id}</span> - {r.name}
						</p>
					</div>
				{/if}

				<div
					id="report-{r.id}"
					class="scroll-mt-6 space-y-6"
					aria-label="{r.id} - {r.name}"
					data-testid="report"
					data-report={r.id}
				>
					{#each [1, 2] as pageNo (pageNo)}
						<article
							class="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70"
							aria-label="{r.id} - {r.name}, page {pageNo} of {PAGES}"
							data-testid="report-page"
							data-page={pageNo}
						>
							{@render reportHeader(r)}
							<div class="space-y-6 px-5 py-5">
								{#if pageNo === PAGES}
									{@render contextPage(r)}
								{:else if r.id === '2501'}
									{@render summaryPage()}
								{:else}
									<ForwardLook />
								{/if}
							</div>
							{@render reportFooter(r, pageNo)}
						</article>
					{/each}
				</div>
			{/each}

			<!-- The standard -->
			<section class="mt-6">
				<h2 class="mb-2 font-mono text-xs tracking-widest text-teal-400/80 uppercase">
					The standard
				</h2>
				<ol class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
					{#each standards as s, i (s.rule)}
						<li class="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2">
							<p class="text-sm text-slate-100">
								<span class="mr-1.5 font-mono text-xs text-slate-500"
									>{String(i + 1).padStart(2, '0')}</span
								>{s.rule}
							</p>
							<p class="text-xs text-slate-400">{s.why}</p>
						</li>
					{/each}
				</ol>
			</section>
		</section>
	</div>
</main>

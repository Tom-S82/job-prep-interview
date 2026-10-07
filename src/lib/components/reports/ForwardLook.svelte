<script lang="ts">
	import {
		report,
		rotas,
		simulateQueue,
		forecastModel,
		driftAlerts,
		scoreDistribution,
		fraudProbability,
		REVIEW_MINUTES,
		SLA_HOURS
	} from '#lib/data/report-standards.ts';

	// --- Predictive: tomorrow's manual-review demand ---------------------------------
	const PI = 0.2; // 80% prediction interval half-width, as a share of the point forecast
	const forecast = report.hourly.map((h) => {
		const f = h.manual_review * forecastModel.uplift;
		return { hour: h.hour, f, lo: f * (1 - PI), hi: f * (1 + PI) };
	});
	const fcTotal = forecast.reduce((s, h) => s + h.f, 0);
	const arrivals = forecast.map((h) => h.f);
	const sim = {
		current: simulateQueue(arrivals, rotas.current.reviewers),
		recommended: simulateQueue(arrivals, rotas.recommended.reviewers)
	};
	const perHour = 60 / REVIEW_MINUTES;
	const rotaHours = (r: number[]) => r.reduce((a, b) => a + b, 0);
	const extraHours = rotaHours(rotas.recommended.reviewers) - rotaHours(rotas.current.reviewers);

	let showRota = $state<'current' | 'recommended'>('current');
	let hoverHour = $state<number | null>(null);

	const FW = 480;
	const FH = 110;
	const fMax = Math.ceil(Math.max(...forecast.map((h) => h.hi), perHour * 2) / 2) * 2;
	const fy = (v: number) => FH - (v / fMax) * FH;
	const bw = FW / 24;
	const capacityPath = $derived(
		rotas[showRota].reviewers
			.map(
				(r, h) =>
					`${h === 0 ? 'M' : 'L'}${h * bw},${fy(r * perHour)} L${(h + 1) * bw},${fy(r * perHour)}`
			)
			.join(' ')
	);
	const overloaded = $derived(
		forecast.filter(
			(h) =>
				h.f > rotas[showRota].reviewers[h.hour] * perHour && rotas[showRota].reviewers[h.hour] > 0
		).length
	);

	// --- Prescriptive: threshold what-if + optimiser ---------------------------------
	const COST_MISSED_FRAUD = 1200; // £ average loss per fraud that gets through
	const COST_GENUINE_DECLINE = 150; // £ lost lifetime value + customer harm per wrongly declined customer
	const REVIEW_CATCH_RATE = 0.9;
	const reviewCapacity = rotaHours(rotas.recommended.reviewers) * perHour;

	const BASE = { review: 0.5, decline: 0.75 };
	let reviewFrom = $state(BASE.review);
	let declineAbove = $state(BASE.decline);

	const EPS = 1e-9;
	function evaluate(rf: number, da: number) {
		let approve = 0,
			review = 0,
			decline = 0,
			missed = 0,
			genuineDeclined = 0,
			fraudStopped = 0;
		for (const { score, n } of scoreDistribution) {
			const p = fraudProbability(score);
			if (score < rf - EPS) {
				approve += n;
				missed += n * p;
			} else if (score <= da + EPS) {
				review += n;
				missed += n * p * (1 - REVIEW_CATCH_RATE);
				fraudStopped += n * p * REVIEW_CATCH_RATE;
			} else {
				decline += n;
				genuineDeclined += n * (1 - p);
				fraudStopped += n * p;
			}
		}
		const cost = missed * COST_MISSED_FRAUD + genuineDeclined * COST_GENUINE_DECLINE;
		return {
			approve,
			review,
			decline,
			missed,
			genuineDeclined,
			fraudStopped,
			cost,
			fits: review <= reviewCapacity
		};
	}
	const baseline = evaluate(BASE.review, BASE.decline);
	const current = $derived(evaluate(reviewFrom, declineAbove));

	const steps = (from: number, to: number) =>
		Array.from(
			{ length: Math.round((to - from) / 0.05) + 1 },
			(_, i) => Math.round((from + i * 0.05) * 100) / 100
		);
	const optimum = (() => {
		let best = { rf: BASE.review, da: BASE.decline, r: baseline };
		for (const rf of steps(0.35, 0.65))
			for (const da of steps(0.6, 0.95)) {
				if (da < rf) continue;
				const r = evaluate(rf, da);
				if (r.fits && r.cost < best.r.cost) best = { rf, da, r };
			}
		return best;
	})();
	const isOptimal = $derived(reviewFrom === optimum.rf && declineAbove === optimum.da);

	const gbp = (v: number) => `£${Math.round(v).toLocaleString('en-GB')}`;
	const signed = (v: number, dp = 0) =>
		`${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(dp)}`;
	const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
</script>

<div class="space-y-5" data-testid="forward-look">
	<!-- AI narrative -->
	<section
		class="rounded-lg border border-violet-500/40 bg-violet-950/20 p-4"
		data-testid="ai-summary"
	>
		<div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
			<h3 class="font-mono text-xs tracking-widest text-violet-300/90 uppercase">AI summary</h3>
			<span class="font-mono text-[10px] text-slate-500"
				>Example output · Claude via MCP over fincrime.decisions</span
			>
		</div>
		<p class="text-sm leading-relaxed text-slate-200">
			Tomorrow is the day after payday, so the model expects about <strong
				>{Math.round(fcTotal)} manual reviews</strong
			>
			({signed((forecastModel.uplift - 1) * 100)}%), peaking {hh(18)}–{hh(21)}. On the current rota
			only
			<strong>{sim.current.slaPct.toFixed(0)}%</strong> would be cleared within {SLA_HOURS} hours. Moving
			shifts later ({signed(extraHours)} reviewer-hour) lifts that to
			<strong>{sim.recommended.slaPct.toFixed(0)}%</strong>. Separately,
			<span class="font-mono">device_new</span> is firing more often since the 2 Oct iOS release: check
			device-ID continuity before anyone changes its weight.
		</p>
		<p class="mt-2 text-[11px] text-slate-500">
			Every number above is a semantic-layer metric with lineage, not free text: the model can only
			read governed, PII-masked views.
		</p>
	</section>

	<div class="grid gap-4 lg:grid-cols-[3fr_2fr]">
		<!-- Predictive: forecast vs capacity -->
		<section class="rounded-lg border border-slate-800 bg-slate-950/40 p-4" data-testid="forecast">
			<div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
				<h3 class="font-mono text-xs tracking-widest text-sky-400/80 uppercase">
					Predictive · tomorrow's review demand
				</h3>
				<div
					class="flex overflow-hidden rounded-md border border-slate-700 text-[11px]"
					role="group"
					aria-label="Rota"
				>
					{#each ['current', 'recommended'] as const as r (r)}
						<button
							class="px-2 py-0.5 {showRota === r
								? 'bg-slate-700 text-white'
								: 'text-slate-400 hover:text-white'}"
							aria-pressed={showRota === r}
							onclick={() => (showRota = r)}>{r} rota</button
						>
					{/each}
				</div>
			</div>
			<p class="mb-2 text-xs text-slate-400">
				<span class="font-mono text-lg text-slate-100">{Math.round(fcTotal)}</span> reviews forecast
				(80% interval
				{Math.round(fcTotal * (1 - PI))}–{Math.round(fcTotal * (1 + PI))}) ·
				<span class={overloaded ? 'text-amber-300' : 'text-emerald-300'}
					>{overloaded} staffed hour{overloaded === 1 ? '' : 's'} over capacity</span
				>
			</p>
			<svg
				viewBox="0 -8 {FW} {FH + 24}"
				class="block w-full"
				role="img"
				aria-label="Hourly review forecast against reviewer capacity"
			>
				{#each forecast as h (h.hour)}
					{@const x = h.hour * bw}
					{@const staffed = rotas[showRota].reviewers[h.hour] > 0}
					{@const over = staffed && h.f > rotas[showRota].reviewers[h.hour] * perHour}
					<g
						role="presentation"
						opacity={hoverHour === null || hoverHour === h.hour ? 1 : 0.5}
						style="transition: opacity 150ms"
						onmouseenter={() => (hoverHour = h.hour)}
						onmouseleave={() => (hoverHour = null)}
					>
						<rect {x} y="-8" width={bw} height={FH + 8} fill="transparent" />
						<line
							x1={x + bw / 2}
							x2={x + bw / 2}
							y1={fy(h.hi)}
							y2={fy(h.lo)}
							stroke="#64748b"
							stroke-width="1"
						/>
						<rect
							x={x + 3}
							y={fy(h.f)}
							width={bw - 6}
							height={FH - fy(h.f)}
							rx="1"
							fill={!staffed ? '#475569' : over ? '#f59e0b' : '#38bdf8'}
							opacity="0.85"
						>
							<title
								>{hh(h.hour)} · forecast {h.f.toFixed(1)} (80%: {h.lo.toFixed(1)}–{h.hi.toFixed(1)})
								· capacity {rotas[showRota].reviewers[h.hour] * perHour}/h</title
							>
						</rect>
					</g>
					{#if h.hour % 6 === 0}
						<text
							x={x + bw / 2}
							y={FH + 12}
							text-anchor="middle"
							fill="#64748b"
							font-size="9"
							font-family="ui-monospace, monospace">{String(h.hour).padStart(2, '0')}</text
						>
					{/if}
				{/each}
				<path
					d={capacityPath}
					fill="none"
					stroke="#e2e8f0"
					stroke-width="1.5"
					stroke-dasharray="4 3"
				/>
			</svg>
			<p class="mt-1 flex flex-wrap gap-x-4 font-mono text-[10px] text-slate-500">
				<span><span class="text-sky-400">■</span> forecast</span>
				<span><span class="text-amber-400">■</span> over capacity</span>
				<span><span class="text-slate-500">■</span> unstaffed (queued)</span>
				<span>│ 80% interval</span>
				<span>- - capacity ({perHour} reviews/reviewer/h)</span>
			</p>
			<details class="mt-2 text-[11px] text-slate-500">
				<summary class="cursor-pointer text-slate-400">Model card</summary>
				<dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
					<dt>Model</dt>
					<dd class="text-slate-300">{forecastModel.name}</dd>
					<dt>Features</dt>
					<dd class="text-slate-300">{forecastModel.features}</dd>
					<dt>Trained on</dt>
					<dd class="text-slate-300">{forecastModel.trainedOn}</dd>
					<dt>Backtest</dt>
					<dd class="text-slate-300">MAPE {forecastModel.backtestMape}% (daily total)</dd>
				</dl>
			</details>
		</section>

		<!-- Predictive: drift -->
		<section class="rounded-lg border border-slate-800 bg-slate-950/40 p-4" data-testid="drift">
			<h3 class="mb-2 font-mono text-xs tracking-widest text-sky-400/80 uppercase">
				Predictive · rule drift monitor
			</h3>
			<ul class="space-y-3">
				{#each driftAlerts as d (d.factor)}
					<li
						class="rounded-md border px-3 py-2 {d.severity === 'warning'
							? 'border-amber-500/40'
							: 'border-slate-800'}"
					>
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<span class="font-mono text-xs text-slate-100">{d.factor}</span>
							<span
								class="font-mono text-[11px] {d.severity === 'warning'
									? 'text-amber-300'
									: 'text-emerald-400'}">PSI {d.psi.toFixed(2)} · {d.severity}</span
							>
						</div>
						<p class="font-mono text-[11px] text-slate-400">
							{d.today}% today vs {d.baseline}% 30-day baseline ({signed(d.today - d.baseline, 1)} pt)
						</p>
						<p class="mt-1 text-xs text-slate-400">{d.hypothesis}</p>
						<p class="mt-0.5 text-xs text-slate-300">→ {d.action}</p>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-[11px] text-slate-500">
				PSI &gt; 0.10 warns, &gt; 0.25 pages the on-call engineer.
			</p>
		</section>
	</div>

	<!-- Prescriptive -->
	<div class="grid gap-4 lg:grid-cols-[2fr_3fr]">
		<section
			class="rounded-lg border border-emerald-500/30 bg-slate-950/40 p-4"
			data-testid="rota-recommendation"
		>
			<h3 class="mb-2 font-mono text-xs tracking-widest text-emerald-400/80 uppercase">
				Prescriptive · reviewer rota
			</h3>
			<div class="grid grid-cols-2 gap-3">
				{#each ['current', 'recommended'] as const as r (r)}
					<div
						class="rounded-md border border-slate-800 p-3 {r === 'recommended'
							? 'border-emerald-500/40'
							: ''}"
					>
						<p class="text-[11px] text-slate-500 capitalize">{r}</p>
						<p
							class="font-mono text-2xl font-semibold {r === 'recommended'
								? 'text-emerald-300'
								: 'text-amber-300'}"
							data-testid="sla-{r}"
						>
							{sim[r].slaPct.toFixed(0)}%
						</p>
						<p class="text-[11px] text-slate-500">
							within {SLA_HOURS}h · peak queue {Math.round(sim[r].peak)}
						</p>
						<p class="mt-1 font-mono text-[10px] text-slate-400">{rotas[r].name}</p>
					</div>
				{/each}
			</div>
			<p class="mt-3 text-xs text-slate-300">
				<span class="text-emerald-300">Recommendation:</span> same three reviewers, shifts moved
				later ({signed(extraHours)} reviewer-hour/day). Fixes the evening backlog behind today's SLA miss.
			</p>
		</section>

		<section
			class="rounded-lg border border-emerald-500/30 bg-slate-950/40 p-4"
			data-testid="threshold-optimiser"
		>
			<div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
				<h3 class="font-mono text-xs tracking-widest text-emerald-400/80 uppercase">
					Prescriptive · threshold what-if
				</h3>
				<div class="flex gap-2">
					<button
						class="rounded-md border border-emerald-500/50 px-2 py-0.5 text-[11px] text-emerald-200 hover:border-emerald-400"
						onclick={() => {
							reviewFrom = optimum.rf;
							declineAbove = optimum.da;
						}}
						data-testid="optimise">Optimise</button
					>
					<button
						class="rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:border-slate-500"
						onclick={() => {
							reviewFrom = BASE.review;
							declineAbove = BASE.decline;
						}}>Reset</button
					>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				<label class="text-xs text-slate-400">
					Review from <span class="font-mono text-slate-100" data-testid="review-value"
						>{reviewFrom.toFixed(2)}</span
					>
					<input
						type="range"
						min="0.35"
						max="0.65"
						step="0.05"
						class="mt-1 w-full accent-yellow-500"
						bind:value={reviewFrom}
						oninput={() => {
							if (declineAbove < reviewFrom) declineAbove = reviewFrom;
						}}
						data-testid="review-slider"
					/>
				</label>
				<label class="text-xs text-slate-400">
					Decline above <span class="font-mono text-slate-100" data-testid="decline-value"
						>{declineAbove.toFixed(2)}</span
					>
					<input
						type="range"
						min="0.6"
						max="0.95"
						step="0.05"
						class="mt-1 w-full accent-red-500"
						bind:value={declineAbove}
						oninput={() => {
							if (reviewFrom > declineAbove) reviewFrom = declineAbove;
						}}
						data-testid="decline-slider"
					/>
				</label>
			</div>

			<dl class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
				{#each [{ k: 'Reviews / day', v: current.review.toFixed(0), d: current.review - baseline.review, bad: current.review > baseline.review, dp: 0, warn: !current.fits }, { k: 'Fraud missed / day', v: current.missed.toFixed(1), d: current.missed - baseline.missed, bad: current.missed > baseline.missed, dp: 1, warn: false }, { k: 'Genuine declined', v: current.genuineDeclined.toFixed(1), d: current.genuineDeclined - baseline.genuineDeclined, bad: current.genuineDeclined > baseline.genuineDeclined, dp: 1, warn: false }, { k: 'Expected cost / day', v: gbp(current.cost), d: current.cost - baseline.cost, bad: current.cost > baseline.cost, dp: 0, warn: false }] as m (m.k)}
					<div
						class="rounded-md border px-2.5 py-2 {m.warn
							? 'border-rose-500/60'
							: 'border-slate-800'}"
					>
						<dt class="text-[11px] text-slate-500">{m.k}</dt>
						<dd class="font-mono text-base text-slate-100">{m.v}</dd>
						<dd
							class="font-mono text-[10px] {Math.abs(m.d) < 0.05
								? 'text-slate-500'
								: m.bad
									? 'text-rose-300'
									: 'text-emerald-300'}"
						>
							{Math.abs(m.d) < 0.05 ? 'baseline' : `${signed(m.d, m.dp)} vs live`}
						</dd>
					</div>
				{/each}
			</dl>
			<p
				class="mt-2 text-xs {current.fits ? 'text-slate-400' : 'text-rose-300'}"
				data-testid="optimiser-note"
			>
				{#if !current.fits}
					Over review capacity ({Math.round(reviewCapacity)}/day on the recommended rota): queue
					would grow.
				{:else if isOptimal}
					Optimal within capacity: saves {gbp(baseline.cost - optimum.r.cost)}/day vs live
					thresholds. Ships as a
					<span class="font-mono">fraud_rules</span> PR: back-test in CI, FinCrime approval, then a new
					ruleset version.
				{:else}
					Cost = missed fraud × {gbp(COST_MISSED_FRAUD)} + genuine declines × {gbp(
						COST_GENUINE_DECLINE
					)}, subject to review capacity. Press Optimise to search every threshold pair.
				{/if}
			</p>
		</section>
	</div>

	<p class="text-xs text-slate-600 italic">
		Illustrative models and figures. Recommendations are advisory: a human approves every change,
		and Consumer Duty outcomes are checked by customer segment before release.
	</p>
</div>

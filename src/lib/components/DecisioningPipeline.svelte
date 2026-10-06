<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import {
		RULES,
		NOW,
		RULESET_VERSION,
		DECISION_META,
		DECLINE_ABOVE,
		REVIEW_FROM,
		decide,
		decisionRecord,
		fraudScenarios,
		decisionStages,
		type FraudScenario
	} from '#lib/data/fraud-scenarios.ts';

	// --- Layout constants (SVG user units; the SVG scales via viewBox) ---
	const W = 1200;
	const H = 350;
	const MARGIN = 24;
	const GAP = 16;
	const BOX_TOP = 44;
	const BOX_H = 248;
	const BOX_BOTTOM = BOX_TOP + BOX_H;
	const BELT_Y = 104;
	const INNER_Y = 146; // where each stage's internals start (below the belt)
	const RULE_ROW = 17;

	const APPLICATION = 0;
	const LAMBDA = 1;
	const FEATURES = 2;
	const DECISION = 3;
	const KINESIS = 4;
	const BRONZE = 5;
	const SILVER_GOLD = 6;
	const N = decisionStages.length;

	// Timings in frames (1 frame = 16.67 ms at 1×)
	const RULE_FRAMES = 18; // 300 ms per rule
	const HOLD_AFTER_SCORE = 24;
	const PAUSE_AT = { [APPLICATION]: 24, [FEATURES]: 22, [DECISION]: 36 } as Record<number, number>;
	const PX_PER_FRAME = 3.4;
	const SPEEDS = [0.5, 1, 2] as const;
	const UNDECIDED = '#cbd5e1';

	let svgEl: SVGSVGElement;
	let ptLayer: SVGGElement;

	// --- UI state ---
	let selectedIndex = $state<number | null>(null);
	let paused = $state(false);
	let speed = $state<(typeof SPEEDS)[number]>(1);
	let mode = $state<number>(-1); // -1 = rotate through all four
	let resetToken = $state(0);

	// --- Animation mirrors (written by the D3 timer, read by the markup) ---
	let widths = $state<number[]>(targetWidths(null));
	let xs = $state<number[]>(xsFor(targetWidths(null)));
	let flowT = $state(0);
	let appSc = $state<number | null>(null);
	let lambdaSc = $state<number | null>(null);
	let ruleStep = $state(0); // rules evaluated so far for lambdaSc
	let scoring = $state(false);
	let lastDelta = $state<{ v: number; at: number } | null>(null);
	let fsAppend = $state(false);
	let fsSc = $state<number | null>(null);
	let decisionSc = $state<number | null>(null);
	let counts = $state({ kinesis: 0, bronze: 0, gold: 0 });

	const focusSc = $derived(lambdaSc ?? (mode >= 0 ? mode : 0));
	const focus = $derived<FraudScenario>(fraudScenarios[focusSc]);
	const selected = $derived(selectedIndex === null ? null : decisionStages[selectedIndex]);
	const lambdaScenario = $derived(lambdaSc === null ? null : fraudScenarios[lambdaSc]);
	const runningScore = $derived(
		lambdaScenario && ruleStep > 0
			? lambdaScenario.result.running[Math.min(ruleStep, RULES.length) - 1]
			: 0
	);
	const scoreDone = $derived(lambdaScenario !== null && ruleStep >= RULES.length);

	function weightOf(i: number, sel: number | null) {
		const base = i === LAMBDA ? 1.9 : 1;
		return i === sel ? base + 1.4 : base;
	}
	function targetWidths(sel: number | null): number[] {
		const weights = decisionStages.map((_, i) => weightOf(i, sel));
		const total = d3.sum(weights);
		const usable = W - MARGIN * 2 - GAP * (N - 1);
		return weights.map((w) => (w / total) * usable);
	}
	function xsFor(ws: number[]): number[] {
		let x = MARGIN;
		return ws.map((w) => {
			const at = x;
			x += w + GAP;
			return at;
		});
	}
	const centre = (i: number) => xs[i] + widths[i] / 2;
	const dx = $derived(centre(DECISION));
	const kx = $derived(centre(KINESIS));
	const fx = $derived(centre(FEATURES));
	const lx = $derived(centre(LAMBDA));

	function toggle(i: number) {
		selectedIndex = selectedIndex === i ? null : i;
	}
	function onStageKey(e: KeyboardEvent, i: number) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			toggle(i);
		}
	}
	function setMode(m: number) {
		mode = m;
		resetToken++;
	}
	function cycleSpeed(dir: 1 | -1) {
		const i = SPEEDS.indexOf(speed);
		speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))];
	}

	function onWindowKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (
			t &&
			(t.tagName === 'SELECT' ||
				t.tagName === 'INPUT' ||
				t.tagName === 'TEXTAREA' ||
				t.closest('[role="button"]'))
		)
			return;
		if (e.key === ' ' || e.key === 'p') {
			e.preventDefault();
			paused = !paused;
		} else if (e.key === '+' || e.key === '=' || e.key === 'ArrowRight') cycleSpeed(1);
		else if (e.key === '-' || e.key === 'ArrowLeft') cycleSpeed(-1);
		else if (e.key >= '1' && e.key <= '4') setMode(Number(e.key) - 1);
		else if (e.key === '0' || e.key === 'r') setMode(-1);
		else if (e.key === 'Escape') selectedIndex = null;
	}

	const fmt = (v: number) => v.toFixed(2);
	const short = (r: string) =>
		r.replace('_reactivation', '_react').replace('_consistency', '_consist');
	const json = (v: unknown) => JSON.stringify(v, null, 2);

	/**
	 * Particle lifecycle (stage-space `s` = stage index + progress, like Pipeline.svelte):
	 *   flow → pause in Application → flow → queue at Lambda door → scoring (rules fire one by one)
	 *   → decided (recoloured) → pause at Feature Store (append) → pause at Decision → flow
	 *   through Kinesis → Bronze → exit into Silver/Gold.
	 * Only one application is scored at a time; the next waits at the Lambda door.
	 */
	type Phase = 'flow' | 'pause' | 'queue' | 'scoring' | 'exit';
	type Particle = {
		id: number;
		sc: number;
		phase: Phase;
		s: number;
		wait: number;
		stop: number; // next stage index to pause at, or -1
		decided: boolean;
		opacity: number;
		counted: Set<number>;
	};

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;

		const defs = d3.select(svgEl).select('defs');
		const glow = defs
			.append('filter')
			.attr('id', 'dglow')
			.attr('x', '-50%')
			.attr('y', '-50%')
			.attr('width', '200%')
			.attr('height', '200%');
		glow.append('feGaussianBlur').attr('stdDeviation', 2.2).attr('result', 'b');
		const merge = glow.append('feMerge');
		merge.append('feMergeNode').attr('in', 'b');
		merge.append('feMergeNode').attr('in', 'SourceGraphic');

		let particles: Particle[] = [];
		let nextId = 1;
		let rotateIdx = 0;
		let last = 0;
		let elapsed = 0;
		let ruleAcc = 0;
		let seenReset = resetToken;

		const sx = (s: number) => {
			const i = Math.min(N - 1, Math.max(0, Math.floor(s)));
			return xs[i] + (s - i) * (widths[i] + (i < N - 1 ? GAP : 0));
		};

		const nextScenario = () => {
			if (mode >= 0) return mode;
			const sc = rotateIdx % fraudScenarios.length;
			rotateIdx++;
			return sc;
		};

		const spawn = () => {
			const sc = nextScenario();
			particles.push({
				id: nextId++,
				sc,
				phase: 'flow',
				s: 0.05,
				wait: 0,
				stop: APPLICATION,
				decided: false,
				opacity: 0,
				counted: new Set()
			});
			appSc = sc;
		};

		const reset = () => {
			// Keep decisions already downstream of the Decision stage; restart everything upstream.
			particles = particles.filter((p) => p.decided && p.s >= DECISION + 0.5);
			rotateIdx = 0;
			lambdaSc = null;
			ruleStep = 0;
			scoring = false;
			decisionSc = null;
			fsSc = null;
			fsAppend = false;
			lastDelta = null;
			spawn();
		};

		spawn();

		const timer = d3.timer((t) => {
			const dtRaw = Math.min((t - last) / 16.67, 3);
			last = t;
			const dt = paused ? 0 : dtRaw * speed;
			elapsed += dt;
			flowT = (flowT + dt * 0.6) % 1000;

			if (seenReset !== resetToken) {
				seenReset = resetToken;
				reset();
			}

			// Ease layout toward target
			const target = targetWidths(selectedIndex);
			const nw = widths.map((w, i) => w + (target[i] - w) * Math.min(1, 0.14 * dtRaw));
			widths = nw;
			xs = xsFor(nw);

			const scorer = particles.find((p) => p.phase === 'scoring');
			const lambdaBusy = !!scorer;

			// Spawn the next application once the previous one has reached the Lambda
			const upstream = particles.some((p) => !p.decided && p.phase !== 'scoring');
			if (!upstream) spawn();

			// Scoring: one rule every RULE_FRAMES
			if (scorer) {
				ruleAcc += dt;
				if (ruleStep < RULES.length && ruleAcc >= RULE_FRAMES) {
					ruleAcc = 0;
					const o = fraudScenarios[scorer.sc].result.outcomes[ruleStep];
					ruleStep++;
					if (o.fired) lastDelta = { v: o.contribution, at: elapsed };
				} else if (ruleStep >= RULES.length && ruleAcc >= HOLD_AFTER_SCORE) {
					scorer.phase = 'flow';
					scorer.decided = true;
					scorer.stop = FEATURES;
					scoring = false;
				}
			}

			let fsBusy = false;
			for (const p of particles) {
				const i = Math.min(N - 1, Math.floor(p.s));
				p.opacity = p.phase === 'exit' ? p.opacity - 0.03 * dt : Math.min(1, p.opacity + 0.08 * dt);

				if (p.phase === 'flow' || p.phase === 'exit') {
					const stopAt = p.stop >= 0 ? p.stop + 0.5 : Infinity;
					// Undecided applications wait at the Lambda door while another is scored
					const door = !p.decided && p.stop < 0 ? LAMBDA + 0.18 : Infinity;
					p.s += (PX_PER_FRAME * dt) / (widths[i] + GAP);

					if (!p.decided && p.stop < 0 && p.s >= door && lambdaBusy) {
						p.s = door;
						p.phase = 'queue';
					} else if (!p.decided && p.s >= LAMBDA + 0.5 && !lambdaBusy && p.stop < 0) {
						p.s = LAMBDA + 0.5;
						p.phase = 'scoring';
						lambdaSc = p.sc;
						ruleStep = 0;
						ruleAcc = 0;
						scoring = true;
						lastDelta = null;
					} else if (p.s >= stopAt) {
						p.s = stopAt;
						p.phase = 'pause';
						p.wait = PAUSE_AT[p.stop] ?? 0;
						if (p.stop === DECISION) decisionSc = p.sc;
					}
					for (const [stage, key] of [
						[KINESIS, 'kinesis'],
						[BRONZE, 'bronze'],
						[SILVER_GOLD, 'gold']
					] as const) {
						if (p.s >= stage + 0.5 && !p.counted.has(stage)) {
							p.counted.add(stage);
							counts[key]++;
						}
					}
					if (p.s >= SILVER_GOLD + 0.5 && p.phase !== 'exit') p.phase = 'exit';
				} else if (p.phase === 'queue') {
					if (!lambdaBusy && !particles.some((q) => q.phase === 'scoring')) p.phase = 'flow';
				} else if (p.phase === 'pause') {
					if (p.stop === FEATURES) {
						fsBusy = true;
						fsSc = p.sc;
					}
					p.wait -= dt;
					if (p.wait <= 0) {
						p.phase = 'flow';
						p.stop = p.stop === APPLICATION ? -1 : p.stop === FEATURES ? DECISION : -1;
					}
				}
			}
			fsAppend = fsBusy;
			particles = particles.filter((p) => p.opacity > 0 || p.phase !== 'exit');

			// --- Render particles (D3 join, like the main Pipeline) ---
			const y = (p: Particle) => (p.phase === 'queue' ? BELT_Y - 12 : BELT_Y);
			d3.select(ptLayer)
				.selectAll<SVGCircleElement, Particle>('circle.pt')
				.data(particles, (d) => d.id)
				.join((enter) => enter.append('circle').attr('class', 'pt').attr('filter', 'url(#dglow)'))
				.attr('cx', (p) => sx(p.s))
				.attr('cy', y)
				.attr('r', (p) =>
					p.phase === 'scoring' ? 7 + Math.sin(elapsed / 4) * 1.2 : p.decided ? 6.5 : 6
				)
				.attr('fill', (p) =>
					p.decided ? DECISION_META[fraudScenarios[p.sc].result.decision].color : UNDECIDED
				)
				.attr('stroke', (p) => (p.phase === 'scoring' ? '#22d3ee' : 'none'))
				.attr('stroke-width', 2)
				.attr('opacity', (p) => Math.max(0, p.opacity))
				.attr('data-phase', (p) => p.phase)
				.attr('data-scenario', (p) => p.sc)
				.attr('data-decided', (p) => String(p.decided));
		});

		return () => timer.stop();
	});

	function ruleState(i: number): 'pending' | 'evaluating' | 'fired' | 'clear' | 'skipped' {
		if (!lambdaScenario) return 'pending';
		if (i < ruleStep) {
			const o = lambdaScenario.result.outcomes[i];
			return o.fired ? 'fired' : o.evaluated ? 'clear' : 'skipped';
		}
		return i === ruleStep && scoring ? 'evaluating' : 'pending';
	}
	const ruleFill = {
		pending: '#334155',
		evaluating: '#22d3ee',
		fired: '#f59e0b',
		clear: '#16a34a',
		skipped: '#475569'
	};

	function stageStroke(i: number) {
		return selectedIndex === i ? decisionStages[i].color : '#334155';
	}

	// Example artefacts per stage for the detail panel
	function stageArtefact(id: string, s: FraudScenario): { title: string; body: unknown } {
		const rec = decisionRecord(s);
		switch (id) {
			case 'application':
				return { title: `POST /applications · ${s.request.application_id}`, body: s.request };
			case 'features':
				return {
					title: `DynamoDB features · GetItem then append`,
					body: {
						...s.features,
						recent_application_ts: [...s.features.recent_application_ts, NOW.getTime() / 1000]
					}
				};
			case 'kinesis':
				return {
					title: 'kinesis.put_record',
					body: {
						StreamName: 'decisions',
						PartitionKey: s.request.customer_id,
						Data: {
							application_id: rec.application_id,
							decision: rec.decision,
							score: rec.score,
							ruleset_version: rec.ruleset_version,
							'…': 'full decision record'
						}
					}
				};
			case 'bronze':
				return {
					title: 's3://tm-bronze/decisions/dt=2026-10-06/',
					body: {
						_ingested_at: '2026-10-06T10:01:02Z',
						_source: 'kinesis:decisions',
						_sequence: '4960…7731',
						payload: {
							application_id: rec.application_id,
							decision: rec.decision,
							score: rec.score,
							evidence: `${rec.evidence.length} rule outcomes`
						}
					}
				};
			case 'silver-gold':
				return {
					title: 'gold.decisions + gold.decision_reconciliation',
					body: {
						application_id: rec.application_id,
						customer_id: rec.customer_id,
						lambda_decision: rec.decision,
						lambda_score: rec.score,
						batch_decision: rec.decision,
						batch_score: rec.score,
						matches: true,
						ruleset_version: RULESET_VERSION
					}
				};
			default:
				return { title: 'Decision record (DynamoDB decisions table)', body: rec };
		}
	}
</script>

<svelte:window onkeydown={onWindowKey} />

<section
	class="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-200 shadow-2xl shadow-black/40 sm:p-6"
>
	<header class="mb-4 flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="font-mono text-xs tracking-[0.2em] text-cyan-400/80 uppercase">
				Track 2 · real-time decisioning
			</p>
			<h2 class="text-xl font-semibold text-slate-100 sm:text-2xl">
				Fraud scoring through the platform
			</h2>
			<p class="mt-1 text-sm text-slate-400">
				Click a stage to open it up. Space pauses, +/− change speed, 1–4 pick a scenario, 0 rotates.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-3 text-xs">
			{#each Object.values(DECISION_META) as m (m.label)}
				<span class="flex items-center gap-1.5 text-slate-400">
					<span class="h-2 w-2 rounded-full" style="background:{m.color}"
					></span>{m.label.toLowerCase()}
				</span>
			{/each}
			<div
				class="flex overflow-hidden rounded-md border border-slate-700"
				role="group"
				aria-label="Speed"
			>
				{#each SPEEDS as sp (sp)}
					<button
						class="px-2 py-1 font-mono {speed === sp
							? 'bg-slate-700 text-white'
							: 'text-slate-400 hover:text-white'}"
						aria-pressed={speed === sp}
						data-speed={sp}
						onclick={() => (speed = sp)}>{sp}×</button
					>
				{/each}
			</div>
			<button
				class="rounded-md border border-slate-700 px-2.5 py-1 font-mono text-slate-300 hover:border-slate-500 hover:text-white"
				onclick={() => (paused = !paused)}
				aria-pressed={paused}
				data-testid="pause"
			>
				{paused ? '▶ Run' : '❚❚ Pause'}
			</button>
		</div>
	</header>

	<div
		class="mb-3 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:flex-row sm:items-center"
	>
		<label class="flex min-w-0 items-center gap-2 text-xs text-slate-400 sm:shrink-0">
			<span class="font-mono tracking-widest text-cyan-400/80 uppercase">Scenario</span>
			<select
				class="max-w-full min-w-0 flex-1 rounded-md border-slate-700 bg-slate-900 py-1 pr-8 pl-2 text-xs text-slate-200 sm:flex-none"
				data-testid="scenario-select"
				value={String(mode)}
				onchange={(e) => setMode(Number((e.currentTarget as HTMLSelectElement).value))}
			>
				<option value="-1">Rotate all four</option>
				{#each fraudScenarios as s, i (s.id)}
					<option value={String(i)}>{i + 1}. {s.name} ({fmt(s.result.score)})</option>
				{/each}
			</select>
		</label>
		<p class="text-sm text-slate-300" data-testid="scenario-why">
			<span class="font-mono text-xs text-slate-500">{focus.request.application_id}</span>
			<span class="ml-1 font-semibold" style="color:{DECISION_META[focus.result.decision].color}"
				>{focus.name}.</span
			>
			{focus.why}
		</p>
	</div>

	<div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
		<svg
			bind:this={svgEl}
			viewBox="0 0 {W} {H}"
			class="block w-full min-w-[860px] select-none"
			role="img"
			aria-label="Real-time fraud decisioning pipeline"
		>
			<defs>
				<pattern id="dgrid" width="20" height="20" patternUnits="userSpaceOnUse">
					<path d="M20 0H0V20" fill="none" stroke="#1e293b" stroke-width="0.6" />
				</pattern>
				<marker
					id="arrow-orange"
					viewBox="0 0 10 10"
					refX="8"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M0,0 L10,5 L0,10 z" fill="#f97316" />
				</marker>
				<marker
					id="arrow-violet"
					viewBox="0 0 10 10"
					refX="8"
					refY="5"
					markerWidth="6"
					markerHeight="6"
					orient="auto-start-reverse"
				>
					<path d="M0,0 L10,5 L0,10 z" fill="#a78bfa" />
				</marker>
			</defs>
			<rect width={W} height={H} fill="url(#dgrid)" />

			<!-- Conveyor belt -->
			<rect
				x={MARGIN - 6}
				y={BELT_Y - 20}
				width={W - MARGIN * 2 + 12}
				height="40"
				rx="8"
				fill="#0b1220"
				stroke="#1f2a3d"
			/>
			{#each [BELT_Y - 20, BELT_Y + 20] as by (by)}
				<line
					x1={MARGIN}
					x2={W - MARGIN}
					y1={by}
					y2={by}
					stroke="#334155"
					stroke-width="2"
					stroke-dasharray="10 8"
					stroke-dashoffset={-flowT * 3}
				/>
			{/each}

			<!-- Stage machines -->
			{#each decisionStages as st, i (st.id)}
				{@const x = xs[i]}
				{@const w = widths[i]}
				{@const cx = x + w / 2}
				{@const tx = x + 10}
				<g
					class="stage"
					data-stage={st.id}
					data-expanded={selectedIndex === i}
					role="button"
					tabindex="0"
					aria-label="{st.label}: {st.sub}. Click to expand."
					aria-expanded={selectedIndex === i}
					style="cursor:pointer"
					onclick={() => toggle(i)}
					onkeydown={(e) => onStageKey(e, i)}
				>
					<rect
						{x}
						y={BOX_TOP}
						width={w}
						height={BOX_H}
						rx="10"
						fill="#0f172a"
						fill-opacity="0.82"
						stroke={stageStroke(i)}
						stroke-width="1.5"
					/>
					<rect {x} y={BOX_TOP} width={w} height="3" rx="1.5" fill={st.color} opacity="0.8" />
					<text x={tx} y={BOX_TOP + 20} fill="#e2e8f0" font-size="13" font-weight="600"
						>{st.label}</text
					>
					<text
						x={x + w - 8}
						y={BOX_TOP + 20}
						text-anchor="end"
						fill="#475569"
						font-size="10"
						font-family="ui-monospace, monospace">{String(i + 1).padStart(2, '0')}</text
					>
					<text
						x={tx}
						y={BOX_TOP + 33}
						fill="#64748b"
						font-size="9"
						font-family="ui-monospace, monospace">{st.latency}</text
					>
					<rect
						x={x + 4}
						y={BELT_Y - 24}
						width={w - 8}
						height="48"
						rx="4"
						fill="none"
						stroke="#334155"
						stroke-dasharray="2 3"
					/>

					<g font-family="ui-monospace, monospace" font-size="9.5">
						{#if i === APPLICATION}
							{@const a = appSc === null ? null : fraudScenarios[appSc].request}
							{#if a}
								{#each [a.customer_id, `£${a.amount} limit`, a.device_id, a.device_location, `£${a.stated_monthly_income}/mo`, `SCA ${a.sca_result}`] as line, li (li)}
									<text x={tx} y={INNER_Y + li * 15} fill={li === 0 ? '#e2e8f0' : '#94a3b8'}
										>{line}</text
									>
								{/each}
							{/if}
						{:else if i === LAMBDA}
							{#each RULES as r, ri (r.id)}
								{@const state = ruleState(ri)}
								{@const o = lambdaScenario?.result.outcomes[ri]}
								{@const ry = INNER_Y - 8 + ri * RULE_ROW}
								<g class="rule" data-rule={r.id} data-state={state}>
									<title>{r.description}</title>
									<rect
										x={tx - 4}
										y={ry - 10}
										width={w - 12}
										height={RULE_ROW - 2}
										rx="3"
										fill={state === 'fired'
											? '#f59e0b22'
											: state === 'evaluating'
												? '#22d3ee1a'
												: 'transparent'}
										stroke={state === 'evaluating' ? '#22d3ee' : 'none'}
									/>
									<circle cx={tx + 3} cy={ry - 3} r="3.5" fill={ruleFill[state]} />
									<text
										x={tx + 12}
										y={ry}
										fill={state === 'fired'
											? '#fde68a'
											: state === 'pending'
												? '#64748b'
												: '#cbd5e1'}>{w > 300 ? r.id : short(r.id)}</text
									>
									{#if w > 340 && o && state !== 'pending' && state !== 'evaluating'}
										<text x={x + w - 64} y={ry} text-anchor="end" fill="#64748b" font-size="9"
											>{r.summarise(o)}</text
										>
									{/if}
									<text
										x={x + w - 10}
										y={ry}
										text-anchor="end"
										fill={state === 'fired' ? '#fbbf24' : '#475569'}
										data-contribution
									>
										{state === 'fired'
											? `+${fmt(r.weight)}`
											: state === 'clear'
												? '0'
												: state === 'skipped'
													? 'n/e'
													: `${fmt(r.weight)}`}
									</text>
								</g>
							{/each}
							<!-- Running score + threshold bar -->
							{@const barY = INNER_Y - 8 + RULES.length * RULE_ROW + 4}
							{@const barW = w - 20}
							{@const sc = runningScore}
							<rect x={tx} y={barY} width={barW} height="6" rx="3" fill="#1e293b" />
							<rect
								x={tx}
								y={barY}
								width={barW * sc}
								height="6"
								rx="3"
								fill={DECISION_META[decide(sc)].color}
							/>
							{#each [REVIEW_FROM, DECLINE_ABOVE] as th (th)}
								<line
									x1={tx + barW * th}
									x2={tx + barW * th}
									y1={barY - 3}
									y2={barY + 9}
									stroke="#94a3b8"
									stroke-width="1"
								/>
							{/each}
							<text
								x={tx}
								y={barY + 27}
								fill={scoreDone ? DECISION_META[decide(sc)].color : '#e2e8f0'}
								font-size="17"
								font-weight="700"
								data-testid="running-score"
								data-done={scoreDone}>{fmt(sc)}</text
							>
							{#if lambdaScenario && scoreDone && lambdaScenario.result.raw_score > 1}
								<text x={tx + 48} y={barY + 26} fill="#64748b" font-size="9"
									>raw {fmt(lambdaScenario.result.raw_score)}, capped</text
								>
							{:else if lastDelta && scoring}
								<text x={tx + 48} y={barY + 26} fill="#fbbf24" font-size="11"
									>+{fmt(lastDelta.v)}</text
								>
							{/if}
						{:else if i === FEATURES}
							{@const f =
								fsSc === null ? (lambdaScenario?.features ?? null) : fraudScenarios[fsSc].features}
							{#if f}
								<text x={tx} y={INNER_Y} fill="#c4b5fd">GET {f.customer_id}</text>
								<text x={tx} y={INNER_Y + 15} fill="#94a3b8">devices: {f.known_devices.length}</text
								>
								<text x={tx} y={INNER_Y + 30} fill="#94a3b8"
									>income: {f.typical_monthly_income ?? '—'}</text
								>
								<text x={tx} y={INNER_Y + 45} fill="#94a3b8"
									>apps 7d: {f.recent_application_ts.length}</text
								>
								<text
									x={tx}
									y={INNER_Y + 68}
									fill={fsAppend ? '#a78bfa' : '#334155'}
									font-weight={fsAppend ? 700 : 400}>+ APPEND ts</text
								>
							{/if}
							<text x={tx} y={BOX_BOTTOM - 12} fill="#64748b" font-size="8.5">nightly ← dbt</text>
						{:else if i === DECISION}
							{#if decisionSc !== null}
								{@const ds = fraudScenarios[decisionSc]}
								{@const meta = DECISION_META[ds.result.decision]}
								<g
									data-testid="decision-badge"
									data-decision={ds.result.decision}
									data-score={fmt(ds.result.score)}
								>
									<rect
										x={tx - 2}
										y={INNER_Y - 14}
										width={w - 16}
										height="26"
										rx="5"
										fill="{meta.color}26"
										stroke={meta.color}
									/>
									<text
										x={cx}
										y={INNER_Y + 3}
										text-anchor="middle"
										fill={meta.color}
										font-size={w > 160 ? 11 : 9}
										font-weight="700">{meta.label}</text
									>
								</g>
								<text x={tx} y={INNER_Y + 30} fill="#e2e8f0">score {fmt(ds.result.score)}</text>
								<text x={tx} y={INNER_Y + 45} fill="#64748b">conf {fmt(ds.result.confidence)}</text>
								{#each ds.result.outcomes
									.filter((o) => o.fired)
									.sort((a, b) => b.contribution - a.contribution)
									.slice(0, 4) as o, oi (o.factor)}
									<text x={tx} y={INNER_Y + 64 + oi * 13} fill="#94a3b8" font-size="8.5"
										>• {short(o.factor)}</text
									>
								{/each}
							{/if}
						{:else if i === KINESIS}
							<text x={tx} y={INNER_Y} fill="#fdba74">stream: decisions</text>
							<text x={tx} y={INNER_Y + 15} fill="#94a3b8">key: customer_id</text>
							<text x={tx} y={INNER_Y + 30} fill="#94a3b8">events: {counts.kinesis}</text>
							{#each [0, 1, 2] as sh (sh)}
								<line
									x1={tx}
									x2={x + w - 10}
									y1={INNER_Y + 52 + sh * 12}
									y2={INNER_Y + 52 + sh * 12}
									stroke="#7c2d12"
									stroke-width="2"
									stroke-dasharray="6 6"
									stroke-dashoffset={-flowT * (4 + sh)}
								/>
							{/each}
						{:else if i === BRONZE}
							<text x={tx} y={INNER_Y} fill="#e7b37c">raw JSON · S3</text>
							<text x={tx} y={INNER_Y + 15} fill="#94a3b8">via Firehose</text>
							<text x={tx} y={INNER_Y + 30} fill="#94a3b8">landed: {counts.bronze}</text>
							<text x={tx} y={INNER_Y + 45} fill="#94a3b8">append-only</text>
						{:else if i === SILVER_GOLD}
							<text x={tx} y={INNER_Y} fill="#fde047">dbt · hourly</text>
							<text x={tx} y={INNER_Y + 15} fill="#94a3b8">re-scored: {counts.gold}</text>
							<text x={tx} y={INNER_Y + 30} fill="#4ade80">match {counts.gold}/{counts.gold}</text>
							<text x={tx} y={INNER_Y + 45} fill="#94a3b8">→ Power BI</text>
							<text x={tx} y={INNER_Y + 60} fill="#94a3b8">→ Claude · MCP</text>
						{/if}
					</g>
				</g>
			{/each}

			<!-- Async publish: Decision → Kinesis (over the top) -->
			<path
				d="M{dx},{BOX_TOP} Q{(dx + kx) / 2},{BOX_TOP - 34} {kx},{BOX_TOP - 2}"
				fill="none"
				stroke="#f97316"
				stroke-width="1.5"
				stroke-dasharray="5 4"
				stroke-dashoffset={-flowT * 2}
				marker-end="url(#arrow-orange)"
			/>
			<text
				x={(dx + kx) / 2}
				y={BOX_TOP - 22}
				text-anchor="middle"
				fill="#fb923c"
				font-size="9.5"
				font-family="ui-monospace, monospace">async put_record</text
			>

			<!-- Feature read: Feature Store → Lambda (underneath), happens before scoring -->
			<path
				d="M{fx},{BOX_BOTTOM} Q{(fx + lx) / 2},{BOX_BOTTOM + 44} {lx},{BOX_BOTTOM + 2}"
				fill="none"
				stroke="#a78bfa"
				stroke-width="1.5"
				stroke-dasharray="5 4"
				stroke-dashoffset={flowT * 2}
				marker-end="url(#arrow-violet)"
			/>
			<text
				x={(fx + lx) / 2}
				y={BOX_BOTTOM + 40}
				text-anchor="middle"
				fill="#c4b5fd"
				font-size="9.5"
				font-family="ui-monospace, monospace">GetItem ~8 ms (read before scoring)</text
			>

			<g bind:this={ptLayer}></g>
		</svg>
	</div>

	<ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-slate-500">
		<li><span class="text-slate-300">●</span> application (undecided)</li>
		<li><span class="text-amber-400">●</span> rule fired</li>
		<li><span class="text-green-500">●</span> rule clear</li>
		<li>
			<span class="text-slate-500">●</span> n/e = not evaluated (missing data lowers confidence)
		</li>
		<li><span class="text-orange-400">- -</span> async, never blocks the customer</li>
	</ul>

	{#if selected && selectedIndex !== null}
		{@const color = selected.color}
		{@const art = stageArtefact(selected.id, focus)}
		<article
			class="mt-4 rounded-xl border bg-slate-900/70 p-5"
			style="border-color:{color}55"
			aria-live="polite"
			data-testid="stage-panel"
			data-panel={selected.id}
		>
			<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="font-mono text-xs text-slate-500">
						Stage {String(selectedIndex + 1).padStart(2, '0')} · {selected.latency} · showing {focus
							.request.application_id}
					</p>
					<h3 class="text-2xl font-semibold" style="color:{color}">{selected.label}</h3>
					<p class="text-sm text-slate-400">{selected.sub}</p>
				</div>
				<button
					class="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
					onclick={() => (selectedIndex = null)}>Close ✕</button
				>
			</div>

			<blockquote
				class="mb-5 border-l-2 pl-4 text-lg text-slate-100 italic"
				style="border-color:{color}"
			>
				{selected.oneLiner}
			</blockquote>

			<div class="grid gap-5 md:grid-cols-2">
				<div>
					<h4 class="mb-1.5 font-mono text-xs tracking-widest text-sky-400/80 uppercase">
						What happens
					</h4>
					<ul class="list-disc space-y-1 pl-4 text-sm text-slate-300 marker:text-sky-500">
						{#each selected.what as w (w)}<li>{w}</li>{/each}
					</ul>
				</div>
				<div class="space-y-4">
					<div>
						<h4 class="mb-1.5 font-mono text-xs tracking-widest text-emerald-400/80 uppercase">
							Why it exists
						</h4>
						<p class="text-sm leading-relaxed text-slate-300">{selected.why}</p>
					</div>
					<div>
						<h4 class="mb-1.5 font-mono text-xs tracking-widest text-rose-400/80 uppercase">
							What can go wrong
						</h4>
						<ul class="list-disc space-y-1 pl-4 text-sm text-slate-300 marker:text-rose-500">
							{#each selected.risk as r (r)}<li>{r}</li>{/each}
						</ul>
					</div>
				</div>
			</div>

			{#if selected.id === 'lambda'}
				<div class="mt-5 overflow-x-auto border-t border-slate-800 pt-4">
					<h4 class="mb-2 font-mono text-xs tracking-widest text-cyan-400/80 uppercase">
						Rule evaluation · {focus.request.application_id}
					</h4>
					<table class="w-full min-w-[520px] text-left text-sm" data-testid="rule-table">
						<thead class="font-mono text-[11px] text-slate-500 uppercase">
							<tr
								><th class="py-1 pr-3">Rule</th><th class="pr-3">Evidence</th><th class="pr-3"
									>Result</th
								><th class="pr-3 text-right">Contribution</th><th class="text-right">Running</th
								></tr
							>
						</thead>
						<tbody class="font-mono text-xs">
							{#each RULES as r, ri (r.id)}
								{@const o = focus.result.outcomes[ri]}
								<tr class="border-t border-slate-800" data-rule-row={r.id} data-fired={o.fired}>
									<td
										class="py-1.5 pr-3 {o.fired ? 'text-amber-200' : 'text-slate-400'}"
										title={r.description}>{r.id}</td
									>
									<td class="pr-3 text-slate-400">{r.summarise(o)}</td>
									<td
										class="pr-3 {o.fired
											? 'text-amber-400'
											: o.evaluated
												? 'text-green-500'
												: 'text-slate-500'}"
										>{o.fired ? 'fired' : o.evaluated ? 'clear' : 'not evaluated'}</td
									>
									<td class="pr-3 text-right {o.fired ? 'text-amber-300' : 'text-slate-600'}"
										>{o.fired ? `+${fmt(o.contribution)}` : '0.00'}</td
									>
									<td class="text-right text-slate-300">{fmt(focus.result.running[ri])}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t border-slate-600 font-mono text-sm">
								<td class="py-2 font-semibold text-slate-200" colspan="3">
									Total{focus.result.raw_score > 1
										? ` (raw ${fmt(focus.result.raw_score)}, capped at 1.00)`
										: ''} · confidence {fmt(focus.result.confidence)}
								</td>
								<td
									class="text-right font-bold"
									colspan="2"
									style="color:{DECISION_META[focus.result.decision].color}"
									data-testid="lambda-total"
								>
									{fmt(focus.result.score)} → {DECISION_META[focus.result.decision].label}
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
			{:else if selected.id === 'decision'}
				<div class="mt-5 grid gap-4 border-t border-slate-800 pt-4 md:grid-cols-2">
					<div class="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
						<p class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
							Support staff view
						</p>
						<p
							class="mt-1 text-lg font-semibold"
							style="color:{DECISION_META[focus.result.decision].color}"
						>
							{DECISION_META[focus.result.decision].label} · {fmt(focus.result.score)}
						</p>
						<p class="text-sm text-slate-300">{decisionRecord(focus).recommended_action}</p>
						<ul class="mt-2 space-y-0.5 font-mono text-xs text-slate-400">
							{#each decisionRecord(focus).reasoning as r (r.factor)}
								<li><span class="text-amber-300">+{fmt(r.contribution)}</span> {r.factor}</li>
							{:else}
								<li>No rules fired.</li>
							{/each}
							{#each decisionRecord(focus).not_evaluated as ne (ne)}
								<li class="text-slate-500">
									n/e {ne} (lowers confidence to {fmt(focus.result.confidence)})
								</li>
							{/each}
						</ul>
					</div>
					<div class="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
						<p class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
							Customer sees
						</p>
						<p class="mt-1 text-sm text-slate-200 italic">
							“{decisionRecord(focus).customer_message}”
						</p>
						<p class="mt-2 text-xs text-slate-500">
							Deliberately general: telling customers which rules fired would teach fraudsters how
							to avoid them.
						</p>
					</div>
				</div>
			{/if}

			<div class="mt-5 border-t border-slate-800 pt-4">
				<h4 class="mb-2 font-mono text-xs tracking-widest text-sky-400/80 uppercase">
					{'{ }'}
					{art.title}
				</h4>
				<pre
					class="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">{json(
						art.body
					)}</pre>
			</div>
		</article>
	{/if}
</section>

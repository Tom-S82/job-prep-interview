<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { stages, statusMeta, type Stage } from '#lib/data/stages.ts';

	// --- Layout constants (SVG user units; the SVG scales via viewBox) ---
	const W = 1200;
	const H = 330;
	const MARGIN = 24;
	const GAP = 16;
	const BOX_TOP = 62;
	const BOX_H = 168;
	const BELT_Y = BOX_TOP + BOX_H / 2 + 6;
	const TRAY_Y = 292;
	const EXPAND_WEIGHT = 2.6;

	// Colour of a particle as it passes through each stage (raw → refined)
	const stageColors = [
		'#64748b', // sources
		'#94a3b8', // ingestion
		'#22d3ee', // validation
		'#cd7f32', // bronze
		'#d4d4d8', // silver
		'#facc15', // gold
		'#a78bfa', // semantic
		'#38bdf8' // consumers
	];

	let selectedIndex = $state<number | null>(null);
	let svgEl: SVGSVGElement;
	let paused = $state(false);

	const selected = $derived<Stage | null>(selectedIndex === null ? null : stages[selectedIndex]);

	function toggle(i: number) {
		selectedIndex = selectedIndex === i ? null : i;
	}

	function targetWidths(sel: number | null): number[] {
		const weights = stages.map((_, i) => (i === sel ? EXPAND_WEIGHT : 1));
		const total = d3.sum(weights);
		const usable = W - MARGIN * 2 - GAP * (stages.length - 1);
		return weights.map((w) => (w / total) * usable);
	}

	// Simple involute-ish gear path, centred on 0,0
	function gearPath(r: number, teeth: number): string {
		const inner = r * 0.78;
		const pts: [number, number][] = [];
		const step = (Math.PI * 2) / (teeth * 4);
		for (let i = 0; i < teeth * 4; i++) {
			const rad = i % 4 < 2 ? r : inner;
			const a = i * step;
			pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
		}
		return d3.line().curve(d3.curveLinearClosed)(pts) ?? '';
	}

	type Particle = {
		x: number;
		y: number;
		lane: number;
		speed: number;
		kind: 'batch' | 'stream';
		reject: boolean;
		dropping: boolean;
		vy: number;
		opacity: number;
	};

	onMount(() => {
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduceMotion) paused = true;

		const svg = d3.select(svgEl);
		const widths = targetWidths(null);
		let xs: number[] = [];
		const computeXs = () => {
			xs = [];
			let x = MARGIN;
			for (const w of widths) {
				xs.push(x);
				x += w + GAP;
			}
		};
		computeXs();

		// --- Static layers ---
		const defs = svg.append('defs');
		const glow = defs.append('filter').attr('id', 'pglow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
		glow.append('feGaussianBlur').attr('stdDeviation', 2.2).attr('result', 'b');
		const merge = glow.append('feMerge');
		merge.append('feMergeNode').attr('in', 'b');
		merge.append('feMergeNode').attr('in', 'SourceGraphic');

		const grid = defs
			.append('pattern')
			.attr('id', 'pgrid')
			.attr('width', 20)
			.attr('height', 20)
			.attr('patternUnits', 'userSpaceOnUse');
		grid.append('path').attr('d', 'M20 0H0V20').attr('fill', 'none').attr('stroke', '#1e293b').attr('stroke-width', 0.6);

		svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#pgrid)');

		// Conveyor belt rails running the full length
		const belt = svg.append('g').attr('class', 'belt');
		belt
			.append('rect')
			.attr('x', MARGIN - 6)
			.attr('y', BELT_Y - 22)
			.attr('width', W - MARGIN * 2 + 12)
			.attr('height', 44)
			.attr('rx', 8)
			.attr('fill', '#0b1220')
			.attr('stroke', '#1f2a3d');
		const beltDash = belt
			.selectAll('line')
			.data([BELT_Y - 22, BELT_Y + 22])
			.join('line')
			.attr('x1', MARGIN)
			.attr('x2', W - MARGIN)
			.attr('y1', (d) => d)
			.attr('y2', (d) => d)
			.attr('stroke', '#334155')
			.attr('stroke-width', 2)
			.attr('stroke-dasharray', '10 8');

		// Quarantine tray under the validation stage
		const tray = svg.append('g').attr('class', 'tray');
		const trayRect = tray
			.append('rect')
			.attr('y', TRAY_Y)
			.attr('height', 26)
			.attr('rx', 4)
			.attr('fill', '#1f0f13')
			.attr('stroke', '#7f1d1d')
			.attr('stroke-dasharray', '4 3');
		const trayText = tray
			.append('text')
			.attr('y', TRAY_Y + 17)
			.attr('text-anchor', 'middle')
			.attr('fill', '#f87171')
			.attr('font-size', 10)
			.attr('font-family', 'ui-monospace, monospace')
			.attr('letter-spacing', 1)
			.text('QUARANTINE');

		// Stage machines
		const stageG = svg
			.append('g')
			.selectAll<SVGGElement, Stage>('g.stage')
			.data(stages)
			.join('g')
			.attr('class', 'stage')
			.attr('role', 'button')
			.attr('tabindex', 0)
			.attr('aria-label', (d) => `${d.label}: ${d.sub}. Click to expand.`)
			.style('cursor', 'pointer')
			.on('click', (_e, d) => toggle(stages.indexOf(d)))
			.on('keydown', (e: KeyboardEvent, d) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle(stages.indexOf(d));
				}
			});

		const body = stageG
			.append('rect')
			.attr('class', 'body')
			.attr('y', BOX_TOP)
			.attr('height', BOX_H)
			.attr('rx', 10)
			.attr('fill', '#0f172a')
			.attr('fill-opacity', 0.82)
			.attr('stroke-width', 1.5);

		// Window cut-out showing the belt through the machine
		const windowRect = stageG
			.append('rect')
			.attr('y', BELT_Y - 26)
			.attr('height', 52)
			.attr('rx', 4)
			.attr('fill', 'none')
			.attr('stroke', '#334155')
			.attr('stroke-dasharray', '2 3');

		const statusPip = stageG
			.append('circle')
			.attr('cy', BOX_TOP + 16)
			.attr('r', 4)
			.attr('fill', (d) => statusMeta[d.status].color);

		const label = stageG
			.append('text')
			.attr('y', BOX_TOP + 21)
			.attr('fill', '#e2e8f0')
			.attr('font-size', 14)
			.attr('font-weight', 600)
			.text((d) => d.label);

		const stepNum = stageG
			.append('text')
			.attr('y', BOX_TOP + 21)
			.attr('text-anchor', 'end')
			.attr('fill', '#475569')
			.attr('font-size', 11)
			.attr('font-family', 'ui-monospace, monospace')
			.text((_d, i) => String(i + 1).padStart(2, '0'));

		const sub = stageG
			.append('text')
			.attr('y', BOX_TOP + 40)
			.attr('fill', '#94a3b8')
			.attr('font-size', 11)
			.attr('opacity', 0)
			.text((d) => d.sub);

		const gearA = stageG
			.append('path')
			.attr('d', gearPath(13, 8))
			.attr('fill', '#1e293b')
			.attr('stroke', '#475569')
			.attr('stroke-width', 1);
		const gearB = stageG
			.append('path')
			.attr('d', gearPath(9, 6))
			.attr('fill', '#1e293b')
			.attr('stroke', '#475569')
			.attr('stroke-width', 1);

		// Inter-stage arrows / chevrons on the belt
		const chevrons = svg
			.append('g')
			.selectAll('path')
			.data(d3.range(stages.length - 1))
			.join('path')
			.attr('d', 'M-4,-6 L3,0 L-4,6')
			.attr('fill', 'none')
			.attr('stroke', '#475569')
			.attr('stroke-width', 2);

		// Source lane labels (batch vs stream)
		const laneLabels = svg
			.append('g')
			.selectAll('text')
			.data([
				{ t: '▪ SSIS CDC · batch', dy: -32, c: '#94a3b8' },
				{ t: '● Kinesis · stream', dy: 40, c: '#38bdf8' }
			])
			.join('text')
			.attr('x', MARGIN + 4)
			.attr('y', (d) => BELT_Y + d.dy)
			.attr('fill', (d) => d.c)
			.attr('font-size', 9.5)
			.attr('font-family', 'ui-monospace, monospace')
			.attr('opacity', 0.85)
			.text((d) => d.t);

		const particleLayer = svg.append('g').attr('filter', 'url(#pglow)').style('pointer-events', 'none');

		// --- Particles ---
		const particles: Particle[] = [];
		const endX = () => W - MARGIN;
		const spawn = (kind: 'batch' | 'stream', xOffset = 0) => {
			const lane = kind === 'batch' ? -9 + Math.random() * 6 : 4 + Math.random() * 8;
			particles.push({
				x: MARGIN + 4 - xOffset,
				y: BELT_Y + lane,
				lane,
				speed: kind === 'batch' ? 1.6 : 2.0 + Math.random() * 0.5,
				kind,
				reject: Math.random() < 0.07,
				dropping: false,
				vy: 0,
				opacity: 1
			});
		};

		const stageAt = (x: number): number => {
			for (let i = stages.length - 1; i >= 0; i--) if (x >= xs[i] - GAP / 2) return i;
			return 0;
		};

		let elapsed = 0;
		let last = 0;
		let streamAcc = 0;
		let batchAcc = 1.5;

		const timer = d3.timer((t) => {
			const dtRaw = Math.min((t - last) / 16.67, 3);
			last = t;
			const dt = paused ? 0 : dtRaw;
			elapsed += dt;

			// Ease widths toward the target layout
			const target = targetWidths(selectedIndex);
			for (let i = 0; i < widths.length; i++) widths[i] += (target[i] - widths[i]) * Math.min(1, 0.14 * dtRaw);
			computeXs();

			// Spawn: steady stream + periodic CDC batch bursts
			streamAcc += dt;
			batchAcc += dt;
			if (streamAcc > 9) {
				streamAcc = 0;
				spawn('stream');
			}
			if (batchAcc > 150) {
				batchAcc = 0;
				for (let k = 0; k < 7; k++) spawn('batch', k * 9);
			}

			// Move particles
			const validationIdx = 2;
			const vCentre = xs[validationIdx] + widths[validationIdx] / 2;
			for (const p of particles) {
				if (p.dropping) {
					p.vy += 0.18 * dt;
					p.y += p.vy * dt;
					if (p.y > TRAY_Y + 14) {
						p.y = TRAY_Y + 14;
						p.opacity -= 0.015 * dt;
					}
					continue;
				}
				const si = stageAt(p.x);
				const slow = si === selectedIndex ? 0.55 : 1;
				p.x += p.speed * slow * dt;
				p.y = BELT_Y + p.lane + Math.sin((elapsed + p.x) * 0.05) * 1.2;
				if (p.reject && p.x >= vCentre) {
					p.dropping = true;
					p.vy = 0.5;
				}
				if (p.x > endX()) p.opacity -= 0.08 * dt;
			}
			for (let i = particles.length - 1; i >= 0; i--) if (particles[i].opacity <= 0) particles.splice(i, 1);

			// --- Render ---
			stageG.attr('transform', (_d, i) => `translate(${xs[i]},0)`);
			body
				.attr('width', (_d, i) => widths[i])
				.attr('stroke', (_d, i) => (i === selectedIndex ? stageColors[i] : '#273449'));
			windowRect.attr('x', 8).attr('width', (_d, i) => Math.max(0, widths[i] - 16));
			statusPip.attr('cx', 14);
			label.attr('x', 24);
			stepNum
				.attr('x', (_d, i) => widths[i] - 10)
				.attr('opacity', (_d, i) => Math.max(0, Math.min(1, (widths[i] - 135) / 15)));
			sub
				.attr('x', 14)
				.attr('opacity', (_d, i) => Math.max(0, Math.min(1, (widths[i] - 200) / 50)));

			const rot = elapsed * 1.6;
			gearA.attr('transform', (_d, i) => `translate(${widths[i] / 2 - 9},${BOX_TOP + BOX_H - 22}) rotate(${rot * (i % 2 ? -1 : 1)})`);
			gearB.attr(
				'transform',
				(_d, i) => `translate(${widths[i] / 2 + 12},${BOX_TOP + BOX_H - 18}) rotate(${(-rot * 13) / 9 * (i % 2 ? -1 : 1) + 15})`
			);

			chevrons.attr('transform', (i) => `translate(${xs[i] + widths[i] + GAP / 2},${BELT_Y - 34})`);
			beltDash.attr('stroke-dashoffset', -elapsed * 1.2);

			trayRect.attr('x', xs[validationIdx] + 10).attr('width', Math.max(0, widths[validationIdx] - 20));
			trayText.attr('x', vCentre);
			laneLabels.attr('opacity', selectedIndex === 0 || selectedIndex === null ? 0.85 : 0);

			particleLayer
				.selectAll<SVGElement, Particle>('.pt')
				.data(particles)
				.join((enter) =>
					enter.append((d) =>
						document.createElementNS(
							'http://www.w3.org/2000/svg',
							d.kind === 'batch' ? 'rect' : 'circle'
						)
					)
				)
				.attr('class', 'pt')
				.each(function (d) {
					const el = d3.select(this);
					const colour = d.dropping ? '#ef4444' : stageColors[stageAt(d.x)];
					el.attr('fill', colour).attr('opacity', Math.max(0, d.opacity));
					if (d.kind === 'batch') el.attr('x', d.x - 3).attr('y', d.y - 3).attr('width', 6).attr('height', 6).attr('rx', 1);
					else el.attr('cx', d.x).attr('cy', d.y).attr('r', 2.6);
				});
		});

		return () => timer.stop();
	});
</script>

<section class="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-200 shadow-2xl shadow-black/40 sm:p-6">
	<header class="mb-4 flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="font-mono text-xs tracking-[0.2em] text-amber-400/80 uppercase">Factory floor</p>
			<h2 class="text-xl font-semibold text-slate-100 sm:text-2xl">thinkmoney data platform — target state</h2>
			<p class="mt-1 text-sm text-slate-400">Click a machine to open it up. Click again to close.</p>
		</div>
		<div class="flex flex-wrap items-center gap-3 text-xs">
			{#each Object.values(statusMeta) as s (s.label)}
				<span class="flex items-center gap-1.5 text-slate-400">
					<span class="h-2 w-2 rounded-full" style="background:{s.color}"></span>{s.label}
				</span>
			{/each}
			<button
				type="button"
				class="rounded-md border border-slate-700 px-2.5 py-1 font-mono text-slate-300 hover:border-slate-500 hover:text-white"
				onclick={() => (paused = !paused)}
				aria-pressed={paused}
			>
				{paused ? '▶ Run' : '❚❚ Pause'}
			</button>
		</div>
	</header>

	<div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
		<svg
			bind:this={svgEl}
			viewBox="0 0 {W} {H}"
			class="block w-full min-w-[820px] select-none"
			role="img"
			aria-label="Animated data pipeline from sources to consumers"
		></svg>
	</div>

	{#if selected && selectedIndex !== null}
		{@const color = stageColors[selectedIndex]}
		<article
			class="mt-4 rounded-xl border bg-slate-900/70 p-5"
			style="border-color:{color}55"
			aria-live="polite"
		>
			<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="font-mono text-xs text-slate-500">
						STAGE {String(selectedIndex + 1).padStart(2, '0')} ·
						<span style="color:{statusMeta[selected.status].color}">{statusMeta[selected.status].label}</span>
					</p>
					<h3 class="text-2xl font-semibold" style="color:{color}">{selected.label}</h3>
					<p class="text-sm text-slate-400">{selected.sub}</p>
				</div>
				<button
					type="button"
					class="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
					onclick={() => (selectedIndex = null)}
				>
					Close ✕
				</button>
			</div>

			<blockquote class="mb-5 border-l-2 pl-4 text-lg text-slate-100 italic" style="border-color:{color}">
				“{selected.oneLiner}”
			</blockquote>

			<div class="grid gap-5 md:grid-cols-2">
				<div>
					<h4 class="mb-1.5 font-mono text-xs tracking-widest text-slate-500 uppercase">Problem it solves</h4>
					<p class="text-sm leading-relaxed text-slate-300">{selected.problem}</p>
				</div>
				<div>
					<h4 class="mb-1.5 font-mono text-xs tracking-widest text-emerald-400/80 uppercase">What good looks like</h4>
					<ul class="list-disc space-y-1 pl-4 text-sm text-slate-300 marker:text-emerald-500">
						{#each selected.good as g (g)}<li>{g}</li>{/each}
					</ul>
				</div>
				<div>
					<h4 class="mb-1.5 font-mono text-xs tracking-widest text-sky-400/80 uppercase">How at thinkmoney</h4>
					<ul class="list-disc space-y-1 pl-4 text-sm text-slate-300 marker:text-sky-500">
						{#each selected.implementation as s (s)}<li>{s}</li>{/each}
					</ul>
				</div>
				<div>
					<h4 class="mb-1.5 font-mono text-xs tracking-widest text-rose-400/80 uppercase">What can go wrong</h4>
					<ul class="list-disc space-y-1 pl-4 text-sm text-slate-300 marker:text-rose-500">
						{#each selected.pitfalls as s (s)}<li>{s}</li>{/each}
					</ul>
				</div>
			</div>

			<div class="mt-5 border-t border-slate-800 pt-4">
				<h4 class="mb-2 font-mono text-xs tracking-widest text-amber-400/80 uppercase">Interview questions</h4>
				<ol class="space-y-2">
					{#each selected.questions as item, qi (item.q)}
						<li class="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
							<span class="mr-2 font-mono text-slate-500">Q{qi + 1}</span>{item.q}
							<p class="mt-1 text-xs text-slate-500 italic">{item.a ?? 'Model answer coming soon.'}</p>
						</li>
					{/each}
				</ol>
			</div>
		</article>
	{/if}
</section>

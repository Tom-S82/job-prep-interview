<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { stages, statusMeta, type Stage } from '#lib/data/stages.ts';

	// --- Layout constants (SVG user units; the SVG scales via viewBox) ---
	const W = 1200;
	const H = 360;
	const MARGIN = 24;
	const GAP = 16;
	const BOX_TOP = 56;
	const BOX_H = 176;
	const BOX_BOTTOM = BOX_TOP + BOX_H;
	const BELT_Y = 150;
	const TRAY_Y = 248;
	const RETURN_Y = 300;
	const EXPAND_WEIGHT = 2.6;

	const SOURCES = 0;
	const VALIDATION = 2;
	const GOLD = 5;
	const CONSUMERS = 7;

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
	const REJECT_COLOR = '#ef4444';
	const FIXED_COLOR = '#4ade80';

	type Kind = 'sql' | 'stream' | 'file' | 'agg';
	type Route = 'bi' | 'ai';

	const sourceRows: { kind: Exclude<Kind, 'agg'>; label: string; tag: string; y: number }[] = [
		{ kind: 'sql', label: 'SQL Server', tag: 'SSIS CDC', y: BELT_Y - 44 },
		{ kind: 'stream', label: 'Kinesis', tag: 'events', y: BELT_Y },
		{ kind: 'file', label: 'S3 files', tag: 'batch', y: BELT_Y + 44 }
	];
	const consumerBays: { route: Route; label: string; y: number; color: string }[] = [
		{ route: 'bi', label: 'Power BI', y: BELT_Y - 40, color: '#facc15' },
		{ route: 'ai', label: 'Claude · MCP', y: BELT_Y + 40, color: '#a78bfa' }
	];

	let selectedIndex = $state<number | null>(null);
	let svgEl: SVGSVGElement;
	let paused = $state(false);
	let stats = $state({ quarantined: 0, replayed: 0, bi: 0, ai: 0 });

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

	function gearPath(r: number, teeth: number): string {
		const inner = r * 0.78;
		const pts: [number, number][] = [];
		const step = (Math.PI * 2) / (teeth * 4);
		for (let i = 0; i < teeth * 4; i++) {
			const rad = i % 4 < 2 ? r : inner;
			pts.push([Math.cos(i * step) * rad, Math.sin(i * step) * rad]);
		}
		return d3.line().curve(d3.curveLinearClosed)(pts) ?? '';
	}

	const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
	const smooth = (v: number) => {
		const t = clamp01(v);
		return t * t * (3 - 2 * t);
	};

	/**
	 * Particle lifecycle:
	 *   flow → (reject) drop → tray → return → rise → respawned as "fixed"
	 *   flow → held (staged at Gold in 2×2 groups) → released as one "agg" particle
	 *   agg flow → forks to a consumer bay → exit
	 * Flowing particles live in stage-space (`s` = stage index + progress), so they
	 * track their stage smoothly when the layout expands/collapses.
	 */
	type Phase = 'flow' | 'drop' | 'tray' | 'return' | 'rise' | 'held' | 'exit';
	type Particle = {
		id: number;
		kind: Kind;
		phase: Phase;
		s: number;
		x: number;
		y: number;
		lane: number;
		srcY: number;
		speed: number;
		reject: boolean;
		fixed: boolean;
		vy: number;
		wait: number;
		opacity: number;
		route: Route;
	};
	type Group = { members: Particle[]; fullAt: number | null };

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) paused = true;

		const svg = d3.select(svgEl);
		const widths = targetWidths(null);
		const xs: number[] = [];
		const computeXs = () => {
			let x = MARGIN;
			widths.forEach((w, i) => {
				xs[i] = x;
				x += w + GAP;
			});
		};
		computeXs();
		const centre = (i: number) => xs[i] + widths[i] / 2;
		const sx = (s: number) => {
			const i = Math.min(stages.length - 1, Math.max(0, Math.floor(s)));
			return xs[i] + (s - i) * (widths[i] + (i < stages.length - 1 ? GAP : 0));
		};
		const stageOf = (s: number) => Math.min(stages.length - 1, Math.max(0, Math.floor(s)));

		// --- Defs ---
		const defs = svg.append('defs');
		const glow = defs
			.append('filter')
			.attr('id', 'pglow')
			.attr('x', '-50%')
			.attr('y', '-50%')
			.attr('width', '200%')
			.attr('height', '200%');
		glow.append('feGaussianBlur').attr('stdDeviation', 2).attr('result', 'b');
		const merge = glow.append('feMerge');
		merge.append('feMergeNode').attr('in', 'b');
		merge.append('feMergeNode').attr('in', 'SourceGraphic');
		defs
			.append('pattern')
			.attr('id', 'pgrid')
			.attr('width', 20)
			.attr('height', 20)
			.attr('patternUnits', 'userSpaceOnUse')
			.append('path')
			.attr('d', 'M20 0H0V20')
			.attr('fill', 'none')
			.attr('stroke', '#1e293b')
			.attr('stroke-width', 0.6);

		svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'url(#pgrid)');

		// --- Conveyor belt ---
		const belt = svg.append('g');
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

		// --- Quarantine tray + feedback loop back to Sources ---
		const loop = svg.append('g');
		const returnPath = loop
			.append('path')
			.attr('fill', 'none')
			.attr('stroke', '#7f1d1d')
			.attr('stroke-width', 1.5)
			.attr('stroke-dasharray', '6 5');
		const returnArrow = loop.append('path').attr('d', 'M-5,5 L0,-2 L5,5').attr('fill', 'none').attr('stroke', '#b91c1c').attr('stroke-width', 1.5);
		const returnLabel = loop
			.append('text')
			.attr('y', RETURN_Y + 16)
			.attr('text-anchor', 'middle')
			.attr('fill', '#f87171')
			.attr('font-size', 10)
			.attr('font-family', 'ui-monospace, monospace')
			.attr('opacity', 0.8);
		const trayRect = loop
			.append('rect')
			.attr('y', TRAY_Y)
			.attr('height', 24)
			.attr('rx', 4)
			.attr('fill', '#1f0f13')
			.attr('stroke', '#7f1d1d')
			.attr('stroke-dasharray', '4 3');
		const trayText = loop
			.append('text')
			.attr('y', TRAY_Y + 16)
			.attr('text-anchor', 'middle')
			.attr('fill', '#f87171')
			.attr('font-size', 9.5)
			.attr('font-family', 'ui-monospace, monospace')
			.attr('letter-spacing', 1)
			.text('QUARANTINE');

		// --- Stage machines ---
		const stageG = svg
			.append('g')
			.selectAll<SVGGElement, Stage>('g.stage')
			.data(stages)
			.join('g')
			.attr('class', 'stage')
			.attr('data-stage', (d) => d.id)
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
			.attr('y', BOX_TOP)
			.attr('height', BOX_H)
			.attr('rx', 10)
			.attr('fill', '#0f172a')
			.attr('fill-opacity', 0.82)
			.attr('stroke-width', 1.5);

		// Belt window (not on Sources/Consumers, which have their own internals)
		const windowRect = stageG
			.filter((_d, i) => i !== SOURCES && i !== CONSUMERS)
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
			.attr('y', BOX_TOP + 38)
			.attr('fill', '#94a3b8')
			.attr('font-size', 11)
			.attr('opacity', 0)
			.text((d) => d.sub);

		const gearA = stageG.append('path').attr('d', gearPath(13, 8)).attr('fill', '#1e293b').attr('stroke', '#475569');
		const gearB = stageG.append('path').attr('d', gearPath(9, 6)).attr('fill', '#1e293b').attr('stroke', '#475569');

		// Sources: three distinct feeds
		const srcG = stageG.filter((_d, i) => i === SOURCES);
		const srcChips = srcG
			.selectAll('g.src')
			.data(sourceRows)
			.join('g')
			.attr('class', 'src');
		const srcChipRect = srcChips
			.append('rect')
			.attr('x', 8)
			.attr('y', (d) => d.y - 16)
			.attr('height', 32)
			.attr('rx', 5)
			.attr('fill', '#0b1220')
			.attr('stroke', '#334155');
		srcChips
			.append('text')
			.attr('x', 14)
			.attr('y', (d) => d.y - 3)
			.attr('fill', '#cbd5e1')
			.attr('font-size', 10)
			.attr('font-weight', 600)
			.text((d) => d.label);
		srcChips
			.append('text')
			.attr('x', 14)
			.attr('y', (d) => d.y + 9)
			.attr('fill', '#64748b')
			.attr('font-size', 8.5)
			.attr('font-family', 'ui-monospace, monospace')
			.text((d) => d.tag);

		// Gold: staging indicator
		const goldG = stageG.filter((_d, i) => i === GOLD);
		const batchReady = goldG
			.append('text')
			.attr('y', BELT_Y - 32)
			.attr('text-anchor', 'middle')
			.attr('fill', '#facc15')
			.attr('font-size', 9)
			.attr('font-family', 'ui-monospace, monospace')
			.attr('letter-spacing', 1)
			.attr('opacity', 0)
			.text('BATCH READY ✓');
		const stagingLabel = goldG
			.append('text')
			.attr('y', BELT_Y + 40)
			.attr('text-anchor', 'middle')
			.attr('fill', '#854d0e')
			.attr('font-size', 8.5)
			.attr('font-family', 'ui-monospace, monospace')
			.text('2×2 staging');

		// Consumers: two self-serve bays
		const conG = stageG.filter((_d, i) => i === CONSUMERS);
		const bays = conG.selectAll('g.bay').data(consumerBays).join('g').attr('class', 'bay');
		const bayRect = bays
			.append('rect')
			.attr('x', 8)
			.attr('y', (d) => d.y - 18)
			.attr('height', 36)
			.attr('rx', 5)
			.attr('fill', '#0b1220')
			.attr('stroke-width', 1.2);
		bays
			.append('text')
			.attr('x', 14)
			.attr('y', (d) => d.y - 6)
			.attr('fill', (d) => d.color)
			.attr('font-size', 9.5)
			.attr('font-weight', 600)
			.text((d) => d.label);
		const bayCount = bays
			.append('text')
			.attr('y', (d) => d.y - 6)
			.attr('text-anchor', 'end')
			.attr('fill', '#64748b')
			.attr('font-size', 8.5)
			.attr('font-family', 'ui-monospace, monospace');

		// Chevrons between stages
		const chevrons = svg
			.append('g')
			.selectAll('path')
			.data(d3.range(stages.length - 1))
			.join('path')
			.attr('d', 'M-4,-6 L3,0 L-4,6')
			.attr('fill', 'none')
			.attr('stroke', '#475569')
			.attr('stroke-width', 2);

		// One layer per shape, keyed joins — prevents elements being reused for the wrong particle
		const pLayer = svg.append('g').attr('filter', 'url(#pglow)').style('pointer-events', 'none');
		const layer = {
			sql: pLayer.append('g'),
			file: pLayer.append('g'),
			stream: pLayer.append('g'),
			agg: pLayer.append('g')
		};

		// --- Simulation state ---
		let nextId = 0;
		let particles: Particle[] = [];
		const groups: Group[] = [];
		const pending: { kind: Exclude<Kind, 'agg'>; fixed: boolean; at: number }[] = [];
		const bayPulse: Record<Route, number> = { bi: -999, ai: -999 };
		let routeToggle = false;
		let lastRelease = -999;
		let elapsed = 0;
		let last = 0;
		let streamAcc = 0;
		let sqlAcc = 120;
		let fileAcc = 60;

		const spawn = (kind: Exclude<Kind, 'agg'>, fixed = false) => {
			const row = sourceRows.find((r) => r.kind === kind)!;
			const lane = kind === 'sql' ? -12 + Math.random() * 7 : kind === 'stream' ? -3 + Math.random() * 6 : 5 + Math.random() * 7;
			particles.push({
				id: nextId++,
				kind,
				phase: 'flow',
				s: 0.62,
				x: 0,
				y: row.y + 4,
				lane,
				srcY: row.y + 4,
				speed: kind === 'stream' ? 2.0 + Math.random() * 0.5 : 1.7,
				reject: !fixed && Math.random() < 0.06,
				fixed,
				vy: 0,
				wait: 0,
				opacity: 1,
				route: 'bi'
			});
		};

		const releaseGroup = (g: Group) => {
			const gx = d3.mean(g.members, (m) => m.x) ?? centre(GOLD);
			particles = particles.filter((p) => !g.members.includes(p));
			routeToggle = !routeToggle;
			particles.push({
				id: nextId++,
				kind: 'agg',
				phase: 'flow',
				s: GOLD + (gx - xs[GOLD]) / (widths[GOLD] + GAP),
				x: gx,
				y: BELT_Y,
				lane: 0,
				srcY: BELT_Y,
				speed: 1.8,
				reject: false,
				fixed: g.members.some((m) => m.fixed),
				vy: 0,
				wait: 0,
				opacity: 1,
				route: routeToggle ? 'bi' : 'ai'
			});
			lastRelease = elapsed;
		};

		const colourOf = (p: Particle) => {
			if (p.phase === 'drop' || p.phase === 'tray' || p.phase === 'return' || p.phase === 'rise') return REJECT_COLOR;
			if (p.phase === 'held') return stageColors[GOLD];
			return stageColors[stageOf(p.s)];
		};

		const timer = d3.timer((t) => {
			const dtRaw = Math.min((t - last) / 16.67, 3);
			last = t;
			const dt = paused ? 0 : dtRaw;
			elapsed += dt;

			// Ease layout toward target
			const target = targetWidths(selectedIndex);
			for (let i = 0; i < widths.length; i++) widths[i] += (target[i] - widths[i]) * Math.min(1, 0.14 * dtRaw);
			computeXs();

			// Spawning: steady Kinesis stream, periodic SSIS CDC + S3 file batches
			streamAcc += dt;
			sqlAcc += dt;
			fileAcc += dt;
			if (streamAcc > 11) {
				streamAcc = 0;
				spawn('stream');
			}
			if (sqlAcc > 170) {
				sqlAcc = 0;
				for (let k = 0; k < 6; k++) pending.push({ kind: 'sql', fixed: false, at: elapsed + k * 6 });
			}
			if (fileAcc > 260) {
				fileAcc = 0;
				for (let k = 0; k < 4; k++) pending.push({ kind: 'file', fixed: false, at: elapsed + k * 8 });
			}
			for (let i = pending.length - 1; i >= 0; i--) {
				if (pending[i].at <= elapsed) {
					spawn(pending[i].kind, pending[i].fixed);
					pending.splice(i, 1);
				}
			}

			const vCentre = centre(VALIDATION);
			const srcCentre = centre(SOURCES);
			const goldCentre = centre(GOLD);
			const removed = new Set<Particle>();

			for (const p of particles) {
				switch (p.phase) {
					case 'flow': {
						const i = stageOf(p.s);
						p.s += (p.speed * dt) / (widths[i] + GAP);
						p.x = sx(p.s);
						const wobble = Math.sin((elapsed + p.id * 13) * 0.08) * 1;
						if (p.kind === 'agg' && p.s >= CONSUMERS) {
							const bay = consumerBays.find((b) => b.route === p.route)!;
							p.y = BELT_Y + (bay.y + 5 - BELT_Y) * smooth((p.s - CONSUMERS - 0.02) / 0.35);
						} else if (p.s < 1.1) {
							p.y = p.srcY + (BELT_Y + p.lane - p.srcY) * smooth((p.s - 0.62) / 0.45) + wobble;
						} else {
							p.y = BELT_Y + p.lane + wobble;
						}

						if (p.reject && p.s >= VALIDATION + 0.5) {
							p.phase = 'drop';
							p.vy = 0.4;
							stats.quarantined++;
						} else if (p.kind !== 'agg' && p.s >= GOLD + 0.42) {
							p.phase = 'held';
							let g = groups[groups.length - 1];
							if (!g || g.members.length >= 4) {
								g = { members: [], fullAt: null };
								groups.push(g);
							}
							g.members.push(p);
							if (g.members.length === 4) g.fullAt = elapsed;
						} else if (p.kind === 'agg' && p.s >= CONSUMERS + 0.78) {
							p.phase = 'exit';
							stats[p.route]++;
							bayPulse[p.route] = elapsed;
						}
						break;
					}
					case 'drop':
						p.x = vCentre + (p.id % 7) * 4 - 12;
						p.vy += 0.2 * dt;
						p.y += p.vy * dt;
						if (p.y >= TRAY_Y + 12) {
							p.y = TRAY_Y + 12;
							p.phase = 'tray';
							p.wait = 50;
						}
						break;
					case 'tray':
						p.x = vCentre + (p.id % 7) * 4 - 12;
						p.wait -= dt;
						if (p.wait <= 0) {
							p.phase = 'return';
							p.x = vCentre;
						}
						break;
					case 'return':
						if (p.y < RETURN_Y) {
							p.y = Math.min(RETURN_Y, p.y + 1.5 * dt);
							p.x = vCentre;
						} else {
							p.x -= 2.4 * dt;
							if (p.x <= srcCentre) {
								p.x = srcCentre;
								p.phase = 'rise';
							}
						}
						break;
					case 'rise':
						p.x = srcCentre;
						p.y -= 1.5 * dt;
						if (p.y <= BOX_BOTTOM - 2) {
							removed.add(p);
							stats.replayed++;
							pending.push({ kind: p.kind as Exclude<Kind, 'agg'>, fixed: true, at: elapsed + 20 });
						}
						break;
					case 'held':
						break; // positioned below with its group
					case 'exit':
						p.opacity -= 0.06 * dt;
						if (p.opacity <= 0) removed.add(p);
						break;
				}
			}

			// Gold staging: groups sit in 2×2 formation, release one full group at a time
			groups.forEach((g, gi) => {
				const gx = goldCentre + 16 - (groups.length - 1 - gi) * 18;
				g.members.forEach((m, k) => {
					const tx = gx + (k % 2) * 7 - 3.5;
					const ty = BELT_Y + Math.floor(k / 2) * 7 - 3.5;
					m.x += (tx - m.x) * Math.min(1, 0.2 * dtRaw);
					m.y += (ty - m.y) * Math.min(1, 0.2 * dtRaw);
				});
			});
			const head = groups[0];
			if (head && head.fullAt !== null && elapsed - head.fullAt > 30 && elapsed - lastRelease > 12) {
				releaseGroup(head);
				groups.shift();
			}

			if (removed.size) particles = particles.filter((p) => !removed.has(p));
			// Safety net: never let anything live off the end of the line
			particles = particles.filter((p) => p.s < stages.length + 0.5);

			// --- Render stages ---
			stageG.attr('transform', (_d, i) => `translate(${xs[i]},0)`);
			body.attr('width', (_d, i) => widths[i]).attr('stroke', (_d, i) => (i === selectedIndex ? stageColors[i] : '#273449'));
			windowRect.attr('x', 8).attr('width', (d) => Math.max(0, widths[stages.indexOf(d)] - 16));
			statusPip.attr('cx', 14);
			label.attr('x', 24);
			stepNum
				.attr('x', (_d, i) => widths[i] - 10)
				.attr('opacity', (_d, i) => clamp01((widths[i] - 135) / 15));
			sub
				.attr('x', 14)
				.attr('opacity', (_d, i) => (i === SOURCES || i === CONSUMERS ? 0 : clamp01((widths[i] - 200) / 50)));

			const rot = elapsed * 1.6;
			gearA.attr('transform', (_d, i) => `translate(${widths[i] / 2 - 9},${BOX_BOTTOM - 22}) rotate(${rot * (i % 2 ? -1 : 1)})`);
			gearB.attr(
				'transform',
				(_d, i) => `translate(${widths[i] / 2 + 12},${BOX_BOTTOM - 18}) rotate(${((-rot * 13) / 9) * (i % 2 ? -1 : 1) + 15})`
			);

			srcChipRect.attr('width', Math.max(0, widths[SOURCES] - 16));
			batchReady.attr('x', widths[GOLD] / 2).attr('opacity', clamp01(1 - (elapsed - lastRelease) / 45));
			stagingLabel.attr('x', widths[GOLD] / 2);
			bayRect
				.attr('width', Math.max(0, widths[CONSUMERS] - 16))
				.attr('stroke', (d) => d3.interpolateRgb(d.color, '#334155')(clamp01((elapsed - bayPulse[d.route]) / 30)));
			bayCount.attr('x', widths[CONSUMERS] - 14).text((d) => (widths[CONSUMERS] > 150 ? String(stats[d.route]) : ''));

			chevrons.attr('transform', (i) => `translate(${xs[i] + widths[i] + GAP / 2},${BELT_Y - 34})`);
			beltDash.attr('stroke-dashoffset', -elapsed * 1.2);

			trayRect.attr('x', xs[VALIDATION] + 10).attr('width', Math.max(0, widths[VALIDATION] - 20));
			trayText.attr('x', vCentre);
			returnPath
				.attr('d', `M${vCentre},${TRAY_Y + 24} V${RETURN_Y} H${srcCentre} V${BOX_BOTTOM + 2}`)
				.attr('stroke-dashoffset', elapsed * 0.8);
			returnArrow.attr('transform', `translate(${srcCentre},${BOX_BOTTOM + 6})`);
			returnLabel
				.attr('x', (vCentre + srcCentre) / 2)
				.text(`fix at source → replay   ·   ${stats.quarantined} held · ${stats.replayed} replayed`);

			// --- Render particles (keyed by id) ---
			const byKind = (k: Kind) => particles.filter((p) => p.kind === k);
			const stroke = (p: Particle) => (p.fixed ? FIXED_COLOR : 'none');

			layer.stream
				.selectAll<SVGCircleElement, Particle>('circle')
				.data(byKind('stream'), (d) => d.id)
				.join('circle')
				.attr('class', 'pt')
				.attr('data-phase', (d) => d.phase)
				.attr('r', 2.6)
				.attr('cx', (d) => d.x)
				.attr('cy', (d) => d.y)
				.attr('fill', colourOf)
				.attr('stroke', stroke)
				.attr('opacity', (d) => d.opacity);

			layer.sql
				.selectAll<SVGRectElement, Particle>('rect')
				.data(byKind('sql'), (d) => d.id)
				.join('rect')
				.attr('class', 'pt')
				.attr('data-phase', (d) => d.phase)
				.attr('width', 5.5)
				.attr('height', 5.5)
				.attr('rx', 1)
				.attr('x', (d) => d.x - 2.75)
				.attr('y', (d) => d.y - 2.75)
				.attr('fill', colourOf)
				.attr('stroke', stroke)
				.attr('opacity', (d) => d.opacity);

			layer.file
				.selectAll<SVGRectElement, Particle>('rect')
				.data(byKind('file'), (d) => d.id)
				.join('rect')
				.attr('class', 'pt')
				.attr('data-phase', (d) => d.phase)
				.attr('width', 5)
				.attr('height', 5)
				.attr('x', -2.5)
				.attr('y', -2.5)
				.attr('transform', (d) => `translate(${d.x},${d.y}) rotate(45)`)
				.attr('fill', colourOf)
				.attr('stroke', stroke)
				.attr('opacity', (d) => d.opacity);

			layer.agg
				.selectAll<SVGGElement, Particle>('g')
				.data(byKind('agg'), (d) => d.id)
				.join((enter) => {
					const g = enter.append('g').attr('class', 'pt agg');
					for (let k = 0; k < 4; k++)
						g.append('rect')
							.attr('x', (k % 2) * 6 - 5.5)
							.attr('y', Math.floor(k / 2) * 6 - 5.5)
							.attr('width', 5)
							.attr('height', 5)
							.attr('rx', 0.8);
					return g;
				})
				.attr('data-phase', (d) => d.phase)
				.attr('transform', (d) => `translate(${d.x},${d.y})`)
				.attr('opacity', (d) => d.opacity)
				.attr('fill', colourOf)
				.attr('stroke', stroke)
				.attr('stroke-width', 0.6);
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

	<ul class="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-slate-500">
		<li><span class="text-slate-400">▪</span> SQL Server CDC row</li>
		<li><span class="text-slate-400">●</span> Kinesis event</li>
		<li><span class="text-slate-400">◆</span> S3 file record</li>
		<li><span class="text-amber-400">▪▪</span> Gold aggregate</li>
		<li><span class="text-red-400">●</span> quarantined</li>
		<li><span class="text-green-400">○</span> corrected &amp; replayed</li>
	</ul>

	{#if selected && selectedIndex !== null}
		{@const color = stageColors[selectedIndex]}
		<article class="mt-4 rounded-xl border bg-slate-900/70 p-5" style="border-color:{color}55" aria-live="polite">
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
				<h4 class="mb-2 font-mono text-xs tracking-widest text-amber-400/80 uppercase">
					Interview questions <span class="normal-case tracking-normal text-slate-500">— think first, then reveal</span>
				</h4>
				<ol class="space-y-2">
					{#each selected.questions as item, qi (item.q)}
						<li class="rounded-lg border border-slate-800 bg-slate-950/60 text-sm">
							{#if item.a}
								<details class="group">
									<summary class="flex cursor-pointer list-none gap-2 px-3 py-2 hover:bg-slate-900">
										<span class="font-mono text-slate-500">Q{qi + 1}</span>
										<span class="flex-1">{item.q}</span>
										<span class="font-mono text-xs text-slate-500 group-open:hidden">reveal ▸</span>
										<span class="hidden font-mono text-xs text-slate-500 group-open:inline">hide ▾</span>
									</summary>
									<p class="answer border-t border-slate-800 px-3 py-3 leading-relaxed whitespace-pre-line text-slate-300">
										{item.a}
									</p>
								</details>
							{:else}
								<div class="px-3 py-2">
									<span class="mr-2 font-mono text-slate-500">Q{qi + 1}</span>{item.q}
									<p class="mt-1 text-xs text-slate-500 italic">Model answer coming soon.</p>
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		</article>
	{/if}
</section>

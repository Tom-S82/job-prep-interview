<script lang="ts">
	import { capstone, diagramEdges, diagramNodes, type DiagramNode, type NodeId } from '#lib/data/capstone/index.ts';

	let {
		done = [],
		current = [],
		compact = false
	}: { done?: NodeId[]; current?: NodeId[]; compact?: boolean } = $props();

	const W = 900;
	const H = 490;
	const NW = 150;
	const NH = 46;

	const doneSet = $derived(new Set(done));
	const currentSet = $derived(new Set(current));
	const byId = new Map(diagramNodes.map((n) => [n.id, n]));
	// Which part(s) design each component (excluding the synthesis part)
	const lettersFor = (id: NodeId) =>
		capstone.parts
			.filter((p) => p.letter !== 'I' && p.nodes.includes(id))
			.map((p) => p.letter)
			.join('');

	const pathColor: Record<DiagramNode['path'], string> = {
		hot: '#f87171',
		batch: '#38bdf8',
		serve: '#fbbf24',
		ops: '#a78bfa'
	};
	const state = (id: NodeId) => (currentSet.has(id) ? 'current' : doneSet.has(id) ? 'done' : 'todo');

	function edgePath(a: DiagramNode, b: DiagramNode) {
		// Connect the nearest sides of the two boxes
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
		const sx = horizontal ? a.x + Math.sign(dx) * (NW / 2) : a.x;
		const sy = horizontal ? a.y : a.y + Math.sign(dy) * (NH / 2);
		const ex = horizontal ? b.x - Math.sign(dx) * (NW / 2) : b.x;
		const ey = horizontal ? b.y : b.y - Math.sign(dy) * (NH / 2);
		return { d: `M${sx},${sy} L${ex},${ey}`, mx: (sx + ex) / 2, my: (sy + ey) / 2 };
	}
</script>

<figure class="capstone-diagram" class:compact>
	<div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
		<svg viewBox="0 0 {W} {H}" class="block w-full {compact ? 'min-w-[640px]' : 'min-w-[760px]'}" role="img" aria-label="Capstone system diagram">
			<defs>
				<marker id="cap-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
					<path d="M0,0 L10,5 L0,10 z" fill="#475569" />
				</marker>
			</defs>

			<!-- Lanes -->
			<rect x="5" y="20" width="680" height="170" rx="12" fill="#f8717110" stroke="#f8717130" stroke-dasharray="4 4" />
			<text x="15" y="185" fill="#f87171" font-size="11" font-family="ui-monospace, monospace" opacity="0.8">decision path: under 2 seconds</text>
			<rect x="5" y="215" width="890" height="80" rx="12" fill="#38bdf810" stroke="#38bdf830" stroke-dasharray="4 4" />
			<text x="15" y="290" fill="#38bdf8" font-size="11" font-family="ui-monospace, monospace" opacity="0.8">batch path: hourly, eventually consistent</text>

			{#each diagramEdges as [from, to, label] (`${from}-${to}`)}
				{@const a = byId.get(from)!}
				{@const b = byId.get(to)!}
				{@const e = edgePath(a, b)}
				{@const lit = (doneSet.has(from) || currentSet.has(from)) && (doneSet.has(to) || currentSet.has(to))}
				<path d={e.d} stroke={lit ? '#94a3b8' : '#1e293b'} stroke-width={lit ? 1.8 : 1.2} fill="none" marker-end="url(#cap-arrow)" />
				{#if label && !compact}
					<text x={e.mx} y={e.my - 4} text-anchor="middle" fill={lit ? '#94a3b8' : '#334155'} font-size="9.5" font-family="ui-monospace, monospace">{label}</text>
				{/if}
			{/each}

			{#each diagramNodes as n (n.id)}
				{@const s = state(n.id)}
				<g class="node" data-node={n.id} data-state={s} transform="translate({n.x - NW / 2},{n.y - NH / 2})">
					<rect
						width={NW}
						height={NH}
						rx="8"
						fill={s === 'todo' ? '#0b1220' : '#0f172a'}
						stroke={s === 'current' ? '#fbbf24' : s === 'done' ? pathColor[n.path] : '#1e293b'}
						stroke-width={s === 'current' ? 2.5 : 1.4}
						opacity={s === 'todo' ? 0.55 : 1}
					>
						{#if s === 'current'}<animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.8s" repeatCount="indefinite" />{/if}
					</rect>
					<text x="8" y="18" fill={s === 'todo' ? '#475569' : '#e2e8f0'} font-size="11" font-weight="600">{n.label}</text>
					<text x="8" y="34" fill={s === 'todo' ? '#334155' : '#94a3b8'} font-size="9.5">{n.sub}</text>
					{#if lettersFor(n.id)}
						<text x={NW - 6} y="13" text-anchor="end" fill={s === 'todo' ? '#334155' : '#64748b'} font-size="9" font-family="ui-monospace, monospace">{lettersFor(n.id)}</text>
					{/if}
				</g>
			{/each}
		</svg>
	</div>
	{#if !compact}
		<figcaption class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
			<span><span class="text-amber-300">▢</span> part you're on</span>
			<span><span class="text-slate-300">▢</span> designed in a completed part</span>
			<span><span class="text-slate-600">▢</span> not yet designed</span>
			<span>Letters show which part designs each component.</span>
		</figcaption>
	{/if}
</figure>

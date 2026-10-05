<script lang="ts">
	// Small line chart of 1–5 ratings over attempts (oldest → newest).
	let { series }: { series: { label: string; color: string; values: number[] }[] } = $props();

	const W = 600;
	const H = 160;
	const PAD = { l: 28, r: 10, t: 10, b: 22 };
	const n = $derived(Math.max(...series.map((s) => s.values.length), 1));
	const x = (i: number) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i / (n - 1)) * (W - PAD.l - PAD.r));
	const y = (v: number) => PAD.t + ((5 - v) / 4) * (H - PAD.t - PAD.b);
	const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
</script>

<figure class="trend-chart">
	<svg viewBox="0 0 {W} {H}" class="w-full" role="img" aria-label="Ratings over time">
		{#each [1, 2, 3, 4, 5] as v (v)}
			<line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#1e293b" />
			<text x={PAD.l - 8} y={y(v) + 4} text-anchor="end" fill="#64748b" font-size="11">{v}</text>
		{/each}
		<text x={PAD.l} y={H - 4} fill="#64748b" font-size="11">oldest</text>
		<text x={W - PAD.r} y={H - 4} fill="#64748b" font-size="11" text-anchor="end">newest</text>
		{#each series as s (s.label)}
			<path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2.5" stroke-linejoin="round" />
			{#each s.values as v, i (i)}
				<circle cx={x(i)} cy={y(v)} r="3.5" fill={s.color} />
			{/each}
		{/each}
	</svg>
	<figcaption class="mt-1 flex flex-wrap gap-4 text-xs text-slate-400">
		{#each series as s (s.label)}
			<span class="flex items-center gap-1.5"><span class="h-2 w-4 rounded-full" style="background:{s.color}"></span>{s.label}</span>
		{/each}
	</figcaption>
</figure>

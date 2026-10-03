<script lang="ts">
	import { actionMeta, type RtbfScenario } from '#lib/data/rtbf-scenarios.ts';

	let {
		scenario,
		step,
		playing,
		onstep,
		ontoggleplay,
		onclose
	}: {
		scenario: RtbfScenario;
		step: number;
		playing: boolean;
		onstep: (i: number) => void;
		ontoggleplay: () => void;
		onclose: () => void;
	} = $props();

	const done = $derived(step >= scenario.steps.length - 1);
</script>

<aside class="rtbf-panel mt-4 rounded-xl border border-fuchsia-900/60 bg-slate-900/80 p-4" aria-live="polite">
	<div class="mb-3 flex flex-wrap items-start justify-between gap-3">
		<div class="max-w-3xl">
			<p class="font-mono text-xs tracking-widest text-fuchsia-400/90 uppercase">Right to erasure · trace</p>
			<h3 class="text-lg font-semibold text-slate-100">{scenario.customer}: {scenario.situation}</h3>
			<p class="mt-1 text-sm text-slate-400"><span class="text-slate-300">Legal position:</span> {scenario.legalPosition}</p>
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				class="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40"
				disabled={step <= 0}
				onclick={() => onstep(step - 1)}>◂ Back</button
			>
			<button
				type="button"
				class="rounded-md border border-fuchsia-800 px-2.5 py-1 text-xs text-fuchsia-200 hover:border-fuchsia-500"
				onclick={ontoggleplay}>{playing ? '❚❚ Pause' : done ? '↺ Replay' : '▶ Play'}</button
			>
			<button
				type="button"
				class="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40"
				disabled={done}
				onclick={() => onstep(step + 1)}>Next ▸</button
			>
			<button
				type="button"
				class="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500"
				onclick={onclose}>Close ✕</button
			>
		</div>
	</div>

	<div class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
		{#each Object.entries(actionMeta) as [key, a] (key)}
			<span class="flex items-center gap-1.5 text-slate-400"
				><span class="h-2 w-2 rounded-sm" style="background:{a.color}"></span>{a.label}</span
			>
		{/each}
	</div>

	<ol class="space-y-2">
		{#each scenario.steps as s, i (s.target)}
			<li
				class="trace-step rounded-lg border px-3 py-2 transition-opacity duration-300"
				class:opacity-30={i > step}
				style="border-color:{i === step ? '#c026d3' : '#1e293b'}; background:{i === step ? '#2e10334d' : 'transparent'}"
			>
				<button type="button" class="w-full text-left" onclick={() => onstep(i)}>
					<p class="text-sm font-semibold text-slate-200">
						<span class="mr-2 font-mono text-xs text-slate-500">{String(i + 1).padStart(2, '0')}</span>{s.title}
					</p>
				</button>
				{#if i <= step}
					<ul class="mt-1.5 space-y-1">
						{#each s.items as it, k (k)}
							<li class="flex flex-wrap items-baseline gap-x-2 text-xs">
								<span
									class="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-950"
									style="background:{actionMeta[it.action].color}">{actionMeta[it.action].label}</span
								>
								<code class="text-slate-200">{it.object}</code>
								<span class="text-slate-500">[{it.fields.join(', ')}]</span>
								{#if it.note}<span class="w-full pl-1 text-slate-400 sm:w-auto">— {it.note}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ol>

	{#if done}
		<p class="mt-3 rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
			<span class="font-semibold">Outcome:</span>
			{scenario.outcome}
		</p>
	{/if}
</aside>

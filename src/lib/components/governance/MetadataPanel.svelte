<script lang="ts">
	import { metadataExamples } from '#lib/data/metadata-examples.ts';
	import { stages } from '#lib/data/stages.ts';

	let { stageId, onclose }: { stageId: string; onclose: () => void } = $props();

	const example = $derived(metadataExamples[stageId]);
	const stage = $derived(stages.find((s) => s.id === stageId));

	// Minimal JSON syntax highlighting (escape first, then wrap tokens)
	function highlight(obj: unknown): string {
		const esc = JSON.stringify(obj, null, 2).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return esc.replace(
			/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g,
			(m, str: string | undefined, colon: string | undefined, lit: string | undefined) => {
				if (str) {
					const cls = colon ? 'text-sky-300' : /pii|identifier|personal/i.test(str) ? 'text-rose-300' : 'text-emerald-300';
					return `<span class="${cls}">${str}</span>${colon ?? ''}`;
				}
				if (lit) return `<span class="text-fuchsia-300">${m}</span>`;
				return `<span class="text-amber-300">${m}</span>`;
			}
		);
	}
</script>

{#if example && stage}
	<aside class="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4" aria-label="Metadata example for {stage.label}">
		<div class="mb-2 flex items-start justify-between gap-3">
			<div>
				<p class="font-mono text-xs tracking-widest text-sky-400/80 uppercase">{'{ }'} Metadata · {stage.label}</p>
				<h3 class="text-base font-semibold text-slate-100">{example.title}</h3>
			</div>
			<button
				type="button"
				class="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
				onclick={onclose}>Close ✕</button
			>
		</div>
		<pre
			class="metadata-json max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[12px] leading-relaxed text-slate-400">{@html highlight(
				example.json
			)}</pre>
		<p class="mt-2 text-xs text-slate-500">Illustrative example. Fields like these make lineage, retention and erasure answerable by query rather than by archaeology.</p>
	</aside>
{/if}

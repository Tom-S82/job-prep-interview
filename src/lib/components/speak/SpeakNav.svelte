<script lang="ts">
	import { page } from '$app/state';

	const tabs = [
		{ href: '/speak/score', label: 'Speak & Score' },
		{ href: '/speak/simulation', label: 'Interview Simulation' },
		{ href: '/speak/journal', label: 'Practice Journal' }
	];
	const active = (href: string) => page.url.pathname.startsWith(href);
</script>

<nav class="speak-nav mb-6 flex flex-wrap items-center justify-between gap-3">
	<a href="/speak" class="font-mono text-xs tracking-[0.2em] text-amber-400/80 uppercase hover:text-amber-300">Speaking practice</a>
	<div class="flex flex-wrap gap-1.5">
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class="rounded-full border px-3 py-1 text-xs sm:text-sm {active(t.href)
					? 'border-amber-400 bg-amber-400 text-slate-950'
					: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
				aria-current={active(t.href) ? 'page' : undefined}>{t.label}</a
			>
		{/each}
		<a href="/" class="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-500 hover:text-slate-300 sm:text-sm">Pipeline</a>
	</div>
</nav>

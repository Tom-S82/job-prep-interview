<script lang="ts">
	import { page } from '$app/state';

	// One header nav for the pipeline-style pages. The current page's link is shown as active.
	const links = [
		{
			href: '/',
			label: 'Track 1: Data Pipeline',
			tone: 'border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
		},
		{
			href: '/decisioning-pipeline',
			label: 'Track 2: Decisioning →',
			tone: 'border-cyan-500/50 text-cyan-200 hover:border-cyan-400 hover:text-cyan-100'
		},
		{
			href: '/reports',
			label: 'Report Standards →',
			tone: 'border-teal-500/50 text-teal-200 hover:border-teal-400 hover:text-teal-100'
		},
		{
			href: '/interview',
			label: 'Interview Mode →',
			tone: 'border-amber-500/50 text-amber-200 hover:border-amber-400 hover:text-amber-100'
		},
		{
			href: '/challenge',
			label: 'Architecture Challenge →',
			tone: 'border-sky-500/50 text-sky-200 hover:border-sky-400 hover:text-sky-100'
		},
		{
			href: '/speak',
			label: 'Speaking Practice →',
			tone: 'border-rose-500/50 text-rose-200 hover:border-rose-400 hover:text-rose-100'
		}
	];
</script>

<nav class="mb-4 flex flex-wrap justify-end gap-2" aria-label="Site">
	{#each links as l (l.href)}
		{@const current = page.url.pathname === l.href}
		<a
			href={l.href}
			class="rounded-md border px-3 py-1.5 text-sm {l.tone} {current ? 'bg-slate-800/80' : ''}"
			aria-current={current ? 'page' : undefined}>{l.label}</a
		>
	{/each}
</nav>

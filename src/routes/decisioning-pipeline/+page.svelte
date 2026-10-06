<script lang="ts">
	import DecisioningPipeline from '#lib/components/DecisioningPipeline.svelte';
</script>

<svelte:head>
	<title>Decisioning Pipeline · Inside the Data Platform</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<nav class="mb-4 flex flex-wrap justify-between gap-2">
			<a
				href="/"
				class="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:border-slate-400 hover:text-white"
				>← Track 1: Data Pipeline</a
			>
			<a
				href="/interview"
				class="rounded-md border border-amber-500/50 px-3 py-1.5 text-sm text-amber-200 hover:border-amber-400 hover:text-amber-100"
				>Interview Mode →</a
			>
		</nav>
		<DecisioningPipeline />
	</div>
</main>

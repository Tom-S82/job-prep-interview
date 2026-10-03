<script lang="ts">
	import Pipeline from '#lib/components/Pipeline.svelte';
</script>

<svelte:head>
	<title>Inside the Data Platform</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<nav class="mb-4 flex justify-end">
			<a
				href="/interview"
				class="rounded-md border border-amber-500/50 px-3 py-1.5 text-sm text-amber-200 hover:border-amber-400 hover:text-amber-100"
				>Interview Mode →</a
			>
		</nav>
		<Pipeline />
	</div>
</main>

<script lang="ts">
	import DecisioningPipeline from '#lib/components/DecisioningPipeline.svelte';
	import SiteNav from '#lib/components/SiteNav.svelte';
</script>

<svelte:head>
	<title>Decisioning Pipeline · Inside the Data Platform</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<SiteNav />
		<DecisioningPipeline />
	</div>
</main>

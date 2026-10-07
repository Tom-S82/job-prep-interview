<script lang="ts">
	import Pipeline from '#lib/components/Pipeline.svelte';
	import SiteNav from '#lib/components/SiteNav.svelte';
</script>

<svelte:head>
	<title>Inside the Data Platform</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<SiteNav />
		<Pipeline />
	</div>
</main>

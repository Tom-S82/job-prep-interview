<script lang="ts">
	import Pipeline from '#lib/components/Pipeline.svelte';
</script>

<svelte:head>
	<title>Inside the Data Platform</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-7xl">
		<nav class="mb-4 flex flex-wrap justify-end gap-2">
			<a
				href="/interview"
				class="rounded-md border border-amber-500/50 px-3 py-1.5 text-sm text-amber-200 hover:border-amber-400 hover:text-amber-100"
				>Interview Mode →</a
			>
			<a
				href="/challenge"
				class="rounded-md border border-sky-500/50 px-3 py-1.5 text-sm text-sky-200 hover:border-sky-400 hover:text-sky-100"
				>Architecture Challenge →</a
			>
			<a
				href="/speak"
				class="rounded-md border border-rose-500/50 px-3 py-1.5 text-sm text-rose-200 hover:border-rose-400 hover:text-rose-100"
				>Speaking Practice →</a
			>
		</nav>
		<Pipeline />
	</div>
</main>

<script lang="ts">
	import { page } from '$app/state';
	import InterviewMode from '#lib/components/InterviewMode.svelte';
</script>

<svelte:head>
	<title>Interview Mode · Inside the Data Platform</title>
</svelte:head>

<main class="min-h-screen bg-slate-950 px-4 py-8 sm:px-8">
	<div class="mx-auto max-w-4xl">
		<InterviewMode initialSet={page.url.searchParams.get('set')} />
	</div>
</main>

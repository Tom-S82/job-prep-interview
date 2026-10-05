<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { SpeechCapture, speechSupport, type RecorderResult } from '#lib/speech/capture.ts';
	import { playBell, playWarning } from '#lib/speech/sound.ts';

	let {
		maxSeconds = 0, // 0 = no limit
		warnSeconds = 60, // chime when this many seconds remain
		allowTyping = true,
		requireSpeech = false, // simulation: typing only if recording is impossible
		label = 'Start speaking',
		compact = false,
		onfinish
	}: {
		maxSeconds?: number;
		warnSeconds?: number;
		allowTyping?: boolean;
		requireSpeech?: boolean;
		label?: string;
		compact?: boolean;
		onfinish: (r: RecorderResult) => void;
	} = $props();

	type Phase = 'idle' | 'recording' | 'processing' | 'fix-transcript' | 'typing';
	let phase = $state<Phase>('idle');
	let support = $state({ record: false, transcribe: false });
	let level = $state(0);
	let live = $state('');
	let elapsed = $state(0);
	let error = $state<string | null>(null);
	let typed = $state('');
	let pending: RecorderResult | null = null;
	let capture: SpeechCapture | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;
	let warned = false;

	const remaining = $derived(maxSeconds ? Math.max(0, maxSeconds - elapsed) : 0);
	const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

	onMount(() => {
		support = speechSupport();
		if (!support.record && allowTyping) phase = 'typing';
	});
	onDestroy(() => {
		if (ticker) clearInterval(ticker);
		capture?.cancel();
	});

	async function start() {
		error = null;
		live = '';
		elapsed = 0;
		warned = false;
		capture = new SpeechCapture({ onLevel: (v) => (level = v), onTranscript: (t) => (live = t) });
		try {
			await capture.start();
		} catch (e) {
			capture = null;
			error =
				(e as Error)?.name === 'NotAllowedError'
					? 'Microphone access was blocked. Allow it in your browser settings, or type your answer instead.'
					: 'Could not start the microphone. You can type your answer instead.';
			if (allowTyping) phase = 'typing';
			return;
		}
		phase = 'recording';
		ticker = setInterval(() => {
			elapsed = (capture?.elapsed() ?? 0) / 1000;
			if (maxSeconds && !warned && remaining <= warnSeconds && maxSeconds > warnSeconds) {
				warned = true;
				playWarning();
			}
			if (maxSeconds && elapsed >= maxSeconds) {
				playBell();
				stop();
			}
		}, 200);
	}

	async function stop() {
		if (!capture || phase !== 'recording') return;
		if (ticker) clearInterval(ticker);
		phase = 'processing';
		const r = await capture.stop();
		capture = null;
		level = 0;
		const result: RecorderResult = {
			answer: {
				transcript: r.transcript,
				segments: r.segments,
				pauses: r.pauses,
				durationMs: r.durationMs,
				voiceStart: r.voiceStart,
				voiceEnd: r.voiceEnd,
				typed: false
			},
			blob: r.blob,
			mimeType: r.mimeType
		};
		if (!r.transcript.trim()) {
			// Recorded, but no transcript (unsupported browser or recognition error): let them type it
			pending = result;
			typed = '';
			phase = 'fix-transcript';
			error = r.transcriptionError === 'unsupported'
				? "This browser can't transcribe speech. Your recording and pauses were captured; type roughly what you said to get feedback."
				: 'No speech was transcribed. Type roughly what you said to get feedback (your recording and pauses are kept).';
			return;
		}
		phase = 'idle';
		onfinish(result);
	}

	function submitTyped() {
		const text = typed.trim();
		if (text.length < 10) return;
		if (phase === 'fix-transcript' && pending) {
			const p = pending;
			pending = null;
			phase = 'idle';
			onfinish({ ...p, answer: { ...p.answer, transcript: text, segments: [] } });
		} else {
			phase = 'idle';
			onfinish({
				answer: { transcript: text, segments: [], pauses: [], durationMs: 0, voiceStart: null, voiceEnd: null, typed: true },
				blob: null,
				mimeType: ''
			});
		}
		typed = '';
	}
</script>

<div class="recorder rounded-2xl border border-slate-800 bg-slate-900/70 {compact ? 'p-3' : 'p-4 sm:p-5'}" data-phase={phase}>
	{#if phase === 'idle'}
		<div class="flex flex-wrap items-center gap-3">
			<button
				type="button"
				class="record-btn flex items-center gap-2 rounded-full bg-rose-500 font-semibold text-white shadow-lg shadow-rose-900/40 hover:bg-rose-400 {compact
					? 'px-4 py-2 text-sm'
					: 'px-6 py-3 text-base'}"
				onclick={start}
				disabled={!support.record}
			>
				<span class="h-3 w-3 rounded-full bg-white"></span>{label}
			</button>
			{#if maxSeconds}<span class="font-mono text-sm text-slate-400">{fmt(maxSeconds)} limit</span>{/if}
			{#if allowTyping && (!requireSpeech || !support.record)}
				<button type="button" class="type-instead text-sm text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline" onclick={() => (phase = 'typing')}
					>Type instead</button
				>
			{/if}
		</div>
		{#if !support.transcribe && support.record}
			<p class="mt-2 text-xs text-amber-300/80">
				This browser can record but not transcribe (try Chrome, Edge or Safari). You'll be asked to type what you said.
			</p>
		{/if}
	{:else if phase === 'recording'}
		<div class="flex flex-wrap items-center gap-4">
			<button
				type="button"
				class="stop-btn flex items-center gap-2 rounded-full border-2 border-rose-500 px-5 py-2.5 font-semibold text-rose-200 hover:bg-rose-500/10"
				onclick={stop}
			>
				<span class="h-3 w-3 rounded-sm bg-rose-500"></span>Stop
			</button>
			<span class="flex items-center gap-2 font-mono text-lg text-slate-100" aria-live="off">
				<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500"></span>
				{maxSeconds ? fmt(remaining) : fmt(elapsed)}
			</span>
			<span class="level h-2 w-28 overflow-hidden rounded-full bg-slate-800" aria-label="Microphone level">
				<span class="block h-full bg-emerald-400 transition-[width] duration-75" style="width:{Math.round(level * 100)}%"></span>
			</span>
			{#if maxSeconds && remaining <= warnSeconds}
				<span class="text-sm text-amber-300">Wrap up</span>
			{/if}
		</div>
		<p class="live-transcript mt-3 min-h-[3rem] text-sm text-slate-300" aria-live="polite">
			{live || (support.transcribe ? 'Listening…' : 'Recording (no live transcript in this browser)…')}
		</p>
	{:else if phase === 'processing'}
		<p class="text-sm text-slate-400">Finishing the transcript…</p>
	{:else}
		<label class="block text-sm text-slate-300" for="typed-answer">
			{phase === 'fix-transcript' ? 'What did you say?' : 'Type your answer the way you would say it (thinking out loud)'}
		</label>
		<textarea
			id="typed-answer"
			class="typed-answer mt-2 w-full rounded-lg border-slate-700 bg-slate-950 text-sm text-slate-100 focus:border-amber-400 focus:ring-amber-400"
			rows="6"
			bind:value={typed}
		></textarea>
		<div class="mt-2 flex flex-wrap items-center gap-3">
			<button
				type="button"
				class="submit-typed rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
				disabled={typed.trim().length < 10}
				onclick={submitTyped}>Get feedback</button
			>
			{#if phase === 'typing' && support.record}
				<button type="button" class="text-sm text-slate-400 hover:text-slate-200" onclick={() => (phase = 'idle')}>Use the microphone instead</button>
			{/if}
			{#if phase === 'typing'}
				<span class="text-xs text-slate-500">Typed answers get no pause or pace feedback.</span>
			{/if}
		</div>
	{/if}
	{#if error}<p class="recorder-error mt-2 text-sm text-amber-300">{error}</p>{/if}
</div>

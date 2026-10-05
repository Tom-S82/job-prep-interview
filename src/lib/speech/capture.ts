// Microphone capture: audio recording (MediaRecorder), pause detection from the audio level
// (Web Audio), and live transcription (Web Speech API, where the browser supports it).
// Browser-only; every capability degrades gracefully.

import type { Pause, SpeechSegment, SpokenAnswer } from './analysis.ts';

export interface CaptureResult extends SpokenAnswer {
	blob: Blob | null;
	mimeType: string;
	transcriptionError: string | null;
}

/** What a recording session hands back to the page. */
export interface RecorderResult {
	answer: SpokenAnswer;
	blob: Blob | null;
	mimeType: string;
}

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib)
interface RecognitionAlternative {
	transcript: string;
}
interface RecognitionResult {
	readonly isFinal: boolean;
	readonly length: number;
	[index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
	resultIndex: number;
	results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	onresult: ((e: RecognitionEvent) => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	onend: (() => void) | null;
	start(): void;
	stop(): void;
	abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupport() {
	const hasWindow = typeof window !== 'undefined';
	return {
		record: hasWindow && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined',
		transcribe: !!recognitionCtor()
	};
}

function pickMimeType(): string {
	for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
		if (MediaRecorder.isTypeSupported?.(t)) return t;
	}
	return '';
}

const MIN_PAUSE_MS = 700;
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

export class SpeechCapture {
	private stream: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private audioCtx: AudioContext | null = null;
	private levelTimer: ReturnType<typeof setInterval> | null = null;
	private recognition: Recognition | null = null;
	private recognising = false;
	private session = 0;
	private interimStarts = new Map<string, number>();
	private finalised = new Set<string>();
	private t0 = 0;
	private recording = false;

	segments: SpeechSegment[] = [];
	pauses: Pause[] = [];
	voiceStart: number | null = null;
	voiceEnd: number | null = null;
	transcriptionError: string | null = null;
	mimeType = '';

	constructor(
		private opts: {
			onLevel?: (level: number) => void; // 0–1, for a live meter
			onTranscript?: (text: string) => void; // final + interim, live
			lang?: string;
			transcribe?: boolean;
		} = {}
	) {}

	elapsed() {
		return this.recording ? performance.now() - this.t0 : 0;
	}

	async start() {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: true, noiseSuppression: true }
		});
		this.t0 = performance.now();
		this.recording = true;

		// 1. Recording
		this.mimeType = pickMimeType();
		this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
		this.mimeType = this.recorder.mimeType || this.mimeType;
		this.chunks = [];
		this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
		this.recorder.start(1000);

		// 2. Level meter + pause detection
		this.startLevelAnalysis(this.stream);

		// 3. Transcription
		if (this.opts.transcribe !== false) this.startRecognition();
	}

	private startLevelAnalysis(stream: MediaStream) {
		try {
			this.audioCtx = new AudioContext();
			const source = this.audioCtx.createMediaStreamSource(stream);
			const analyser = this.audioCtx.createAnalyser();
			analyser.fftSize = 2048;
			source.connect(analyser);
			const buf = new Float32Array(analyser.fftSize);
			const history: number[] = [];
			let silenceStart: number | null = null;
			this.levelTimer = setInterval(() => {
				analyser.getFloatTimeDomainData(buf);
				let sum = 0;
				for (const v of buf) sum += v * v;
				const rms = Math.sqrt(sum / buf.length);
				history.push(rms);
				if (history.length > 300) history.shift();
				// Adaptive threshold: well above the quietest 10% of recent frames (the room's noise floor)
				const floor = [...history].sort((a, b) => a - b)[Math.floor(history.length * 0.1)] ?? 0;
				const threshold = Math.max(0.012, floor * 3);
				const now = this.elapsed();
				const voiced = rms > threshold;
				this.opts.onLevel?.(Math.min(1, rms / 0.2));
				if (voiced) {
					if (this.voiceStart === null) this.voiceStart = now;
					this.voiceEnd = now;
					if (silenceStart !== null && now - silenceStart >= MIN_PAUSE_MS && this.voiceStart < silenceStart) {
						this.pauses.push({ start: silenceStart, end: now });
					}
					silenceStart = null;
				} else if (silenceStart === null) silenceStart = now;
			}, 50);
		} catch {
			// Web Audio unavailable: no pause analysis, recording still works
		}
	}

	private startRecognition() {
		const Ctor = recognitionCtor();
		if (!Ctor) {
			this.transcriptionError = 'unsupported';
			return;
		}
		const rec = new Ctor();
		rec.continuous = true;
		rec.interimResults = true;
		rec.lang = this.opts.lang ?? 'en-GB';
		rec.onresult = (e) => {
			const now = this.elapsed();
			let interim = '';
			for (let i = e.resultIndex; i < e.results.length; i++) {
				const r = e.results[i];
				const key = `${this.session}:${i}`;
				if (!this.interimStarts.has(key)) this.interimStarts.set(key, now);
				const text = (r[0]?.transcript ?? '').trim();
				if (r.isFinal) {
					if (!this.finalised.has(key) && text) {
						this.finalised.add(key);
						this.segments.push({ text, start: this.interimStarts.get(key)!, end: now });
					}
				} else interim += ' ' + text;
			}
			this.opts.onTranscript?.(`${this.transcript()} ${interim}`.trim());
		};
		rec.onerror = (e) => {
			if (FATAL_ERRORS.has(e.error)) {
				this.transcriptionError = e.error;
				this.recognising = false;
			}
		};
		rec.onend = () => {
			// Chrome ends recognition after silences or ~60 s; restart while we are still recording
			if (this.recording && this.recognising) {
				this.session++;
				setTimeout(() => {
					try {
						if (this.recording && this.recognising) rec.start();
					} catch {
						/* already started */
					}
				}, 100);
			}
		};
		this.recognition = rec;
		this.recognising = true;
		try {
			rec.start();
		} catch (err) {
			this.transcriptionError = String(err);
			this.recognising = false;
		}
	}

	transcript() {
		return this.segments.map((s) => s.text).join(' ');
	}

	async stop(): Promise<CaptureResult> {
		const durationMs = this.elapsed();
		this.recording = false;

		// Give the recogniser a moment to deliver final results
		if (this.recognition && this.recognising) {
			this.recognising = false;
			await new Promise<void>((resolve) => {
				const rec = this.recognition!;
				const done = () => resolve();
				rec.onend = done;
				setTimeout(done, 1500);
				try {
					rec.stop();
				} catch {
					done();
				}
			});
		}

		if (this.levelTimer) clearInterval(this.levelTimer);
		await this.audioCtx?.close().catch(() => {});

		const blob = await new Promise<Blob | null>((resolve) => {
			if (!this.recorder || this.recorder.state === 'inactive') return resolve(null);
			this.recorder.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: this.mimeType || 'audio/webm' }) : null);
			this.recorder.stop();
		});
		this.stream?.getTracks().forEach((t) => t.stop());

		return {
			transcript: this.transcript(),
			segments: this.segments,
			pauses: this.pauses,
			durationMs,
			voiceStart: this.voiceStart,
			voiceEnd: this.voiceEnd,
			typed: false,
			blob,
			mimeType: this.mimeType,
			transcriptionError: this.transcriptionError
		};
	}

	/** Abandon without producing a result (e.g. navigating away). */
	cancel() {
		this.recording = false;
		this.recognising = false;
		try {
			this.recognition?.abort();
		} catch {
			/* ignore */
		}
		if (this.levelTimer) clearInterval(this.levelTimer);
		this.audioCtx?.close().catch(() => {});
		try {
			if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
		} catch {
			/* ignore */
		}
		this.stream?.getTracks().forEach((t) => t.stop());
	}
}

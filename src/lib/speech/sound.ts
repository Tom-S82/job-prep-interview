// Small audio helpers: the end-of-time bell, a one-minute warning chime, and text-to-speech
// for hearing the Lead's answer. Browser-only, and every call is safe if audio is unavailable.

function tone(freqs: number[], seconds: number, volume = 0.25) {
	try {
		const ctx = new AudioContext();
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(volume, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
		gain.connect(ctx.destination);
		for (const f of freqs) {
			const osc = ctx.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = f;
			osc.connect(gain);
			osc.start();
			osc.stop(ctx.currentTime + seconds);
		}
		setTimeout(() => ctx.close().catch(() => {}), seconds * 1000 + 200);
	} catch {
		// no audio output available
	}
}

/** A bell: two harmonics with a long decay. */
export const playBell = () => tone([880, 1320, 1760], 2.2, 0.3);

/** A soft single chime for "one minute left". */
export const playWarning = () => tone([660], 0.6, 0.15);

export function ttsSupported() {
	return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Read text aloud with a British English voice where available. Returns a stop function. */
export function speak(text: string, onend?: () => void): () => void {
	if (!ttsSupported()) {
		onend?.();
		return () => {};
	}
	const synth = window.speechSynthesis;
	synth.cancel();
	const u = new SpeechSynthesisUtterance(text);
	u.lang = 'en-GB';
	u.rate = 1;
	const voice = synth.getVoices().find((v) => v.lang === 'en-GB') ?? synth.getVoices().find((v) => v.lang.startsWith('en'));
	if (voice) u.voice = voice;
	u.onend = () => onend?.();
	u.onerror = () => onend?.();
	synth.speak(u);
	return () => synth.cancel();
}

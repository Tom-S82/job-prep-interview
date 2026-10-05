import { expect, test, type Page } from '@playwright/test';

// Real microphone pipeline with a fake device (Chromium's built-in test tone), plus a scripted
// fake SpeechRecognition so transcription is deterministic.
test.use({
	launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
	permissions: ['microphone']
});

const SCRIPT = [
	'the constraint is the two second budget',
	"so I'd score card events in Lambda on the Kinesis stream",
	'because features must be looked up in milliseconds',
	'the trade-off is running two paths',
	"if the rules needed complex state we'd move to Flink"
];

async function fakeRecognition(page: Page, lines = SCRIPT) {
	await page.addInitScript((script: string[]) => {
		class FakeRecognition {
			continuous = false;
			interimResults = false;
			lang = 'en-GB';
			onresult: ((e: unknown) => void) | null = null;
			onerror: ((e: unknown) => void) | null = null;
			onend: (() => void) | null = null;
			private timer: ReturnType<typeof setInterval> | undefined;
			private results: unknown[] = [];
			private i = 0;
			start() {
				this.timer = setInterval(() => {
					if (this.i >= script.length) return;
					const res = Object.assign([{ transcript: script[this.i++] }], { isFinal: true });
					this.results.push(res);
					this.onresult?.({ resultIndex: this.results.length - 1, results: this.results });
				}, 250);
			}
			stop() {
				clearInterval(this.timer);
				setTimeout(() => this.onend?.(), 20);
			}
			abort() {
				this.stop();
			}
		}
		const w = window as unknown as Record<string, unknown>;
		w.SpeechRecognition = FakeRecognition;
		w.webkitSpeechRecognition = FakeRecognition;
	}, lines);
}

async function open(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeAttached();
}

test('hub reports microphone and transcription support', async ({ page }) => {
	await fakeRecognition(page);
	await open(page, '/speak');
	await expect(page.locator('.mode-card')).toHaveCount(3);
	await expect(page.getByTestId('support-record')).toContainText('✅');
	await expect(page.getByTestId('support-transcribe')).toContainText('✅');
});

test('speak & score: record, transcribe, narrative feedback, playback, journal', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await fakeRecognition(page);
	await open(page, '/speak/score');
	await page.locator('.speak-scenario[data-scenario="fraud"]').click();
	await expect(page).toHaveURL(/s=fraud/);

	await page.locator('.record-btn').click();
	await expect(page.locator('.recorder[data-phase="recording"]')).toBeVisible();
	await expect(page.locator('.live-transcript')).toContainText('Flink', { timeout: 5000 });
	await page.locator('.stop-btn').click();

	const fb = page.locator('.speech-feedback');
	await expect(fb).toBeVisible({ timeout: 10000 });
	for (const k of ['clarity', 'confidence', 'precision', 'leadLike']) {
		await expect(fb.locator(`.rating[data-rating="${k}"] .stars`)).toHaveText(/^[★☆]{5}$/);
	}
	await expect(fb.locator('.rating[data-rating="clarity"]')).toContainText('(');
	await expect(fb.locator('.marker[data-kind="good-opening"]')).toBeVisible();
	await expect(fb.locator('.marker[data-kind="trade-off"]')).toBeVisible();
	await expect(fb.locator('.tips li').first()).toBeVisible();
	await expect(fb.locator('audio.attempt-audio')).toHaveAttribute('src', /^blob:/);
	await expect(fb.locator('.lead-reference')).toContainText('The Lead version');

	await open(page, '/speak/journal');
	await expect(page.getByTestId('journal-total')).toHaveText('1');
	await page.locator('.journal-entry summary').first().click();
	await expect(page.locator('.journal-entry')).toContainText('two second budget');
	await page.locator('.load-audio').click();
	await expect(page.locator('.journal-entry audio')).toHaveAttribute('src', /^blob:/);
	expect(errors).toEqual([]);
});

test('typed fallback: thinking out loud by typing still gets articulation feedback', async ({ page }) => {
	await open(page, '/speak/score?s=gdpr-erasure');
	await page.locator('.type-instead').click();
	await page
		.locator('.typed-answer')
		.fill("Maybe we'd just delete everything, it's basically best practice and fully compliant and stuff.");
	await page.locator('.submit-typed').click();
	const fb = page.locator('.speech-feedback');
	await expect(fb).toBeVisible();
	await expect(fb).toContainText('Typed answer');
	await expect(fb.locator('.rating[data-rating="precision"] .stars')).toHaveAttribute('data-stars', /^[12]$/);
	await expect(fb.locator('.tips')).toContainText('constraint');
});

test('interview simulation: 3 timed scenarios, auto-stop at time, then review', async ({ page }) => {
	await fakeRecognition(page);
	await open(page, '/speak/simulation?seconds=2');
	await page.locator('button.begin').click();

	for (let i = 0; i < 3; i++) {
		await expect(page.locator('.sim-progress')).toHaveText(`Question ${i + 1} of 3`);
		await page.locator('.record-btn').click(); // "Start answering"
		// No stop click: the bell ends the answer at the time limit
		if (i < 2) {
			await page.locator('button.next-question').click({ timeout: 10000 });
		}
	}

	await expect(page.locator('.sim-summary tbody tr')).toHaveCount(3, { timeout: 10000 });
	await expect(page.locator('.sim-result')).toHaveCount(3);
	await expect(page.locator('.sim-result').first().locator('audio.attempt-audio')).toHaveAttribute('src', /^blob:/);

	await open(page, '/speak/journal');
	await expect(page.getByTestId('journal-total')).toHaveText('3');
	await expect(page.locator('.journal-entry[data-mode="simulation"]')).toHaveCount(3);
});

test('journal shows improvement over time and the weakest scenarios', async ({ page }) => {
	await open(page, '/speak/journal');
	await expect(page.getByTestId('journal-empty')).toBeVisible();
	await page.evaluate(() => {
		const mk = (i: number, scenarioId: string, clarity: number, confidence: number, rambled: boolean) => ({
			id: `seed_${i}`,
			at: new Date(Date.now() - (10 - i) * 86400000).toISOString(),
			mode: 'speak',
			scenarioId,
			typed: false,
			hasRecording: false,
			durationSec: 80,
			words: 200,
			wpm: 150,
			longPauses: 5 - confidence,
			restarts: 1,
			fillers: 0,
			rambled,
			ratings: { clarity, confidence, precision: clarity, leadLike: clarity },
			transcript: 'seeded attempt'
		});
		const entries = [
			mk(1, 'fraud', 2, 2, true),
			mk(2, 'clickstream', 2, 3, true),
			mk(3, 'clickstream', 2, 2, true),
			mk(4, 'fraud', 4, 3, false),
			mk(5, 'gdpr-erasure', 4, 4, false),
			mk(6, 'fraud', 5, 4, false)
		];
		localStorage.setItem('speak-journal-v1', JSON.stringify({ entries, references: {} }));
	});
	await page.reload();
	await expect(page.locator('main[data-ready="true"]')).toBeAttached();
	await expect(page.getByTestId('journal-total')).toHaveText('6');
	await expect(page.locator('.trend-chart path')).toHaveCount(3);
	await expect(page.locator('.improvement')).toContainText('2 → 4.3');
	await expect(page.locator('.weak-scenarios li').first()).toContainText('Mobile app clickstream');
	await expect(page.locator('.weak-scenarios li').first()).toContainText('rambled in 100%');
});

test('speaking pages fit a phone screen', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 760 });
	for (const path of ['/speak', '/speak/score?s=fraud', '/speak/simulation', '/speak/journal']) {
		await open(page, path);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow, path).toBeLessThanOrEqual(0);
	}
});

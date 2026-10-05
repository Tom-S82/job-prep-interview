import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	return errors;
}

test('pipeline answers render bold, not literal **', async ({ page }) => {
	await page.goto('/');
	await page.locator('g.stage[data-stage="ingestion"]').click();
	await page.locator('article summary').first().click();
	const answer = page.locator('article .answer').first();
	await expect(answer.locator('strong').first()).toBeVisible();
	await expect(answer).not.toContainText('**');
});

test('interview mode: three-stage reveal, separate accuracy + confidence, progress persists', async ({ page }) => {
	const errors = trackErrors(page);
	await page.goto('/interview');
	await expect(page.locator('h2.question')).not.toBeEmpty(); // hydrated: question is picked in onMount

	await page.locator('.set-btn', { hasText: 'Ingestion' }).click();
	await expect(page.locator('.set-btn', { hasText: 'Ingestion' })).toHaveAttribute('aria-pressed', 'true');
	const question = page.locator('h2.question');
	await expect(question).not.toBeEmpty();
	// Stage 0: question only
	await expect(page.locator('.key-points')).toHaveCount(0);
	await expect(page.locator('.answer')).toHaveCount(0);

	// Stage 1: key points (3–5 prompts), answer still hidden
	await page.locator('button.advance', { hasText: 'Show key points' }).click();
	const cues = page.locator('.key-points li');
	expect(await cues.count()).toBeGreaterThanOrEqual(3);
	expect(await cues.count()).toBeLessThanOrEqual(5);
	await expect(page.locator('.answer')).toHaveCount(0);

	// Stage 2: model answer with formatting
	await page.locator('button.advance', { hasText: 'Show model answer' }).click();
	const answer = page.locator('.answer');
	await expect(answer.locator('strong').first()).toBeVisible();
	await expect(answer).not.toContainText('**');
	await expect(page.locator('.scoring')).toHaveCount(0);

	// Stage 3: score accuracy and confidence independently
	await page.locator('button.advance', { hasText: 'Score accuracy' }).click();
	await page.locator('button[data-accuracy="close"]').click();
	await expect(page.locator('button[data-accuracy="close"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.progress-row[data-set="ingestion"] .acc')).toHaveText('7%'); // 0.5 of 7
	await expect(page.locator('.progress-row[data-set="ingestion"] .pct')).toHaveText('0%');
	await page.locator('button[data-confidence="green"]').click();
	await expect(page.locator('.progress-row[data-set="ingestion"] .pct')).toHaveText('14%'); // 1 of 7
	await expect(page.locator('.progress-row[data-set="ingestion"] .acc')).toHaveText('7%');

	const first = await question.textContent();
	await page.locator('button.next').click();
	await expect(question).not.toHaveText(first ?? '');
	await expect(page.locator('.answer')).toHaveCount(0);

	await page.reload();
	await expect(page.locator('.progress-row[data-set="ingestion"] .pct')).toHaveText('14%');
	await expect(page.locator('.progress-row[data-set="ingestion"] .acc')).toHaveText('7%');
	expect(errors).toEqual([]);
});

test('stages toggle backwards and forwards (buttons, stepper, keyboard)', async ({ page }) => {
	await page.goto('/interview?set=validation');
	await expect(page.locator('h2.question')).not.toBeEmpty(); // hydrated: question is picked in onMount
	await expect(page.locator('.set-btn', { hasText: 'Validation' })).toHaveAttribute('aria-pressed', 'true');
	const current = page.locator('.stage-pill[aria-current="step"]');

	await page.locator('h2.question').click(); // focus the page, not a button
	await page.keyboard.press('Space');
	await expect(current).toHaveAttribute('data-stage', '1');
	await page.keyboard.press('ArrowRight');
	await expect(current).toHaveAttribute('data-stage', '2');
	await page.keyboard.press('ArrowLeft');
	await expect(current).toHaveAttribute('data-stage', '1');
	await expect(page.locator('.answer')).toHaveCount(0);

	await page.locator('.stage-pill[data-stage="3"]').click();
	await expect(page.locator('.scoring')).toBeVisible();
	await page.locator('h2.question').click();
	await page.keyboard.press('1');
	await expect(page.locator('button[data-accuracy="nailed"]')).toHaveAttribute('aria-pressed', 'true');

	await page.locator('button.back').click();
	await expect(current).toHaveAttribute('data-stage', '2');
	await expect(page.locator('.scoring')).toHaveCount(0);
	await page.locator('.stage-pill[data-stage="0"]').click();
	await expect(page.locator('.key-points')).toHaveCount(0);
	await expect(page.locator('button.back')).toBeDisabled();

	await page.locator('h2.question').click();
	await page.keyboard.press('n');
	await expect(current).toHaveAttribute('data-stage', '0');
});

test('progressiveReveal: false skips the key-points stage', async ({ page }) => {
	await page.goto('/interview?set=terraform');
	await expect(page.locator('h2.question')).not.toBeEmpty(); // hydrated: question is picked in onMount
	const q = page.locator('h2.question');
	for (let i = 0; i < 30; i++) {
		if ((await q.textContent())?.includes('development happens in the console')) break;
		await page.locator('button.next').click();
	}
	await expect(q).toContainText('development happens in the console');
	await expect(page.locator('.stage-pill[data-stage="1"]')).toBeDisabled();
	await page.locator('button.advance', { hasText: 'Show model answer' }).click();
	await expect(page.locator('.answer')).toBeVisible();
	await expect(page.locator('.key-points')).toHaveCount(0);
});

test('back to pipeline and practise link round-trip', async ({ page }) => {
	await page.goto('/');
	await page.locator('g.stage[data-stage="bronze"]').click();
	await page.locator('.practise-link').click();
	await expect(page).toHaveURL(/\/interview\?set=bronze/);
	await expect(page.locator('.set-btn', { hasText: 'Bronze' })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('link', { name: '← Back to pipeline' }).click();
	await expect(page.locator('g.stage')).toHaveCount(8);
});

test('interview mode fits a phone screen', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 760 });
	await page.goto('/interview');
	await expect(page.locator('h2.question')).not.toBeEmpty(); // hydrated: question is picked in onMount
	await page.locator('button.advance').click();
	await page.locator('button.advance').click();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('semantic and consumers stages show 7 real answers in the pipeline', async ({ page }) => {
	await page.goto('/');
	for (const id of ['semantic', 'apis']) {
		const stage = page.locator(`g.stage[data-stage="${id}"]`);
		await stage.click();
		await expect(page.locator('article details')).toHaveCount(7);
		await expect(page.locator('article')).not.toContainText('Model answer coming soon');
		await stage.click();
		await expect(page.locator('article')).toHaveCount(0);
	}
});

test('architecture sets are selectable in interview mode and render inline code', async ({ page }) => {
	await page.goto('/interview?set=semantic');
	await expect(page.locator('h2.question')).not.toBeEmpty();
	await expect(page.locator('.set-btn', { hasText: 'Technology stack' })).toBeVisible();
	await expect(page.locator('.set-btn', { hasText: 'Masking, quarantine & redaction' })).toBeVisible();
	const q = page.locator('h2.question');
	for (let i = 0; i < 30; i++) {
		if ((await q.textContent())?.includes('design the MCP server')) break;
		await page.locator('button.next').click();
	}
	await expect(q).toContainText('design the MCP server');
	await page.locator('.stage-pill[data-stage="2"]').click();
	await expect(page.locator('.answer code').first()).toHaveText('list_metrics');
});

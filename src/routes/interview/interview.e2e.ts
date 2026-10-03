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

test('interview mode: pick stage, reveal formatted answer, rate, next, progress persists', async ({ page }) => {
	const errors = trackErrors(page);
	await page.goto('/interview');

	await page.locator('.set-btn', { hasText: 'Ingestion' }).click();
	await expect(page.locator('.set-btn', { hasText: 'Ingestion' })).toHaveAttribute('aria-pressed', 'true');
	const question = page.locator('h2.question');
	await expect(question).not.toBeEmpty();
	await expect(page.locator('.answer')).toHaveCount(0); // question only until revealed

	await page.locator('button.reveal').click();
	const answer = page.locator('.answer');
	await expect(answer.locator('strong').first()).toBeVisible();
	await expect(answer).not.toContainText('**');

	await page.locator('button[data-confidence="green"]').click();
	await expect(page.locator('button[data-confidence="green"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.progress-row[data-set="ingestion"] .pct')).toHaveText('17%'); // 1 of 6
	await expect(page.getByTestId('overall-progress')).toContainText('1/');

	const first = await question.textContent();
	await page.locator('button.next').click();
	await expect(question).not.toHaveText(first ?? '');
	await expect(page.locator('.answer')).toHaveCount(0);

	await page.reload();
	await expect(page.locator('.progress-row[data-set="ingestion"] .pct')).toHaveText('17%');
	expect(errors).toEqual([]);
});

test('keyboard: space reveals, 2 rates amber, n moves on', async ({ page }) => {
	await page.goto('/interview?set=validation');
	await expect(page.locator('.set-btn', { hasText: 'Validation' })).toHaveAttribute('aria-pressed', 'true');
	await page.locator('h2.question').click();
	await page.keyboard.press('Space');
	await expect(page.locator('.answer')).toBeVisible();
	await page.keyboard.press('2');
	await expect(page.locator('button[data-confidence="amber"]')).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('n');
	await expect(page.locator('.answer')).toHaveCount(0);
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
	await page.locator('button.reveal').click();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

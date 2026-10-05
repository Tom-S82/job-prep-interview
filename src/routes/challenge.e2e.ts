import { expect, test, type Page } from '@playwright/test';

// Attempt History & Progress Journal for the Architecture Challenge

async function open(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeAttached(); // hydrated
}

const WEAK = '- Lambda for fast detection, Spark for investigation';
const STRONG =
	'- The constraint is the 2 second budget, so scoring has to happen on the stream\n' +
	'- Kinesis to Lambda with a DynamoDB feature store, because lookups must take milliseconds\n' +
	'- Every verdict stored with its rule version for audit; rules as versioned config in shadow mode\n' +
	"- The trade-off is two paths to run. If rules needed complex state, we'd move to Flink";

async function submitFraud(page: Page, level1: string, picks: Record<string, string>) {
	await open(page, '/challenge?s=fraud');
	await page.locator('textarea.level1').fill(level1);
	for (const [q, opt] of Object.entries(picks)) {
		await page.locator(`.level2-question[data-question="${q}"] input[value="${opt}"]`).check();
	}
	await page.locator('button.submit').click();
	await expect(page.locator('.challenge-feedback')).toBeVisible();
	await expect(page).toHaveURL(/\?s=fraud&a=ch_/);
}

const BEST = { compute: 'A', features: 'B', verdicts: 'B', rules: 'B' };
const WEAKER = { compute: 'A', features: 'B', verdicts: 'A', rules: 'B' };

test('feedback survives a refresh, and says what the next star needs', async ({ page }) => {
	await submitFraud(page, WEAK, WEAKER);
	await expect(page.locator('.score[data-score="structure"] .next-star')).toContainText('To reach');

	await page.reload();
	await expect(page.locator('main[data-ready="true"]')).toBeAttached();
	await expect(page.locator('.challenge-feedback')).toBeVisible(); // still there after refresh
	await expect(page.locator('.your-level1')).toContainText('Lambda for fast detection');
	await expect(page.locator('.score[data-score="structure"] .next-star')).toContainText('open with the constraint');

	await page.locator('.self-rating button[data-rating="3"]').click();
	await expect(page.locator('.self-rating button[data-rating="3"]')).toHaveAttribute('aria-pressed', 'true');
});

test('attempt history lists, filters, sorts and opens attempts in detail', async ({ page }) => {
	await submitFraud(page, WEAK, WEAKER);
	await submitFraud(page, STRONG, BEST);
	await open(page, '/challenge?s=ssis-migration');
	await page.locator('textarea.level1').fill('- Inventory first, keep the CDC that works, migrate domain by domain');
	for (const q of ['first', 'cdc', 'target', 'cutover']) await page.locator(`.level2-question[data-question="${q}"] input`).first().check();
	await page.locator('button.submit').click();
	await expect(page.locator('.challenge-feedback')).toBeVisible();

	await open(page, '/challenge');
	await page.locator('.challenge-tabs a', { hasText: 'Attempt History' }).click();
	await expect(page).toHaveURL(/view=history/);
	await expect(page.locator('.history-row')).toHaveCount(3);
	await expect(page.locator('.history-row').first()).toContainText('Migrate legacy SSIS'); // newest first

	await page.locator('.filter-scenario').selectOption('fraud');
	await expect(page.locator('.history-row')).toHaveCount(2);
	await page.locator('.filter-sort').selectOption('score');
	const avgs = await page.locator('.row-avg').allTextContents();
	expect(Number(avgs[0])).toBeGreaterThanOrEqual(Number(avgs[1]));

	// The weaker fraud attempt: open it and read why
	await page.locator('.filter-sort').selectOption('newest');
	await page.locator('.history-row').last().click();
	const detail = page.locator('.attempt-detail');
	await expect(detail).toContainText('Real-time fraud warnings');
	await expect(detail.locator('.score-row')).toHaveCount(3);
	await expect(detail.locator('.next-star [data-next="structure"]')).toContainText('open with the constraint');
	await expect(detail.locator('.your-answer')).toContainText('Lambda for fast detection');
	await expect(detail.locator('.your-answer')).toContainText('Q3');
	await expect(detail.locator('.expert-answer')).toContainText('The constraint is');
	await expect(detail.locator('.to-sharpen li').first()).toBeVisible();

	await detail.locator('.back-to-history').click();
	await expect(page.locator('.history-row').first()).toBeVisible();
	await page.locator('.history-row').first().click();
	await page.locator('.attempt-detail .try-again').click();
	await expect(page).toHaveURL(/\?s=/);
	await expect(page.locator('textarea.level1')).toHaveValue(''); // new attempts still work
});

test('progress journal shows per-scenario history, averages and trends', async ({ page }) => {
	await open(page, '/challenge?view=journal');
	await expect(page.getByTestId('journal-empty')).toBeVisible();

	await submitFraud(page, WEAK, WEAKER);
	await submitFraud(page, STRONG, BEST);
	await submitFraud(page, STRONG, BEST);

	await open(page, '/challenge?view=journal');
	const journal = page.locator('.progress-journal');
	await expect(journal.locator('.averages [data-score="structure"]')).toHaveAttribute('data-trend', 'up');
	await expect(journal.locator('.trend-line')).toContainText('Structure ↑');
	await expect(journal.locator('.trend-chart path')).toHaveCount(3);
	const fraud = journal.locator('.journal-scenario[data-scenario="fraud"] li');
	await expect(fraud).toHaveCount(3);
	await expect(fraud.first()).toContainText('Missing:');
	await fraud.first().locator('a').click();
	await expect(page.locator('.attempt-detail')).toBeVisible();
});

test('history and journal fit a phone screen', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 760 });
	await submitFraud(page, WEAK, WEAKER);
	for (const path of ['/challenge?view=history', '/challenge?view=journal']) {
		await open(page, path);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow, path).toBeLessThanOrEqual(0);
	}
});

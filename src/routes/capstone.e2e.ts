import { expect, test, type Page } from '@playwright/test';

// Capstone: the 8-part medallion design challenge inside Architecture Challenge Mode

async function open(page: Page, path: string) {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeAttached(); // hydrated
}

const PART_A_ANSWER =
	'- The constraint is a 2 second decision on a live call, so the decision happens synchronously in an API\n' +
	'- Lambda reads precomputed features from a feature store, then publishes the decision to Kinesis\n' +
	'- Both paths land in Bronze; hourly CDC is idempotent on LSN; they MERGE in Silver\n' +
	"- The trade-off is two paths. If decisions could wait minutes, we'd score from the stream";

test('capstone appears after the scenarios and opens an overview with a diagram and 9 parts', async ({ page }) => {
	await open(page, '/challenge');
	await expect(page.locator('.scenario-card')).toHaveCount(8);
	await expect(page.getByTestId('capstone-card-progress')).toHaveText('0/9 parts');
	await page.locator('.capstone-card').click();
	await expect(page).toHaveURL(/view=capstone/);

	const overview = page.locator('.capstone-overview');
	await expect(overview.locator('.capstone-part')).toHaveCount(9);
	await expect(overview.locator('.capstone-diagram .node')).toHaveCount(18);
	await expect(overview.locator('.capstone-diagram .node[data-state="done"]')).toHaveCount(0);
	await expect(overview).toContainText('Firehose batches records');
});

test('a part teaches first (primer), then challenges, and the diagram builds up', async ({ page }) => {
	await open(page, '/challenge?view=capstone');
	await page.locator('.capstone-start').click();
	await expect(page).toHaveURL(/s=medallion-a-flow/);

	// Part header: stepper and the components this part designs
	await expect(page.locator('.capstone-header[data-part="A"]')).toBeVisible();
	await expect(page.locator('.capstone-stepper a[aria-current="step"]')).toHaveText('A');
	await expect(page.locator('.capstone-header .node[data-node="api"]')).toHaveAttribute('data-state', 'current');

	// Primer teaches before asking
	const primer = page.locator('details.primer');
	await expect(primer).toHaveAttribute('open', '');
	await expect(primer).toContainText('Synchronous vs asynchronous');

	// Answer and submit Part A
	await page.locator('textarea.level1').fill(PART_A_ANSWER);
	for (const [q, o] of Object.entries({ hot: 'B', cdc: 'B', meet: 'B', truth: 'B' })) {
		await page.locator(`.level2-question[data-question="${q}"] input[value="${o}"]`).check();
	}
	await page.locator('#l3-firehose').fill('The decision never waits for Firehose; it lands the event afterwards. The cost is a second path.');
	await page.locator('button.submit').click();
	const fb = page.locator('.challenge-feedback');
	await expect(fb).toBeVisible();
	await expect(fb.locator('.score[data-score="structure"] .value')).toHaveText('5');
	await expect(fb.locator('.verdict[data-verdict="best"]')).toHaveCount(4);

	// Next goes to Part B, not to the main scenarios
	await expect(fb.locator('a.next-scenario')).toHaveAttribute('href', '?s=medallion-b-layout');

	// Overview now shows Part A done and its components lit
	await open(page, '/challenge?view=capstone');
	await expect(page.getByTestId('capstone-progress')).toHaveText('1/9 parts done');
	await expect(page.locator('.capstone-part[data-part="A"]')).toHaveAttribute('data-done', 'true');
	await expect(page.locator('.capstone-overview .node[data-node="kinesis"]')).toHaveAttribute('data-state', 'done');
	await expect(page.locator('.capstone-overview .node[data-node="wlm"]')).toHaveAttribute('data-state', 'todo');
	await expect(page.locator('.capstone-start')).toContainText('Part B');

	// Main scenario progress is unaffected; history can open the capstone attempt
	await open(page, '/challenge');
	await expect(page.getByTestId('challenge-completed')).toHaveText('0/8');
	await expect(page.getByTestId('capstone-card-progress')).toHaveText('1/9 parts');
	await open(page, '/challenge?view=history');
	await page.locator('.history-row').first().click();
	await expect(page.locator('.attempt-detail')).toContainText('A · Data flow');
	await expect(page.locator('.attempt-detail .expert-answer')).toContainText('The constraint is');
});

test('the synthesis part links to spoken practice', async ({ page }) => {
	await open(page, '/challenge?s=medallion-i-synthesis');
	await expect(page.locator('.capstone-header[data-part="I"]')).toBeVisible();
	await expect(page.locator('.capstone-header .node[data-state="done"]')).toHaveCount(18); // whole system shown
	await page.locator('a.speak-synthesis').click();
	await expect(page).toHaveURL(/\/speak\/score\?s=medallion-i-synthesis/);
	await expect(page.locator('main[data-ready="true"]')).toBeAttached();
	await expect(page.locator('h1')).toContainText('Synthesis');
});

test('capstone pages fit a phone screen', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 760 });
	for (const path of ['/challenge?view=capstone', '/challenge?s=medallion-h-fraud-path']) {
		await open(page, path);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow, path).toBeLessThanOrEqual(0);
	}
});

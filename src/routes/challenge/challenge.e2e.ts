import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, path = '/challenge') {
	await page.goto(path);
	await expect(page.locator('main[data-ready="true"]')).toBeAttached(); // hydrated
}

async function fillFraud(page: Page, pick: 'best' | 'weak') {
	await page
		.locator('textarea.level1')
		.fill(
			'- Hot path: stream card events through Kinesis, score with Lambda using a DynamoDB feature store\n' +
				'- Rules as versioned config owned by the fraud team, shadow mode first\n' +
				'- Persist every verdict with rule version for audit; feedback loop on false positives'
		);
	const picks = pick === 'best' ? { compute: 'A', features: 'B', verdicts: 'B', rules: 'B' } : { compute: 'B', features: 'A', verdicts: 'C', rules: 'C' };
	for (const [q, opt] of Object.entries(picks)) {
		await page.locator(`.level2-question[data-question="${q}"] input[value="${opt}"]`).check();
		await page.locator(`#why-${q}`).fill('Because latency and auditability matter here.');
	}
}

test('pick a scenario, answer levels 1–2, see expert feedback', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await open(page);

	await expect(page.locator('.scenario-card')).toHaveCount(8);
	await page.locator('.scenario-card[data-scenario="fraud"]').click();
	await expect(page).toHaveURL(/\?s=fraud/);
	await expect(page.locator('.challenge-form h2')).toHaveText('Real-time fraud warnings');

	const submit = page.locator('button.submit');
	await expect(submit).toBeDisabled();
	await fillFraud(page, 'best');
	await expect(submit).toBeEnabled();
	await submit.click();

	const fb = page.locator('.challenge-feedback');
	await expect(fb).toBeVisible();
	await expect(fb.locator('.your-level1')).toContainText('Kinesis');
	await fb.locator('.expert-level1 summary').click();
	await expect(fb.locator('.expert-level1 strong').first()).toBeVisible(); // markdown rendered
	await expect(fb.locator('.expert-level1')).not.toContainText('**');
	await expect(fb.locator('.verdict[data-verdict="best"]')).toHaveCount(4);
	await expect(fb.locator('.feedback-gaps')).toContainText('No major gaps');
	expect(errors).toEqual([]);
});

test('weak choices are flagged, and you can edit and resubmit', async ({ page }) => {
	await open(page, '/challenge?s=fraud');
	await fillFraud(page, 'weak');
	await page.locator('button.submit').click();

	await expect(page.locator('.verdict[data-verdict="weak"]')).toHaveCount(4);
	await expect(page.locator('.feedback-gaps li')).not.toHaveCount(0);

	await page.locator('button.retry').click();
	await expect(page.locator('textarea.level1')).toHaveValue(/Kinesis/); // answers kept
	await page.locator('.level2-question[data-question="compute"] input[value="A"]').check();
	await page.locator('textarea.level1').press('Control+Enter'); // keyboard submit
	await expect(page.locator('.decision[data-question="compute"] .verdict')).toHaveAttribute('data-verdict', 'best');
});

test('next scenario starts with a fresh form', async ({ page }) => {
	await open(page, '/challenge?s=ssis-migration');
	await page.locator('textarea.level1').fill('- Inventory every package, keep CDC, parallel run and reconcile per domain');
	for (const q of ['first', 'cdc', 'target', 'cutover']) {
		await page.locator(`.level2-question[data-question="${q}"] input`).first().check();
	}
	await page.locator('button.submit').click();
	await page.locator('a.next-scenario').click();
	await expect(page).toHaveURL(/\?s=data-science-24h/);
	await expect(page.locator('.challenge-form h2')).toHaveText('Clean data for a data scientist in 24 hours');
	await expect(page.locator('textarea.level1')).toHaveValue('');
});

test('challenge page fits a phone screen', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 760 });
	await open(page, '/challenge?s=gdpr-erasure');
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test('feedback teaches how to explain: articulation, lead version, phrasing, anti-patterns, junior vs lead', async ({ page }) => {
	await open(page, '/challenge?s=gdpr-erasure');
	await page
		.locator('textarea.level1')
		.fill("- We'd delete all their data, maybe with a script\n- The constraint is the one month deadline\n- Fully compliant and robust");
	for (const q of ['first', 'find', 'archives', 'aggregates']) {
		await page.locator(`.level2-question[data-question="${q}"] input`).first().check();
	}
	await page.locator('#why-first').fill('It is quicker.');
	await page.locator('button.submit').click();

	await expect(page.locator('.artic-sharpen')).toContainText('buried it in point 2');
	await expect(page.locator('.artic-sharpen')).toContainText('You wrote: “The constraint is the one month deadline”');
	await expect(page.locator('.artic-sharpen')).toContainText('fully compliant');
	await expect(page.locator('.artic-gaps')).toContainText("didn't say what your design gives up");
	await expect(page.locator('.lead-explanation')).toContainText('The constraint');
	await expect(page.locator('.lead-explanation')).toContainText('The trade-off');
	await expect(page.locator('.lead-phrases li')).toHaveCount(5);
	await expect(page.locator('.anti-patterns li').first()).toBeVisible();
	await expect(page.locator('.junior-vs-lead')).toContainText('Junior answer');
	await expect(page.locator('.decision[data-question="first"] .lead-says')).toContainText('The constraint is');
});

test('homepage links to the architecture challenge', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('g.stage')).toHaveCount(8);
	await page.getByRole('link', { name: 'Architecture Challenge →' }).click();
	await expect(page).toHaveURL(/\/challenge$/);
	await expect(page.locator('.scenario-card')).toHaveCount(8);
});

import { expect, test } from '@playwright/test';

const URL = '/decisioning-pipeline';

// Expected Lambda output (fraud-scoring/lambda/examples/run_examples.py)
const EXPECTED = [
	{
		value: '0',
		score: '0.40',
		decision: 'approve',
		fired: { new_account: '+0.25', device_new: '+0.15' }
	},
	{
		value: '1',
		score: '1.00',
		decision: 'decline',
		fired: {
			velocity_spike: '+0.35',
			sca_fail: '+0.30',
			new_account: '+0.25',
			device_new: '+0.15',
			location_unusual: '+0.10'
		}
	},
	{
		value: '2',
		score: '0.55',
		decision: 'manual_review',
		fired: { income_consistency: '+0.20', dormant_reactivation: '+0.20', device_new: '+0.15' }
	},
	{ value: '3', score: '0.00', decision: 'approve', fired: {} }
] as const;

test('page renders seven stages and auto-plays the default scenario', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto(URL);
	await expect(page.locator('g.stage')).toHaveCount(8);
	for (const t of [
		'Application',
		'Lambda Scorer',
		'Feature Store',
		'Fraud Rules Config',
		'sync decision (< 200ms)',
		'Decision',
		'Kinesis',
		'Bronze',
		'Silver / Gold'
	]) {
		await expect(page.locator('svg text', { hasText: t }).first()).toBeVisible();
	}
	await expect(page.locator('g.rule')).toHaveCount(7);
	// Default rotation: first application is scored and decided
	await expect(page.locator('[data-testid="decision-badge"]')).toHaveAttribute(
		'data-score',
		'0.40',
		{ timeout: 20_000 }
	);
	expect(errors).toEqual([]);
});

test('scenario picker offers four scenarios plus rotate', async ({ page }) => {
	await page.goto(URL);
	await expect(page.locator('[data-testid="scenario-select"] option')).toHaveCount(5);
	await page.selectOption('[data-testid="scenario-select"]', '2');
	await expect(page.locator('[data-testid="scenario-why"]')).toContainText(
		'Dormant account reactivated'
	);
});

for (const s of EXPECTED) {
	test(`scenario ${Number(s.value) + 1} animates to ${s.score} → ${s.decision}`, async ({
		page
	}) => {
		await page.goto(URL);
		await page.click('button[data-speed="2"]');
		await page.selectOption('[data-testid="scenario-select"]', s.value);

		const score = page.locator('[data-testid="running-score"]');
		await expect(score).toHaveAttribute('data-done', 'true', { timeout: 20_000 });
		await expect(score).toHaveText(s.score);

		// Each rule shows its contribution only if it fired
		for (const rule of [
			'new_account',
			'velocity_spike',
			'device_new',
			'income_consistency',
			'dormant_reactivation',
			'sca_fail',
			'location_unusual'
		]) {
			const row = page.locator(`g.rule[data-rule="${rule}"]`);
			const want = (s.fired as Record<string, string>)[rule];
			if (want) {
				await expect(row).toHaveAttribute('data-state', 'fired');
				await expect(row.locator('[data-contribution]')).toHaveText(want);
			} else {
				await expect(row).not.toHaveAttribute('data-state', 'fired');
			}
		}

		const badge = page.locator('[data-testid="decision-badge"]');
		await expect(badge).toHaveAttribute('data-decision', s.decision, { timeout: 20_000 });
		await expect(badge).toHaveAttribute('data-score', s.score);

		// Detail table agrees with the animation
		await page.locator('g.stage[data-stage="lambda"]').click();
		await expect(page.locator('[data-testid="lambda-total"]')).toContainText(s.score);
	});
}

test('rules fire one at a time, not all at once', async ({ page }) => {
	await page.goto(URL);
	await page.selectOption('[data-testid="scenario-select"]', '1');
	await expect(page.locator('g.rule[data-state="evaluating"]')).toHaveCount(1, { timeout: 5000 });
	await expect(page.locator('g.rule[data-state="pending"]').first()).toBeAttached();
});

test('clickable stages expand and collapse', async ({ page }) => {
	await page.goto(URL);
	const panel = page.locator('[data-testid="stage-panel"]');
	await expect(panel).toHaveCount(0);

	for (const id of [
		'application',
		'lambda',
		'features',
		'rules-config',
		'decision',
		'kinesis',
		'bronze',
		'silver-gold'
	]) {
		await page.locator(`g.stage[data-stage="${id}"]`).click();
		await expect(panel).toHaveAttribute('data-panel', id);
	}
	await page.locator('g.stage[data-stage="decision"]').click();
	await expect(panel).toHaveAttribute('data-panel', 'decision');
	await expect(panel).toContainText('Support staff view');
	await page.locator('g.stage[data-stage="decision"]').click();
	await expect(panel).toHaveCount(0);

	// Keyboard: Enter opens, Escape closes
	await page.locator('g.stage[data-stage="lambda"]').focus();
	await page.keyboard.press('Enter');
	await expect(panel).toHaveAttribute('data-panel', 'lambda');
	await page.locator('h2').click();
	await page.keyboard.press('Escape');
	await expect(panel).toHaveCount(0);
});

test('animation loop runs with no stuck applications', async ({ page }) => {
	await page.goto(URL);
	await page.click('button[data-speed="2"]');
	await page.waitForTimeout(6000);

	const snap = () =>
		page.evaluate(() => {
			const out: Record<string, { x: number; phase: string }> = {};
			document.querySelectorAll<SVGCircleElement>('circle.pt').forEach((el) => {
				const d = (el as unknown as { __data__: { id: number } }).__data__;
				out[d.id] = {
					x: Number(el.getAttribute('cx')),
					phase: el.getAttribute('data-phase') ?? ''
				};
			});
			return out;
		});

	const a = await snap();
	await page.waitForTimeout(1500);
	const b = await snap();
	const flowing = Object.entries(a).filter(
		([id, p]) => p.phase === 'flow' && b[id]?.phase === 'flow'
	);
	for (const [id, p] of flowing) expect(b[id].x, `particle ${id} stuck`).toBeGreaterThan(p.x);

	// Decisions make it all the way into Silver/Gold
	await expect(page.locator('svg text', { hasText: /re-scored: [1-9]/ })).toBeVisible({
		timeout: 15_000
	});
	// Every application currently on the floor exists only once in Lambda
	expect(await page.locator('circle.pt[data-phase="scoring"]').count()).toBeLessThanOrEqual(1);
});

test('pause freezes the floor', async ({ page }) => {
	await page.goto(URL);
	await page.waitForTimeout(1500);
	await page.click('[data-testid="pause"]');
	await page.waitForTimeout(200);
	const before = await page
		.locator('circle.pt')
		.evaluateAll((els) => els.map((e) => e.getAttribute('cx')));
	await page.waitForTimeout(800);
	const after = await page
		.locator('circle.pt')
		.evaluateAll((els) => els.map((e) => e.getAttribute('cx')));
	expect(after).toEqual(before);
});

test('lays out at phone width without page overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(URL);
	await expect(page.locator('g.stage')).toHaveCount(8);
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

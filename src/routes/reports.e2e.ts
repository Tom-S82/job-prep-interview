import { expect, test } from '@playwright/test';

test('two distinct reports, each with a data page then a context page last', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto('/reports');
	await expect(page.locator('[data-testid="key-insight"]')).toContainText('the 2501 is wrong');
	await expect(page.locator('[data-testid="pack-index"] a')).toHaveCount(2);

	const reports = page.locator('[data-testid="report"]');
	await expect(reports).toHaveCount(2);
	await expect(page.locator('[data-testid="report-separator"]')).toHaveCount(1);
	await expect(page.locator('[data-testid="report-separator"]')).toContainText('End of 2501');

	const expected = [
		{
			id: '2501',
			name: '2501 - Fraud Decisioning Summary',
			param: 'Decision date: 2026-10-06',
			owner: 'FinCrime Lead',
			data: 'metric'
		},
		{
			id: '2502',
			name: '2502 - Fraud Operations Forecast & Recommendations',
			param: 'Forecast date: 2026-10-08',
			owner: 'FinCrime Operations Manager',
			data: 'forward-look'
		}
	];
	for (const e of expected) {
		const rep = page.locator(`[data-testid="report"][data-report="${e.id}"]`);
		const pages = rep.locator('[data-testid="report-page"]');
		await expect(pages).toHaveCount(2);
		// Same header on every page; the ID lives only in the title
		await expect(rep.locator('[data-testid="report-title"]')).toHaveText([e.name, e.name]);
		await expect(rep.locator('header').getByText('Report ID', { exact: true })).toHaveCount(0);

		// Data first, context page (purpose + dictionary/lineage tabs) last
		await expect(pages.nth(0).locator(`[data-testid="${e.data}"]`).first()).toBeVisible();
		await expect(pages.nth(0).getByRole('tablist')).toHaveCount(0);
		await expect(pages.nth(1).getByRole('heading', { name: 'Purpose' })).toBeVisible();
		await expect(pages.nth(1).getByRole('tablist')).toBeVisible();

		for (const [i, pg] of [pages.nth(0), pages.nth(1)].entries()) {
			const footer = pg.locator('[data-testid="report-footer"]');
			await expect(footer).toContainText(e.param);
			await expect(footer).toContainText(`Owner: ${e.owner}`);
			await expect(footer).toContainText('Category: 25');
			await expect(footer).toContainText('Last refresh');
			await expect(footer.locator('[data-testid="page-number"]')).toHaveText(`Page ${i + 1} of 2`);
		}
	}

	const metrics = reports.first().locator('[data-testid="metric"]');
	await expect(metrics).toHaveCount(4);
	for (const m of ['Approvals', 'Manual reviews', 'Declines', 'reconciliation']) {
		await expect(metrics.filter({ hasText: m })).toHaveCount(1);
	}
	expect(errors).toEqual([]);
});

test('each context page has its own dictionary and lineage tabs', async ({ page }) => {
	await page.goto('/reports');
	const r1 = page.locator('[data-testid="report"][data-report="2501"]');
	const r2 = page.locator('[data-testid="report"][data-report="2502"]');
	await expect(r1.locator('[data-testid="dictionary"]')).toContainText('reconciled_pct');
	await expect(r2.locator('[data-testid="dictionary"]')).toContainText('forecast_reviews');

	await r1.getByRole('tab', { name: 'Lineage' }).click();
	await expect(r1.getByRole('tab', { name: 'Lineage' })).toHaveAttribute('aria-selected', 'true');
	await expect(r1.locator('[data-testid="lineage"]')).toContainText('gold.decision_summary');
	await expect(r1.locator('[data-testid="dictionary"]')).toHaveCount(0);
	// Tabs are independent per report
	await expect(r2.locator('[data-testid="dictionary"]')).toBeVisible();

	await r2.getByRole('tab', { name: 'Lineage' }).click();
	await expect(r2.locator('[data-testid="lineage"]')).toContainText('ml.review_demand_forecast');
	await expect(r2.locator('[data-testid="lineage"]')).toContainText('silver.wfm_rota');

	// Arrow keys move between tabs
	await page.keyboard.press('ArrowLeft');
	await expect(r2.getByRole('tab', { name: 'Data Dictionary' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
});

test('site nav links to every main page', async ({ page }) => {
	for (const path of ['/', '/decisioning-pipeline', '/reports']) {
		await page.goto(path);
		const nav = page.getByRole('navigation', { name: 'Site' });
		for (const label of [
			'Track 1: Data Pipeline',
			'Track 2: Decisioning →',
			'Report Standards →',
			'Interview Mode →',
			'Architecture Challenge →',
			'Speaking Practice →'
		]) {
			await expect(nav.getByRole('link', { name: label })).toBeVisible();
		}
	}
	await page.goto('/');
	await page.getByRole('link', { name: 'Report Standards →' }).click();
	await expect(page).toHaveURL(/\/reports$/);
});

test('reports page has no horizontal overflow at phone width', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/reports');
	await expect(page.locator('[data-testid="report"]').first()).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth
	);
	expect(overflow).toBeLessThanOrEqual(1);
});

test('hovering an hour dims the other bars and shows a readout', async ({ page }) => {
	await page.goto('/reports');
	const bars = page.locator('[data-testid="hourly-chart"] g.hour-bar');
	await expect(bars).toHaveCount(24);
	await expect(bars.nth(19)).toHaveAttribute('opacity', '1');

	await bars.nth(19).hover();
	await expect(bars.nth(19)).toHaveAttribute('opacity', '1');
	await expect(bars.nth(3)).toHaveAttribute('opacity', '0.5');
	await expect(page.locator('[data-testid="hour-readout"]')).toContainText('19:00');

	await page.mouse.move(0, 0);
	await expect(bars.nth(3)).toHaveAttribute('opacity', '1');
	await expect(page.locator('[data-testid="hour-readout"]')).toHaveCount(0);
});

test('report 2502 shows predictive and prescriptive analytics', async ({ page }) => {
	await page.goto('/reports');
	const p3 = page.locator(
		'[data-testid="report"][data-report="2502"] [data-testid="report-page"][data-page="1"]'
	);
	for (const id of [
		'ai-summary',
		'forecast',
		'drift',
		'rota-recommendation',
		'threshold-optimiser'
	]) {
		await expect(p3.locator(`[data-testid="${id}"]`)).toBeVisible();
	}
	// The recommended rota beats the current one on the review SLA
	const pct = async (id: string) =>
		parseFloat((await p3.locator(`[data-testid="${id}"]`).innerText()).replace('%', ''));
	expect(await pct('sla-recommended')).toBeGreaterThan(await pct('sla-current'));

	// Optimiser moves the thresholds off the live values and reports a saving
	await expect(p3.locator('[data-testid="review-value"]')).toHaveText('0.50');
	await expect(p3.locator('[data-testid="decline-value"]')).toHaveText('0.75');
	await p3.locator('[data-testid="optimise"]').click();
	await expect(p3.locator('[data-testid="optimiser-note"]')).toContainText(
		'Optimal within capacity'
	);
	const moved =
		(await p3.locator('[data-testid="review-value"]').innerText()) !== '0.50' ||
		(await p3.locator('[data-testid="decline-value"]').innerText()) !== '0.75';
	expect(moved).toBe(true);
});

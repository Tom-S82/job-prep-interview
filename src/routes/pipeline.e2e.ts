import { expect, test } from '@playwright/test';

type Snap = Record<string, { x: number; y: number; phase: string }>;

// Snapshot every particle's position keyed by its D3 datum id
async function snapshot(page: import('@playwright/test').Page): Promise<Snap> {
	return page.evaluate(() => {
		const out: Record<string, { x: number; y: number; phase: string }> = {};
		document.querySelectorAll<SVGGraphicsElement>('.pt').forEach((el) => {
			const d = (el as unknown as { __data__: { id: number } }).__data__;
			const b = el.getBoundingClientRect();
			out[d.id] = { x: b.x, y: b.y, phase: el.getAttribute('data-phase') ?? '' };
		});
		return out;
	});
}

test('pipeline renders all stages and three sources', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('g.stage')).toHaveCount(8);
	for (const t of ['SQL Server', 'Kinesis', 'S3 files', 'Power BI', 'Claude · MCP', 'QUARANTINE']) {
		await expect(page.locator('svg text', { hasText: t }).first()).toBeVisible();
	}
});

test('particles flow and gold aggregates appear', async ({ page }) => {
	await page.goto('/');
	await page.waitForTimeout(9000);
	expect(await page.locator('.pt').count()).toBeGreaterThan(10);
	await expect(page.locator('.pt.agg').first()).toBeAttached();
	// Bays show counts only when expanded; check via the return label instead for quarantine
	await expect(page.locator('svg text', { hasText: 'replayed' })).toBeVisible();
});

test('no particle gets stuck', async ({ page }) => {
	await page.goto('/');
	await page.waitForTimeout(4000);
	const a = await snapshot(page);
	await page.waitForTimeout(3000);
	const b = await snapshot(page);
	const stuck = Object.keys(a).filter(
		(id) => b[id] && Math.abs(a[id].x - b[id].x) < 0.5 && Math.abs(a[id].y - b[id].y) < 0.5
	);
	expect(stuck).toEqual([]);
});

test('click expands and collapses a stage; answers reveal', async ({ page }) => {
	await page.goto('/');
	const ingestion = page.locator('g.stage[data-stage="ingestion"]');
	await ingestion.click();
	await expect(page.locator('article h3')).toHaveText('Ingestion');
	await expect(page.locator('article details')).toHaveCount(6);
	await page.locator('article summary').first().click();
	await expect(page.locator('article .answer').first()).toContainText('SSIS');
	await ingestion.click();
	await expect(page.locator('article')).toHaveCount(0);
});

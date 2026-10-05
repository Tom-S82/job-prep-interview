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
	await expect(page.locator('article details')).toHaveCount(7);
	await page.locator('article summary').first().click();
	await expect(page.locator('article .answer').first()).toContainText('SSIS');
	await ingestion.click();
	await expect(page.locator('article')).toHaveCount(0);
});

test('governance lens toggles overlay on and off', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('g.stage')).toHaveCount(8); // hydrated: D3 draws stages in onMount
	const security = page.getByRole('button', { name: 'Security' });
	await security.click();
	await expect(security).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.lens-legend')).toContainText('Security lens');
	await expect(page.locator('.lens-chip text', { hasText: 'Raw · engineers only' })).toBeAttached();
	await page.getByRole('button', { name: 'Lifecycle' }).click();
	await expect(page.locator('.lens-chip text', { hasText: 'Std → IA → Glacier' })).toBeAttached();
	await page.getByRole('button', { name: 'Lifecycle' }).click();
	await expect(page.locator('.lens-legend')).toHaveCount(0);
});

test('metadata icon reveals JSON without toggling the stage', async ({ page }) => {
	await page.goto('/');
	await page.locator('g.stage[data-stage="gold"] .meta-icon').click();
	await expect(page.locator('.metadata-json')).toContainText('s3://tm-platform-gold/');
	await expect(page.locator('.metadata-json')).toContainText('contains_pii');
	await expect(page.locator('article')).toHaveCount(0);
});

test('RTBF scenario can be selected and traced', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('g.stage')).toHaveCount(8); // hydrated: D3 draws stages in onMount
	await page.locator('.rtbf-select').selectOption('closed-hold');
	const panel = page.locator('.rtbf-panel');
	await expect(panel).toContainText('Customer #1177');
	await panel.getByRole('button', { name: /Pause/ }).click();
	for (let i = 0; i < 10; i++) {
		const next = panel.getByRole('button', { name: 'Next ▸' });
		if (await next.isDisabled()) break;
		await next.click();
	}
	await expect(panel).toContainText('Cold storage: Glacier');
	await expect(panel).toContainText('Retain (legal hold)');
	await expect(panel).toContainText('Outcome:');
});

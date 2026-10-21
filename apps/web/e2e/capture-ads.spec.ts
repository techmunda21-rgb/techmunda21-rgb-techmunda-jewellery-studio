import { test } from '@playwright/test';
import path from 'path';
import { signIn } from './helpers';
const OUT = path.resolve(__dirname, '../../../marketing/meta-ads/assets');
/** Not a test: captures real product screenshots for the ad posters (synthetic demo data). Run with CAPTURE_ADS=1. */
test('capture app screenshots for ads', async ({ page }) => {
  test.skip(!process.env.CAPTURE_ADS, 'only when CAPTURE_ADS=1');
  await page.setViewportSize({ width: 1500, height: 940 });
  await signIn(page);
  await page.goto('/crm'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'app-crm.png') });
  await page.goto('/overview'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'app-overview.png') });
  await page.goto('/approvals'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'app-approvals.png') });
});

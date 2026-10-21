import { test, expect } from '@playwright/test';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { signIn } from './helpers';

const sharp = createRequire(path.resolve(__dirname, '../../api/package.json'))('sharp');

test('import the generated catalogue CSV, then upload 12 real-file frames and spin the 360° view', async ({ page }) => {
  await signIn(page, { email: 'owner@alnoor.demo', password: 'Demo@12345' });
  // make the test re-runnable: remove products left by a previous run
  const token = JSON.parse((await page.evaluate(() => localStorage.getItem('tm_session')))!).accessToken;
  const H = { Authorization: `Bearer ${token}` };
  const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
  for (const p of (await (await page.request.get(`${API}/products?pageSize=100`, { headers: H })).json()).data) if (['BG-005', 'ST-006', 'ER-004', 'NK-001', 'PD-009', 'RG-012'].includes(p.sku)) await page.request.delete(`${API}/products/${p.id}`, { headers: H });
  await page.goto('/products');

  // CSV round-trip: the CSV produced alongside the PDF imports cleanly
  await page.getByRole('button', { name: 'Import CSV' }).click();
  const csvPath = path.resolve(__dirname, '../../../docs/catalogue/suvarna-heritage-catalogue.csv');
  await page.getByLabel('Choose CSV file').setInputFiles(csvPath);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByText('6 new')).toBeVisible();
  await expect(page.getByText('22K · 916').first()).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/6 added/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Open Emerald Heritage Necklace/ }).click();
  await expect(page.getByText('71.906 g')).toBeVisible(); // 78.5 g × 916 / 1000
  await expect(page.getByText('Pure metal content', { exact: true })).toBeVisible();

  // 360° frames: 12 test frames (varying colour) uploaded together
  await page.getByRole('tab', { name: /360° view/ }).click();
  await expect(page.getByText('No 360° view yet')).toBeVisible();
  const files = [] as Array<{ name: string; mimeType: string; buffer: Buffer }>;
  for (let k = 0; k < 12; k++) {
    const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 40 + k * 15, g: 20, b: 200 - k * 12 } } }).png().toBuffer();
    files.push({ name: `${String(k + 1).padStart(2, '0')}.png`, mimeType: 'image/png', buffer });
  }
  await page.getByRole('checkbox').check();
  await page.locator('input[type=file][multiple]').setInputFiles(files);
  await expect(page.getByRole('slider', { name: /360 degree view/ })).toBeVisible({ timeout: 30_000 });
  const slider = page.getByRole('slider', { name: /360 degree view/ });
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '2');
  await expect(slider).toHaveAttribute('aria-valuetext', '60 degrees');
  await page.getByRole('button', { name: 'Auto-rotate' }).click();
  await page.waitForTimeout(600);
  expect(Number(await slider.getAttribute('aria-valuenow'))).not.toBe(2);
  if (process.env.SHOTS_DIR) { fs.mkdirSync(process.env.SHOTS_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS_DIR, 'spin.png') }); }
});

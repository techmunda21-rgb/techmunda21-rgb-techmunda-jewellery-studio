import { test, expect } from '@playwright/test';
import path from 'path';
import { signIn } from './helpers';

const CATALOGUE = path.resolve(__dirname, '../../../docs/catalogue/suvarna-heritage-catalogue.pdf');

test('manager imports the design PDF and it shows on the dashboard; viewer sees it but cannot import', async ({ page }) => {
  await signIn(page, { email: 'manager@suvarna.demo', password: process.env.DEMO_PASSWORD ?? 'Demo@12345' });
  const token = JSON.parse((await page.evaluate(() => localStorage.getItem('tm_session')))!).accessToken;
  const H = { Authorization: `Bearer ${token}` };
  const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
  for (const d of (await (await page.request.get(`${API}/showcase`, { headers: H })).json()).data) if (d.title !== 'Suvarna Heritage — Price Catalogue') await page.request.delete(`${API}/showcase/${d.id}`, { headers: H }); else await page.request.post(`${API}/showcase/${d.id}/activate`, { headers: H });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Suvarna Heritage — Price Catalogue' })).toBeVisible(); // seeded showcase
  await page.getByLabel('Choose design PDF').setInputFiles(CATALOGUE);
  await expect(page.getByText('Design PDF added to the dashboard showcase.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'suvarna-heritage-catalogue' })).toBeVisible();
  await expect(page.getByText(/9 pages/)).toBeVisible();
  // headless Chromium has no built-in PDF viewer, so either the embedded <object> or the open-PDF fallback is shown
  await expect(page.locator('object[type="application/pdf"], a:has-text("Open PDF")').first()).toBeAttached();
  await expect(page.getByRole('link', { name: /Open full screen/ })).toHaveAttribute('href', /\/media\/file\//);
  await page.getByRole('button', { name: /All PDFs \(2\)/ }).click();
  await expect(page.getByText('On dashboard')).toBeVisible();
  await page.keyboard.press('Escape');

  // a non-PDF is refused with a clear message
  await page.getByLabel('Choose design PDF').setInputFiles({ name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>nope</html>') });
  await expect(page.getByText('The file is not a PDF')).toBeVisible();
  await page.screenshot({ path: (process.env.SHOTS_DIR ?? '/tmp') + '/showcase.png' });

  // viewer: sees the showcase, no import button
  await page.evaluate(() => localStorage.clear());
  await signIn(page, { email: 'viewer@suvarna.demo', password: process.env.DEMO_PASSWORD ?? 'Demo@12345' });
  await expect(page.getByRole('link', { name: /Open full screen/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Replace PDF|Import design PDF/ })).toHaveCount(0);
});

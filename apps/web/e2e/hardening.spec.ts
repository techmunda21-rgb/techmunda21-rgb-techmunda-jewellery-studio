import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test('web ships a strict CSP, no browser source maps, and the console warning', async ({ page, request }) => {
  const res = await request.get('/login');
  const csp = res.headers()['content-security-policy'];
  expect(csp).toMatch(/frame-ancestors 'none'/);
  expect(csp).toMatch(/object-src http/);
  expect(res.headers()['strict-transport-security']).toBeTruthy();
  expect(res.headers()['x-powered-by']).toBeUndefined();

  // every JS chunk the page loads must have no source map reference (original source is never published)
  const html = await res.text();
  const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]).slice(0, 8);
  expect(chunks.length).toBeGreaterThan(0);
  for (const c of chunks) {
    const js = await (await request.get(c)).text();
    expect(js).not.toMatch(/sourceMappingURL=/);
    expect((await request.get(`${c}.map`)).status()).toBe(404);
  }
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/login');
  await page.waitForTimeout(500);
  expect(logs.join(' ')).toMatch(/Stop!/);
});

test('platform admin sees honest e-mail/OTP readiness and security events; others do not', async ({ page }) => {
  await signIn(page, { email: 'admin@techmunda.demo', password: process.env.DEMO_PASSWORD ?? 'Demo@12345' });
  await page.goto('/settings');
  await expect(page.getByText('Email & OTP readiness')).toBeVisible();
  await expect(page.getByText('Security events')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send test e-mail' })).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, { email: 'owner@suvarna.demo', password: process.env.DEMO_PASSWORD ?? 'Demo@12345' });
  await page.goto('/settings');
  await expect(page.getByText('Privacy & data')).toBeVisible();
  await expect(page.getByText('Email & OTP readiness')).toHaveCount(0);
});

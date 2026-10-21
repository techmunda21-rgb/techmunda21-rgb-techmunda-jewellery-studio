import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { signIn } from './helpers';

/**
 * Visits every screen at three viewports, asserts no horizontal overflow and no console errors,
 * and (when SHOTS_DIR is set) saves screenshots for visual review against the design reference.
 */
const SHOTS = process.env.SHOTS_DIR;
const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'tablet', width: 820, height: 1100 }, { name: 'mobile', width: 390, height: 844 }];
const PUBLIC = [['01-login', '/login'], ['06-enquiry', '/enquiry/suvarna-heritage'], ['14-signup', '/signup'], ['15-privacy', '/legal/privacy'], ['16-terms', '/legal/terms']] as const;
const PAGES = [
  ['02-overview', '/overview', true], ['03-products', '/products', true], ['04-creative-studio', '/creative-studio', true], ['08-crm', '/crm', true], ['09-approvals', '/approvals', true], ['10-leads', '/leads', true], ['11-analytics', '/analytics', true],
  ['12-campaigns', '/campaigns', true], ['13-settings', '/settings', true],
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`responsive: ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    test('all screens render without overflow or console errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource.*(401|404)/.test(m.text()) && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      if (SHOTS) fs.mkdirSync(path.join(SHOTS, vp.name), { recursive: true });

      for (const [name, url] of PUBLIC) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name} @${vp.name} overflows`).toBeLessThanOrEqual(1);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, vp.name, `${name}.png`), fullPage: true });
      }
      await signIn(page);
      for (const [name, url] of PAGES) {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${name} @${vp.name} horizontally overflows by ${overflow}px`).toBeLessThanOrEqual(1);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, vp.name, `${name}.png`), fullPage: true });
      }
      // lead detail + review + draft screens need ids
      const token = JSON.parse(await page.evaluate(() => localStorage.getItem('tm_session')!)).accessToken;
      const api = process.env.API_URL ?? 'http://localhost:4000/api/v1';
      const leads = await (await page.request.get(`${api}/leads?pageSize=50`, { headers: { Authorization: `Bearer ${token}` } })).json();
      const priya = leads.data.find((l: any) => l.contact.name === 'Priya Mehta');
      await page.goto(`/leads/${priya.id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('AI Qualification Result')).toBeVisible();
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, vp.name, '07-lead-qualification.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      const drafts = await (await page.request.get(`${api}/communications/drafts`, { headers: { Authorization: `Bearer ${token}` } })).json();
      await page.goto(`/approvals?draft=${drafts.data[0].id}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Email Draft', { exact: true })).toBeVisible();
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, vp.name, '09-gmail-draft-approval.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      const assets = await (await page.request.get(`${api}/creatives/jobs`, { headers: { Authorization: `Bearer ${token}` } })).json();
      await page.goto(`/creative-studio`);
      await page.waitForLoadState('networkidle');
      await page.getByRole('tab', { name: 'Review & Library' }).click();
      await page.waitForLoadState('networkidle');
      await page.getByRole('button', { name: 'Open in review' }).first().click();
      await expect(page.getByText('Results & Review')).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, vp.name, '05-results-review.png'), fullPage: true });
      void assets;
      expect(errors, errors.join('\n')).toEqual([]);
    });
  });
}

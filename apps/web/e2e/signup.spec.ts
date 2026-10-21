import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const LOG = path.resolve(__dirname, '../../../.logs/api.log');
/** Local-only: the API runs with ALLOW_INSECURE_OTP_CONSOLE=true and prints the code to its log. */
async function otpFor(channel: 'EMAIL' | 'SMS', since: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`[DEV ONLY] ${channel} OTP`));
    const hit = lines.map((l) => ({ t: JSON.parse(l).time as number, m: (JSON.parse(l).msg as string).match(/: (\d{6})$/)?.[1] })).filter((x) => x.t >= since && x.m).pop();
    if (hit) return hit.m!;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('OTP not found in API log');
}

test('signup: consent gates, OTP verification, workspace creation, privacy export and self-deletion', async ({ page }) => {
  const n = Date.now();
  const email = `signup.${n}@example.com`;
  const phone = `+9198${String(n).slice(-8)}`;
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create a demo workspace' }).click();
  await expect(page).toHaveURL(/\/signup/);

  await page.locator('#fullName').fill('Anika Rao');
  await page.locator('#businessName').fill(`Anika Gems ${n}`);
  await page.locator('#email').fill(email);
  await page.locator('#phone').fill(phone);
  await page.locator('#password').fill('Sup3rSecret!x');
  await expect(page.getByRole('checkbox', { name: /Terms of Demo Use/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Privacy Policy/ })).not.toBeChecked();
  await page.getByRole('button', { name: /send verification code/i }).click();
  await expect(page.getByText('You must accept the Terms of Demo Use')).toBeVisible();
  await expect(page.getByText('You must accept the Privacy Policy')).toBeVisible();
  await expect(page.getByLabel('Enter the 6-digit code', { exact: false })).toHaveCount(0);

  await page.getByRole('checkbox', { name: /Terms of Demo Use/ }).check();
  await page.getByRole('checkbox', { name: /Privacy Policy/ }).check();
  const since = Date.now() - 500;
  await page.getByRole('button', { name: /send verification code/i }).click();
  await expect(page.getByRole('heading', { name: 'Verify your details' })).toBeVisible();
  await expect(page.getByText(/a•••@example\.com|s•••@example\.com/)).toBeVisible();

  await page.locator('#otp').fill('000000');
  await page.getByRole('button', { name: /verify & create workspace/i }).click();
  await expect(page.getByText('That code is not correct.')).toBeVisible();

  await page.locator('#otp').fill(await otpFor('EMAIL', since));
  await page.getByRole('button', { name: /verify & create workspace/i }).click();
  await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Anika/ })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('Privacy & data')).toBeVisible();
  await expect(page.getByText(/Auto-deleted/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data' }).click()]);
  const exported = JSON.parse(fs.readFileSync((await download.path())!, 'utf8'));
  expect(exported.users[0].email).toBe(email);
  expect(JSON.stringify(exported)).not.toMatch(/\$2[aby]\$/);

  await page.getByRole('button', { name: 'Delete workspace' }).click();
  await page.locator('#del-pw').fill('Sup3rSecret!x');
  await page.locator('#del-phrase').fill('DELETE MY WORKSPACE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('Sup3rSecret!x');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});

test('legal pages are public and the policy version is shown', async ({ page }) => {
  for (const [url, h] of [['/legal/privacy', 'Privacy Policy'], ['/legal/terms', 'Terms of Demo Use']] as const) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
    await expect(page.getByText(/Version 2026-10-21/)).toBeVisible();
  }
});

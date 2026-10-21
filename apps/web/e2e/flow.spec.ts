import { test, expect } from '@playwright/test';
import { API, signIn } from './helpers';

/** The Day-3 acceptance flow against the real stack (API + Redis worker + Postgres). Gmail is NOT configured here, so Send must be blocked. */
test('enquiry → AI qualification → CRM → draft → approve → send is honestly blocked', async ({ page, request }) => {
  const stamp = Date.now();
  const email = `flow.${stamp}@example.com`;

  // bad credentials show a clear error
  await page.goto('/login');
  await page.locator('#email').fill('owner@suvarna.demo');
  await page.locator('#password').fill('wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();

  // public enquiry: consent is required and unchecked by default
  await page.goto('/enquiry/suvarna-heritage');
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.locator('#name').fill(`Flow Tester ${stamp}`);
  await page.locator('#email').fill(email);
  await page.locator('#productInterest').selectOption('Necklace');
  await page.locator('#budgetRange').selectOption('₹10L – ₹15L');
  await page.locator('#purchaseTimeline').selectOption('Within 1 month');
  await page.locator('#message').fill('Looking for a necklace for my wedding. Would like to book an appointment.');
  await page.waitForTimeout(1800); // human-speed: the instant-submit trap must not fire
  await page.getByRole('button', { name: /submit enquiry/i }).click();
  await expect(page.getByText('consent is required', { exact: false })).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /submit enquiry/i }).click();
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();

  // worker qualifies it (poll the API; the queue is Redis/BullMQ)
  await signIn(page);
  const token = JSON.parse((await page.evaluate(() => localStorage.getItem('tm_session')))!).accessToken;
  const H = { Authorization: `Bearer ${token}` };
  let lead: any;
  await expect.poll(async () => {
    const r = await (await request.get(`${API}/leads?q=${encodeURIComponent(email)}`, { headers: H })).json();
    lead = r.data[0];
    return lead?.leadScore;
  }, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(lead.qualificationSource).toBe('SIMULATED_RULES');
  expect(lead.status).toBe('QUALIFIED');

  // visible in CRM
  await page.goto('/crm');
  await expect(page.getByText(`Flow Tester ${stamp}`).first()).toBeVisible();

  // draft → approve (does not send) → Send is blocked because Gmail is not connected
  await page.goto(`/leads/${lead.id}`);
  await page.getByRole('button', { name: /draft follow-up email/i }).click();
  await expect(page).toHaveURL(/\/approvals\?draft=/);
  await expect(page.getByText('Pending review').first()).toBeVisible();
  await page.getByRole('button', { name: /approve & save to gmail draft/i }).click();
  await expect(page.getByText('Approved (version 1) — not sent')).toBeVisible();
  await expect(page.getByText('Sending is blocked: Gmail is not connected')).toBeVisible();
  await expect(page.getByRole('button', { name: /confirm & send/i })).toBeDisabled();

  // editing invalidates the approval
  await page.getByRole('button', { name: 'Edit Draft' }).click();
  await page.locator('#d-body').fill('Dear Flow, a revised message.\n\nWarm regards');
  await page.getByRole('button', { name: /save & resubmit/i }).click();
  await expect(page.getByText('Pending review').first()).toBeVisible();
  await expect(page.getByText('v2').first()).toBeVisible();

  // the timeline shows the CRM activity
  await page.goto(`/leads/${lead.id}`);
  await expect(page.getByText('Email approved')).toBeVisible();
  await expect(page.getByText('Enquiry received')).toBeVisible();
});

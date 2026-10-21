import { expect, type Page } from '@playwright/test';

export const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
export const OWNER = { email: 'owner@suvarna.demo', password: 'Demo@12345' };

export async function signIn(page: Page, creds = OWNER) {
  await page.goto('/login');
  await page.locator('#email').fill(creds.email);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/overview/);
}

import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('home slider auto-advances, supports controls and pauses', async ({ page }) => {
  await signIn(page);
  await page.goto('/overview');
  const slider = page.getByRole('region', { name: 'Featured jewellery' });
  await expect(slider).toBeVisible();
  const current = () => slider.locator('[aria-current="true"]').getAttribute('aria-label');
  expect(await current()).toBe('Go to slide 1');
  await expect.poll(current, { timeout: 9000 }).toBe('Go to slide 2'); // auto swipe
  await slider.getByRole('button', { name: 'Next slide' }).click();
  expect(await current()).toBe('Go to slide 3');
  await slider.getByRole('button', { name: 'Pause slideshow' }).click();
  await page.waitForTimeout(5500);
  expect(await current()).toBe('Go to slide 3');
  await page.screenshot({ path: '/tmp/claude-0/-home-user/b3d5d689-1c35-5db8-a412-48d219d3f48b/scratchpad/slider.png' });
});

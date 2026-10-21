import { defineConfig } from '@playwright/test';
import fs from 'fs';

// Use a system/pre-installed Chromium when present (CI downloads its own via `playwright install chromium`).
const candidates = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome'];
const executablePath = process.env.CHROMIUM_PATH ?? candidates.find((p) => fs.existsSync(p));

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.WEB_URL ?? 'http://localhost:3000', launchOptions: { executablePath, args: ['--no-sandbox'] }, trace: 'off' },
});

import { defineConfig, devices } from '@playwright/test';

// Needs: the compose stack (API on :3000) and the Next.js client on :4000.
// By default the client dev server is started for you (reused if it is already running).
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // gateway rate limits login/register per IP
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: CLIENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.NO_CLIENT_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        cwd: '../../../client',
        url: CLIENT_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

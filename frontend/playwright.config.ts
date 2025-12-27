/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 300000, // 5 minutes for demo tests with slowMo
  expect: {
    timeout: 30000,
  },
  use: {
    baseURL: process.env.FRONTEND_URL || 'https://d3dijqo3myu4c.cloudfront.net',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on',
    // Slow down for demo visibility
    launchOptions: {
      slowMo: 500,
    },
    // Run in headed mode for demos (set HEADLESS=true to override)
    headless: process.env.HEADLESS === 'true',
    // Viewport size for better visibility
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: undefined,
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  // CI machines are slow to start Electron; one retry absorbs a cold-start timeout.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173'
  },
  webServer: {
    command: 'node server.mjs',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    env: {
      NO_OPEN: '1'
    }
  }
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke coverage for the upload → share-link → download → decrypt path.
 * Starts its own Bun server so CI does not need a separate compose service.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /\.e2e\.ts$/,
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:1443',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'bun run build && bun run prod',
    url: 'http://127.0.0.1:1443/__lbheartbeat__',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NODE_ENV: 'production',
      PORT: '1443',
      BASE_URL: 'http://127.0.0.1:1443',
      REDIS_HOST: 'localhost',
      FILE_DIR: '/tmp/send-e2e'
    }
  }
});

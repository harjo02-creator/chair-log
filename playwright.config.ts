import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (service worker included) served by `vite preview`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/chair-log/',
    serviceWorkers: 'allow',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/chair-log/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});

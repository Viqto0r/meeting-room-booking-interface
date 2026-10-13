import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const external = Boolean(process.env.E2E_BASE_URL)

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  // Scenarios open several pages and wait for 1.5 s latencies.
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    // MSW lives in a Service Worker: it must not be blocked
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: external
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testIgnore: /api-parity/ },
    // `@smoke` only (see grep in smoke.spec.ts via project filter)
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      grep: /@smoke/,
      testIgnore: /api-parity/,
    },
  ],
})

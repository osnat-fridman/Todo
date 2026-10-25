import { defineConfig, devices } from "@playwright/test";

// E2E tests against `vercel dev` and the Supabase Dev project (ADR-11).
// The Dev task table is saved before the run and restored afterwards.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One worker: all tests share the single Dev task list.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3000",
    locale: "he-IL",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 7"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 15"] } },
  ],
  webServer: {
    command: "npx vercel dev --listen 3000",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

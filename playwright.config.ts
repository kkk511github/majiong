import { defineConfig } from "@playwright/test";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "./src/legal-copy";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5178",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Most scenarios start as returning users. legal.e2e.ts explicitly tests first launch.
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:5178", localStorage: [{ name: LEGAL_STORAGE_KEY, value: JSON.stringify({ version: LEGAL_VERSION, acceptedAt: "2026-09-14T00:00:00Z" }) }] }] },
  },
  webServer: {
    command: "tsx tests/account-ui-server.ts",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

import { defineConfig } from "@playwright/test";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "./src/legal-copy";
export default defineConfig({
  testDir: "./tests", testMatch: "web-parity.e2e.ts", workers: 1, timeout: 60000,
  outputDir: "test-results-web-parity",
  use: {
    baseURL: "http://127.0.0.1:5194/play/", viewport: { width: 844, height: 390 },
    screenshot: "only-on-failure", trace: "retain-on-failure",
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:5194", localStorage: [{ name: LEGAL_STORAGE_KEY, value: JSON.stringify({version:LEGAL_VERSION, acceptedAt:"2026-09-19"}) }] }] },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: { command: "tsx tests/web-release-server.ts", url: "http://127.0.0.1:5194/play/", reuseExistingServer: false },
});

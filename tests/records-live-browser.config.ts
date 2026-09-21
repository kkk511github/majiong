import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const node = `'${process.execPath.replace(/'/g, "'\\''")}'`;
export default defineConfig({
  testDir: ".",
  testMatch: "records-live.browser.ts",
  timeout: 30000,
  workers: 1,
  outputDir: "../test-results/records-live",
  use: {
    baseURL: "http://127.0.0.1:5196",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${node} node_modules/vite/bin/vite.js --config tests/records-live-vite.config.ts`,
    cwd: resolve(import.meta.dirname, ".."),
    url: "http://127.0.0.1:5196/tests/previews/records.html",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

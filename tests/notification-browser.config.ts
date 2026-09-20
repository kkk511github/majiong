import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const node = `'${process.execPath.replace(/'/g, "'\\''")}'`;
export default defineConfig({
  testDir: ".",
  testMatch: "notification-center.browser.ts",
  timeout: 20000,
  fullyParallel: false,
  workers: 1,
  outputDir: "../test-results/notification-browser",
  use: {
    baseURL: "http://127.0.0.1:5196",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1100, height: 760 },
  },
  webServer: {
    command: `${node} node_modules/vite/bin/vite.js --config tests/notification-vite.config.ts --port 5196 --strictPort --host 127.0.0.1`,
    cwd: resolve(import.meta.dirname, ".."),
    url: "http://127.0.0.1:5196",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});

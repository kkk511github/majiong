import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const node = `'${process.execPath.replace(/'/g, "'\\''")}'`;
export default defineConfig({
  testDir: ".",
  testMatch: "control-ui.browser.ts",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  outputDir: "../test-results/control-browser",
  use: {
    baseURL: "http://127.0.0.1:5194",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${node} node_modules/vite/bin/vite.js --config vite.control.config.ts --port 5194 --strictPort --host 127.0.0.1`,
    cwd: resolve(import.meta.dirname, ".."),
    url: "http://127.0.0.1:5194",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});

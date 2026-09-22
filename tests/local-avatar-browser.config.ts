import { defineConfig } from "@playwright/test";
import base from "./records-live-browser.config";
const { channel: _channel, ...sharedUse } = base.use ?? {};

export default defineConfig({
  ...base,
  use: sharedUse,
  testMatch: "local-avatar.browser.ts",
  outputDir: "../test-results/local-avatar",
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit", channel: undefined } },
  ],
});

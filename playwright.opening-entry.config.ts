import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const { channel: _channel, ...sharedUse } = base.use ?? {};
export default defineConfig({
  ...base,
  use: { ...sharedUse, viewport: { width: 844, height: 390 } },
  testMatch: ["**/opening-entry.e2e.ts", "**/cocos-loading.e2e.ts"],
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});

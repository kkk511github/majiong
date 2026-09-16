import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const { channel: _channel, ...sharedUse } = base.use!;
export default defineConfig({
  ...base,
  use: sharedUse,
  testMatch: ["**/keyboard.e2e.ts", "**/records-workspace.e2e.ts"],
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit", channel: undefined } },
  ],
});

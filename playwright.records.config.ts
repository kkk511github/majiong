import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const { channel: _channel, ...sharedUse } = base.use ?? {};
export default defineConfig({
  ...base,
  use: sharedUse,
  testMatch: ["**/records-workspace.e2e.ts", "**/replay.e2e.ts"],
  projects: [
    {
      name: "chromium",
      use: { ...sharedUse, browserName: "chromium", channel: "chrome" },
    },
    { name: "webkit", use: { ...sharedUse, browserName: "webkit" } },
  ],
});

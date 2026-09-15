import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: ["**/hand-feedback.e2e.ts", "**/room-voice.e2e.ts"],
  use: { ...base.use, browserName: "webkit", channel: undefined },
});

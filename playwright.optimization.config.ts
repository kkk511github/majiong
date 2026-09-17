import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
const { channel: _channel, ...use } = base.use!;
export default defineConfig({
  ...base,
  use,
  testMatch: [
    "**/win-presentation.e2e.ts",
    "**/deferred-features.e2e.ts",
    "**/cocos-app.e2e.ts",
    "**/cocos-loading.e2e.ts",
    "**/win-hints.e2e.ts",
    "**/records-workspace.e2e.ts",
    "**/audio-recovery.e2e.ts",
    "**/audio-resume.e2e.ts",
    "**/voice.e2e.ts",
    "**/voice-preview.e2e.ts",
    "**/audio-quality.e2e.ts",
    "**/network-resume.e2e.ts",
    "**/music-scenes.e2e.ts",
    "**/replay.e2e.ts",
    "**/replay-win-presentation.e2e.ts",
    "**/table-setup-summary.e2e.ts",
  ],
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});

import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: [
    "**/hand-feedback.e2e.ts",
    "**/home-scroll.e2e.ts",
    "**/voice.e2e.ts",
    "**/compass.e2e.ts",
    "**/motion.e2e.ts",
    "**/pung-effect.e2e.ts",
    "**/audio-quality.e2e.ts",
    "**/audio-resume.e2e.ts",
    "**/music-scenes.e2e.ts",
  ],
  use: { ...base.use, browserName: "webkit", channel: undefined },
});

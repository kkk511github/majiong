import { defineConfig } from "@playwright/test";
import base from "./playwright.cocos-release.config";

export default defineConfig({
  ...base,
  testMatch: ["**/nanjing-rules.e2e.ts", "**/external-records.e2e.ts"],
});

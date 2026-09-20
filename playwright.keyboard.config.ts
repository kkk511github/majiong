import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "./playwright.config";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "./src/legal-copy";

process.env.MAHJONG_E2E_DATABASE ??= resolve("output/phrases-only-build64/keyboard-e2e.sqlite");
process.env.MAHJONG_E2E_API_PORT ??= "8795";
process.env.MAHJONG_E2E_UI_PORT ??= "5182";
const origin = `http://127.0.0.1:${process.env.MAHJONG_E2E_UI_PORT}`;

const { channel: _channel, ...sharedUse } = base.use ?? {};
export default defineConfig({
  ...base,
  outputDir: "./output/phrases-only-build64/keyboard-results",
  use: { ...sharedUse, baseURL: origin,
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: LEGAL_STORAGE_KEY, value: JSON.stringify({ version: LEGAL_VERSION, acceptedAt: "2026-09-20T00:00:00Z" }) }] }] },
  },
  webServer: {
    command: "tsx tests/account-ui-server.ts", url: origin, reuseExistingServer: false, timeout: 30000,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)) as Record<string, string>, VITE_GAME_SERVER_URL: origin },
  },
  testMatch: ["**/keyboard.e2e.ts"],
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});

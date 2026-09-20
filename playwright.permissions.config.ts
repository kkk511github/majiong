import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "./playwright.config";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "./src/legal-copy";

process.env.MAHJONG_E2E_DATABASE = resolve("../../work/table-permissions-e2e.sqlite");
process.env.MAHJONG_E2E_API_PORT = "8896";
process.env.MAHJONG_E2E_UI_PORT = "5296";
const baseURL = "http://127.0.0.1:5296";

export default defineConfig({
  ...base,
  testMatch: "permissions.e2e.ts",
  outputDir: "test-results/table-permissions",
  use: {
    ...base.use,
    baseURL,
    storageState: {
      cookies: [],
      origins: [{
        origin: baseURL,
        localStorage: [{
          name: LEGAL_STORAGE_KEY,
          value: JSON.stringify({ version: LEGAL_VERSION, acceptedAt: "2026-09-20T00:00:00Z" }),
        }],
      }],
    },
  },
  webServer: {
    command: "tsx tests/account-ui-server.ts",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});

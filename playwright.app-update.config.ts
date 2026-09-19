import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const { channel: _channel, ...sharedUse } = base.use ?? {};
const sharedServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;
if (!sharedServer) throw new Error("App update UI tests require the account fixture server");
export default defineConfig({
  ...base,
  testMatch: ["**/app-update.e2e.ts"],
  use: { ...sharedUse, viewport: { width: 844, height: 390 } },
  // A native platform needs an explicit service URL. Keep every game/account
  // request on the fixture server, never the production native destination.
  webServer: {
    ...sharedServer,
    env: { ...process.env, VITE_GAME_SERVER_URL: "http://127.0.0.1:5178" },
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});

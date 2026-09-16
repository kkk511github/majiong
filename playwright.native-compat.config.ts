import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/native-compat.e2e.ts",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:5186", viewport: { width: 1280, height: 720 } },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: { command: "vite preview --host 127.0.0.1 --port 5186 --strictPort", url: "http://127.0.0.1:5186", reuseExistingServer: false },
});

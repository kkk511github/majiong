import { defineConfig, mergeConfig } from "vite";
import { resolve } from "node:path";
import main from "../vite.config";

export default defineConfig(async (environment) =>
  mergeConfig(typeof main === "function" ? await main(environment) : main, {
    cacheDir: resolve(process.cwd(), "node_modules/.vite-records-live"),
    define: { "import.meta.env.VITE_GAME_SERVER_URL": JSON.stringify("") },
    server: { host: "127.0.0.1", port: 5196, strictPort: true },
  }),
);

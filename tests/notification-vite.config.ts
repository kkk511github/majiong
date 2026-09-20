import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
export default defineConfig({
  root,
  cacheDir: resolve(root, "node_modules/.vite-notification-browser"),
  plugins: [react()],
});

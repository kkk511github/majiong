import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    root: resolve(process.cwd(), "control"),
    base: command === "build" ? "/manage/" : "/",
    publicDir: false,
    plugins: [react()],
    define: { "import.meta.env.VITE_CONTROL_API_BASE": JSON.stringify(env.VITE_CONTROL_API_BASE || (command === "build" ? "/mahjong/api/control" : "/api/control")) },
    server: { host: "127.0.0.1", port: 5182, strictPort: true, fs: { allow: [process.cwd()] },
      proxy: { "/api": process.env.VITE_API_TARGET ?? "http://127.0.0.1:8787" } },
    build: { outDir: resolve(process.cwd(), "dist-control"), emptyOutDir: true, sourcemap: false,
      rollupOptions: { output: { manualChunks(id) { if (id.includes("node_modules")) return "vendor"; } } } },
  };
});

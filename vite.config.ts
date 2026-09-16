import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { auditNativeWeb, protectClientCode, protectNativeTable } from "./scripts/native-security";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build") {
    if (mode === "native" && !env.VITE_GAME_SERVER_URL)
      throw new Error("Native builds require an HTTPS game service.");
    if (env.VITE_GAME_SERVER_URL) {
      const endpoint = new URL(env.VITE_GAME_SERVER_URL);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error(
          "The production game service must use HTTPS without embedded credentials, query parameters or fragments.",
        );
    }
  }
  return {
    plugins: [react(), {
      name: "protect-native-code",
      apply: "build",
      enforce: "post",
      renderChunk(code, chunk) {
        if (mode !== "native" || chunk.name === "vendor") return null;
        return { code: protectClientCode(code), map: null };
      },
      async writeBundle(options) {
        if (mode !== "native") return;
        const root = resolve(options.dir ?? "dist");
        await protectNativeTable(root);
        const files = await auditNativeWeb(root, env.VITE_GAME_SERVER_URL);
        console.log(`Native security audit: ${files} web files passed (network destination remains observable).`);
      },
    }],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/ws": {
          target: (
            process.env.VITE_API_TARGET ?? "http://127.0.0.1:8787"
          ).replace(/^http/, "ws"),
          ws: true,
        },
        "/api": process.env.VITE_API_TARGET ?? "http://127.0.0.1:8787",
      },
    },
    // Production artifacts must not contain recoverable original-source maps.
    build: { sourcemap: false, rollupOptions: { output: { manualChunks(id) { if (id.includes("node_modules")) return "vendor"; } } } },
  };
});

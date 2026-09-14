import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import JavaScriptObfuscator from "javascript-obfuscator";
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
        return { code: JavaScriptObfuscator.obfuscate(code, {
          target: "browser-no-eval", compact: true, sourceMap: false,
          controlFlowFlattening: false, deadCodeInjection: false,
          debugProtection: false, selfDefending: false,
          renameGlobals: false, renameProperties: false,
          stringArray: true, stringArrayThreshold: 1,
          stringArrayEncoding: ["base64"], unicodeEscapeSequence: true,
          identifierNamesGenerator: "hexadecimal",
        }).getObfuscatedCode(), map: null };
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

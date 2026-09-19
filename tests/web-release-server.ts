import { preview } from "vite";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { makeServer } from "../server/service";
import { provisionAdministrator } from "../server/accounts";

const database = resolve("output/web-parity-20260919/test.sqlite");
mkdirSync(resolve("output/web-parity-20260919"), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(database + suffix, { force: true });
const db = new DatabaseSync(database);
await provisionAdministrator(db, { username: "web-admin", password: "Local-web-check-2026", mustChangePassword: false });
db.close();
const api = makeServer({ database, port: 8794, host: "127.0.0.1" });
await api.listen();
const web = await preview({
  configFile: false,
  base: "/play/",
  build: { outDir: process.env.MAHJONG_WEB_BUILD_DIR || "output/web-parity-20260919/web" },
  preview: {
    host: "127.0.0.1", port: 5194, strictPort: true,
    proxy: { "/mahjong": { target: "http://127.0.0.1:8794", ws: true, rewrite: p => p.replace(/^\/mahjong/, "") } },
  },
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => { web.httpServer.close(); void api.close().then(() => process.exit(0)); });

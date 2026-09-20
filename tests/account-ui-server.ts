import { resolve } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { makeServer } from "../server/service";
import { provisionAdministrator } from "../server/accounts";
const file = resolve(process.env.MAHJONG_E2E_DATABASE ?? "../../work/accounts-e2e.sqlite");
mkdirSync(resolve(file, ".."), { recursive: true });
for (const suffix of ["", "-wal", "-shm"])
  rmSync(file + suffix, { force: true });
const db = new DatabaseSync(file);
await provisionAdministrator(db, {
  username: "guanli@1",
  password: "Browser-fixture-password-2026",
  mustChangePassword: false,
});
await provisionAdministrator(db, {
  username: "initial-admin",
  password: "Browser-fixture-password-2026",
});
db.close();
const apiPort = Number(process.env.MAHJONG_E2E_API_PORT ?? 8788);
const uiPort = Number(process.env.MAHJONG_E2E_UI_PORT ?? 5178);
const server = makeServer({ database: file, port: apiPort, host: "127.0.0.1" });
await server.listen();
const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(uiPort)],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_API_TARGET: `http://127.0.0.1:${apiPort}` },
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    vite.kill(signal);
    server.close().then(() => process.exit(0));
  });

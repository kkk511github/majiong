import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WebSocket } from "ws";
const base = process.argv[2]?.replace(/\/$/, "");
if (!base || !/^https:\/\//.test(base))
  throw Error("Usage: tsx scripts/check-auth-service.ts https://host/path");
const health = await fetch(base + "/api/health");
assert.equal(health.status, 200);
const info = await health.json();
const expectedVersion = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
assert.equal(info.version, expectedVersion, "线上服务版本与准备发布的客户端不同，请先同步服务端");
for (const path of ["/api/auth/session", "/api/admin/records", "/api/records", "/api/admin/teams", "/api/admin/members", "/api/admin/points", "/api/admin/points/export", "/api/replays/deployment-probe"])
  assert.equal((await fetch(base + path)).status, 401);
const cors = await fetch(base + "/api/auth/login", {
  method: "OPTIONS",
  headers: {
    Origin: "capacitor://localhost",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Authorization, Content-Type",
  },
});
assert.equal(cors.status, 204);
assert.equal(
  cors.headers.get("access-control-allow-origin"),
  "capacitor://localhost",
);
await new Promise<void>((resolve, reject) => {
  const ws = new WebSocket(base.replace(/^http/, "ws") + "/ws"),
    timer = setTimeout(() => {
      ws.terminate();
      reject(Error("WebSocket handshake timed out"));
    }, 10000);
  ws.once("open", () =>
    ws.send(JSON.stringify({ type: "hello", name: "匿名验收" })),
  );
  ws.once("error", reject);
  ws.once("message", (raw) => {
    try {
      assert.equal(JSON.parse(String(raw)).code, "AUTH_REQUIRED");
      clearTimeout(timer);
      ws.close();
      resolve();
    } catch (error) {
      clearTimeout(timer);
      ws.close();
      reject(error);
    }
  });
});
console.log(
  JSON.stringify(
    {
      ok: true,
      version: info.version,
      backend: base,
      anonymousEndpointsProtected: true,
      nativeCors: true,
      anonymousWebSocketRejected: true,
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);

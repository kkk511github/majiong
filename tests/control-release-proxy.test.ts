import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, request, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createControlReleaseProxy } from "../server/control-release-proxy";
import { AuthError, type AuthSession } from "../server/accounts";

const listen = (server: Server) => new Promise<number>(resolve => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
const close = (server: Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
const session = { id: "control-test-actor", account: { role: "admin" } } as AuthSession;
describe("authenticated management release gateway", () => {
  let folder: string, token: string, hub: Server, gateway: Server, base: string;
  let seen: { url: string; headers: Record<string, unknown>; body: string }[];
  let authorized: boolean, calls: number;
  let waitForAuth: (() => void) | undefined;
  let responseStatus: number, responseBody: string;
  beforeEach(async () => {
    folder = mkdtempSync(join(tmpdir(), "jinling-control-proxy-"));
    token = "d".repeat(64); writeFileSync(join(folder, "token"), token, { mode: 0o600 });
    seen = []; authorized = true; calls = 0; responseStatus = 200; responseBody = JSON.stringify({ current: [], history: [], drafts: [] });
    hub = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(chunk));
      req.on("end", () => {
        seen.push({ url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() });
        res.writeHead(responseStatus, { "Content-Type": "application/json", "Set-Cookie": "private=never-forward" }); res.end(responseBody);
      });
      req.on("error", () => {});
    });
    const upstream = await listen(hub);
    const proxy = createControlReleaseProxy(req => {
      calls++; if (calls >= 2) waitForAuth?.();
      if (!authorized || req.headers.authorization !== "Bearer administrator") throw new AuthError("请登录管理员", 401);
      return session;
    }, { origin: `http://127.0.0.1:${upstream}`, tokenFile: join(folder, "token"), timeoutMs: 1000 });
    gateway = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (!await proxy.handle(req, res, new URL(req.url!, "http://localhost"))) { res.statusCode = 404; res.end("{}"); }
    });
    base = `http://127.0.0.1:${await listen(gateway)}`;
  });
  afterEach(async () => { waitForAuth = undefined; await close(gateway); await close(hub); rmSync(folder, { recursive: true, force: true }); });
  it("rejects unauthenticated list/upload before contacting the hub", async () => {
    expect((await fetch(base + "/api/control/releases")).status).toBe(401);
    expect((await fetch(base + "/api/control/releases/upload?platform=android", { method: "POST", body: "invalid" })).status).toBe(401);
    expect(seen).toHaveLength(0);
  });
  it("forwards only server credentials and strips private upstream response headers", async () => {
    const response = await fetch(base + "/api/control/releases", { headers: { Authorization: "Bearer administrator", Cookie: "user-cookie=secret", "X-Management-Actor": "forged" } });
    expect(response.status).toBe(200); expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ current: [], history: [], drafts: [] });
    expect(seen[0].url).toBe("/internal/control/releases");
    expect(seen[0].headers["x-management-token"]).toBe(token);
    expect(seen[0].headers["x-management-actor"]).toBe(session.id);
    expect(seen[0].headers.authorization).toBeUndefined(); expect(seen[0].headers.cookie).toBeUndefined();
  });
  it("streams a multipart package without changing its bytes", async () => {
    const form = new FormData(); form.set("notes", "新公告功能"); form.set("file", new Blob(["package-content"]), "sample.apk");
    const response = await fetch(base + "/api/control/releases/upload?platform=android", { method: "POST", headers: { Authorization: "Bearer administrator" }, body: form });
    expect(response.status).toBe(200);
    expect(seen).toHaveLength(1); expect(seen[0].url).toBe("/internal/control/releases/upload?platform=android");
    expect(seen[0].body).toContain("新公告功能"); expect(seen[0].body).toContain("package-content");
    expect(Number(seen[0].headers["content-length"])).toBe(Buffer.byteLength(seen[0].body));
  });
  it("forwards only an exact staged release confirmation and discard path", async () => {
    const id = "a".repeat(24), headers = { Authorization: "Bearer administrator", "Content-Type": "application/json" };
    const publish = await fetch(`${base}/api/control/releases/${id}/publish`, {
      method: "POST", headers, body: JSON.stringify({ sha256: "b".repeat(64), build: "68", confirmSameBuild: true }),
    });
    expect(publish.status).toBe(200);
    expect(seen[0]).toMatchObject({ url: `/internal/control/releases/${id}/publish` });
    expect(JSON.parse(seen[0].body)).toEqual({ sha256: "b".repeat(64), build: "68", confirmSameBuild: true });
    const discard = await fetch(`${base}/api/control/releases/${id}/discard`, {
      method: "POST", headers, body: "{}",
    });
    expect(discard.status).toBe(200);
    expect(seen[1]).toMatchObject({ url: `/internal/control/releases/${id}/discard`, body: "{}" });
  });
  it("does not complete an upstream upload after the administrative session is revoked", async () => {
    const authenticated = new Promise<void>(resolve => { waitForAuth = resolve; });
    const body = "--boundary\r\nContent-Disposition: form-data; name=\"notes\"\r\n\r\n" + "x".repeat(256) + "\r\n--boundary--\r\n";
    const result = new Promise<number>((resolve, reject) => {
      const req = request(base + "/api/control/releases/upload?platform=android", { method: "POST", headers: { Authorization: "Bearer administrator", "Content-Type": "multipart/form-data; boundary=boundary", "Content-Length": Buffer.byteLength(body) } }, res => { res.resume(); res.on("end", () => resolve(res.statusCode!)); });
      req.on("error", reject); req.flushHeaders(); req.write(body.slice(0, 60));
      void authenticated.then(() => { authorized = false; req.end(body.slice(60)); });
    });
    expect(await result).toBe(401); expect(seen).toHaveLength(0);
  });
  it("allows only the intended methods, platform, and bounded upload format", async () => {
    const headers = { Authorization: "Bearer administrator" };
    expect((await fetch(base + "/api/control/releases/not-an-id/publish", { method: "POST", headers })).status).toBe(404);
    expect((await fetch(base + "/api/control/releases/upload?platform=other", { method: "POST", headers, body: "abc" })).status).toBe(400);
    expect((await fetch(base + "/api/control/releases/upload?platform=ios", { method: "POST", headers, body: "abc" })).status).toBe(400);
    expect(seen).toHaveLength(0);
  });
  it("does not follow redirects or expose upstream HTML as an admin response", async () => {
    responseStatus = 302; responseBody = "redirect";
    const response = await fetch(base + "/api/control/releases", { headers: { Authorization: "Bearer administrator" } });
    expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain(token);
    responseStatus = 200; responseBody = "<html>bad service</html>";
    expect((await fetch(base + "/api/control/releases", { headers: { Authorization: "Bearer administrator" } })).status).toBe(502);
  });
});

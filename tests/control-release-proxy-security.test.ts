import { afterEach, expect, it } from "vitest";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect, type Socket } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AuthError, type AuthSession } from "../server/accounts";
import { createControlReleaseProxy } from "../server/control-release-proxy";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const listen = (server: Server) =>
  new Promise<number>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as { port: number }).port),
    ),
  );
const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
async function until(predicate: () => boolean, timeout = 1000) {
  const end = Date.now() + timeout;
  while (!predicate() && Date.now() < end) await delay(5);
  return predicate();
}

async function fixture(
  handleHub: (req: IncomingMessage, res: ServerResponse) => void,
  timeoutMs = 1000,
) {
  const dir = mkdtempSync(join(tmpdir(), "control-proxy-security-"));
  writeFileSync(join(dir, "token"), "test-secret-".padEnd(64, "z"), {
    mode: 0o600,
  });
  let authorized = true,
    inputChunks = 0,
    completed = 0;
  const incoming: IncomingMessage[] = [],
    upstream: IncomingMessage[] = [],
    clients: Socket[] = [];
  const hub = createServer((req, res) => {
    upstream.push(req);
    req.on("error", () => {});
    handleHub(req, res);
  });
  const proxy = createControlReleaseProxy(
    () => {
      if (!authorized) throw new AuthError("登录已失效", 401);
      return { id: "review-admin", account: { role: "admin" } } as AuthSession;
    },
    {
      origin: `http://127.0.0.1:${await listen(hub)}`,
      tokenFile: join(dir, "token"),
      timeoutMs,
    },
  );
  const gateway = createServer(async (req, res) => {
    incoming.push(req);
    req.on("data", () => {
      inputChunks++;
    });
    req.on("error", () => {});
    res.setHeader("Content-Type", "application/json");
    await proxy.handle(req, res, new URL(req.url!, "http://localhost"));
    completed++;
  });
  const port = await listen(gateway);
  cleanup.push(async () => {
    for (const client of clients) client.destroy();
    await close(gateway);
    await close(hub);
    rmSync(dir, { recursive: true, force: true });
  });
  async function upload(length: number) {
    const client = connect(port, "127.0.0.1");
    clients.push(client);
    client.on("error", () => {});
    await new Promise<void>((resolve) => client.once("connect", resolve));
    const status = new Promise<number>((resolve, reject) => {
      let response = "";
      const timer = setTimeout(
        () => reject(new Error("No upload response")),
        2500,
      );
      client.on("data", (chunk) => {
        response += chunk.toString();
        const match = /^HTTP\/1\.1 (\d+)/.exec(response);
        if (match) {
          clearTimeout(timer);
          resolve(Number(match[1]));
        }
      });
    });
    client.write(
      `POST /api/control/releases/upload?platform=android HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer review\r\nContent-Type: multipart/form-data; boundary=review\r\nContent-Length: ${length}\r\nConnection: keep-alive\r\n\r\n`,
    );
    return { client, status };
  }
  return {
    upload,
    incoming,
    upstream,
    revoke: () => {
      authorized = false;
    },
    inputChunks: () => inputChunks,
    completed: () => completed,
  };
}

it("multipart完整结束边界后的尾部也必须先通过最终鉴权，hub完整长度门槛禁止提前发布", async () => {
  let bytes = 0,
    published = 0;
  const f = await fixture((req, res) => {
    req.on("data", (chunk) => {
      bytes += chunk.length;
    });
    req.on("end", () => {
      if (bytes !== Number(req.headers["content-length"]))
        return res.writeHead(400).end("{}");
      published++;
      res.writeHead(201).end('{"release":{"id":"fixture"}}');
    });
  });
  const multipart =
    '--review\r\nContent-Disposition: form-data; name="file"; filename="test.apk"\r\n\r\nfixture\r\n--review--\r\n';
  const { client, status } = await f.upload(
    Buffer.byteLength(multipart) + 1024,
  );
  client.write(multipart);
  expect(await until(() => f.inputChunks() >= 1)).toBe(true);
  client.write("x".repeat(512));
  expect(await until(() => f.inputChunks() >= 2)).toBe(true);
  await delay(20);
  expect(published).toBe(0);
  f.revoke();
  client.write("y".repeat(512));
  expect(await status).toBe(401);
  expect(published).toBe(0);
  expect(bytes).toBeLessThan(Buffer.byteLength(multipart) + 1024);
});

it("超过hub的500MiB加multipart上限应在向上游发请求前拒绝", async () => {
  const f = await fixture(
    (_req, res) => res.writeHead(500).end('{"error":"should not reach hub"}'),
    80,
  );
  const { status } = await f.upload(500 * 1024 * 1024 + 65536 + 1);
  expect(await status).toBe(413);
  expect(f.upstream).toHaveLength(0);
});

it("hub提前拒绝后释放未收完的上传管道，不留下暂停的客户端请求", async () => {
  const f = await fixture((_req, res) =>
    res.writeHead(413).end('{"error":"too large"}'),
  );
  const { client, status } = await f.upload(1024 * 1024);
  client.write("a".repeat(32768));
  expect(await until(() => f.inputChunks() >= 1)).toBe(true);
  client.write("b".repeat(32768));
  expect(await status).toBe(413);
  expect(await until(() => f.completed() === 1)).toBe(true);
  client.write("c".repeat(256 * 1024));
  await delay(50);
  const req = f.incoming[0];
  expect(
    req.destroyed || req.readableEnded || req.readableFlowing === true,
  ).toBe(true);
});

it("客户端在上传中断开后同账号可以重新上传，旧upstream关闭", async () => {
  const f = await fixture((req, res) => {
    req.on("data", () => {});
    req.on("end", () => res.writeHead(201).end('{"release":{"id":"new"}}'));
  });
  const first = await f.upload(1024 * 1024);
  // Avoid an unobserved response timeout when intentionally aborting the socket.
  void first.status.catch(() => {});
  first.client.write("a".repeat(32768));
  expect(await until(() => f.inputChunks() >= 1)).toBe(true);
  first.client.write("b".repeat(32768));
  expect(await until(() => f.upstream.length === 1)).toBe(true);
  first.client.destroy();
  expect(
    await until(() => f.completed() === 1 && f.upstream[0].destroyed),
  ).toBe(true);
  const second = await f.upload(10);
  second.client.write("0123456789");
  expect(await second.status).toBe(201);
});

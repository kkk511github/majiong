import { afterEach, expect, it, vi } from "vitest";
import { GameClient } from "../src/game-client";
import type { Account } from "../shared/types";

let client: GameClient | undefined;
afterEach(() => {
  client?.disconnect();
  client = undefined;
  vi.unstubAllGlobals();
});
const account = (id: string): Account => ({
  id,
  username: id,
  name: id,
  role: "member",
  mustChangePassword: false,
});

it("旧公告请求的401不能注销已经换用新token的账号", async () => {
  const values = new Map([["jinling:token", JSON.stringify("old-token")]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  client = new GameClient();
  client.state.account = account("old-member");
  const pending = client.api("/api/announcements");
  expect(fetcher.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer old-token" }));
  values.set("jinling:token", JSON.stringify("new-token"));
  client.state.account = account("new-member");
  finish(
    new Response(JSON.stringify({ error: "旧登录已失效" }), { status: 401 }),
  );
  await expect(pending).rejects.toMatchObject({ status: 401 });
  expect(client.state.account?.id).toBe("new-member");
  expect(client.state.authError).toBe("");
});

it("当前token收到401仍正常退出登录，不能因竞态修复绕过失效处理", async () => {
  const values = new Map([["jinling:token", JSON.stringify("current-token")]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "登录失效" }), { status: 401 }),
    ),
  );
  client = new GameClient();
  client.state.account = account("current-member");
  await expect(client.api("/api/announcements")).rejects.toMatchObject({
    status: 401,
  });
  expect(client.state.account).toBeNull();
  expect(client.state.authError).toContain("登录已失效");
});

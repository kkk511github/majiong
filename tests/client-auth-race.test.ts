import { afterEach, expect, it, vi } from "vitest";
import { GameClient } from "../src/game-client";
import { encodeVoice } from "../shared/room-voice";
import type { Account } from "../shared/types";

let client: GameClient | undefined;
afterEach(() => {
  client?.disconnect();
  client = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const account = (id: string): Account => ({
  id,
  username: id,
  name: id,
  role: "member",
  mustChangePassword: false,
});

function delayed() {
  const values = new Map([["jinling:token", JSON.stringify("old-token")]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  const responses: ((response: Response) => void)[] = [];
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => responses.push(resolve))));
  client = new GameClient(); client.state.account = account("old");
  return { client, responses, switchAccount() { values.set("jinling:token", JSON.stringify("new-token")); client!.state.account = account("new"); } };
}
it.each(['profile', 'avatar'] as const)('旧 %s 成功响应不能覆盖新账号和存储名称', async kind => {
  const p = delayed();
  const pending = kind === 'profile' ? p.client.updateProfile('old-name') : p.client.updateAvatar(null);
  p.switchAccount();
  p.responses[0](new Response(JSON.stringify({ account: { ...account('old'), name: 'old-name' } })));
  await pending;
  expect(p.client.state.account).toEqual(account('new'));
  expect(localStorage.getItem('jinling:name')).toBeNull();
});
it('同账号资料响应颠倒时旧完整资料不能覆盖新资料', async () => {
  const p = delayed();
  const first = p.client.updateProfile('first'), second = p.client.updateProfile('second');
  p.responses[1](new Response(JSON.stringify({ account: { ...account('old'), name: 'second' } })));
  await second;
  p.responses[0](new Response(JSON.stringify({ account: { ...account('old'), name: 'first' } })));
  await first;
  expect(p.client.state.account?.name).toBe('second');
});
it.each([200, 401])('旧会话恢复返回 %s 不得覆盖或清除新token', async status => {
  const p = delayed(); const pending = p.client.restore(); p.switchAccount();
  p.responses[0](new Response(JSON.stringify({ account: account('old'), error: 'expired' }), { status }));
  await pending;
  expect(p.client.state.account?.id).toBe('new');
  expect(JSON.parse(localStorage.getItem('jinling:token')!)).toBe('new-token');
  expect(p.client.state.authError).toBe('');
});
it('旧改密成功不接受新token，也不覆盖新会话的busy状态', async () => {
  const p = delayed(); const pending = p.client.changePassword('before', 'after'); p.switchAccount();
  p.responses[0](new Response(JSON.stringify({ account: account('old'), token: 'password-token' })));
  expect(await pending).toBe(false);
  expect(p.client.state.account?.id).toBe('new');
  expect(JSON.parse(localStorage.getItem('jinling:token')!)).toBe('new-token');
});
it.each([true, false])('改密撤销Socket先于HTTP返回时，成功=%s 仍正确收尾', async success => {
  const p = delayed();
  class Socket {
    static OPEN = 1; static CLOSED = 3; static CLOSING = 2;
    readyState = 1; onclose?: (event: { code: number }) => void;
    send() {} close() { this.readyState = 3; }
  }
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('location', { protocol: 'http:', host: 'localhost' });
  vi.stubGlobal('navigator', { onLine: true });
  p.client.connect('old');
  const socket = (p.client as unknown as { socket: Socket }).socket;
  const pending = p.client.changePassword('before', 'after');
  socket.onclose?.({ code: 4003 });
  p.responses[0](new Response(JSON.stringify(success ? { account: account('old'), token: 'new-password-token' } : { error: 'password failed' }), { status: success ? 200 : 403 }));
  expect(await pending).toBe(success);
  expect(p.client.state.authBusy).toBe(false);
  expect(p.client.state.account?.id ?? null).toBe(success ? 'old' : null);
  if (success) expect(JSON.parse(localStorage.getItem('jinling:token')!)).toBe('new-password-token');
});
it('旧录音401不能踢出新账号', async () => {
  const p = delayed(); p.client.state.mode = 'online'; p.client.state.connected = true;
  p.client.state.view = { id: 'voice-game' } as never;
  const pending = p.client.sendVoice(encodeVoice(new Float32Array(8000), 16000), 'voice-game', new AbortController().signal);
  p.switchAccount(); p.responses[0](new Response(JSON.stringify({ error: 'expired' }), { status: 401 }));
  await expect(pending).rejects.toThrow('expired');
  expect(p.client.state.account?.id).toBe('new'); expect(p.client.state.authError).toBe('');
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

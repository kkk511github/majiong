import { test, expect, legacyRoom } from "./browser-fixtures";
import pkg from "../package.json" with { type: "json" };

test("短暂后台保留连接，失效连接两秒内重建并恢复原桌与登录", async ({
  page,
}) => {
  let connections = 0,
    blocked = -1;
  const sent: { connection: number; type: string }[] = [];
  await page.routeWebSocket("**/ws", (ws) => {
    const id = ++connections,
      server = ws.connectToServer();
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw));
      sent.push({ connection: id, type: msg.type });
      if (id !== blocked) server.send(raw);
    });
    server.onMessage((raw) => {
      if (id !== blocked) ws.send(raw);
    });
  });
  await page.goto("/");
  await legacyRoom(page);
  const code = await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.view!.code;
  });
  const established = connections;
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.setNetworkVisible(false);
  });
  await page.waitForTimeout(150);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow")),
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { client } = await import("/src/game-client.ts" as string);
        return client.state.connected;
      }),
    )
    .toBe(true);
  expect(connections).toBe(established);
  blocked = established;
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.setNetworkVisible(false);
  });
  const started = Date.now();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow"));
    window.dispatchEvent(new Event("focus"));
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { client } = await import("/src/game-client.ts" as string);
          return client.state.connected && client.state.view?.code;
        }),
      { intervals: [50, 100, 200], timeout: 5000 },
    )
    .toBe(code);
  expect(Date.now() - started).toBeLessThan(4000);
  expect(connections).toBe(established + 1);
  expect(sent.filter((m) => m.type === "create")).toHaveLength(1);
  expect(
    sent.filter(
      (m) =>
        m.connection > established &&
        ["action", "ready", "join", "create"].includes(m.type),
    ),
  ).toEqual([]);
  await expect(page.locator(".waiting-room")).toBeVisible();
});

test('重连先收到登录确认时不能操作旧牌桌，等最新快照再开放',async({page})=>{
  let hold=false,connections=0;
  const queued:(()=>void)[]=[],commands:string[]=[];
  await page.routeWebSocket('**/ws',ws=>{
    connections++;const server=ws.connectToServer();
    ws.onMessage(raw=>{const m=JSON.parse(String(raw));commands.push(m.type);server.send(raw);});
    server.onMessage(raw=>{const m=JSON.parse(String(raw));if(hold&&m.type==='state')queued.push(()=>ws.send(raw));else ws.send(raw);});
  });
  await page.goto('/');await legacyRoom(page);
  const before=connections;hold=true;
  await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);client.retryNetwork();});
  await expect.poll(()=>queued.length).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return {connected:client.state.connected,phase:client.state.network.phase};})).toEqual({connected:false,phase:'syncing'});
  const readies=commands.filter(x=>x==='ready').length;
  await page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);client.ready();});
  expect(commands.filter(x=>x==='ready')).toHaveLength(readies);
  hold=false;for(const send of queued)send();
  await expect.poll(()=>page.evaluate(async()=>{const{client}=await import('/src/game-client.ts' as string);return client.state.connected&&client.state.network.phase;})).toBe('ready');
  expect(connections).toBe(before+1);
  expect(commands.filter(x=>x==='ready')).toHaveLength(readies);
});

test("网络诊断显示实际服务版本，复制不含账号和会话凭证", async ({ page }) => {
  await page.goto("/");
  const { version } = pkg;
  await expect.poll(() => page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.network.serverVersion;
  })).toBe(version);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const panel = page.locator(".network-diagnostics");
  await panel.locator("summary").click();
  await expect(panel.locator("dt", { hasText: "服务端版本" }).locator("+ dd")).toHaveText(version);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async (value: string) => { (window as any).__copiedNetwork = value; } },
  }));
  await panel.getByRole("button", { name: "复制诊断" }).click();
  await expect(panel.getByRole("status")).toHaveText("诊断已复制");
  const copied = await page.evaluate(() => JSON.parse((window as any).__copiedNetwork));
  expect(copied.serverVersion).toBe(version);
  expect(copied.appVersion).toBe(version);
  for (const field of ["token", "account", "players", "hand", "roomCode"]) expect(copied).not.toHaveProperty(field);
});

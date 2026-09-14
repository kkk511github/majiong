import { test, expect, legacyRoom } from "./browser-fixtures";

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

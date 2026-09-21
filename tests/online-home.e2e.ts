import { test, expect, browserAccount } from "./browser-fixtures";
import { DEFAULT_RULES, type TableSummary } from "../shared/types";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
const captures = "test-results/screenshots";
const poolCaptures = "output/table-pool-20260921";
test.beforeAll(() => {
  mkdirSync(captures, { recursive: true });
  mkdirSync(poolCaptures, { recursive: true });
});
const tables: TableSummary[] = [
  {
    code: "518209",
    name: "金陵好友局",
    number: 1,
    phase: "waiting",
    round: 1,
    rules: DEFAULT_RULES,
    settings: DEFAULT_TABLE_SETTINGS,
    managed: false,
    seats: [null, null, null, null],
  },
  {
    code: "639158",
    name: "秦淮相聚",
    number: 2,
    phase: "playing",
    round: 3,
    rules: DEFAULT_RULES,
    settings: DEFAULT_TABLE_SETTINGS,
    managed: false,
    seats: ["莫愁", "钟山", "青禾", "小满"].map((name) => ({
      name,
      online: true,
      ready: true,
      isMe: false,
    })),
  },
];
for (const [width, height, left, right] of [
  [568, 320, 0, 0],
  [844, 390, 59, 0],
  [932, 430, 0, 62],
]) {
  test(`联机首页 ${width}：真实状态布局、空位触摸、空大厅与安全区`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left, right, top: 0, bottom: width > 700 ? 21 : 0 },
    });
    let populated = true;
    await page.routeWebSocket("**/ws", (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        const data = JSON.parse(String(message));
        ws.send(
          data.type === "tables"
            ? JSON.stringify({ ...data, tables: populated ? tables : [] })
            : message,
        );
      });
    });
    await page.goto("/");
    await expect(page.locator(".home-table")).toHaveCount(1);
    await expect(page.locator(".home-live-heading")).toContainText(
      "1 桌可加入",
    );
    await expect(page.locator(".home-table").first()).toContainText("等待入座");
    const primary = page.getByRole("button", {
      name: "进入牌桌大厅",
      exact: true,
    });
    expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const locator of [
      primary,
      page.getByRole("button", { name: "全部牌桌", exact: true }),
      page.getByRole("button", { name: "加入好友桌", exact: true }),
      page.getByRole("button", { name: "开一桌，等朋友", exact: true }),
      page.getByRole("button", { name: "518209 东位入座", exact: true }),
    ]) {
      const b = (await locator.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(left);
      expect(b.x + b.width).toBeLessThanOrEqual(width - right);
      expect(b.y + b.height).toBeLessThanOrEqual(
        height - (width > 700 ? 21 : 0),
      );
      expect(
        await locator.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
      ).toBe(true);
    }
    expect(
      (await page
        .getByRole("button", { name: "518209 东位入座" })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({ path: `${captures}/online-home-${width}.png` });
    if (width === 844)
      await page.screenshot({ path: `${poolCaptures}/home-empty-tables.png` });
    populated = false;
    await page.reload();
    await expect(page.locator(".home-empty")).toContainText(
      "暂时没有可加入牌桌",
    );
    await expect(page.locator(".home-live-heading")).toContainText(
      "0 桌可加入",
    );
    await expect(page.locator(".home-table-join")).toHaveCount(0);
    await page.screenshot({
      path: `${captures}/online-home-empty-${width}.png`,
    });
  });
}
test("牌桌大厅按0人、1至3人、不可加入排序并使用紧凑卡片", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const ordered: TableSummary[] = [
    tables[1],
    { ...tables[0], code: "300003", number: 3, seats: [{ name: "紫金", online: true, ready: false, isMe: false }, null, null, null] },
    { ...tables[0], code: "300001", number: 1, seats: [null, null, null, null] },
    { ...tables[0], seats: [
      { name: "紫金", online: true, ready: true, isMe: false },
      { name: "秦淮", online: true, ready: false, isMe: false },
      { name: "玄武", online: true, ready: true, isMe: false },
      null,
    ] },
  ];
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      const data = JSON.parse(String(message));
      ws.send(data.type === "tables" ? JSON.stringify({ ...data, tables: ordered }) : message);
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "进入牌桌大厅", exact: true }).click();
  await expect(page.locator(".table-card")).toHaveCount(4);
  expect(await page.locator(".table-room-code").allInnerTexts()).toEqual([
    "300001",
    "518209",
    "300003",
    "639158",
  ]);
  expect((await page.locator(".table-card").first().boundingBox())!.height).toBeLessThanOrEqual(100);
  await page.screenshot({ path: `${poolCaptures}/lobby-compact-sorted.png` });
});
test("首页展示所有未满桌，完全空桌优先，已有三人仍可直接入座开局", async ({
  page,
  browser,
}) => {
  const tableName = `首页验收${randomUUID().slice(0, 8)}`;
  const peers = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ viewport: { width: 844, height: 390 } }),
    ),
  );
  const peerPages = await Promise.all(peers.map((c) => c.newPage()));
  try {
    await Promise.all(
      peers.map((c, i) => browserAccount(c, ["紫金", "秦淮", "玄武"][i])),
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "开一桌，等朋友", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "玩法名称", exact: true })
      .fill(tableName);
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page
      .getByRole("group", { name: "创建桌数", exact: true })
      .getByRole("button", { name: "1 桌", exact: true })
      .click();
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByRole("button", { name: "创建 1 桌", exact: true }).click();
    const card = page.locator(".table-card").filter({ hasText: tableName });
    await expect(card).toHaveCount(1);
    const code = (await card.locator(".table-room-code").innerText()).trim();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "牌桌", exact: true })
      .click();
    for (const peer of peerPages) {
      await peer.goto("http://127.0.0.1:5178");
      await peer
        .getByRole("button", { name: "加入好友桌", exact: true })
        .click();
      await peer.getByLabel("房间号", { exact: true }).fill(code);
      await peer.getByRole("button", { name: "加入房间", exact: true }).click();
      await peer
        .getByRole("button", { name: "我准备好了", exact: true })
        .click();
    }
    const featured = page.getByRole("article", {
      name: `${tableName} 房号 ${code}`,
      exact: true,
    });
    await expect(featured).toBeVisible();
    await expect(page.locator(".home-live-heading")).toContainText(
      "桌可加入",
    );
    await page.screenshot({ path: `${captures}/online-home-live.png` });
    await featured
      .getByRole("button", { name: `${code} 北位入座`, exact: true })
      .click();
    await page.getByRole("button", { name: "我准备好了", exact: true }).click();
    for (const p of [page, ...peerPages]) {
      await expect(p.getByRole("main", { name: "南京麻将牌桌" })).toBeVisible();
      await expect(
        p.getByRole("list", { name: "玩家状态" }).getByRole("listitem"),
      ).toHaveCount(4);
      await expect
        .poll(() =>
          p.evaluate(async () => {
            const { client } = await import("/src/game-client.ts" as string);
            return client.state.view?.phase;
          }),
        )
        .toBe("playing");
      await expect(p.locator("#cocos-table-board iframe")).toBeVisible();
    }
  } finally {
    await Promise.all(peers.map((c) => c.close()));
  }
});
test("首页断线不显示陈旧空位为在线，恢复后自动更新", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  let disconnect: (() => void) | undefined;
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();
    disconnect = () => ws.close();
    server.onMessage((m) => {
      const d = JSON.parse(String(m));
      ws.send(d.type === "tables" ? JSON.stringify({ ...d, tables }) : m);
    });
  });
  await page.goto("/");
  await expect(page.locator(".home-table-join")).toHaveCount(1);
  disconnect!();
  await expect(page.locator(".home-live-heading")).not.toContainText(
    "1 桌可加入",
  );
  await expect(page.locator(".home-table-join")).toHaveCount(0);
  await expect(page.locator(".home-table-join")).toHaveCount(1, {
    timeout: 12000,
  });
});

test("每次返回首页、再次点击牌桌和首页标识都会请求最新列表", async ({
  page,
}) => {
  let generation = 1;
  let requests = 0;
  let connections = 0;
  await page.routeWebSocket("**/ws", (ws) => {
    connections++;
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (JSON.parse(String(message)).type === "tables") requests++;
      server.send(message);
    });
    server.onMessage((message) => {
      const data = JSON.parse(String(message));
      ws.send(
        data.type === "tables"
          ? JSON.stringify({
              ...data,
              tables: [{ ...tables[0], name: `刷新牌桌${generation}` }],
            })
          : message,
      );
    });
  });
  await page.goto("/");
  await expect(page.locator(".home-table")).toContainText("刷新牌桌1");
  const initialConnections = connections;
  for (const destination of ["我的", "玩法", "战绩", "约局"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: destination, exact: true })
      .click();
    if (destination === "约局")
      await expect(page.locator(".table-list")).toHaveAttribute(
        "aria-busy",
        "false",
      );
    generation++;
    const before = requests;
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "牌桌", exact: true })
      .click();
    await expect(page.locator(".home-table")).toContainText(
      `刷新牌桌${generation}`,
    );
    expect(requests).toBe(before + 1);
  }
  for (const target of [
    page
      .getByRole("navigation")
      .getByRole("button", { name: "牌桌", exact: true }),
    page.getByRole("button", { name: "金陵麻将首页", exact: true }),
  ]) {
    generation++;
    const before = requests;
    await target.click();
    await expect(page.locator(".home-table")).toContainText(
      `刷新牌桌${generation}`,
    );
    expect(requests).toBe(before + 1);
  }
  expect(connections).toBe(initialConnections);
});

test("列表回复丢失自动重连，刷新期间不允许点击旧空位", async ({ page }) => {
  let drop = false;
  let connections = 0;
  await page.routeWebSocket("**/ws", (ws) => {
    const index = ++connections;
    const server = ws.connectToServer();
    server.onMessage((message) => {
      const data = JSON.parse(String(message));
      if (data.type === "tables" && drop && index === 1) return;
      ws.send(
        data.type === "tables"
          ? JSON.stringify({
              ...data,
              tables: [
                { ...tables[0], name: index === 1 ? "旧列表" : "恢复后的列表" },
              ],
            })
          : message,
      );
    });
  });
  await page.goto("/");
  await expect(page.locator(".home-table")).toContainText("旧列表");
  drop = true;
  await page.getByRole("button", { name: "金陵麻将首页", exact: true }).click();
  await expect(page.locator(".home-live-body")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".home-live-heading")).toContainText("更新中");
  await expect(page.locator(".home-table-join")).toBeDisabled();
  await expect(page.locator(".home-table")).toContainText("恢复后的列表", {
    timeout: 18000,
  });
  await expect(page.locator(".home-live-body")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(connections).toBe(2);
});

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`刷新反馈 ${width}：牌桌不闪空、不跳位，旧空位禁用，离线再进入重连界面`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    let hold = false;
    let release: (() => void) | undefined;
    let cut: (() => void) | undefined;
    await page.routeWebSocket("**/ws", (ws) => {
      const server = ws.connectToServer();
      cut = () => ws.close();
      server.onMessage((message) => {
        const data = JSON.parse(String(message));
        if (data.type !== "tables") {
          ws.send(message);
          return;
        }
        const payload = JSON.stringify({ ...data, tables: hold ? [] : tables });
        if (hold) release = () => ws.send(payload);
        else ws.send(payload);
      });
    });
    await page.goto("/");
    await expect(page.locator(".home-table")).toHaveCount(1);
    const card = page.locator(".home-table").first();
    const before = (await card.boundingBox())!;
    hold = true;
    await page
      .getByRole("button", { name: "金陵麻将首页", exact: true })
      .click();
    await expect(page.locator(".home-refresh-status")).toHaveText("更新中…");
    await expect(page.locator(".home-table")).toHaveCount(1);
    await expect(page.locator(".home-empty")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "重新连接", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".home-table-join")).toBeDisabled();
    await expect(page.locator(".home-table .ready")).toHaveCount(0);
    const after = (await card.boundingBox())!;
    for (const key of ["x", "y", "width", "height"] as const)
      expect(Math.abs(before[key] - after[key])).toBeLessThan(1);
    expect(
      await page
        .locator(".home-refresh-status svg")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page.screenshot({ path: `${captures}/home-refresh-${width}.png` });
    await expect.poll(() => !!release).toBe(true);
    release!();
    await expect(page.locator(".home-live-body")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await expect(page.locator(".home-table")).toHaveCount(0);
    await expect(page.locator(".home-empty")).toContainText(
      "暂时没有可加入牌桌",
    );
    cut!();
    await expect(page.locator(".home-refresh-status")).toHaveCount(0);
    await expect(page.locator(".home-live-heading")).toContainText("连接中");
  });
}

for (const [width, height, edge] of [
  [874, 402, 62],
  [568, 320, 0],
])
  test(`未分配战队首页 ${width} 两栏不挤占`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left: edge, right: edge, top: 0, bottom: edge ? 21 : 0 },
    });
    await page.route("**/api/**", async (route) => {
      const response = await route.fetch();
      const type = response.headers()["content-type"] || "";
      if (!type.includes("application/json"))
        return route.fulfill({ response });
      const body = await response.json();
      if (body.account)
        body.account = {
          ...body.account,
          canPlay: false,
          teamId: null,
          teamName: null,
          role: "member",
          canCreateTables: false,
        };
      await route.fulfill({ response, json: body });
    });
    await page.routeWebSocket("**/ws", (ws) => {
      const server = ws.connectToServer();
      server.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.account)
          m.account = {
            ...m.account,
            canPlay: false,
            teamId: null,
            teamName: null,
            role: "member",
            canCreateTables: false,
          };
        ws.send(JSON.stringify(m));
      });
    });
    await page.goto("/");
    await expect(page.locator(".admission-notice")).toBeVisible();
    const welcome = (await page.locator(".home-welcome").boundingBox())!,
      panel = (await page.locator(".home-live-panel").boundingBox())!;
    expect(welcome.x + welcome.width).toBeLessThan(panel.x);
    for (const selector of [
      ".home-intro h1",
      ".home-online-primary",
      ".home-join",
      ".home-quiet-links",
      ".home-live-panel",
    ]) {
      const r = (await page.locator(selector).boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(40);
      expect(r.y + r.height).toBeLessThanOrEqual(height - (edge ? 65 : 44));
    }
    await page.screenshot({ path: `${captures}/home-unassigned-${width}.png` });
  });

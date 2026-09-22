import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import type { StoredRound } from "../shared/types";

function match(
  index: number,
  at = Date.now() - (100 + index) * 60000,
): StoredRound {
  return {
    game: `live-match-${index}`,
    code: String(580000 + index),
    me: 0,
    practice: false,
    adminReadAt: null,
    record: {
      id: `live-match-${index}-final`,
      at,
      round: 8,
      totalRounds: 8,
      matchFinished: true,
      names: ["秦淮月", "月白", "江宁", "金陵牌友"],
      memberIds: ["100001", "100002", "100003", "100004"],
      teamNames: ["一生所爱", "冰茉莉", "日结丁", "日结冰"],
      initialScore: 100,
      scores: [142, 88, 70, 100],
      tableName: "南京好友桌",
      result: {
        reason: "hu",
        winners: [0],
        details: {},
        deltas: [42, -12, -30, 0],
      },
    },
  };
}
type Probes = {
  recordsPoll?: () => Promise<void>;
  recordCues: string[];
  recordPollDelays: number[];
};

async function setup(page: Page) {
  const state = {
    records: Array.from({ length: 30 }, (_, i) => match(i)),
    monitorCalls: 0,
    adminCalls: 0,
    failMonitor: false,
  };
  await page.addInitScript(() => {
    const probes = window as unknown as Probes;
    probes.recordCues = [];
    probes.recordPollDelays = [];
    const interval = window.setInterval.bind(window);
    window.setInterval = ((
      handler: TimerHandler,
      timeout?: number,
      ...args: unknown[]
    ) => {
      if (typeof handler === "function" && handler.name === "pollRecords") {
        probes.recordsPoll = handler as () => Promise<void>;
        probes.recordPollDelays.push(timeout ?? 0);
        return interval(handler, 600000, ...args);
      }
      return interval(handler, timeout, ...args);
    }) as typeof window.setInterval;
  });
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url()),
      q = url.searchParams;
    if (url.pathname.startsWith("/api/avatars/"))
      return route.fulfill({ path: "public/avatars.png", contentType: "image/png" });
    if (
      url.pathname === "/api/admin/records" ||
      url.pathname === "/api/records"
    ) {
      if (url.pathname === "/api/admin/records") state.adminCalls++;
      const monitoring =
        url.pathname === "/api/admin/records" && !q.has("read");
      if (monitoring) state.monitorCalls++;
      if (monitoring && state.failMonitor)
        return route.fulfill({ status: 503, json: { error: "测试断网" } });
      let records = state.records;
      if (q.get("code"))
        records = records.filter((item) =>
          item.code.startsWith(q.get("code")!),
        );
      const pageNumber = Number(q.get("page") || 1);
      return route.fulfill({
        json: {
          records: records.slice((pageNumber - 1) * 20, pageNumber * 20),
          total: records.length,
          page: pageNumber,
          pageSize: 20,
        },
      });
    }
    if (url.pathname.startsWith("/api/matches/")) {
      const selected = state.records.find(
        (item) => item.game === url.pathname.split("/").at(-1),
      )!;
      return route.fulfill({
        json: {
          match: selected,
          rounds: [
            {
              ...selected,
              record: { ...selected.record, matchFinished: false },
            },
          ],
        },
      });
    }
    if (url.pathname.startsWith("/api/admin/match-reads/"))
      return route.fulfill({ json: { readAt: Date.now() } });
    return route.fulfill({
      status: 404,
      json: { error: "隔离测试未定义的接口" },
    });
  });
  await page.routeWebSocket("**/ws", (socket) => socket.close());
  await page.goto("/tests/previews/records.html");
  await page.evaluate(async () => {
    const { client, GameClient } = await import(
      "/src/game-client.ts" as string
    );
    client.loadRecords = GameClient.prototype.loadRecords.bind(client);
    client.loadMatch = GameClient.prototype.loadMatch.bind(client);
    client.markMatchRead = GameClient.prototype.markMatchRead.bind(client);
    const { gameAudio } = await import("/src/audio.ts" as string);
    const play = gameAudio.play.bind(gameAudio);
    gameAudio.play = (cue: string, delay?: number) => {
      if (cue === "records") (window as unknown as Probes).recordCues.push(cue);
      play(cue, delay);
    };
  });
  await page.getByRole("button", { name: "管理视角", exact: true }).click();
  await page.getByRole("button", { name: "牌桌总战绩", exact: true }).click();
  await expect(
    page.locator('.records-workspace[data-scope="admin"] .match-card'),
  ).toHaveCount(20);
  await expect(
    page.locator('.records-workspace[data-scope="admin"] .match-card').first().locator(".record-team"),
  ).toHaveText(["一生所爱", "冰茉莉", "日结丁", "日结冰"]);
  await expect(page.locator(".records-live-status")).toHaveText("实时更新");
  expect(
    await page.evaluate(() => (window as unknown as Probes).recordPollDelays),
  ).toEqual([5000]);
  return state;
}
async function tick(page: Page) {
  await page.evaluate(() => (window as unknown as Probes).recordsPoll?.());
}
async function cues(page: Page) {
  return page.evaluate(() => (window as unknown as Probes).recordCues.length);
}

test("lobby sound is admin-only, deduplicated and remembers mute; avatars render", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "约局", exact: true }).click();
  const sound = page.getByRole("button", { name: "新战绩提示音", exact: true });
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await tick(page);
  expect(await cues(page)).toBe(0);
  state.records.unshift(match(100, Date.now()));
  await tick(page);
  expect(await cues(page)).toBe(1);
  await tick(page);
  expect(await cues(page)).toBe(1);
  await sound.click();
  state.records.unshift(match(101, Date.now() + 1));
  await tick(page);
  expect(await cues(page)).toBe(1);
  for (const [width, height] of [[1280, 720], [390, 844], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await expect(sound).toBeInViewport();
    const avatar = page.locator(".lobby-seat .user-avatar");
    await expect(avatar).toBeVisible();
    expect(await avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync("output/records-live-20260921", { recursive: true });
    await page.screenshot({ path: `output/records-live-20260921/lobby-${width}x${height}.png` });
  }
  await page.getByRole("button", { name: "会员视角", exact: true }).click();
  await expect(sound).toHaveCount(0);
  const calls = state.adminCalls;
  await tick(page);
  expect(state.adminCalls).toBe(calls);
  await page.getByRole("button", { name: "管理视角", exact: true }).click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
});

test("legacy day totals do not block the first page", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "我的对局", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let waiting = false;
  await page.route("**/api/records*", async route => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has("from") && query.get("page") === "2") {
      waiting = true;
      await gate;
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect.poll(() => waiting).toBe(true);
  await expect(page.locator(".match-card")).toHaveCount(20);
  await expect(page.locator(".records-list")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByLabel("个人当日战绩")).toHaveCount(0);
  release();
  await expect(page.getByLabel("个人当日战绩")).toContainText("+1260");
  await expect(page.getByLabel("个人当日战绩")).toContainText("30 局");
});

test("records stay silent while filters, pagination and details remain stable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const state = await setup(page);
  expect(await cues(page)).toBe(0);
  await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
  await page.getByLabel("战绩阅读状态").selectOption("unread");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "下一页战绩" }).click();
  await expect(page.locator(".match-card")).toHaveCount(10);
  await tick(page);
  expect(await cues(page)).toBe(0);
  await page.locator(".match-card").first().click();
  await expect(page.locator(".match-record-dialog")).toBeVisible();
  state.records.unshift(match(100, Date.now()));
  await tick(page);
  await expect(page.locator(".match-record-dialog")).toBeVisible();
  expect(await cues(page)).toBe(0);
  await tick(page);
  expect(await cues(page)).toBe(0);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
  await page.getByLabel("战绩阅读状态").selectOption("all");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(
    page.locator('.match-card[data-game="live-match-100"]'),
  ).toHaveClass(/record-card-new/);
  await expect(page.getByRole("button", { name: "新战绩提示音" })).toHaveCount(0);
  state.records.unshift(match(101, Date.now() + 1));
  await tick(page);
  await expect(
    page.locator('.match-card[data-game="live-match-101"]'),
  ).toBeVisible();
  await expect(
    page.locator('.match-card[data-game="live-match-101"] .record-team'),
  ).toHaveText(["一生所爱", "冰茉莉", "日结丁", "日结冰"]);
  expect(await cues(page)).toBe(0);
  await tick(page);
  expect(await cues(page)).toBe(0);
  await page.getByRole("button", { name: "我的对局", exact: true }).click();
  await expect(page.locator(".records-live-controls")).toHaveCount(0);
  const calls = state.adminCalls;
  await tick(page);
  expect(state.adminCalls).toBe(calls);
});

test("poll failures retain records and recovery stays silent on records page", async ({
  page,
}) => {
  const state = await setup(page);
  state.failMonitor = true;
  await tick(page);
  await expect(page.locator(".records-live-status")).toHaveText("更新重试中");
  await expect(page.locator(".match-card")).toHaveCount(20);
  expect(await cues(page)).toBe(0);
  state.failMonitor = false;
  state.records.unshift(match(100, Date.now()));
  await tick(page);
  await expect(page.locator(".records-live-status")).toHaveText("实时更新");
  await expect(
    page.locator('.match-card[data-game="live-match-100"]'),
  ).toBeVisible();
  expect(await cues(page)).toBe(0);
});

test("polls preserve pending filter/manual failures and do not replace an in-flight background read", async ({
  page,
}) => {
  const state = await setup(page);
  let release: () => void = () => {};
  let gate = Promise.resolve();
  let fail = false;
  let filteredRequests = 0;
  const hold = () => {
    fail = true;
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  await page.route("**/api/admin/records*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("code") !== "580029")
      return route.fallback();
    filteredRequests++;
    await gate;
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: "筛选请求失败，请重试" },
      });
    return route.fallback();
  });

  hold();
  await page
    .getByRole("textbox", { name: "战绩房间号", exact: true })
    .fill("580029");
  await page.getByRole("button", { name: "查询战绩", exact: true }).click();
  await expect.poll(() => filteredRequests).toBeGreaterThan(0);
  await expect(page.locator(".records-list")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await tick(page);
  release();
  await expect(page.locator(".records-list [role='alert']")).toContainText(
    "筛选请求失败",
  );
  await expect(page.locator(".match-card")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "战绩房间号", exact: true }),
  ).toHaveValue("580029");
  await expect(
    page.locator(".records-results-heading > span"),
  ).not.toContainText("共 30 桌");

  fail = false;
  await page
    .locator(".records-list")
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await expect(page.locator(".match-card")).toHaveCount(1);
  await expect(page.locator(".match-card")).toContainText("房间 580029");

  hold();
  const beforeRefresh = filteredRequests;
  await page.getByRole("button", { name: "刷新战绩", exact: true }).click();
  await expect.poll(() => filteredRequests).toBeGreaterThan(beforeRefresh);
  await tick(page);
  release();
  await expect(page.locator(".records-list [role='alert']")).toContainText(
    "筛选请求失败",
  );
  await expect(page.locator(".match-card")).toHaveCount(0);
  expect(await cues(page)).toBe(0);

  fail = false;
  await page
    .locator(".records-list")
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await expect(page.locator(".match-card")).toHaveCount(1);
  hold();
  const beforeBackground = filteredRequests;
  await tick(page);
  await expect.poll(() => filteredRequests).toBeGreaterThan(beforeBackground);
  await tick(page);
  fail = false;
  state.records[29].record.names[0] = "同步完成";
  release();
  await expect(page.locator(".match-card")).toContainText("同步完成");
  expect(filteredRequests).toBe(beforeBackground + 1);
});

for (const [width, height] of [
  [1280, 720],
  [844, 390],
  [568, 320],
]) {
  test(`admin record density and controls ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    const metrics = await page.locator(".records-list").evaluate((list) => {
      const area = list.getBoundingClientRect();
      const cards = Array.from(list.querySelectorAll(".match-card"));
      return {
        full: cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.top >= area.top && rect.bottom <= area.bottom + 1;
        }).length,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
        firstHeight: cards[0].getBoundingClientRect().height,
      };
    });
    expect(metrics.full).toBeGreaterThanOrEqual(width >= 1100 ? 5 : 1);
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
    await expect(
      page.getByRole("button", { name: "新战绩提示音" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "筛选战绩", exact: true })).toBeVisible();
    const scores = page
      .locator(".match-card")
      .first()
      .locator(".match-points b");
    await expect(scores).toHaveText(["+42", "-12", "-30", "0"]);
    const identity = page.locator(".match-card .match-player-name").first();
    await expect(identity).toHaveCSS("flex-wrap", "wrap");
    expect(
      await identity.evaluate((node) =>
        [...node.children].every(
          (child) => child.scrollWidth <= child.clientWidth,
        ),
      ),
    ).toBe(true);
    mkdirSync("output/records-live-20260921", { recursive: true });
    await page.screenshot({
      path: `output/records-live-20260921/admin-records-${width}x${height}.png`,
    });
    expect(await cues(page)).toBe(0);
  });
}

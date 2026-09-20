import { expect, test } from "@playwright/test";
import { replayedRound } from "./fixtures/replayed-round";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION } from "../src/legal-copy";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };

test("the built client resumes a server robot table without randomUUID or structuredClone", async ({
  page,
}) => {
  const errors: string[] = [];
  const account = {
    id: "native-player",
    username: "native-player",
    name: "原生牌友",
    role: "member",
    mustChangePassword: false,
    canCreateTables: false,
    canPlay: true,
  };
  const game = JSON.parse(JSON.stringify(late)) as Game;
  game.id = "native-experience-fixture";
  game.code = "736251";
  game.players[0]!.id = account.id;
  game.players[0]!.name = account.name;
  game.table = {
    creatorId: "fixture-creator",
    groupId: "native-experience",
    number: 1,
    createdAt: Date.now(),
    experience: { sourceCode: "123456" },
    settings: {
      name: "原生兼容体验桌",
      visibility: "public",
      readyMode: "auto",
      autoRenew: false,
      resultSeconds: 5,
      offlineStart: false,
      kickOffline: false,
      kickUnready: false,
      kickAfterSeconds: 30,
      trusteeMode: "match",
      trusteeRounds: 0,
      continuousRounds: false,
      allowDissolve: true,
      privacy: "open",
    },
  };
  const view = viewFor(game, 0);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((token) => {
    localStorage.setItem("jinling:token", JSON.stringify(token));
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, "structuredClone", {
      configurable: true,
      value: undefined,
    });
  }, "native-fixture-token");
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/mahjong/,
      "",
    );
    return route.fulfill({
      status: path === "/api/auth/session" ? 200 : 404,
      json:
        path === "/api/auth/session"
          ? { account }
          : { error: "Unexpected test API path: " + path },
    });
  });
  await page.routeWebSocket("**/ws", (ws) =>
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === "hello") {
        ws.send(
          JSON.stringify({
            type: "session",
            id: account.id,
            name: account.name,
            account,
            token: "native-fixture-token",
            roomCode: view.code,
            tableLobby: true,
          }),
        );
        ws.send(
          JSON.stringify({ type: "state", state: view, serverNow: Date.now() }),
        );
      }
    }),
  );
  await page.goto("/");
  await expect(page.locator(".cocos-loading")).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="金陵麻将牌桌"]').locator("canvas"),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "玩家状态" }).getByRole("listitem"),
  ).toHaveText([/原生牌友/, /秦淮/, /钟山/, /莫愁/]);
  expect(errors).toEqual([]);
  await expect(page.locator(".recovery")).toHaveCount(0);
});

test("the installed bundle opens records, details, replay and admin features with final asset filenames", async ({
  page,
}) => {
  const errors: string[] = [],
    missing: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && new URL(r.url()).pathname.startsWith("/assets/"))
      missing.push(r.url());
  });
  const account = {
    id: "native-fixture",
    username: "native-fixture",
    name: "安装包验收",
    role: "admin",
    mustChangePassword: false,
    canManageAdmins: true,
    canCreateTables: true,
    canPlay: true,
  };
  const g = replayedRound();
  const item = {
    game: g.id,
    code: g.code,
    me: 0,
    practice: false,
    record: {
      ...g.history[0],
      at: Date.now(),
      matchFinished: true,
      totalRounds: 8,
    },
  };
  await page.addInitScript(
    ({ key, version }) => {
      localStorage.setItem(
        "jinling:token",
        JSON.stringify("native-fixture-token"),
      );
      localStorage.setItem(
        key,
        JSON.stringify({ version, acceptedAt: "2026-09-16" }),
      );
    },
    { key: LEGAL_STORAGE_KEY, version: LEGAL_VERSION },
  );
  // Intercept every account/game request; this exact production bundle must
  // never contact the production service during browser verification.
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^\/mahjong/,
      "",
    );
    const json =
      path === "/api/auth/session"
        ? { account }
        : /\/api\/(admin\/)?records/.test(path)
          ? { records: [item], total: 1, page: 1, pageSize: 20, dates: [] }
          : path.startsWith("/api/admin/match-reads/")
            ? { readAt: Date.now() }
            : path.startsWith("/api/matches/")
              ? { match: item, rounds: [{ ...item, record: g.history[0] }] }
              : path.startsWith("/api/replays/")
                ? g.replay
                : path === "/api/admin/teams"
                  ? { teams: [] }
                  : path.startsWith("/api/admin/members")
                    ? { accounts: [], total: 0, page: 1, pageSize: 20 }
                    : path.startsWith("/api/admin/points")
                      ? {
                          rows: [],
                          total: 0,
                          page: 1,
                          pageSize: 20,
                          completedRounds: 0,
                          playerRounds: 0,
                          tables: 0,
                          points: 0,
                        }
                      : path.startsWith("/api/admin/table-permissions")
                        ? { accounts: [], total: 0, page: 1, pageSize: 20 }
                        : undefined;
    return route.fulfill({
      status: json ? 200 : 404,
      json: json ?? { error: "Unexpected test API path: " + path },
    });
  });
  await page.routeWebSocket("**/ws", (ws) =>
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "hello") {
        ws.send(
          JSON.stringify({
            type: "session",
            id: account.id,
            name: account.name,
            account,
            token: "native-fixture-token",
            tableLobby: true,
          }),
        );
        ws.send(JSON.stringify({ type: "tables", tables: [] }));
      }
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await expect(page.locator(".records-workspace")).toBeVisible();
  await page
    .getByRole("button", { name: `查看房间 ${g.code} 最终战绩`, exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "本把明细", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "回放第 1 把", exact: true })
    .click();
  const replay = page.getByRole("dialog", { name: "牌局回放", exact: true });
  await expect(replay).toBeVisible();
  await expect(replay.locator(".cocos-loading")).toHaveCount(0, {
    timeout: 45000,
  });
  await expect(replay.locator("iframe")).toBeVisible();
  await replay.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await expect(page.locator(".record-read")).toBeVisible();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "战队与会员", exact: true }).click();
  await expect(page.locator(".club-workspace")).toBeVisible();
  await page.getByRole("button", { name: "积分统计", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "桌数（8局/桌）", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("button", { name: "开桌权限", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "开桌权限", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".feature-loading[role=alert]")).toHaveCount(0);
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});

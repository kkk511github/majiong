import { test, expect } from "./browser-fixtures";
import {
  DEFAULT_RULES,
  type Account,
  type TableSummary,
} from "../shared/types";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import { mkdirSync } from "node:fs";

const tables: TableSummary[] = [3, 2, 4, 4].map((count, index) => ({
  code: String(600128 + index * 8),
  name: ["金陵好友局", "秦淮相聚", "南京麻将", "四方牌友"][index],
  number: index + 1,
  phase: index === 2 ? "playing" : "waiting",
  round: index === 2 ? 2 : 1,
  rules: DEFAULT_RULES,
  settings: DEFAULT_TABLE_SETTINGS,
  managed: false,
  seats: Array.from({ length: 4 }, (_, i) =>
    i < count
      ? {
          name: `牌友${i + 1}`,
          online: true,
          ready: i < 2,
          isMe: false,
        }
      : null,
  ),
}));

for (const role of ["admin", "member", "authorized"] as const)
  for (const [width, height] of [
    [568, 320],
    [844, 390],
    [1280, 589],
    [1440, 900],
  ]) {
    test(`参考图首页 ${role} ${width}：身份入口、真实人数与行内入桌`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const patchAccount = (account: Account) => ({
        ...account,
        role: role === "admin" ? "admin" : "member",
        canCreateTables: role !== "member",
        canPlay: true,
        playBlocked: false,
      });
      await page.route("**/api/auth/session", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({
          response,
          json: { ...body, account: patchAccount(body.account) },
        });
      });
      const joins: unknown[] = [];
      await page.routeWebSocket("**/ws", (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((raw) => {
          const message = JSON.parse(String(raw));
          if (message.type === "join") joins.push(message);
          else server.send(raw);
        });
        server.onMessage((raw) => {
          const message = JSON.parse(String(raw));
          if (message.account) message.account = patchAccount(message.account);
          if (message.type === "tables") message.tables = tables;
          ws.send(JSON.stringify(message));
        });
      });
      await page.goto("/");
      await expect(page.locator(".home-table")).toHaveCount(4);
      await expect(page.locator(".home-table").first()).toContainText("3/4 人");
      await expect(page.locator(".home-table-join")).toHaveCount(2);
      await expect(
        page.getByRole("article", { name: /600144/ }).getByRole("button"),
      ).toHaveCount(0);
      await expect(page.getByRole("article", { name: /600152/ })).toContainText(
        "等待准备",
      );
      await expect(
        page.getByRole("article", { name: /600152/ }).getByRole("button"),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "开一桌，等朋友", exact: true }),
      ).toHaveCount(role === "member" ? 0 : 1);
      await expect(
        page.getByRole("button", { name: "加入好友桌", exact: true }),
      ).toBeVisible();
      expect(
        await page
          .locator(".home-table-image")
          .first()
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      ).toBe(true);

      const overflow = await page
        .locator(
          ".home-live-heading, .home-table, .home-actions, .home-quiet-links",
        )
        .evaluateAll((elements) =>
          elements
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.className),
        );
      expect(overflow).toEqual([]);
      const join = page.getByRole("button", {
        name: "600128 北位入座",
        exact: true,
      });
      expect(
        await join.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.height >= 44 &&
            el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            )
          );
        }),
      ).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.screenshot({
        path: `test-results/screenshots/home-reference-${role}-${width}.png`,
      });
      await join.click();
      await expect.poll(() => joins.length).toBe(1);
      expect(joins[0]).toMatchObject({ type: "join", code: "600128", seat: 3 });
      await page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("button", { name: "我的", exact: true })
        .click();
      await expect(page.getByRole("region", { name: "管理入口" })).toHaveCount(
        role === "admin" ? 1 : 0,
      );
    });
  }

for (const blocked of [false, true]) {
  test(`未获准参赛的成员不能从首页直接入桌：暂停=${blocked}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.routeWebSocket("**/ws", (ws) => {
      const server = ws.connectToServer();
      server.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.account)
          Object.assign(message.account, {
            role: "member",
            canCreateTables: false,
            canPlay: false,
            playBlocked: blocked,
          });
        if (message.type === "tables") message.tables = tables;
        ws.send(JSON.stringify(message));
      });
    });
    await page.goto("/");
    await expect(page.locator(".admission-notice")).toContainText(
      blocked ? "权限已暂停" : "分配战队",
    );
    await expect(page.locator(".home-table-join")).toHaveCount(2);
    for (const button of await page.locator(".home-table-join").all())
      await expect(button).toBeDisabled();
  });
}

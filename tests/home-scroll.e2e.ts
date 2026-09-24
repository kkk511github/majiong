import { test, expect } from "./browser-fixtures";
import { DEFAULT_RULES, type TableSummary } from "../shared/types";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import { mkdirSync } from "node:fs";

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`房间大厅全部牌桌滑动到底并入座 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const tables: TableSummary[] = Array.from({ length: 12 }, (_, i) => ({
      code: String(700000 + i),
      name: `好友牌桌 ${i + 1}`,
      number: i + 1,
      phase: "waiting",
      round: 1,
      rules: DEFAULT_RULES,
      settings: DEFAULT_TABLE_SETTINGS,
      managed: false,
      seats: [null, null, null, null],
    }));
    const joins: any[] = [];
    await page.routeWebSocket("**/ws", (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === "join") joins.push(m);
        else server.send(raw);
      });
      server.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        ws.send(m.type === "tables" ? JSON.stringify({ ...m, tables }) : raw);
      });
    });
    await page.goto("/");
    await expect(page.locator(".game-lobby-connection")).toContainText("12 桌可加入");
    await page.getByRole("button", { name: "房间大厅", exact: true }).click();
    await expect(page.locator(".table-card")).toHaveCount(12);
    const list = page.getByRole("region", { name: "牌桌列表" });
    const metrics = await list.evaluate((el) => ({
      height: el.clientHeight,
      content: el.scrollHeight,
      touch: getComputedStyle(el).touchAction,
    }));
    expect(metrics.content).toBeGreaterThan(metrics.height * 3);
    expect(metrics.touch).toBe("pan-y");
    await list.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => list.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    const join = page.getByRole("button", {
      name: "700011 东位入座",
      exact: true,
    });
    await join.scrollIntoViewIfNeeded();
    expect(
      await join.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    ).toBe(true);
    await join.click();
    await expect.poll(() => joins.length).toBe(1);
    expect(joins[0]).toMatchObject({ type: "join", code: "700011", seat: 0 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/home-scroll-${width}.png`,
    });
  });
}

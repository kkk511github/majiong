import { expect, test, type Page } from "./browser-fixtures";
import { createGame, newPlayer, startRound, viewFor } from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";
import { seededRandom } from "../shared/tiles";
import type { Game } from "../shared/types";
import { mkdirSync } from "node:fs";

// Only the browser's state delivery is replaced; authentication and clock ping/pong use the real service.
async function tableFixture(page: Page) {
  let game = createGame("582619", "clock-ui", { turnSeconds: 10, rounds: 8 });
  game.table = {
    creatorId: "admin",
    groupId: "clock",
    number: 1,
    createdAt: Date.now(),
    settings: normalizeTableSettings(),
  };
  game.players = ["金陵牌友", "秦淮", "钟山", "莫愁"].map((name, i) => ({
    ...newPlayer(String(i), name),
    ready: i !== 3,
  }));
  let push: () => void = () => {},
    drop: () => void = () => {};
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();
    push = () =>
      ws.send(
        JSON.stringify({
          type: "state",
          state: viewFor(game, 0),
          serverNow: Date.now(),
        }),
      );
    drop = () => ws.close();
    server.onMessage((message) => {
      const data = JSON.parse(String(message));
      if (data.type === "session") {
        ws.send(JSON.stringify({ ...data, roomCode: game.code }));
        push();
      } else ws.send(message);
    });
  });
  return {
    update(fn: (g: Game) => Game) {
      game = fn(game);
      game.revision++;
      push();
    },
    drop() {
      drop();
    },
  };
}
for (const [width, height, skew] of [
  [568, 320, -6],
  [932, 430, 6],
]) {
  test(`联机校时 ${width}：准备、超时倒计时与断线恢复不受手机日期影响`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript((hours) => {
      const realNow = Date.now.bind(Date);
      Date.now = () => realNow() + hours * 3600_000;
    }, skew);
    const fixture = await tableFixture(page);
    await page.goto("/");
    await expect(page.locator(".waiting-room")).toBeVisible();
    fixture.update((g) => {
      g.table!.readyDeadline = Date.now() + 10_000;
      return g;
    });
    await expect(page.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /莫愁准备剩余 (?:9|10) 秒/,
    );
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/clock-ready-${width}.png`,
    });
    fixture.update((g) => {
      g.players.forEach((p) => (p!.ready = true));
      return startRound(g, Date.now(), seededRandom(51));
    });
    await expect(page.locator(".table-center strong")).toHaveText(
      /^(?:09|10)$/,
    );
    // Another date change during play cannot lengthen or expire the server deadline.
    await page.evaluate(() => {
      Date.now = () => 1;
    });
    await expect(page.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /出牌剩余(?:9|10)秒/,
    );
    fixture.update((g) => {
      g.deadline = Date.now() - 2000;
      g.players[g.turn]!.overtimeUsedMs = 6000;
      return g;
    });
    await expect(page.locator(".overtime-status")).toHaveCount(0);
    await expect(page.locator(".feedback-flower")).toHaveCount(0);
    await expect(page.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /超时剩余8[78]秒/,
    );
    const hidden = await page.locator(".turn-countdown").evaluateAll((els) =>
      els
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.left < 0 ||
            b.right > innerWidth ||
            b.top < 0 ||
            b.bottom > innerHeight
          );
        })
        .map((el) => el.className),
    );
    expect(hidden).toEqual([]);
    const compass = await page.locator(".table-center").evaluate((el) => {
      const number = el.querySelector("strong")!.getBoundingClientRect();
      return Array.from(el.querySelectorAll(".compass-wind")).map((w) => {
        const b = w.getBoundingClientRect();
        return {
          size: parseFloat(getComputedStyle(w).fontSize),
          overlaps:
            Math.min(b.right, number.right) - Math.max(b.left, number.left) >
              1 &&
            Math.min(b.bottom, number.bottom) - Math.max(b.top, number.top) > 1,
        };
      });
    });
    expect(compass.filter((w) => w.size < 13 || w.overlaps)).toEqual([]);
    await page.screenshot({
      path: `test-results/screenshots/clock-overtime-${width}.png`,
    });
    fixture.drop();
    await expect(page.locator(".table-center small")).toHaveText("重连中");
    await expect(page.getByRole("timer")).toHaveCount(0);
    await expect(page.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /超时剩余(?:7[89]|8[0-7])秒/,
      { timeout: 12000 },
    );
    await expect(page.locator(".table-center strong")).not.toHaveText("90");
  });
}

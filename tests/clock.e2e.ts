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
    settings: normalizeTableSettings({ openingAnimation: false }),
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
    const frame = page.frameLocator('#cocos-table-board iframe');
    await expect.poll(() => frame.locator('body').evaluate(() => !!(window as any).__JINLING_TABLE_READY__), { timeout: 15000 }).toBe(true);
    // First entry loads real resources. Start a fresh server window after READY
    // so resource startup time is not mistaken for a clock synchronization bug.
    fixture.update(g => { g.deadline = Date.now() + 10_000; return g; });
    await expect(page.getByRole('timer')).toHaveText(/^(?:09|10)$/);
    await expect.poll(() => frame.locator('body').evaluate(async () => {
      const cc = await (window as any).System.import('cc');
      return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').countdownLabel?.string;
    })).toMatch(/^(?:09|10)$/);
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
      /超时剩余8[12]秒/,
    );
    const compass = await frame.locator('body').evaluate(async () => {
      const cc = await (window as any).System.import('cc');
      const scene = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
      const number = scene.countdownLabel.node.getComponent(cc.UITransform).getBoundingBoxToWorld();
      return scene.compassWinds.map((wind: any) => {
        const b = wind.node.getComponent(cc.UITransform).getBoundingBoxToWorld();
        return { size: wind.fontSize,
          inside: b.xMin >= 0 && b.xMax <= 1280 && b.yMin >= 0 && b.yMax <= 590,
          overlaps: Math.min(b.xMax, number.xMax) - Math.max(b.xMin, number.xMin) > 1 &&
            Math.min(b.yMax, number.yMax) - Math.max(b.yMin, number.yMin) > 1 };
      });
    });
    expect(compass).toHaveLength(4);
    expect(compass.filter((w: any) => w.size < 13 || !w.inside || w.overlaps)).toEqual([]);
    await page.screenshot({
      path: `test-results/screenshots/clock-overtime-${width}.png`,
    });
    fixture.drop();
    expect(await page.evaluate(async () => {
      const { client } = await import('/src/game-client.ts' as string);
      return client.state.connected;
    })).toBe(false);
    await expect(page.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /超时剩余(?:7[89]|8[0-7])秒/,
      { timeout: 12000 },
    );
    await expect(page.getByRole('timer')).not.toHaveText('90');
  });
}

import {
  test,
  expect,
  type Page,
  type WebSocketRoute,
} from "./browser-fixtures";
import { completedRound } from "./fixtures/completed-round";
import { startRound, viewFor } from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";
import { mkdirSync } from "node:fs";
import type { Game } from "../shared/types";

async function revealFixture(page: Page) {
  let game = completedRound();
  game.code = "582619";
  game.settlementBase = 100;
  game.initialScore = 90;
  game.scoreDivisor = 2;
  game.table = {
    creatorId: "admin",
    groupId: "reveal",
    number: 1,
    createdAt: Date.now(),
    settings: normalizeTableSettings(),
  };
  game.players.forEach((p) => {
    p!.bot = false;
    p!.online = true;
    p!.ready = false;
    p!.trustee = false;
  });
  game.history.at(-1)!.at = Date.now();
  let socket: WebSocketRoute,
    readyCount = 0;
  const push = () =>
    socket.send(
      JSON.stringify({
        type: "state",
        serverNow: Date.now(),
        state: viewFor(game, 0),
      }),
    );
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    const server = ws.connectToServer();
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "ready") {
        readyCount++;
        setTimeout(() => {
          game.players[0]!.ready = true;
          game.revision++;
          push();
          ws.send(
            JSON.stringify({
              type: "ack",
              requestId: m.requestId,
              serverNow: Date.now(),
            }),
          );
        }, 350);
      } else server.send(raw);
    });
    server.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "session") {
        ws.send(JSON.stringify({ ...m, roomCode: game.code }));
        push();
      } else ws.send(raw);
    });
  });
  return {
    update(fn: (g: Game) => Game) {
      game = fn(game);
      game.revision++;
      push();
    },
    renew() {
      socket.send(
        JSON.stringify({
          type: "left",
          lobby: true,
          message: "本桌结束，已按原设置续开空桌",
        }),
      );
    },
    readyCount: () => readyCount,
  };
}
for (const [width, height, edge, bottom] of [
  [568, 320, 0, 0],
  [844, 390, 59, 21],
  [932, 430, 62, 21],
]) {
  test(`每把四家亮牌和分数，10秒续局与最终累计 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left: edge, right: edge, bottom, top: 0 },
    });
    const f = await revealFixture(page);
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "本局牌面" }),
    ).toBeVisible();
    await expect(dialog.locator(".reveal-player")).toHaveCount(4);
    await expect(dialog.locator(".reveal-meta")).toContainText("582619");
    await expect(dialog.locator(".reveal-next")).toContainText(
      "秒后进入下一局",
    );
    await expect(dialog.locator(".reveal-scores").first()).toContainText(
      "本把",
    );
    for (const row of await dialog.locator(".reveal-player").all())
      expect(await row.locator(".tile").count()).toBeGreaterThanOrEqual(13);
    const blocked = () =>
      dialog
        .locator(
          ".reveal-tiles .tile,.reveal-scores,.modal-footer button,.reveal-identity",
        )
        .evaluateAll(
          (els, { edge, bottom }) =>
            els.flatMap((el) => {
              const b = el.getBoundingClientRect();
              const hit = document.elementFromPoint(
                b.x + b.width / 2,
                b.y + b.height / 2,
              );
              return b.left >= edge - 0.5 &&
                b.right <= innerWidth - edge + 0.5 &&
                b.top >= 0 &&
                b.bottom <= innerHeight - bottom + 0.5 &&
                el.contains(hit)
                ? []
                : [
                    {
                      name: el.className,
                      hit: hit?.className,
                      bottom: b.bottom,
                    },
                  ];
            }),
          { edge, bottom },
        );
    expect(await blocked()).toEqual([]);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/round-reveal-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "进入下一局", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "已确认，等待开局", exact: true }),
    ).toBeDisabled();
    expect(f.readyCount()).toBe(1);
    f.update((g) => {
      g.players[2]!.online = false;
      g.history.at(-1)!.at = Date.now() - 11000;
      return g;
    });
    await expect(dialog.locator(".reveal-next")).toContainText(
      "等待离线牌友回桌",
    );
    f.update((g) => {
      g.players.forEach((p) => {
        p!.online = true;
        p!.ready = true;
      });
      return startRound(g);
    });
    await expect(dialog).not.toBeVisible();
    f.update((g) => {
      const ended = completedRound();
      ended.code = g.code;
      ended.table = g.table;
      ended.phase = "finished";
      ended.table!.finishedAt = Date.now();
      return ended;
    });
    await expect(
      dialog.getByRole("heading", { name: "本桌最终战绩" }),
    ).toBeVisible();
    await expect(dialog.locator(".reveal-scores").first()).toContainText(
      "记分",
    );
    expect(await blocked()).toEqual([]);
    await page.screenshot({
      path: `test-results/screenshots/table-final-${width}.png`,
    });
    f.renew();
    await expect(
      dialog.getByRole("heading", { name: "本桌最终战绩" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "返回大厅", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });
  test(`私有听牌提示与新摸牌独立 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left: edge, right: edge, bottom, top: 0 },
    });
    const f = await revealFixture(page);
    await page.goto("/");
    await expect(page.getByRole("dialog")).toBeVisible();
    f.update((g) => {
      g.phase = "playing";
      g.result = undefined;
      g.turn = 0;
      g.players[0]!.melds = [];
      g.players[0]!.hand = [
        0, 4, 8, 36, 40, 44, 72, 76, 80, 108, 109, 110, 112, 32,
      ];
      g.lastDraw = 32;
      g.deadline = Date.now() + 100000;
      return g;
    });
    await expect(page.locator(".self-listening-hints")).toBeVisible();
    await expect(page.locator(".self-listening-hints .tile")).toHaveAttribute(
      "aria-label",
      "南",
    );
    const drawn = page.locator(".hand > .tile").last();
    const startX = await page
      .locator(".hand > .tile")
      .first()
      .evaluate((el) => el.getBoundingClientRect().left);
    await expect(drawn).toHaveAttribute("aria-label", "选择九万");
    const gap = await drawn.evaluate(
      (el) =>
        el.getBoundingClientRect().left -
        el.previousElementSibling!.getBoundingClientRect().right,
    );
    expect(gap).toBeCloseTo(12, 1);
    await drawn.click();
    await expect(page.locator(".self-listening-hints")).toHaveAttribute(
      "aria-label",
      /打出九万后可胡南/,
    );
    await page.locator(".self-listening-hints summary").click();
    expect(
      await page.locator(".self-listening-hints .tile").evaluate((el) => {
        const b = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/screenshots/listen-hint-${width}.png`,
    });
    f.update((g) => {
      g.turn = 1;
      g.players[0]!.hand = g.players[0]!.hand.filter((t) => t !== 32);
      g.lastDraw = undefined;
      return g;
    });
    await expect(page.locator(".self-listening-hints")).toHaveAttribute(
      "aria-label",
      /已听牌/,
    );
    await expect(page.locator(".hand > .tile.drawn")).toHaveCount(0);
    await expect
      .poll(() =>
        page.locator(".hand > .tile").evaluateAll((els) => {
          const boxes = els.map((el) => el.getBoundingClientRect());
          return {
            left: boxes[0].left,
            gaps: boxes
              .slice(1)
              .map((b, i) => Math.round(b.left - boxes[i].right)),
          };
        }),
      )
      .toEqual({ left: startX, gaps: Array(12).fill(0) });
    const emptyRight = await page.locator(".hand").evaluate((el) => {
      const last = el
        .querySelector(".tile:last-child")!
        .getBoundingClientRect();
      return {
        blank: el.getBoundingClientRect().right - last.right,
        width: last.width,
      };
    });
    expect(emptyRight.blank).toBeGreaterThan(emptyRight.width);
    f.update((g) => {
      g.players[0]!.hand[0] = 33;
      return g;
    });
    await expect(page.locator(".self-listening-hints")).toHaveCount(0);
  });
}

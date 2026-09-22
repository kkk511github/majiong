import {
  expect,
  test,
  type Page,
  type WebSocketRoute,
} from "./browser-fixtures";
import { completedRound } from "./fixtures/completed-round";
import { startRound, viewFor } from "../shared/engine";
import { normalizeTableSettings } from "../shared/table-settings";
import type { Game } from "../shared/types";
import { mkdirSync } from "node:fs";

async function fixture(page: Page) {
  let game = completedRound();
  game.code = "582619";
  game.settlementBase = 100;
  game.table = {
    creatorId: "admin",
    groupId: "next",
    number: 1,
    createdAt: Date.now(),
    settings: normalizeTableSettings({ continuousRounds: false }),
  };
  game.players.forEach((p) => {
    p!.bot = false;
    p!.online = true;
    p!.ready = false;
    p!.trustee = false;
  });
  game.history.at(-1)!.at = Date.now() - 11_000;
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
        }, 450);
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
    drop() {
      socket.close();
    },
    readyCount: () => readyCount,
  };
}

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`下一局 ${width}：四家准备状态清楚，离线计时继续，慢网不能重复准备`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const f = await fixture(page);
    await page.goto("/");
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".settlement-readiness")).toHaveCount(4);
    await expect(
      dialog.locator('.settlement-readiness[data-state="waiting"]'),
    ).toHaveCount(4);
    f.update((g) => {
      g.players[1]!.ready = true;
      g.players[2]!.ready = true;
      g.players[2]!.online = false;
      g.players[3]!.trustee = true;
      return g;
    });
    await expect(
      dialog.getByLabel("钟山：离线·计时继续", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByLabel("莫愁：托管就绪", { exact: true }),
    ).toBeVisible();
    const next = dialog.getByRole("button", { name: "再来一局", exact: true });
    await next.click();
    await expect(
      dialog.getByRole("button", { name: "正在准备…", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByLabel("金陵牌友：已准备", { exact: true }),
    ).toBeVisible();
    expect(f.readyCount()).toBe(1);
    await expect(dialog.locator(".result-next-info")).toContainText(
      "全员就绪，正在发牌",
    );
    f.update((g) => { g.players[2]!.trustee = true; return g; });
    await expect(dialog.getByLabel("钟山：离线·托管", { exact: true })).toBeVisible();
    await expect(dialog.locator(".result-next-info")).toContainText("全员就绪，正在发牌");
    f.update((g) => { g.players[2]!.trustee = false; return g; });
    const hidden = await dialog
      .locator(
        ".reveal-tiles .tile,.reveal-scores,.result-next-info,.result-footer button,.modal-head button",
      )
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.top < 0 ||
              r.bottom > innerHeight ||
              r.left < 0 ||
              r.right > innerWidth ||
              (el.tagName === "TR" &&
                r.bottom >
                  el.closest(".modal-body")!.getBoundingClientRect().bottom) ||
              !el.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              )
            );
          })
          .map((el) => el.className),
      );
    expect(hidden).toEqual([]);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/next-round-${width}.png`,
    });
    f.drop();
    await expect(
      dialog.getByRole("button", { name: "等待重新连接", exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.locator('.settlement-readiness[data-state="syncing"]'),
    ).toHaveCount(4);
    await expect(
      dialog.getByLabel("钟山：离线·计时继续", { exact: true }),
    ).toBeVisible({ timeout: 12000 });
    f.update((g) => {
      g.players[2]!.online = true;
      return g;
    });
    await expect(dialog.locator(".result-next-info")).toContainText(
      "全员就绪，正在发牌",
    );
    f.update((g) => {
      g.players.forEach((p) => (p!.ready = true));
      return startRound(g, Date.now());
    });
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("main", { name: "南京麻将牌桌" })).toBeVisible();
    const frame = await page.locator("iframe").elementHandle();
    const table = await frame!.contentFrame();
    await expect.poll(() => table!.evaluate(async () => {
      const cc = await (window as any).System.import("cc");
      const scene = cc.director.getScene()?.getChildByName("Canvas")?.getComponent("TableScene");
      return scene && {
        round: scene.state.round,
        hand: scene.state.players.find((p: any) => p.seat === scene.state.me)?.hand.length,
      };
    })).toMatchObject({ round: 2, hand: 13 });
  });
}

test("重新打开App时原桌已结束归档，自动展示战绩", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.account && client.state.connected;
  });
  await page.evaluate(async () => {
    const { client, storage } = await import("/src/game-client.ts" as string);
    storage.set(`activeRoom:${client.state.account.id}`, "archived-offline-table");
  });
  await page.reload();
  await expect(page.getByRole("region", { name: "战绩中心" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "战绩", exact: true })).toBeVisible();
});

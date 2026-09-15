import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };

test("四家碰牌都显示生成的透明特效，避开牌面并按时消失", async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  const v = viewFor(structuredClone(late) as unknown as Game, 0);
  v.phase = "playing";
  v.result = undefined;
  v.actions = [];
  v.selfKongs = [];
  v.canDiscard = false;
  v.players.forEach((p) => {
    if (p) {
      p.melds = [];
      p.discards = p.discards.slice(0, 5);
      p.flowers = p.flowers.slice(0, 2);
    }
  });
  let socket: WebSocketRoute;
  const push = () =>
    socket.send(
      JSON.stringify({ type: "state", state: v, serverNow: Date.now() }),
    );
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    ws.connectToServer().onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "session") {
        ws.send(JSON.stringify({ ...m, roomCode: v.code }));
        push();
      } else ws.send(raw);
    });
  });
  await page.goto("/");
  await expect(page.locator("#table-board")).toBeVisible();
  for (const seat of [0, 1, 2, 3]) {
    v.players[seat]!.melds.push({
      type: "pung",
      tiles: [0, 1, 2],
      from: 0,
      concealed: false,
    });
    v.revision++;
    push();
    const effect = page.locator(`.feedback-${seat}.generated-pung`);
    await expect(effect).toBeVisible();
    await expect(effect.locator("img")).toHaveJSProperty("complete", true);
    expect(
      await effect.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return [
          ...document.querySelectorAll(
            ".tile,.tile-back,.table-hud,.game-actions",
          ),
        ].every((tile) => {
          const t = tile.getBoundingClientRect();
          return (
            r.right <= t.left ||
            r.left >= t.right ||
            r.bottom <= t.top ||
            r.top >= t.bottom
          );
        });
      }),
    ).toBe(true);
    await expect(effect).toHaveCount(0, { timeout: 2000 });
  }
});

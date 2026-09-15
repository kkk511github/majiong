import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };

for (const [width, height, edge, bottom] of [[568, 320, 0, 0], [844, 390, 59, 21], [932, 430, 62, 21]]) {
  test(`选牌查河 ${width}：选中即高亮，切换与零张正确，第二次才出牌`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { left: edge, right: edge, top: 0, bottom } });
    const view = viewFor(structuredClone(late) as unknown as Game, 0);
    view.phase = "playing";
    view.turn = 0;
    view.canDiscard = true;
    view.actions = [];
    view.selfKongs = [];
    view.players[0]!.hand = [0, 4, 8, 12, 16, 20, 24, 28, 36, 40, 44, 60, 72, 108];
    view.players[0]!.melds = [];
    view.players[0]!.trustee = false;
    view.lastDraw = 108;
    view.lastDiscard = { tile: 37, seat: 1 };
    [[13], [14, 37], [15, 38, 61], [62]].forEach((tiles, i) => { view.players[i]!.discards = tiles; });
    let socket: WebSocketRoute;
    const actions: unknown[] = [];
    const push = () => socket.send(JSON.stringify({ type: "state", state: view, serverNow: Date.now() }));
    await page.routeWebSocket("**/ws", (ws) => {
      socket = ws;
      const server = ws.connectToServer();
      server.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === "session") {
          ws.send(JSON.stringify({ ...message, roomCode: view.code }));
          push();
        } else ws.send(raw);
      });
      ws.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.type !== "action") return server.send(raw);
        actions.push(message.action);
        if (message.action.type === "discard") {
          const tile = message.action.tile;
          view.players[0]!.hand = view.players[0]!.hand.filter((t) => t !== tile);
          view.players[0]!.discards.push(tile);
          view.lastDiscard = { tile, seat: 0 };
          view.canDiscard = false;
          view.turn = 1;
          view.revision++;
          push();
        }
      });
    });
    await page.goto("/");
    const fourth = page.getByRole("button", { name: "选择四万", exact: true });
    await expect(fourth).toBeVisible();
    await expect(page.locator(".matching-discard")).toHaveCount(0);
    await fourth.click();
    await expect(fourth).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status", { name: "四万，河里已出3张" })).toBeVisible();
    await expect(page.locator(".matching-discard")).toHaveCount(3);
    for (const seat of [0, 1, 2]) await expect(page.locator(`.discards-${seat} .matching-discard .tile`)).toHaveAttribute("aria-label", "四万");
    expect(actions).toEqual([]);
    const display = page.locator(".inspecting-discard");
    expect(await display.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return [...document.querySelectorAll(".opponent-rack .tile,.hand .tile,.discard-field .tile")].every((tile) => {
        const b = tile.getBoundingClientRect();
        return Math.min(r.right, b.right) - Math.max(r.left, b.left) <= 0.5 || Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) <= 0.5;
      });
    })).toBe(true);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({ path: `test-results/screenshots/selected-four-wan-${width}.png` });
    await page.getByRole("button", { name: "选择八万", exact: true }).click();
    await expect(page.locator(".matching-discard")).toHaveCount(0);
    await expect(page.getByRole("status", { name: "八万，河里已出0张" })).toBeVisible();
    await page.getByRole("button", { name: "选择一筒", exact: true }).click();
    await expect(page.locator(".matching-discard")).toHaveCount(2);
    await expect(page.getByRole("status", { name: "一筒，河里已出2张" })).toBeVisible();
    await fourth.click();
    await expect(page.locator(".matching-discard")).toHaveCount(3);
    expect(actions).toEqual([]);
    await fourth.click();
    await expect(fourth).toHaveCount(0);
    await expect(page.locator(".matching-discard")).toHaveCount(0);
    await expect(page.locator(".inspecting-discard")).toHaveCount(0);
    await expect(page.locator(".recent-discard .tile")).toHaveAttribute("aria-label", "四万");
    expect(actions).toEqual([{ type: "discard", tile: 12 }]);
  });
}

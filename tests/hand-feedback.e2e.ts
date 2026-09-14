import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };
import { mkdirSync } from "node:fs";
for (const platform of ["standard", "android"])
  for (const [width, height] of [
    [844, 390],
    [1280, 576],
    [568, 320],
  ]) {
    test(`手牌旁听口与操作 ${platform} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const v = viewFor(structuredClone(late) as unknown as Game, 0);
      v.phase = "playing";
      v.turn = 0;
      v.canDiscard = true;
      v.actions = [];
      v.selfKongs = [];
      v.pending = undefined;
      v.deadline = Date.now() + 100000;
      const p = v.players[0]!;
      p.hand = [0, 1, 4, 5, 8, 92, 96, 100];
      p.melds = [
        { type: "pung", tiles: [64, 65, 66], from: 1, concealed: false },
        { type: "pung", tiles: [24, 25, 26], from: 1, concealed: false },
      ];
      p.trustee = false;
      p.trusteeLocked = false;
      p.flowers = [124, 128, 136, 140];
      v.lastDraw = 8;
      v.players.forEach((p) => {
        if (p) p.discards = p.discards.slice(0, 10);
      });
      let socket: WebSocketRoute;
      const push = () =>
        socket.send(
          JSON.stringify({ type: "state", state: v, serverNow: Date.now() }),
        );
      await page.routeWebSocket("**/ws", (ws) => {
        socket = ws;
        const server = ws.connectToServer();
        server.onMessage((raw) => {
          const m = JSON.parse(String(raw));
          if (m.type === "session") {
            ws.send(JSON.stringify({ ...m, roomCode: v.code }));
            push();
          } else ws.send(raw);
        });
      });
      await page.goto("/");
      await expect(page.locator("#table-board")).toBeVisible();
      await page.evaluate(
        (platform) =>
          (document.documentElement.dataset.tablePlatform = platform),
        platform,
      );
      await page.getByRole("button", { name: "选择三万", exact: true }).click();
      const hints = page.getByRole("status", {
        name: /仅自己可见：打出三万后可胡一万、二万/,
      });
      await expect(hints).toBeVisible();
      await expect(hints.locator(".tile")).toHaveCount(2);
      const hand = (await page.locator(".hand").boundingBox())!,
        hint = (await hints.boundingBox())!;
      expect(hint.y).toBeGreaterThan(height * 0.45);
      expect(hint.y + hint.height).toBeLessThanOrEqual(hand.y - 5);
      expect(
        await hints.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [
            ...document.querySelectorAll(".discard-field .tile,.hand .tile"),
          ].every((tile) => {
            const b = tile.getBoundingClientRect();
            return (
              Math.min(r.right, b.right) - Math.max(r.left, b.left) < 1 ||
              Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) < 1
            );
          });
        }),
      ).toBe(true);
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.screenshot({
        path: `test-results/screenshots/hand-waits-${platform}-${width}.png`,
      });
      const compass = page.locator(".table-hud");
      expect(
        await compass.evaluate((el) => {
          const c = el.querySelector(".table-center")!.getBoundingClientRect();
          return [...el.querySelectorAll(".table-stock,.table-rounds")].every(
            (e) => {
              const r = e.getBoundingClientRect();
              return r.right + 4 <= c.left || r.left >= c.right + 4;
            },
          );
        }),
      ).toBe(true);
      p.hand = p.hand.filter((t) => t !== 8);
      v.canDiscard = false;
      v.phase = "claiming";
      v.actions = ["pass", "pung", "kong", "hu"];
      v.pending = { tile: 2, from: 1, kind: "discard", answered: false };
      v.revision++;
      push();
      await expect(
        page.getByRole("button", { name: "胡", exact: true }),
      ).toBeVisible();
      const rows = await page
        .locator(".game-actions > button")
        .evaluateAll((buttons) =>
          buttons.map((b) => b.getBoundingClientRect().top),
        );
      expect(Math.max(...rows) - Math.min(...rows)).toBeLessThan(1);
      const actions = (await page.locator(".game-actions").boundingBox())!;
      expect(actions.y).toBeGreaterThan(height * 0.45);
      expect(actions.y + actions.height).toBeLessThanOrEqual(hand.y - 5);
      expect(actions.x + actions.width).toBeLessThan(width - 35);
      expect(
        await page.locator(".game-actions").evaluate((el) => {
          const r = el.getBoundingClientRect();
          return [
            ...document.querySelectorAll(
              ".discard-field .tile,.opponent-rack .tile,.hand .tile",
            ),
          ].every((tile) => {
            const b = tile.getBoundingClientRect();
            return (
              Math.min(r.right, b.right) - Math.max(r.left, b.left) < 1 ||
              Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) < 1
            );
          });
        }),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/screenshots/hand-claims-${platform}-${width}.png`,
      });
    });
  }

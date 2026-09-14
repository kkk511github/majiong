import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game, Seat } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };
import { tileName } from "../shared/tiles";
for (const [width, height] of [
  [568, 320],
  [874, 402],
])
  test(`最新弃牌与碰牌来源 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const view = viewFor(structuredClone(late) as unknown as Game, 0);
    view.actions = ["pung", "kong", "hu", "pass"];
    view.phase = "claiming";
    view.canDiscard = false;
    view.selfKongs = [];
    let socket: WebSocketRoute;
    const push = () => {
      view.revision++;
      socket.send(
        JSON.stringify({ type: "state", state: view, serverNow: Date.now() }),
      );
    };
    await page.routeWebSocket("**/ws", (ws) => {
      socket = ws;
      const server = ws.connectToServer();
      server.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === "session") {
          ws.send(JSON.stringify({ ...m, roomCode: view.code }));
          push();
        } else ws.send(raw);
      });
    });
    await page.goto("/");
    await expect(page.locator("#table-board")).toBeVisible();
    for (const seat of [1, 2, 3] as Seat[]) {
      const tile = view.players[seat]!.discards.at(-1)!;
      view.lastDiscard = { seat, tile };
      view.pending = { from: seat, tile, kind: "discard", answered: false };
      push();
      const source = `${view.players[seat]!.name}打出${tileName(tile)}`;
      await expect(page.locator(".claim-source")).toHaveAttribute(
        "aria-label",
        source,
      );
      await expect(page.locator(".last-discard-arrow")).toHaveCount(1);
      await expect(
        page.locator(
          `.discards-${seat} .river-tile:has(.last-discard-arrow) .tile`,
        ),
      ).toHaveAttribute("aria-label", tileName(tile));
      const label = await page.locator(".claim-source").boundingBox();
      const buttons = await page.locator(".game-actions").boundingBox();
      expect(
        label!.y + label!.height <= buttons!.y ||
          label!.x + label!.width <= buttons!.x,
      ).toBe(true);
      expect(
        await page.locator(".claim-source").evaluate((el) => {
          const a = el.getBoundingClientRect();
          return [
            ...document.querySelectorAll(
              ".hand .tile,.flower-rack .tile,.discard-field .tile,.opponent-rack .tile",
            ),
          ].every((b) => {
            const r = b.getBoundingClientRect();
            return (
              Math.min(a.right, r.right) - Math.max(a.left, r.left) <= 0.6 ||
              Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) <= 0.6
            );
          });
        }),
      ).toBe(true);
    }
    const previous = structuredClone(view);
    view.actions = [];
    view.pending = undefined;
    view.phase = "playing";
    for (const count of [1, 8, 9, 16, 17, 24, 25, 32]) {
      for (const seat of [0, 1, 2, 3] as Seat[]) {
        // One long river and three normal rivers: all four at 32 plus hands
        // would exceed the 144-tile deck. Full-capacity layout is tested apart.
        view.players.forEach((p, i) => {
          if (p)
            p.discards = Array.from(
              { length: i === seat ? count : 12 },
              (_, j) => i * 32 + j,
            );
        });
        view.lastDiscard = { seat, tile: view.players[seat]!.discards.at(-1)! };
        push();
        const arrow = page.locator(".last-discard-arrow");
        await expect(arrow).toHaveAttribute(
          "data-row",
          String(Math.floor((count - 1) / 8)),
        );
        await expect(arrow, `seat ${seat}, count ${count}`).toBeVisible();
        const check = await arrow.evaluate((el) => {
          const a = el.getBoundingClientRect();
          const target = el.parentElement!;
          const t = target.getBoundingClientRect();
          const dir = el.getAttribute("data-direction");
          const cx = (a.left + a.right) / 2,
            cy = (a.top + a.bottom) / 2;
          const pointsAtTarget =
            dir === "down"
              ? a.bottom < t.top && cx > t.left && cx < t.right
              : dir === "up"
                ? a.top > t.bottom && cx > t.left && cx < t.right
                : dir === "right"
                  ? a.right < t.left && cy > t.top && cy < t.bottom
                  : a.left > t.right && cy > t.top && cy < t.bottom;
          const sight =
            dir === "up" || dir === "down"
              ? {
                  left: cx - 1,
                  right: cx + 1,
                  top: dir === "down" ? a.bottom : t.bottom,
                  bottom: dir === "down" ? t.top : a.top,
                }
              : {
                  top: cy - 1,
                  bottom: cy + 1,
                  left: dir === "right" ? a.right : t.right,
                  right: dir === "right" ? t.left : a.left,
                };
          const overlap = (r: DOMRect | typeof sight, b: DOMRect) =>
            Math.min(r.right, b.right) - Math.max(r.left, b.left) > 0.6 &&
            Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > 0.6;
          const obstacles = [
            ...document.querySelectorAll(
              ".river-tile,.hand .tile,.flower-rack .tile,.opponent-rack .tile,.opponent-rack .tile-back,.table-center",
            ),
          ];
          return {
            pointsAtTarget,
            overlaps: obstacles
              .filter((o) => overlap(a, o.getBoundingClientRect()))
              .map((o) => o.className),
            blocked: obstacles
              .filter(
                (o) =>
                  o !== target && overlap(sight, o.getBoundingClientRect()),
              )
              .map((o) => o.className),
            motion: getComputedStyle(el).animationName,
          };
        });
        expect(check, `seat ${seat}, count ${count}`).toEqual({
          pointsAtTarget: true,
          overlaps: [],
          blocked: [],
          motion: "discard-pointer",
        });
        if (width === 874 && count === 9)
          await page.screenshot({
            path: `test-results/screenshots/arrow-row2-seat${seat}.png`,
          });
      }
    }
    Object.assign(view, previous);
    push();
    await page.screenshot({
      path: `test-results/screenshots/claim-marker-${width}.png`,
    });
    view.pending!.answered = true;
    push();
    await expect(page.locator(".claim-source")).toHaveCount(0);
    view.players[3]!.discards.pop();
    view.pending = undefined;
    view.actions = [];
    push();
    await expect(page.locator(".last-discard-arrow")).toHaveCount(0);
    view.pending = { from: 1, tile: 120, kind: "robKong", answered: false };
    view.actions = ["hu", "pass"];
    push();
    await expect(page.locator(".claim-source")).toContainText("补杠");
    await expect(page.locator(".last-discard-arrow")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "听牌提示", exact: true }),
    ).toHaveCount(0);
  });

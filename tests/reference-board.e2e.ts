import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };
for (const [width, height, edge, bottom] of [
  [874, 402, 62, 21],
  [844, 390, 59, 21],
  [932, 430, 59, 21],
  [812, 375, 44, 21],
  [568, 320, 0, 0],
  [1280, 853, 0, 0],
]) {
  test(`自适应整桌 ${width}：不拉伸、正确朝向、弃牌固定尺寸`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left: edge, right: edge, top: 0, bottom },
    });
    const view = viewFor(structuredClone(late) as unknown as Game, 0);
    view.players.forEach((p, i) => {
      if (p) {
        p.discards = p.discards.slice(0, 5);
        p.melds = [];
        p.hand = [];
        p.handCount = 13;
        p.flowers = [124 + i, 128 + i];
      }
    });
    view.players[0]!.hand = [
      0, 4, 8, 16, 24, 32, 36, 48, 56, 72, 76, 80, 108, 112,
    ];
    view.players[1]!.melds = [
      { type: "pung", tiles: [12, 13, 14], from: 0, concealed: false },
    ];
    view.players[1]!.handCount = 10;
    view.phase = "playing";
    view.turn = 0;
    view.canDiscard = true;
    view.lastDraw = 112;
    view.actions = [];
    view.selfKongs = [];
    let socket: WebSocketRoute;
    const push = () =>
      socket.send(
        JSON.stringify({ type: "state", state: view, serverNow: Date.now() }),
      );
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
    await page.waitForTimeout(250);
    const board = await page.locator("#table-board").boundingBox();
    expect(board).toEqual({ x: 0, y: 0, width, height });
    for (const side of ["left", "right"]) {
      const matrix = await page
        .locator(`.opponent-${side} .opponent-rack`)
        .evaluate((el) => getComputedStyle(el).transform);
      expect(matrix).toContain(
        side === "left" ? "matrix(0, 1, -1, 0" : "matrix(0, -1, 1, 0",
      );
    }
    const hand = await page.locator(".hand > .tile").first().boundingBox();
    expect(hand!.height / hand!.width).toBeCloseTo(1.45, 1);
    const initial = await page
      .locator(".discards-0 .tile")
      .first()
      .boundingBox();
    // All rivers use the larger opponent size, including our own discards.
    expect(initial!.height).toBeGreaterThanOrEqual(20);
    for (const seat of [1, 2, 3]) {
      const other = (await page
        .locator(`.discards-${seat} .tile`)
        .first()
        .boundingBox())!;
      expect(
        Math.abs(other.width - (seat % 2 ? initial!.height : initial!.width)),
      ).toBeLessThan(0.05);
      expect(
        Math.abs(other.height - (seat % 2 ? initial!.width : initial!.height)),
      ).toBeLessThan(0.05);
    }
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/room-reflow-${width}.png`,
    });
    await page.locator(".hand > .tile").nth(7).click();
    await page.waitForTimeout(300);
    for (const count of [8, 9, 16, 17, 24, 32]) {
      view.players.forEach((p, i) => {
        if (p) p.discards = Array.from({ length: count }, (_, j) => i * 32 + j);
      });
      view.revision++;
      push();
      await expect(page.locator(".discards-0 .tile")).toHaveCount(count);
      expect(
        await page.locator(".discards-0 .tile").first().boundingBox(),
      ).toEqual(initial);
      const issues = await page.locator("#table-board").evaluate((el) => {
        const tiles = [...el.querySelectorAll(".discard-field .tile")],
          obstacles = [
            ...el.querySelectorAll(
              ".hand .tile,.flower-rack .tile,.opponent-melds .tile,.opponent-hand .tile-back,.table-center",
            ),
          ];
        const collision = (a: Element, b: Element) => {
          const x = a.getBoundingClientRect(),
            y = b.getBoundingClientRect();
          return (
            Math.min(x.right, y.right) - Math.max(x.left, y.left) > 0.6 &&
            Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 0.6
          );
        };
        return tiles.flatMap((t, i) =>
          [...tiles.slice(i + 1), ...obstacles]
            .filter((o) => collision(t, o))
            .map((o) => ({
              river: t.closest(".discards")!.className,
              other: o.parentElement!.className,
              box: [
                t.getBoundingClientRect().toJSON(),
                o.getBoundingClientRect().toJSON(),
              ],
            })),
        );
      });
      expect(issues).toEqual([]);
    }
    for (const tile of await page.locator(".hand > .tile").all()) {
      await tile.click();
      await expect(tile).toHaveClass(/selected/);
      await expect
        .poll(() =>
          tile.evaluate((el) => {
            const top = el.getBoundingClientRect().top;
            const bottom = Math.max(
              ...[...document.querySelectorAll(".discards-0 .tile")].map(
                (t) => t.getBoundingClientRect().bottom,
              ),
            );
            return top - bottom;
          }),
        )
        .toBeGreaterThanOrEqual(8);
    }
    await page.screenshot({
      path: `test-results/screenshots/room-full-${width}.png`,
    });
    view.players.forEach((p, i) => {
      if (p) {
        // A four-kong rack consumes 16 physical tiles. Keep a valid-sized
        // river here; 32 discards plus four kongs at every seat exceeds the deck.
        p.discards = p.discards.slice(0, 8);
        p.flowers = Array.from({ length: 5 }, (_, n) => 124 + i * 5 + n);
        if (i !== 0) {
          p.hand = [];
          p.handCount = 2;
          p.melds = Array.from({ length: 4 }, (_, n) => ({
            type: "kong" as const,
            tiles: [0, 1, 2, 3].map((x) => n * 4 + x),
            from: 0 as const,
            concealed: false,
          }));
        }
      }
    });
    view.actions = ["pung", "kong", "hu", "pass"];
    view.revision++;
    push();
    await expect(page.locator(".game-actions > button")).toHaveCount(4);
    await page.waitForTimeout(300);
    const raisedHandTop = (await page.locator(".hand").boundingBox())!.y;
    for (const button of await page.locator(".game-actions > button").all()) {
      const box = (await button.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(raisedHandTop);
      expect(
        await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        }),
      ).toBe(true);
    }
    const publicCollisions = () =>
      page.locator("#table-board").evaluate((el) => {
        const boxes = [
          ...el.querySelectorAll(
            ".flower-rack .tile,.hand .tile,.discard-field .tile,.opponent-rack .tile,.opponent-rack .tile-back,.game-actions > button,.my-info > div:last-child > button",
          ),
        ];
        const hit = (a: Element, b: Element) => {
          const r = a.getBoundingClientRect(),
            s = b.getBoundingClientRect();
          return (
            Math.min(r.right, s.right) - Math.max(r.left, s.left) > 0.6 &&
            Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 0.6
          );
        };
        return boxes.flatMap((a, i) =>
          boxes
            .slice(i + 1)
            .filter((b) => a.parentElement !== b.parentElement && hit(a, b))
            .map((b) => ({
              a: a.parentElement!.className,
              b: b.parentElement!.className,
              box: [
                a.getBoundingClientRect().toJSON(),
                b.getBoundingClientRect().toJSON(),
              ],
            })),
        );
      });
    expect(await publicCollisions()).toEqual([]);
    await page.screenshot({
      path: `test-results/screenshots/room-actions-${width}.png`,
    });
    const topTray = page.locator(".opponent-top .flower-rack");
    await expect(topTray.locator(".flower-rack-label")).toBeVisible();
    expect(
      await topTray.evaluate((el) => {
        const style = getComputedStyle(el);
        const frame = el.getBoundingClientRect();
        return (
          parseFloat(style.borderTopWidth) >= 1 &&
          style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          [...el.querySelectorAll(".tile")].every((t) => {
            const r = t.getBoundingClientRect();
            return (
              r.left > frame.left &&
              r.right < frame.right &&
              r.top > frame.top &&
              r.bottom < frame.bottom
            );
          })
        );
      }),
    ).toBe(true);
    for (const position of ["left", "right", "top"]) {
      const ratio = await page
        .locator(`.opponent-${position} .opponent-melds .tile`)
        .first()
        .evaluate((el) => {
          const meld = getComputedStyle(el);
          const flower = getComputedStyle(
            document.querySelector(".hand-support .flower-rack .tile")!,
          );
          return parseFloat(meld.width) / parseFloat(flower.width);
        });
      expect(ratio).toBeCloseTo(1.2, 2);
    }
    view.players[2]!.flowers = Array.from({ length: 20 }, (_, i) => 124 + i);
    view.revision++;
    push();
    await expect(
      page.locator(".opponent-top .opponent-rack .flower-rack .tile"),
    ).toHaveCount(20);
    expect(
      await page
        .locator(".opponent-top .opponent-rack")
        .evaluate((el, edge) => {
          const r = el.getBoundingClientRect();
          return r.left >= edge - 0.5 && r.right <= innerWidth - edge + 0.5;
        }, edge),
    ).toBe(true);
    view.players[2]!.flowers = view.players[2]!.flowers.slice(0, 5);
    view.players.forEach((p, i) => {
      if (p) {
        p.discards = p.discards.slice(0, 8);
        if (i !== 0) {
          p.melds = p.melds.slice(0, 1);
          p.handCount = 10;
        }
      }
    });
    view.revision++;
    push();
    await page.waitForTimeout(2200);
    expect(await publicCollisions()).toEqual([]);
    await page.screenshot({
      path: `test-results/screenshots/room-actions-preview-${width}.png`,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".game-actions > button")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
  });
}

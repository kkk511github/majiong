import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };
test.use({
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36",
});
for (const [width, height, edge, bottom] of [
  [800, 360, 0, 0],
  [853, 384, 0, 0],
  [915, 412, 0, 0],
  [960, 432, 24, 0],
  [1280, 576, 0, 0],
  [640, 360, 0, 0],
]) {
  test(`安卓大牌整桌 ${width}：不拉伸、正确朝向、弃牌固定尺寸`, async ({
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
    const sizeRatios = await page.evaluate(() => {
      const root = document.documentElement;
      const selectors = [
        ".hand > .tile",
        ".hand-support .flower-rack .tile",
        ".opponent-melds .tile",
        ".opponent-left .opponent-hand .tile-back",
        ".opponent-top .opponent-hand .tile-back",
      ];
      const sizes = () =>
        selectors.map((selector) => {
          const r = document.querySelector(selector)!.getBoundingClientRect();
          return Math.min(r.width, r.height);
        });
      root.dataset.tablePlatform = "standard";
      const before = sizes();
      root.dataset.tablePlatform = "android";
      return sizes().map((value, index) => value / before[index]);
    });
    for (const ratio of sizeRatios) expect(ratio).toBeCloseTo(1, 3);
    await page.waitForTimeout(150);
    const board = await page.locator("#table-board").boundingBox();
    expect(board).toEqual({ x: 0, y: 0, width, height });
    for (const side of ["left", "right"]) {
      const matrix = await page
        .locator(`.opponent-${side} .opponent-hand .tile-back .tile-art`)
        .first()
        .evaluate((el) => getComputedStyle(el).transform);
      expect(matrix).toContain(
        side === "left" ? "matrix(0, 1, -1, 0" : "matrix(0, -1, 1, 0",
      );
      const back = (await page
        .locator(`.opponent-${side} .opponent-hand .tile-back`)
        .first()
        .boundingBox())!;
      const across = (await page
        .locator(".opponent-top .opponent-hand .tile-back")
        .first()
        .boundingBox())!;
      // Side-on tiles should still have substance, rather than a hairline strip.
      expect(back.height).toBeGreaterThanOrEqual(across.width * 0.5);
      expect(back.width).toBeGreaterThanOrEqual(across.height);
      // Verify the painted art, not only its layout box: absolutely positioned
      // backs must stay anchored to their own tile rather than stack together.
      for (const tile of await page
        .locator(`.opponent-${side} .opponent-hand .tile-back`)
        .all()) {
        const box = (await tile.boundingBox())!;
        const art = (await tile.locator(".tile-art").boundingBox())!;
        for (const key of ["x", "y", "width", "height"] as const) {
          expect(Math.abs(box[key] - art[key])).toBeLessThan(0.1);
        }
      }
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
      path: `test-results/screenshots/android-room-reflow-${width}.png`,
    });
    await page.locator(".hand > .tile").nth(7).click();
    await page.waitForTimeout(300);
    // Stress full rivers independently of exposed sets (128 discards plus
    // melds and four complete hands exceeds the physical deck).
    view.players.forEach((p, i) => {
      if (p && i !== 0) {
        p.melds = [];
        p.handCount = 13;
      }
    });
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
              ".hand .tile,.flower-rack .tile,.opponent-melds .tile,.opponent-hand .tile-back,.table-hud",
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
      path: `test-results/screenshots/android-room-full-${width}.png`,
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
            ".flower-rack .tile,.hand .tile,.discard-field .tile,.opponent-rack .tile,.opponent-rack .tile-back,.game-actions > button,.my-info > div:last-child > button,.opponent-info .avatar,.opponent-info strong,.opponent-meta,.flower-rack-label,.table-center > strong,.compass-wind,.table-stock,.table-rounds",
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
      path: `test-results/screenshots/android-room-actions-${width}.png`,
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
          const meld = el.getBoundingClientRect();
          const flower = document
            .querySelector(".opponent-top .opponent-hand .tile-back")!
            .getBoundingClientRect();
          return (
            Math.min(meld.width, meld.height) /
            Math.min(flower.width, flower.height)
          );
        });
      expect(ratio).toBeGreaterThanOrEqual(1.15);
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
    expect(await publicCollisions()).toEqual([]);
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
      path: `test-results/screenshots/android-room-actions-preview-${width}.png`,
    });
    // Three exposed pungs still leave five concealed tiles, a longer rack
    // than the four-kong case. Check this common mixed layout too.
    view.players.forEach((p, i) => {
      if (p && i !== 0) {
        p.melds = Array.from({ length: 3 }, (_, n) => ({
          type: "pung" as const,
          tiles: [n * 4, n * 4 + 1, n * 4 + 2],
          from: 0 as const,
          concealed: false,
        }));
        p.handCount = 5;
      }
    });
    view.revision++;
    push();
    await page.waitForTimeout(300);
    expect(await publicCollisions()).toEqual([]);
    for (const tile of await page
      .locator(".opponent-rack .tile,.opponent-rack .tile-back")
      .all()) {
      const r = (await tile.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeLessThanOrEqual(height);
    }
    for (const flowerCount of [10, 15, 20]) {
      view.players.forEach((p, i) => {
        if (p) {
          p.flowers =
            i === 0
              ? Array.from({ length: flowerCount }, (_, n) => 124 + n)
              : i === 3
                ? Array.from(
                    { length: 20 - flowerCount },
                    (_, n) => 124 + flowerCount + n,
                  )
                : [];
          if (i !== 0) {
            p.melds = p.melds.slice(0, 1);
            p.handCount = 10;
          }
        }
      });
      view.revision++;
      push();
      await page.waitForTimeout(100);
      expect(await publicCollisions()).toEqual([]);
    }
    // Flowers occupy a separate lane even when an opponent owns most of them.
    for (const seat of [1, 2, 3]) {
      view.players.forEach((p, i) => {
        if (p)
          p.flowers =
            i === seat ? Array.from({ length: 20 }, (_, n) => 124 + n) : [];
      });
      view.revision++;
      push();
      await page.waitForTimeout(100);
      expect(await publicCollisions()).toEqual([]);
    }
    // Regression: the user's screenshot combines pungs with a hidden kong.
    // Hidden kongs intentionally contain no tile IDs in another player's view.
    view.players[1]!.melds = [
      { type: "pung", tiles: [72, 73, 74], from: 0, concealed: false },
      { type: "kong", tiles: [], from: 1, concealed: true },
      { type: "pung", tiles: [76, 77, 78], from: 0, concealed: false },
    ];
    view.players[1]!.handCount = 4;
    view.players.forEach((p, i) => {
      if (p) {
        p.flowers = Array.from(
          { length: [3, 4, 4, 5][i] },
          (_, n) => 124 + i * 4 + n,
        );
        p.discards = Array.from(
          { length: i === 1 ? 11 : 9 },
          (_, n) => i * 32 + n,
        );
      }
    });
    view.deadline = Date.now() + 30000;
    view.rules.turnSeconds = 30;
    view.revision++;
    push();
    await page.waitForTimeout(2200);
    expect(await publicCollisions()).toEqual([]);
    for (const group of await page
      .locator(".side-rack .opponent-melds > span")
      .all()) {
      const rows = await group.evaluate((el) =>
        [...el.children].map((t) => t.getBoundingClientRect().left),
      );
      expect(Math.max(...rows) - Math.min(...rows)).toBeLessThan(0.1);
    }
    await page.screenshot({
      path: `test-results/screenshots/android-mixed-kong-${width}.png`,
    });
    // The same rack also displays faces once the round has ended. Verify the
    // art itself remains inside each slot and revealed hands fit the table.
    view.players.forEach((p, i) => {
      if (p && i !== 0)
        p.hand = Array.from({ length: p.handCount }, (_, n) => i * 28 + n);
    });
    view.revision++;
    push();
    await page.waitForTimeout(150);
    expect(await publicCollisions()).toEqual([]);
    for (const tile of await page
      .locator(".side-rack .opponent-hand .tile")
      .all()) {
      const box = (await tile.boundingBox())!;
      const art = (await tile.locator(".tile-art").boundingBox())!;
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(box[key] - art[key])).toBeLessThan(0.1);
      }
    }
    // Regression from the 00:20 Android screenshot: four sets (including
    // an East kong), multiple river columns, and the final revealed pair.
    for (const seat of [1, 3]) {
      view.players.forEach((p, i) => {
        if (p && i !== 0) {
          p.melds = [];
          p.hand = [];
          p.handCount = 13;
          p.discards = Array.from({ length: 8 }, (_, n) => i * 32 + n);
        }
      });
      view.players[seat]!.melds = [
        {
          type: "kong",
          tiles: [108, 109, 110, 111],
          from: 0,
          concealed: false,
        },
        { type: "pung", tiles: [12, 13, 14], from: 0, concealed: false },
        { type: "kong", tiles: [72, 73, 74, 75], from: 0, concealed: false },
        { type: "pung", tiles: [80, 81, 82], from: 0, concealed: false },
      ];
      view.players[seat]!.handCount = 2;
      view.players[seat]!.hand = [76, 77];
      view.players[seat]!.discards = Array.from(
        { length: 24 },
        (_, n) => 36 + n,
      );
      view.actions = [];
      view.canDiscard = false;
      view.revision++;
      push();
      await page.waitForTimeout(2200);
      expect(await publicCollisions()).toEqual([]);
      await page.screenshot({
        path: `test-results/screenshots/android-ended-four-melds-${seat}-${width}.png`,
      });
    }
    view.actions = ["pung", "kong", "hu", "pass"];
    view.revision++;
    push();
    await page.locator(".game-actions > button").first().waitFor();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".game-actions > button")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
  });
}

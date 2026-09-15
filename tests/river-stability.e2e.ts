import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };
import claim from "./fixtures/claim-table.json" with { type: "json" };
import { mkdirSync, writeFileSync } from "node:fs";

for (const [width, height, edge, bottom] of [
  [568, 320, 0, 0],
  [844, 390, 59, 21],
  [932, 430, 62, 21],
  [1366, 768, 0, 0],
]) {
  test(`River tiles keep their size as discards accumulate and actions appear ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { left: edge, right: edge, top: 0, bottom },
    });
    let view = viewFor(structuredClone(late) as unknown as Game, 0);
    view.players.forEach((p) => {
      if (p) p.discards = p.discards.slice(0, 1);
    });
    let socket: WebSocketRoute;
    const push = () =>
      socket.send(
        JSON.stringify({ type: "state", state: view, serverNow: Date.now() }),
      );
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
    });
    await page.goto("/");
    await expect(page.locator(".discards-0 .tile").first()).toBeVisible();
    const sizes = () =>
      page.locator(".discard-field").evaluate((field) => {
        const b = field.getBoundingClientRect();
        const center = field
          .querySelector(".table-center")!
          .getBoundingClientRect();
        return [
          b.x,
          b.y,
          b.width,
          b.height,
          center.x,
          center.y,
          center.width,
          center.height,
          ...[0, 1, 2, 3].flatMap((i) => {
            const grid = field
              .querySelector(`.discards-${i}`)!
              .getBoundingClientRect();
            const r = field
              .querySelector(`.discards-${i} .tile`)!
              .getBoundingClientRect();
            return [
              grid.x,
              grid.y,
              grid.width,
              grid.height,
              r.x,
              r.y,
              r.width,
              r.height,
            ];
          }),
        ].map((n) => Math.round(n * 10) / 10);
      });
    const initial = await sizes();
    mkdirSync("test-results/screenshots", { recursive: true });
    writeFileSync(
      `test-results/screenshots/river-metrics-${width}.json`,
      JSON.stringify(
        {
          width,
          height,
          edge,
          bottom,
          initial,
          rows: await page
            .locator(".discard-field")
            .evaluate((el) =>
              getComputedStyle(el).getPropertyValue("--river-rows"),
            ),
          columns: await page
            .locator(".discard-field")
            .evaluate((el) =>
              getComputedStyle(el).getPropertyValue("--river-columns"),
            ),
        },
        null,
        2,
      ),
    );
    for (const count of [5, 7, 8, 9, 11, 16, 17, 25, 32]) {
      view = structuredClone(view);
      view.players.forEach((p, i) => {
        if (p) p.discards = Array.from({ length: count }, (_, j) => i * 28 + j);
      });
      view.players[0]!.name = `River ${count}`;
      view.revision++;
      push();
      await expect(page.locator(".my-info strong")).toHaveText(
        `River ${count}`,
      );
      await expect.poll(() => sizes()).toEqual(initial);
      const tile = page.locator(".discards-0 .tile").last();
      await expect(tile).toHaveAttribute("aria-label", /./);
      expect(
        Math.max(
          (await tile.boundingBox())!.width,
          (await tile.boundingBox())!.height,
        ),
      ).toBeGreaterThanOrEqual(width < 600 ? 18 : 24);
      // Check the whole painted tile, not just its centre: rotated grid children
      // previously spilled out of their slot and the next row covered an edge.
      const crowded = await page.locator(".discards").evaluateAll((rivers) =>
        rivers.flatMap((river, seat) => {
          const tiles = [...river.querySelectorAll(".tile")];
          return tiles.flatMap((tile, index) => {
            const r = tile.getBoundingClientRect();
            const slot = tile.parentElement!.getBoundingClientRect();
            const out =
              Math.abs(r.left - slot.left) > 0.2 ||
              Math.abs(r.top - slot.top) > 0.2 ||
              Math.abs(r.width - slot.width) > 0.2 ||
              Math.abs(r.height - slot.height) > 0.2;
            const previous = tiles[index - 8]?.getBoundingClientRect();
            const gap = !previous
              ? 2
              : Math.max(
                  r.left - previous.right,
                  previous.left - r.right,
                  r.top - previous.bottom,
                  previous.top - r.bottom,
                );
            return out ||
              gap < 1.8 ||
              getComputedStyle(tile.querySelector(".tile-art")!).filter !==
                "none"
              ? [{ seat, index, out, gap }]
              : [];
          });
        }),
      );
      expect(crowded).toEqual([]);
      const crowdedPlayers = await page
        .locator(".discard-field")
        .evaluate((field) => {
          const rivers = [...field.querySelectorAll(".discards")].map((r) =>
            [...r.querySelectorAll(".tile")].map((t) =>
              t.getBoundingClientRect(),
            ),
          );
          const clock = field
            .querySelector(".table-center")!
            .getBoundingClientRect();
          const gap = (a: DOMRect, b: DOMRect) =>
            Math.max(
              a.left - b.right,
              b.left - a.right,
              a.top - b.bottom,
              b.top - a.bottom,
            );
          return rivers.flatMap((tiles, seat) =>
            tiles.flatMap((tile, index) => {
              const hits = rivers.flatMap((other, owner) =>
                owner === seat
                  ? []
                  : other.flatMap((r, n) =>
                      gap(tile, r) < (innerWidth < 600 ? 8 : 12) - 0.5
                        ? [{ owner, n }]
                        : [],
                    ),
              );
              return hits.length || gap(tile, clock) < 0
                ? [{ seat, index, hits, clockGap: gap(tile, clock) }]
                : [];
            }),
          );
        });
      expect(crowdedPlayers).toEqual([]);
      if (count === 11)
        await page.screenshot({
          path: `test-results/screenshots/river-multirow-${width}.png`,
        });
    }
    for (let i = 0; i < 4; i++) {
      await expect(page.locator(`.discards-${i}`)).toHaveAttribute(
        "data-columns",
        "8",
      );
    }
    view.lastDiscard = { tile: 36, seat: 0 };
    view.revision++;
    push();
    await expect(page.locator(".matching-discard")).toHaveCount(0);
    view.lastDiscard = { tile: 0, seat: 0 };
    view.revision++;
    push();
    await expect(page.locator(".discards-1 .matching-discard")).toHaveCount(0);
    await expect(page.locator(".discards-0 .matching-discard")).toHaveCount(0);
    view.players[0]!.hand = Array.from({ length: 14 }, (_, n) => n * 4);
    view.players[0]!.melds = [];
    view.players[0]!.trustee = false;
    view.players[0]!.name = "Full hand";
    view.lastDraw = 52;
    view.canDiscard = true;
    view.revision++;
    push();
    await expect(page.locator(".my-info strong")).toHaveText("Full hand");
    for (let i = 0; i < 14; i++) {
      await page.locator(".hand > button.tile").nth(i).click();
      await expect(page.locator(".hand > button.tile").nth(i)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const overlapping = await page
        .locator(".discard-field .tile")
        .evaluateAll((tiles) => {
          const hand = [...document.querySelectorAll(".hand > .tile")].map(
            (t) => t.getBoundingClientRect(),
          );
          return tiles
            .filter((t) => {
              const r = t.getBoundingClientRect();
              return hand.some(
                (h) =>
                  Math.min(r.right, h.right) - Math.max(r.left, h.left) > 0.5 &&
                  Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top) > 0.5,
              );
            })
            .map((t) => t.getAttribute("aria-label"));
        });
      expect(overlapping).toEqual([]);
      const hiddenFlowers = await page
        .locator(".flower-rack .tile")
        .evaluateAll((tiles) =>
          tiles
            .filter((t) => {
              const b = t.getBoundingClientRect();
              return !t.contains(
                document.elementFromPoint(
                  b.x + b.width / 2,
                  b.y + b.height / 2,
                ),
              );
            })
            .map((t) => t.getAttribute("aria-label")),
        );
      expect(hiddenFlowers).toEqual([]);
    }
    await expect.poll(() => sizes()).toEqual(initial);
    const settledHand = await page
      .locator(".hand > .tile:not(.selected)")
      .first()
      .boundingBox();
    // The hand sits just inside the complete wooden bottom rail, including safe area.
    const rail = Math.max(18, bottom);
    expect(height - rail - settledHand!.y - settledHand!.height).toBeLessThanOrEqual(4);
    expect(height - rail - settledHand!.y - settledHand!.height).toBeGreaterThanOrEqual(0);
    await page.screenshot({
      path: `test-results/screenshots/river-hand-clearance-${width}.png`,
    });
    view.phase = "claiming";
    view.canDiscard = false;
    view.actions = ["pung", "kong", "hu", "pass"];
    view.selfKongs = [];
    view.pending = viewFor(
      structuredClone(claim) as unknown as Game,
      0,
    ).pending;
    view.revision++;
    push();
    await expect(
      page.getByRole("button", { name: "碰", exact: true }),
    ).toBeVisible();
    await expect.poll(() => sizes()).toEqual(initial);
    const covered = await page
      .locator(
        ".game-actions > button, .my-info .text-button, .discard-field .tile",
      )
      .evaluateAll((elements) =>
        elements.flatMap((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return r.bottom <= innerHeight && el.contains(hit)
            ? []
            : [
                {
                  name: el.textContent || el.getAttribute("aria-label"),
                  by: hit?.className,
                  byParent: hit?.parentElement?.className,
                  byRect: hit?.getBoundingClientRect().toJSON(),
                  rect: r.toJSON(),
                  bottom: r.bottom,
                },
              ];
        }),
      );
    expect(covered).toEqual([]);
    for (let i = 0; i < 4; i++) {
      await expect(page.locator(`.discards-${i} .tile`)).toHaveCount(32);
    }
    await expect(page.locator(".river-more")).toHaveCount(0);
  });
}

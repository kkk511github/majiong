import { test, expect } from "./browser-fixtures";
import late from "./fixtures/late-table.json" with { type: "json" };
import { mkdirSync } from "node:fs";

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  for (const [turn, position] of [
    [1, "right"],
    [2, "top"],
    [3, "left"],
  ] as const) {
    test(`弃牌可读性与当前玩家提示 ${width} ${position}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const saved = structuredClone(late);
      saved.turn = turn;
      // A waiting player with four melds has one concealed tile, not a pending draw.
      saved.players[0].hand = saved.players[0].hand.slice(0, -1);
      delete (saved as { lastDraw?: number }).lastDraw;
      saved.players.forEach((p) => {
        p.bot = false;
        p.trustee = false;
        p.discards = p.discards.slice(0, 3);
      });
      await page.addInitScript((g) => {
        localStorage.setItem("jinling:practice", JSON.stringify(g));
        localStorage.setItem("jinling:name", JSON.stringify(g.players[0].name));
      }, saved);
      await page.goto("/");
      await page.getByRole("button", { name: /继续/ }).click();
      // Inspect this exact seat's turn even when native builds load the machine.
      await page.evaluate(async () => {
        const { client } = await import("/src/game-client.ts" as string);
        client.pauseLocal(true);
      });
      await expect(page.locator(".discard-field .tile").first()).toBeVisible();
      const metrics = await page.evaluate(() => {
        const rect = (selector: string) => {
          const b = document.querySelector(selector)!.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        };
        return {
          field: rect(".discard-field"),
          table: rect(".mahjong-table"),
          center: rect(".table-center"),
          tile: rect(".discards-0 .tile"),
          hand: rect(".hand"),
        };
      });
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.screenshot({
        path: `test-results/screenshots/table-legibility-${width}-${position}.png`,
      });
      expect(metrics.tile.height).toBeGreaterThanOrEqual(
        width === 568 ? 18 : 24,
      );
      const status = page.locator(
        `.opponent-${position} .opponent-turn-status`,
      );
      await expect(status).toContainText("正在思考");
      await expect(page.locator(".opponent-turn-status")).toHaveCount(1);
      await expect(page.locator(".table-status")).not.toContainText("正在思考");
      expect(
        await status.evaluate((el) => {
          const b = el.getBoundingClientRect();
          const overlap = (r: DOMRect) =>
            Math.min(b.right, r.right) - Math.max(b.left, r.left) > 1 &&
            Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) > 1;
          const others = Array.from(
            document.querySelectorAll(
              ".hand, .opponent-rack .tile, .discards .tile, .player-portrait, .game-topbar",
            ),
          ).filter((other) => overlap(other.getBoundingClientRect()));
          return [
            ...(b.left >= 0 &&
            b.right <= innerWidth &&
            b.top >= 0 &&
            b.bottom <= innerHeight
              ? []
              : [{ outside: b.toJSON() }]),
            ...others.map((other) => ({
              name: other.className,
              text: other.getAttribute("aria-label"),
              rect: other.getBoundingClientRect().toJSON(),
              status: b.toJSON(),
            })),
          ];
        }),
      ).toEqual([]);
      expect(
        await page.locator(".discard-field .tile").evaluateAll((tiles) =>
          tiles.every((tile) => {
            const b = tile.getBoundingClientRect();
            return (
              Math.max(b.width, b.height) >= (innerWidth < 600 ? 18 : 24) &&
              tile.contains(
                document.elementFromPoint(
                  b.x + b.width / 2,
                  b.y + b.height / 2,
                ),
              )
            );
          }),
        ),
      ).toBe(true);
    });
  }
}

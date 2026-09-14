import { expect, test } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
import late from "./fixtures/late-table.json" with { type: "json" };
import { tileName } from "../shared/tiles";
const captures = "test-results/screenshots";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
for (const [width, height, edge, bottom] of [
  [568, 320, 0, 0],
  [844, 390, 59, 21],
  [874, 402, 62, 21],
  [932, 430, 62, 21],
]) {
  for (const owner of [-1, 0, 1, 2, 3])
    test(`花牌常驻 ${width}，${owner < 0 ? "四家正常补花" : `${owner}家20花`}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { left: edge, right: edge, bottom, top: 0 },
      });
      const saved = structuredClone(late);
      if (owner >= 0) {
        saved.players.forEach(
          (p, i) =>
            (p.flowers =
              i === owner ? Array.from({ length: 20 }, (_, n) => 124 + n) : []),
        );
        saved.wall = saved.wall.filter((t) => t < 124);
      }
      await page.addInitScript(
        (g) => localStorage.setItem("jinling:practice", JSON.stringify(g)),
        saved,
      );
      await page.goto("/");
      await page.getByRole("button", { name: /继续打/ }).click();
      const racks = [
        ".hand-support",
        ".opponent-right",
        ".opponent-top",
        ".opponent-left",
      ];
      for (let seat = 0; seat < 4; seat++) {
        const tiles = page.locator(`${racks[seat]} .flower-rack .tile`);
        expect(
          await tiles.evaluateAll((els) =>
            els.map((el) => el.getAttribute("aria-label")),
          ),
        ).toEqual(saved.players[seat].flowers.map(tileName));
      }
      await expect(page.getByText("查看花牌", { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: `${captures}/flowers-${width}-${owner}.png`,
      });
      const blocked = await page
        .locator(
          ".flower-rack .tile,.discard-field .tile,.opponent-rack .tile,.opponent-info strong,.hand > .tile,.game-actions > button",
        )
        .evaluateAll(
          (els, { edge, bottom }) =>
            els.flatMap((el) => {
              const r = el.getBoundingClientRect();
              const hit = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2,
              );
              return r.width > 0 &&
                r.height > 0 &&
                r.left >= edge - 0.5 &&
                r.right <= innerWidth - edge + 0.5 &&
                r.top >= 0 &&
                r.bottom <= innerHeight - bottom + 0.5 &&
                el.contains(hit)
                ? []
                : [
                    {
                      name: el.getAttribute("aria-label") || el.textContent,
                      by: hit?.className,
                      parent: el.parentElement?.className,
                      x: r.x,
                      y: r.y,
                      w: r.width,
                      h: r.height,
                    },
                  ];
            }),
          { edge, bottom },
        );
      expect(blocked).toEqual([]);
      const hint = page.locator(".hand-help .hint-button");
      if (await hint.isVisible()) {
        const a = (await hint.boundingBox())!,
          b = (await page
            .locator(".my-info > div:last-child > button")
            .boundingBox())!;
        expect(
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0 &&
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0,
        ).toBe(false);
      }
    });
}

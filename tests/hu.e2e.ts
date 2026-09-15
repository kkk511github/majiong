import { test, expect, type Page } from "./browser-fixtures";
import { createGame, newPlayer, seats, viewFor } from "../shared/engine";
import { mkdirSync } from "node:fs";
import type { Game } from "../shared/types";
const captures = "test-results/screenshots";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));
function winningGame(claim = false): Game {
  const g = createGame("123456", "hu-screen", { rounds: 4, turnSeconds: 0 });
  g.players = seats.map((s) => newPlayer("p" + s, "玩家" + s, s !== 0));
  g.phase = "playing";
  g.round = 1;
  g.turn = 0;
  g.canSelfWin = true;
  g.players[0]!.hand = [0, 4, 8, 12, 16, 20, 36, 40, 44, 72, 76, 80, 108, 109];
  g.lastDraw = 109;
  if (claim) {
    g.players[0]!.hand.pop();
    g.turn = 1;
    g.phase = "claiming";
    g.pending = {
      tile: 109,
      from: 1,
      kind: "discard",
      openedAtRevision: 0,
      offers: { 0: ["hu", "pass"] },
      replies: {},
    };
    g.players[1]!.discards = [109];
  }
  return g;
}
async function openSaved(page: Page, g: Game) {
  await page.addInitScript(
    (g) => localStorage.setItem("jinling:practice", JSON.stringify(g)),
    g,
  );
  await page.goto("/");
  await page.getByRole("button", { name: /继续/ }).click();
}
for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
])
  for (const claim of [false, true]) {
    test(`${claim ? "点炮" : "自摸"}胡牌 ${width}：合法胡牌按钮可见可点，并实际产生结算`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const g = winningGame(claim);
      expect(viewFor(g, 0).actions).toContain("hu");
      await openSaved(page, g);
      const hu = page.getByRole("button", {
        name: claim ? "胡" : "自摸",
        exact: true,
      });
      await expect(hu).toBeVisible();
      expect(
        await hu.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.bottom <= innerHeight &&
            r.top >= 0 &&
            el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            )
          );
        }),
      ).toBe(true);
      await page.screenshot({
        path: `${captures}/hu-${claim ? "claim" : "self"}-${width}.png`,
      });
      await hu.click();
      await expect(page.locator(".round-reveal")).toBeVisible();
      await expect(page.locator(".reveal-player")).toHaveCount(4);
      await expect(
        page.locator(".reveal-winner .reveal-scores span:first-child b"),
      ).not.toHaveText("0");
    });
  }
test("其他玩家的暗杠显示四张背牌，公开牌查看不泄漏牌型", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const g = winningGame();
  g.canSelfWin = false;
  g.players[1]!.melds = [
    { type: "kong", tiles: [24, 25, 26, 27], from: 1, concealed: true },
  ];
  await openSaved(page, g);
  await expect(page.locator(".opponent-melds .tile-back")).toHaveCount(4);
  await expect(
    page.locator(".opponent-melds .tile:not(.tile-back)"),
  ).toHaveCount(0);
});

for (const reduced of [false, true])
  test(`杠上开花按真实结算突出显示，特效不影响结算操作（减少动态 ${reduced}）`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
    const g = winningGame();
    g.replacement = { type: "kong", direct: true, from: 1 };
    g.wall = [32, 33, 34, 35];
    await openSaved(page, g);
    await page.getByRole("button", { name: "自摸", exact: true }).click();
    const title = page.locator(".reveal-winner .reveal-identity small");
    await expect(title).toBeVisible();
    await expect(title).toHaveText("杠上开花");
    if (reduced)
      expect(
        await title.evaluate((el) => getComputedStyle(el).animationName),
      ).toBe("none");
    await expect(page.locator(".round-reveal")).toBeVisible();
    const buttons = await page
      .getByRole("dialog")
      .getByRole("button")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width && r.height;
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom <= innerHeight && r.top >= 0;
          }),
      );
    expect(buttons.every(Boolean)).toBe(true);
    await page.screenshot({
      path: `${captures}/kong-win-${reduced ? "reduced" : "animated"}-568.png`,
    });
  });

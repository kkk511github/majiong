import { test, expect, type Page } from "./browser-fixtures";
import { createGame, newPlayer, seats } from "../shared/engine";
import { mkdirSync } from "node:fs";
function pendingPung() {
  const g = createGame("123456", "motion-test", { turnSeconds: 0, rounds: 4 });
  g.players = seats.map((s) => newPlayer("p" + s, "牌友" + s, s !== 0));
  g.phase = "claiming";
  g.round = 1;
  g.turn = 1;
  g.revision = 20;
  g.players[0]!.hand = [0, 1, 4, 8, 12, 16, 20, 36, 40, 44, 72, 76, 80];
  g.players[1]!.discards = [2];
  g.lastDiscard = { tile: 2, seat: 1 };
  g.pending = {
    tile: 2,
    from: 1,
    kind: "discard",
    openedAtRevision: 20,
    offers: { 0: ["pung", "pass"] },
    replies: {},
  };
  return g;
}
async function enter(page: Page) {
  await page.addInitScript(
    (g) => localStorage.setItem("jinling:practice", JSON.stringify(g)),
    pendingPung(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /继续/ }).click();
}
for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`碰牌反馈与整理 ${width}：动画不遮操作，手牌命中与布局正确`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await enter(page);
    // A stable DOM node must survive a turn change so sorting does not remount every tile.
    await page
      .locator('.hand > [data-tile="4"]')
      .evaluate((el) => el.setAttribute("data-same-node", "yes"));
    await page.getByRole("button", { name: "碰", exact: true }).click();
    const call = page.locator(".feedback-pung");
    await expect(call).toHaveCount(1);
    await expect(call).toBeVisible();
    await expect
      .poll(() =>
        call
          .locator("img")
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(call.locator("strong")).toHaveText("碰");
    await expect(page.locator(".hand > .tile")).toHaveCount(11);
    await expect(page.locator('.hand > [data-tile="4"]')).toHaveAttribute(
      "data-same-node",
      "yes",
    );
    const result = await page.locator(".hand > .tile").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          inside:
            r.left >= 0 &&
            r.right <= innerWidth &&
            r.top >= 0 &&
            r.bottom <= innerHeight,
          hit: el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          ),
        };
      }),
    );
    expect(result.every((r) => r.inside && r.hit)).toBe(true);
    expect(
      await call.evaluate(
        (el) => getComputedStyle(el.parentElement!).pointerEvents,
      ),
    ).toBe("none");
    expect(
      await call.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          occupied = [
            ...document.querySelectorAll(
              ".tile,.tile-back,.table-hud,.flower-rack,.game-actions",
            ),
          ];
        return occupied.every((node) => {
          const c = node.getBoundingClientRect();
          return (
            r.right <= c.left ||
            r.left >= c.right ||
            r.bottom <= c.top ||
            r.top >= c.bottom
          );
        });
      }),
    ).toBe(true);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/motion-pung-${width}.png`,
    });
    const tile = page.locator('.hand > [data-tile="4"]');
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await tile.click();
    await expect(
      page.locator('.discards-0 .tile[aria-label="一万"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('.discards-0 .tile[aria-label="二万"]'),
    ).toHaveCount(1);
  });
}
test("减少动态效果：不启动手牌位移或碰牌缩放，但仍显示已确认动作", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 390 });
  await enter(page);
  await page.getByRole("button", { name: "碰", exact: true }).click();
  const badge = page.locator(".feedback-pung");
  await expect(badge).toHaveCount(1);
  expect(await badge.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  expect(
    await page
      .locator(".hand")
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.getByRole("button", { name: "牌桌设置" }).click();
  await expect(page.locator(".table-action-feedback")).toHaveCount(0);
});

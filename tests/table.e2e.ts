import { expect, test, type Page } from "./browser-fixtures";
import late from "./fixtures/late-table.json" with { type: "json" };
import melds from "./fixtures/melds-table.json" with { type: "json" };
import claim from "./fixtures/claim-table.json" with { type: "json" };
import { tileName } from "../shared/tiles";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const captures = resolve("test-results/screenshots");
test.beforeAll(() => mkdirSync(captures, { recursive: true }));

async function loadSavedTable(page: Page, saved: unknown) {
  await page.addInitScript((g: any) => {
    localStorage.setItem("jinling:practice", JSON.stringify(g));
    localStorage.setItem("jinling:name", JSON.stringify(g.players[0].name));
  }, saved);
  await page.goto("/");
  await page.getByRole("button", { name: /继续/ }).click();
  await expect(page.getByLabel("我的手牌")).toBeVisible();
}

for (const [width, height] of [
  [568, 320],
  [667, 375],
  [844, 390],
  [932, 430],
]) {
  test(`残局 ${width}×${height}：全部弃牌在桌面，固定大小与碰杠可读，公开牌一览不展示暗手`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const saved = width === 667 ? melds : late;
    await loadSavedTable(page, saved);
    for (let i = 0; i < 4; i++) {
      const river = page.locator(`.discards-${i}`);
      await expect(river).toHaveAttribute(
        "data-discard-count",
        String(saved.players[i].discards.length),
      );
      const count = saved.players[i].discards.length;
      await expect(river.locator(".tile")).toHaveCount(count);
      await expect(river.locator(".river-more")).toHaveCount(0);
    }
    const blocked = await page
      .locator(".discard-field .tile, .opponent-rack .tile, .self-melds .tile")
      .evaluateAll((tiles) =>
        tiles.flatMap((tile) => {
          const b = tile.getBoundingClientRect();
          const top = document.elementFromPoint(
            b.x + b.width / 2,
            b.y + b.height / 2,
          );
          return b.width > 0 &&
            b.height > 0 &&
            b.x >= 0 &&
            b.y >= 0 &&
            b.right <= innerWidth + 0.5 &&
            b.bottom <= innerHeight + 0.5 &&
            tile.contains(top)
            ? []
            : [
                {
                  name: tile.getAttribute("aria-label"),
                  className: tile.parentElement?.className,
                  rect: { x: b.x, y: b.y, w: b.width, h: b.height },
                  occludedBy: top?.className,
                },
              ];
        }),
      );
    await page.screenshot({ path: captures + `/late-table-${width}.png` });
    expect(blocked).toEqual([]);
    await page.getByRole("button", { name: "查看公开牌", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("公开牌一览", { exact: true })).toBeVisible();
    for (const p of saved.players) {
      await dialog
        .getByRole("button", { name: new RegExp(p.name), exact: false })
        .click();
      const section = dialog.getByRole("region", { name: `${p.name}的公开牌` });
      await expect(section.locator(".tile")).toHaveCount(
        p.discards.length +
          p.flowers.length +
          p.melds.reduce((n, m) => n + m.tiles.length, 0),
      );
      const labels = await section
        .locator(".overview-discards .tile")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
      expect(labels).toEqual(p.discards.map(tileName));
      expect(
        await section.locator(".tile").evaluateAll((els) =>
          els.every((el) => {
            const b = el.getBoundingClientRect();
            return (
              b.y >= 0 &&
              b.bottom <= innerHeight &&
              el.contains(
                document.elementFromPoint(
                  b.x + b.width / 2,
                  b.y + b.height / 2,
                ),
              )
            );
          }),
        ),
      ).toBe(true);
    }
    await page.screenshot({ path: captures + `/public-tiles-${width}.png` });
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const first = page.locator(".hand > button.tile").first();
    await first.click();
    await first.click();
    await expect(page.getByLabel("我的手牌")).toBeVisible();
  });
}
for (const [width, height] of [
  [568, 320],
  [844, 390],
]) {
  test(`碰牌响应 ${width}×${height}：提示不压弃牌，碰后手牌和副露可操作`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await loadSavedTable(page, claim);
    const targets = page.locator(
      ".discard-field .tile, .game-actions > button, .hand > .tile",
    );
    const obscured = await targets.evaluateAll((els) =>
      els.flatMap((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          b.x + b.width / 2,
          b.y + b.height / 2,
        );
        return b.width > 0 &&
          b.height > 0 &&
          b.x >= 0 &&
          b.y >= 0 &&
          b.right <= innerWidth + 0.5 &&
          b.bottom <= innerHeight + 0.5 &&
          el.contains(hit)
          ? []
          : [
              {
                name: el.getAttribute("aria-label") ?? el.textContent,
                by: hit?.className,
              },
            ];
      }),
    );
    await page.screenshot({ path: captures + `/claim-table-${width}.png` });
    expect(obscured).toEqual([]);
    await page.getByRole("button", { name: "碰", exact: true }).click();
    await expect(page.locator(".self-melds .tile")).toHaveCount(3);
    await expect(page.locator(".hand > button.tile")).toHaveCount(11);
    const first = page.locator(".hand > button.tile").first();
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".discard-button")).toHaveCount(0);
    await first.click();
    await expect(page.locator(".hand > .tile")).toHaveCount(10);
  });
}

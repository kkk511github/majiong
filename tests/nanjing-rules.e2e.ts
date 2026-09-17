import { expect, test } from "./browser-fixtures";
import { mkdirSync } from "node:fs";

for (const [width, height] of [[844, 390], [932, 430], [667, 375]]) {
  test(`B档开桌固定花砸2，三步设置与服务端实际规则一致 ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    // An old draft cannot switch new tables back to the previous rules.
    await page.addInitScript(() => localStorage.setItem("jinling:tableDraft-v3", JSON.stringify({
      ruleId: "nj-open-v2", flowerDouble: false, settings: { name: "南京好友桌", kickAfterSeconds: 10 },
      rounds: 8, seconds: 10, count: 1,
    })));
    await page.goto("/");
    await page.getByRole("navigation").getByRole("button", { name: "约局", exact: true }).click();
    await page.getByRole("button", { name: "开桌设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "开桌设置", exact: true });
    await expect(dialog.getByLabel("本桌固定规则")).toContainText("进园子 · B档");
    await expect(dialog.getByRole("switch", { name: "花砸 2", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("switch", { name: "花砸 2", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("switch", { name: "东南西北罚分", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(dialog.getByRole("switch", { name: "保米", exact: true })).toBeEnabled();
    const name = `B档验收${width}`;
    await dialog.getByRole("textbox", { name: "玩法名称", exact: true }).fill(name);
    await dialog.getByRole("group", { name: "把数选择", exact: true }).getByRole("button", { name: "8 把", exact: true }).click();
    mkdirSync("docs/research/nanjing-b-v3", { recursive: true });
    for (const [step, label] of [[0, "玩法"], [1, "桌子"], [2, "确认"]] as const) {
      await dialog.locator(".setup-content").evaluate(el => el.scrollTop = 0);
      await page.screenshot({ path: `docs/research/nanjing-b-v3/${testInfo.project.name}-${width}-${label}.png` });
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (step < 2) await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    }
    await expect(dialog.locator(".setup-review")).toContainText("进园子 B档 · 底分 10 · 门清 10");
    await dialog.getByRole("button", { name: "创建 1 桌", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const card = page.locator(".table-card").filter({ hasText: name });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /东位入座/ }).click();
    await expect(page.locator(".waiting-room")).toBeVisible();
    const view = await page.evaluate(async () => {
      const { client } = await import("/src/game-client.ts" as string);
      return client.state.view;
    });
    expect(view!.rules).toMatchObject({ id: "nj-garden-b-v3", rounds: 8, flowerDouble: true, twoBankrupt: true, protectWinner: true, biXiaHu: "next", doubleSidePayments: true });
    expect(view!.players[0]!.score).toBe(90);
    await page.reload();
    await expect(page.locator(".waiting-room")).toBeVisible();
    expect(await page.evaluate(async () => (await import("/src/game-client.ts" as string)).client.state.view?.rules.id)).toBe("nj-garden-b-v3");
  });
}

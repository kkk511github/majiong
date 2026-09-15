import { expect, test } from "./browser-fixtures";
import { mkdirSync } from "node:fs";

for (const [width, height] of [
  [844, 390],
  [932, 430],
]) {
  test(`南京开桌默认进园子，切换敞开头实际下发独立规则 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "约局", exact: true })
      .click();
    for (const [mode, id] of [
      ["进园子", "nj-garden-v2"],
      ["敞开头", "nj-open-v2"],
    ]) {
      await page.getByRole("button", { name: "开桌设置", exact: true }).click();
      const choices = page.getByRole("group", {
        name: "计分规则",
        exact: true,
      });
      if (mode === "进园子")
        await expect(
          choices.getByRole("button", { name: mode, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
      else
        await choices.getByRole("button", { name: mode, exact: true }).click();
      const name = `规则验收${width}${mode}`;
      await page
        .getByRole("textbox", { name: "玩法名称", exact: true })
        .fill(name);
      await expect(page.getByRole("switch", { name: "保米", exact: true }))[
        mode === "敞开头" ? "toBeDisabled" : "toBeEnabled"
      ]();
      await choices.scrollIntoViewIfNeeded();
      mkdirSync("test-results/screenshots", { recursive: true });
      await page.screenshot({
        path: `test-results/screenshots/nanjing-rules-${width}-${id}.png`,
      });
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await page.getByRole("button", { name: "下一步", exact: true }).click();
      await expect(page.locator(".setup-review")).toContainText(
        `南京麻将 · ${mode}`,
      );
      await page
        .getByRole("button", { name: "创建 1 桌", exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      const card = page.locator(".table-card").filter({ hasText: name });
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: /东位入座/ }).click();
      await expect(page.locator(".waiting-room")).toBeVisible();
      const rules = await page.evaluate(async () => {
        const { client } = await import("/src/game-client.ts" as string);
        return client.state.view?.rules;
      });
      expect(rules).toMatchObject({
        id,
        twoBankrupt: mode === "进园子",
        protectWinner: mode === "进园子",
        biXiaHu: "next",
        doubleSidePayments: true,
      });
      await page.getByRole("button", { name: "返回大厅", exact: true }).click();
      await expect(
        page.getByRole("region", { name: "牌桌大厅" }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

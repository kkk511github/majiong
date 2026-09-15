import { legacyRoom } from "./browser-fixtures";
import { expect, test } from "./browser-fixtures";
import { mkdirSync } from "node:fs";
const captures = "test-results/screenshots";
test.beforeAll(() => mkdirSync(captures, { recursive: true }));

import { completedRound } from "./fixtures/completed-round";
const finished = completedRound();

test("弹窗空白不误关闭，选择状态可读，声音控件可触摸", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "开一桌，等朋友", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "开桌设置" });
  await expect(dialog).toBeVisible();
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 5, box.y + box.height / 2);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "8 局", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "8 局", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "4 局", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "牌桌设置" });
  for (const name of ["背景音乐音量", "游戏音效音量"]) {
    const slider = settings.getByRole("slider", { name });
    expect((await slider.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `${captures}/audit-settings-874.png` });
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
});

test("房间号校验显示在当前弹窗内，更正后清除错误", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.getByRole("button", { name: "加入好友桌", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "加入好友房间" });
  await dialog
    .getByRole("textbox", { name: "房间号", exact: true })
    .fill("123");
  await dialog.getByRole("button", { name: "加入房间", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("6 位数字");
  await expect(
    dialog.getByRole("textbox", { name: "房间号", exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect(
    await dialog
      .getByRole("button", { name: "加入房间", exact: true })
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.bottom <= innerHeight &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
  ).toBe(true);
  await page.screenshot({ path: `${captures}/audit-join-validation-568.png` });
  await dialog
    .getByRole("textbox", { name: "房间号", exact: true })
    .fill("123456");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(
    dialog.getByRole("textbox", { name: "房间号", exact: true }),
  ).toHaveAttribute("aria-invalid", "false");
});

test("小屏等待桌始终显示开局状态，准备、陪练与规则互不遮挡", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await legacyRoom(page);
  const room = page.locator(".waiting-room");
  await expect(room.getByRole("status")).toContainText("已入座 1 / 4");
  for (const name of ["我准备好了", "添加电脑陪练", "本桌规则"]) {
    const button = room.getByRole("button", { name, exact: true });
    expect(
      await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.y >= 0 &&
          r.bottom <= innerHeight &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
    ).toBe(true);
  }
  await room.getByRole("button", { name: "我准备好了", exact: true }).click();
  await room.getByRole("button", { name: "添加电脑陪练", exact: true }).click();
  await expect(room.getByRole("status")).toContainText("已入座 2 / 4");
  await expect(room.locator('[data-state="ready"]')).toHaveCount(2);
  await page.screenshot({ path: `${captures}/audit-waiting-568.png` });
  await room.getByRole("button", { name: "返回大厅", exact: true }).click();
  await expect(room).not.toBeVisible();
});

for (const [width, height] of [
  [568, 320],
  [874, 402],
  [932, 430],
]) {
  test(`结算 ${width}：旧练习存档展示四家完整牌面，可提前进入下一局`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (g) => localStorage.setItem("jinling:practice", JSON.stringify(g)),
      finished,
    );
    await page.goto("/");
    await page.getByRole("button", { name: /继续打/ }).click();
    const dialog = page.locator(".round-reveal-dialog");
    await expect(dialog).toBeVisible();
    const header = dialog.locator(".modal-head");
    await expect(dialog.locator(".reveal-player")).toHaveCount(4);
    await expect(dialog.locator(".reveal-next")).toContainText(
      "秒后进入下一局",
    );
    const next = dialog.getByRole("button", {
      name: "进入下一局",
      exact: true,
    });
    const assertReachable = async () => {
      for (const button of [
        next,
        dialog.getByRole("button", { name: "关闭", exact: true }),
      ]) {
        const b = (await button.boundingBox())!;
        expect(b.height).toBeGreaterThanOrEqual(40);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height).toBeLessThanOrEqual(height);
        expect(
          await button.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        ).toBe(true);
      }
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
    };
    await assertReachable();
    await page.screenshot({
      path: `${captures}/audit-settlement-first-${width}.png`,
    });
    for (const row of await dialog.locator(".reveal-player").all()) {
      expect(await row.locator(".tile").count()).toBeGreaterThanOrEqual(13);
      await expect(row.locator(".reveal-scores")).toContainText("本把");
    }
    await next.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByLabel("我的手牌")).toBeVisible();
  });
}

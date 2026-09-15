import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

test("四位注册、选照片预览保存、重登保留、Cocos 头像与恢复默认", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const username = "photo-" + randomUUID().slice(0, 8);
  await page.goto("/");
  await page.getByRole("tab", { name: "注册账号" }).click();
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("牌桌昵称", { exact: true }).fill("头像测试");
  await page.getByLabel("密码", { exact: true }).fill("1234");
  await page.getByLabel("确认密码", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "注册并进入大厅" }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", {name:"更换头像", exact:true}).click();
  const image = await sharp({
    create: { width: 360, height: 240, channels: 3, background: "#b8492f" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("选择头像照片")
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: image,
    });
  await expect(page.getByAltText("新头像预览")).toBeVisible();
  await page.getByRole("button", { name: "保存头像", exact: true }).click();
  await expect(page.getByText("头像已保存，牌桌同步更新。")).toBeVisible();
  const path = await page.getByRole("dialog").getByAltText("当前头像").getAttribute("src");
  await page.getByRole("dialog").getByRole("button", {name:"关闭",exact:true}).click();
  expect(path).toMatch(/^\/api\/avatars\//);
  await page.screenshot({
    path: `test-results/screenshots/avatar-profile-${test.info().project.name}.png`,
  });
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    await client.logout();
  });
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("1234");
  await page
    .getByRole("button", { name: "登录，开始相聚", exact: true })
    .click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await expect(page.getByAltText("当前头像")).toHaveAttribute("src", path!);
  // Exercise the real native renderer with the account's image URL.
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.practice("头像测试", { rounds: 4 });
  });
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect
    .poll(async () => {
      const frame = page
        .frames()
        .find((f) => f.url().includes("/cocos-table/index.html"));
      return frame?.evaluate(async (path) => {
        const cc = await (window as any).System.import("cc");
        const scene = cc.director
          .getScene()
          ?.getChildByName("Canvas")
          ?.getComponent("TableScene");
        return (
          !!scene?.frames.get(path)?.texture &&
          scene?.state.players.find((p: any) => p.seat === scene.state.me)
            ?.avatar === path
        );
      }, path);
    })
    .toBe(true);
  await page.screenshot({
    path: `test-results/screenshots/avatar-table-${test.info().project.name}.png`,
  });
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.leave();
  });
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "更换头像", exact: true }).click();
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(page.getByText("已恢复默认头像。")).toBeVisible();
  await expect(page.getByAltText("当前头像")).toHaveCount(0);
});

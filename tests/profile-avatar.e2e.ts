import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

test("四位注册、选照片预览保存、重登保留、Cocos 头像失败上限与恢复默认", async ({
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
  await page.getByRole("button", { name: "更换头像", exact: true }).click();
  const image = await sharp({
    create: { width: 360, height: 240, channels: 3, background: "#b8492f" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("选择头像照片").setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.getByAltText("新头像预览")).toBeVisible();
  await page.getByRole("button", { name: "保存头像", exact: true }).click();
  await expect(page.getByText("头像已保存，牌桌同步更新。")).toBeVisible();
  const renderedAvatar = await page
    .getByRole("dialog")
    .getByAltText("当前头像")
    .getAttribute("src");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  expect(renderedAvatar).toBeTruthy();
  const avatarPath = new URL(renderedAvatar!, page.url()).pathname;
  expect(avatarPath).toMatch(/^\/api\/avatars\//);
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
  await expect(page.getByAltText("当前头像")).toHaveAttribute(
    "src",
    renderedAvatar!,
  );
  const tableAvatarRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("/api/avatars/") &&
      request.url().includes("table-avatar=1")
    )
      tableAvatarRequests.push(request.url());
  });
  // Exercise the real renderer with a public view. Local practice is retired,
  // so inject the same sanitized shape received from the online service.
  await page.evaluate(async (avatar) => {
    const [{ client }, { viewFor }, fixture] = await Promise.all([
      import("/src/game-client.ts" as string),
      import("/shared/engine.ts" as string),
      import("/tests/fixtures/late-table.json" as string),
    ]);
    const game = structuredClone(fixture.default);
    game.id = "avatar-renderer-test";
    game.players[0].name = "头像测试";
    const view = viewFor(game, 0);
    view.players[0]!.avatar = avatar;
    (client as any).emit({ mode: "local", view });
    // Local practice normally injects the signed-in account avatar. The test
    // supplies the equivalent server view directly because practice is retired.
    client.state.view!.players[0]!.avatar = avatar;
    (client as any).emit({});
  }, avatarPath);
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect
    .poll(async () => {
      const frame = page
        .frames()
        .find((f) => f.url().includes("/cocos-table/index.html"));
      try {
        return await frame?.evaluate(async (path) => {
          const cc = await (window as any).System.import("cc");
          const scene = cc.director
            .getScene()
            ?.getChildByName("Canvas")
            ?.getComponent("TableScene");
          const avatarFrame = scene?.frames.get(path);
          const avatarNode = scene?.hud.children.find(
            (node: any) => node.name === path,
          );
          return {
            avatar: scene?.state.players.find(
              (player: any) => player.seat === scene.state.me,
            )?.avatar,
            hasFrame: !!avatarFrame,
            hasNode: !!avatarNode,
            spriteUsesFrame:
              avatarNode?.getComponent(cc.Sprite)?.spriteFrame === avatarFrame,
          };
        }, renderedAvatar);
      } catch {
        return undefined;
      }
    })
    .toEqual({
      avatar: renderedAvatar,
      hasFrame: true,
      hasNode: true,
      spriteUsesFrame: true,
    });
  expect(tableAvatarRequests).toHaveLength(1);
  await page.screenshot({
    path: `test-results/screenshots/avatar-table-${test.info().project.name}.png`,
  });
  const brokenAvatarPath =
    "/api/avatars/00000000-0000-4000-8000-000000000000/" +
    "f".repeat(64) +
    ".jpg";
  const brokenRenderedAvatar = renderedAvatar!.replace(
    avatarPath,
    brokenAvatarPath,
  );
  const tableFrame = page
    .frames()
    .find((frame) => frame.url().includes("/cocos-table/index.html"));
  expect(tableFrame).toBeTruthy();
  await tableFrame!.evaluate(async (avatar) => {
    const cc = await (window as any).System.import("cc");
    const original = cc.assetManager.loadRemote.bind(cc.assetManager);
    (window as any).__avatarFailureProbe = { attempts: 0, original };
    cc.assetManager.loadRemote = (
      url: string,
      options: unknown,
      complete: (error: Error) => void,
    ) => {
      if (url.includes(avatar)) {
        (window as any).__avatarFailureProbe.attempts++;
        setTimeout(() => complete(new Error("missing avatar")), 0);
        return;
      }
      return original(url, options, complete);
    };
  }, brokenAvatarPath);
  await page.evaluate(async (avatar) => {
    const { client } = await import("/src/game-client.ts" as string);
    client.state.view!.players[0]!.avatar = avatar;
    (client as any).emit({});
  }, brokenAvatarPath);
  await expect
    .poll(() =>
      tableFrame!.evaluate(async () => {
        const cc = await (window as any).System.import("cc");
        const scene = cc.director
          .getScene()
          ?.getChildByName("Canvas")
          ?.getComponent("TableScene");
        return scene?.state.players.find(
          (player: any) => player.seat === scene.state.me,
        )?.avatar;
      }),
    )
    .toBe(brokenRenderedAvatar);
  const failedAttempts = () =>
    tableFrame!.evaluate(
      () => (window as any).__avatarFailureProbe.attempts as number,
    );
  await expect.poll(failedAttempts).toBe(1);
  await expect
    .poll(
      () =>
        tableFrame!.evaluate(async (avatar) => {
          const cc = await (window as any).System.import("cc");
          const scene = cc.director
            .getScene()
            ?.getChildByName("Canvas")
            ?.getComponent("TableScene");
          const failure = scene?.avatarFailures.get(avatar);
          return {
            attempts: failure?.attempts ?? 0,
            coolingDown: !!failure && failure.retryAt > Date.now(),
            loading: scene?.avatarLoads.has(avatar) ?? false,
          };
        }, brokenRenderedAvatar),
      { timeout: 450, intervals: [20, 40, 80] },
    )
    .toEqual({ attempts: 1, coolingDown: true, loading: false });
  await tableFrame!.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    const scene = cc.director
      .getScene()
      ?.getChildByName("Canvas")
      ?.getComponent("TableScene");
    for (let redraw = 0; redraw < 20; redraw++) {
      scene.hudKey = "";
      scene.draw();
    }
  });
  expect(await failedAttempts()).toBe(1);
  await expect.poll(failedAttempts, { timeout: 4_000 }).toBe(3);
  await expect
    .poll(() =>
      tableFrame!.evaluate(async (avatar) => {
        const cc = await (window as any).System.import("cc");
        const scene = cc.director
          .getScene()
          ?.getChildByName("Canvas")
          ?.getComponent("TableScene");
        const failure = scene?.avatarFailures.get(avatar);
        return failure
          ? {
              attempts: failure.attempts,
              retryAt: failure.retryAt,
              loading: scene.avatarLoads.has(avatar),
              frameLoaded: scene.frames.has(avatar),
            }
          : undefined;
      }, brokenRenderedAvatar),
    )
    .toMatchObject({
      attempts: 3,
      retryAt: expect.any(Number),
      loading: false,
      frameLoaded: false,
    });
  await tableFrame!.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    const scene = cc.director
      .getScene()
      ?.getChildByName("Canvas")
      ?.getComponent("TableScene");
    for (let redraw = 0; redraw < 20; redraw++) {
      scene.hudKey = "";
      scene.draw();
    }
  });
  await page.waitForTimeout(1_600);
  expect(await failedAttempts()).toBe(3);
  await tableFrame!.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    cc.assetManager.loadRemote = (window as any).__avatarFailureProbe.original;
    delete (window as any).__avatarFailureProbe;
  });
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    (client as any).emit({ view: null, mode: null });
  });
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "更换头像", exact: true }).click();
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(page.getByText("已恢复默认头像。")).toBeVisible();
  await expect(page.getByAltText("当前头像")).toHaveCount(0);
});

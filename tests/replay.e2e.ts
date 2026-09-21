import { test, expect } from "./browser-fixtures";
import { replayedRound } from "./fixtures/replayed-round";
import sharp from "sharp";

test("回放加载上传头像，播放及切换视角后仍显示四家照片", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  const replay = replayedRound().replay!;
  replay.avatars = [0, 1, 2, 3].map(seat => `/api/avatars/00000000-0000-4000-8000-${String(seat + 1).padStart(12, "0")}/${"a".repeat(64)}.jpg`);
  const photo = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#b94c52" } }).jpeg().toBuffer();
  await page.route("**/api/avatars/**", route => route.fulfill({ contentType: "image/jpeg", body: photo }));
  await page.route("**/api/replays/**", route => route.fulfill({ json: replay }));
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await page.getByRole("button", { name: "牌局回放", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "牌局回放", exact: true });
  await dialog.getByLabel("牌局 ID", { exact: true }).fill(replay.id);
  await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
  const sceneFrame = () => page.frames().find(frame => frame.url().includes("/cocos-table/index.html"));
  const renderedPhotos = async () => sceneFrame()?.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    const scene = cc.director.getScene()?.getChildByName("Canvas")?.getComponent("TableScene");
    if (!scene?.state) return [];
    return scene.state.players.map((player: { avatar?: string }) => {
      const frame = scene.frames.get(player.avatar);
      return !!frame && scene.hud.children.some((node: any) => node.name === player.avatar && node.getComponent(cc.Sprite)?.spriteFrame === frame);
    });
  });
  await expect.poll(renderedPhotos, { timeout: 20000 }).toEqual([true, true, true, true]);
  await dialog.getByRole("button", { name: "下一步", exact: true }).click();
  await expect.poll(renderedPhotos).toEqual([true, true, true, true]);
  await sceneFrame()!.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    const scene = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    const avatar = scene.state.players[1].avatar;
    scene.hud.children.find((node: any) => node.name === avatar).emit(cc.Node.EventType.TOUCH_END);
  });
  await expect.poll(renderedPhotos).toEqual([true, true, true, true]);
  await page.screenshot({ path: `test-results/screenshots/replay-avatars-${test.info().project.name}.png` });
});

for (const [width, height] of [
  [568, 320],
  [874, 402],
  [1280, 590],
]) {
  test(`普通会员通过ID播放、暂停、跳步和看结算 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const replay = replayedRound().replay!;
    await page.route("**/api/auth/session", async (route) => {
      const res = await route.fetch(),
        data = await res.json();
      data.account = {
        ...data.account,
        role: "member",
        canManageAdmins: false,
        canCreateTables: false,
      };
      await route.fulfill({ response: res, json: data });
    });
    await page.routeWebSocket("**/ws", (ws) => {
      ws.connectToServer().onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.account)
          m.account = {
            ...m.account,
            role: "member",
            canManageAdmins: false,
            canCreateTables: false,
          };
        ws.send(JSON.stringify(m));
      });
    });
    await page.route("**/api/replays/**", async (route) => {
      const id = route.request().url().split("/").at(-1);
      if (id === replay.id) await route.fulfill({ json: replay });
      else if (id === "legacy-1")
        await route.fulfill({
          json: {
            ...replay,
            id,
            summaryOnly: true,
            frames: [replay.frames.at(-1)],
          },
        });
      else
        await route.fulfill({
          status: 404,
          json: { error: "未找到已结束的牌局，请检查 ID" },
        });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "战绩", exact: true }).click();
    await expect(page.locator(".records-heading h1")).toHaveText("我的战绩");
    await expect(page.locator(".records-admin")).toHaveCount(0);
    const entry = page.getByRole("button", { name: "牌局回放", exact: true });
    const contrast = await entry.evaluate((el) => {
      const style = getComputedStyle(el);
      const luma = (color: string) => {
        const rgb = color
          .match(/\d+/g)!
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const a = luma(style.color),
        b = luma(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThan(4.5);
    await page.screenshot({
      path: `test-results/screenshots/history-entry-${width}.png`,
    });
    await page.getByRole("button", { name: "牌局回放", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "牌局回放", exact: true });
    await dialog.getByLabel("牌局 ID", { exact: true }).fill(replay.id);
    await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
    const canvas = dialog.locator('.cocos-embedded iframe');
    await expect(canvas).toBeVisible();
    const sceneFrame = () => page.frames().find(f => f.url().includes('/cocos-table/index.html'))!;
    await expect.poll(async () => sceneFrame()?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__), { timeout: 20000 }).toBe(true);
    const scene = () => sceneFrame().evaluate(async () => {
      const cc = await (window as any).System.import('cc');
      const component = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
      return { state: component.state, tiles: (window as any).__JINLING_TABLE_LAYOUT__ };
    });
    await expect.poll(async () => (await scene()).state?.players.length).toBe(4);
    const fullscreen = await dialog.boundingBox();
    expect(fullscreen).toEqual({ x: 0, y: 0, width, height });
    await expect(dialog.locator(".replay-search")).toHaveCount(0);
    await expect(dialog.locator(".replay-table-event")).toContainText(
      "开局发牌",
    );
    const keyStep=replay.frames.findIndex(f=>['pung','kong','concealedKong','addedKong','finish'].includes(f.type));
    await dialog.getByLabel('跳到关键动作').selectOption(String(keyStep));
    await expect(dialog.getByRole('slider',{name:'回放进度'})).toHaveValue(String(keyStep));
    await expect(dialog.getByRole('button',{name:'播放回放',exact:true})).toBeVisible();
    await dialog.getByRole('button',{name:'回到开局',exact:true}).click();
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(dialog.getByRole("slider", { name: "回放进度" })).toHaveValue(
      "1",
    );
    await dialog.getByRole("button", { name: "播放回放", exact: true }).click();
    await expect
      .poll(async () => Number(await dialog.getByRole("slider").inputValue()))
      .toBeGreaterThan(1);
    await expect(dialog.locator('.replay-controls')).toBeHidden({timeout:5000});
    expect(await canvas.boundingBox()).toEqual({x:0,y:0,width,height});
    await page.screenshot({path:`test-results/screenshots/replay-hidden-${width}.png`});
    const surface=(await canvas.boundingBox())!;
    await page.mouse.click(surface.width/2,surface.height/2);
    await expect(dialog.locator('.replay-controls')).toBeVisible();
    await dialog.getByRole("button", { name: "暂停回放", exact: true }).click();
    const paused = await dialog.getByRole("slider").inputValue();
    await page.waitForTimeout(1100);
    await expect(dialog.getByRole("slider")).toHaveValue(paused);
    await dialog.getByRole("button", { name: "查看结算", exact: true }).click();
    await expect(dialog.locator(".replay-table-event")).toContainText(
      "本局结算",
    );
    await expect.poll(async () => (await scene()).state.revision).toBe(replay.frames.length - 1);
    const ended = await scene();
    for (const [i, p] of replay.frames.at(-1)!.players.entries()) {
      expect(ended.state.players[i].score).toBe(p.score);
      expect(ended.tiles.filter((t:any) => t.seat===i && t.area==='hand')).toHaveLength(p.hand.length);
    }
    for (let seat=0;seat<4;seat++) {
      if(await dialog.locator('.replay-controls').isVisible())await page.mouse.click(width/2,height/2);
      const prior=await scene(), offset=(seat-prior.state.me+4)%4;
      const [x,y]=[[1198,508],[1200,207],[892,32],[68,207]][offset];
      const box=(await canvas.boundingBox())!,scale=Math.min(box.width/1280,box.height/590);
      await page.mouse.click(box.x+(box.width-1280*scale)/2+x*scale,box.y+(box.height-590*scale)/2+y*scale);
      await expect.poll(async () => (await scene()).state.me).toBe(seat);
      const {tiles}=await scene(),collisions=[];
      for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
        const a=tiles[i],b=tiles[j];if(a.stack||b.stack||(a.seat===b.seat&&a.area===b.area))continue;
        if((a.w+b.w)/2-Math.abs(a.x-b.x)>3 && (a.h+b.h)/2-Math.abs(a.y-b.y)>3)collisions.push({a,b});
      }
      expect(collisions,`perspective ${seat}`).toEqual([]);
      expect((await scene()).state.actions).toEqual([]);
    }
    const layout = await dialog.evaluate((el) => {
      const table = el.querySelector(".replay-cocos")!;
      const controls = el
        .querySelector(".replay-controls")!
        .getBoundingClientRect();
      const rect = table.getBoundingClientRect();
      return {
        right: rect.right,
        bottom: controls.bottom,
        width: rect.width,
        controlsTop: controls.top,
        tableBottom: rect.bottom,
        overflow: table.scrollWidth - table.clientWidth,
      };
    });
    expect(layout.right).toBeLessThanOrEqual(width);
    expect(layout.bottom).toBeLessThanOrEqual(height);
    expect(layout.width).toBeGreaterThan(width * 0.85);
    expect(layout.tableBottom).toBe(height);
    expect(layout.controlsTop).toBeLessThan(layout.tableBottom);
    expect(await canvas.boundingBox()).toEqual({x:0,y:0,width,height});
    expect(layout.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/screenshots/replay-${width}.png`,
    });
    await dialog.getByRole("button", { name: "查找牌局", exact: true }).click();
    await dialog.getByLabel("牌局 ID", { exact: true }).fill("missing-1");
    await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("未找到");
    await expect(dialog.locator(".replay-cocos")).toHaveCount(0);
    await dialog.getByLabel("牌局 ID", { exact: true }).fill("legacy-1");
    await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
    await expect(dialog.locator(".replay-legacy")).toContainText(
      "没有历史出牌过程",
    );
    await expect(dialog.getByRole("button", { name: "播放回放" })).toHaveCount(
      0,
    );
  });
}

import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import sharp from "sharp";

for (const [width, height] of [[568, 320], [852, 393], [932, 430], [1280, 720]]) {
  test(`左下头像避开手牌和双向安全区 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/tests/previews/opening.html");
    await page.addStyleTag({ content: 'nav[aria-label="开桌预览控制"] { display: none !important; }' });
    await expect.poll(() => page.frames().find(f => f.url().includes("/cocos-table/index.html"))?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    const frame = page.frames().find(f => f.url().includes("/cocos-table/index.html"))!;
    for (const [left, right] of [[0, 0], [59, 0], [0, 59]]) {
      await page.locator(".cocos-game").evaluate((node, safe) => {
        (node as HTMLElement).style.setProperty("--table-safe-left", `${safe.left}px`);
        (node as HTMLElement).style.setProperty("--table-safe-right", `${safe.right}px`);
        (node as HTMLElement).style.setProperty("--table-safe-bottom", "21px");
        window.dispatchEvent(new Event("resize"));
      }, { left, right });
      await expect.poll(() => frame.evaluate(async () => {
        const cc = await (window as any).System.import("cc");
        const c = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
        return { left: c.state.safeArea.left > 0, right: c.state.safeArea.right > 0 };
      })).toEqual({ left: left > 0, right: right > 0 });
      const result = await frame.evaluate(async () => {
        const cc = await (window as any).System.import("cc");
        const c = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
        const me = c.state.me;
        c.state.selected = c.state.players.find((p: any) => p.seat === me).hand[0];
        c.draw();
        const n = c.hud.getChildByName(`player-panel-${me}`), u = n.getComponent(cc.UITransform);
        const avatar = c.hud.getChildByName(`avatar-${me}`);
        return {
          me,
          panel: { x: n.position.x + 640, y: 295 - n.position.y, w: u.width, h: u.height },
          safe: c.state.safeArea,
          avatar: { active: avatar.activeInHierarchy, texture: !!avatar.getComponent(cc.Sprite).spriteFrame },
          tiles: (window as any).__JINLING_TABLE_LAYOUT__,
        };
      });
      expect(result.avatar).toEqual({ active: true, texture: true });
      const p = result.panel;
      expect(p.x).toBeLessThan(320);
      expect(p.x - p.w / 2).toBeGreaterThanOrEqual(result.safe.left);
      expect(p.y + p.h / 2).toBeLessThan(476);
      const hand = result.tiles.filter((tile: any) => tile.seat === result.me && tile.area === "hand");
      expect(Math.min(...hand.map((tile: any) => tile.x - tile.w / 2))).toBeGreaterThan(result.safe.left + 16);
      expect(Math.max(...hand.map((tile: any) => tile.x + tile.w / 2))).toBeLessThan(1280 - result.safe.right - 16);
      for (const tile of result.tiles) {
        expect(Math.abs(p.x - tile.x) >= (p.w + tile.w) / 2 || Math.abs(p.y - tile.y) >= (p.h + tile.h) / 2,
          `player panel ${JSON.stringify(p)} overlaps ${JSON.stringify(tile)}`).toBe(true);
      }
      mkdirSync("output/local-avatar", { recursive: true });
      const screenshot = await page.screenshot({ path: `output/local-avatar/${test.info().project.name}-${width}-${left}-${right}.png` });
      const stats = await sharp(screenshot).stats();
      expect(stats.channels.some(channel => channel.stdev > 20)).toBe(true);
    }
  });
}

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fullMeldFixture } from './previews/table-full-meld-fixture';

type HudBox = { left: number; right: number; top: number; bottom: number };

function overlaps(a: HudBox, b: HudBox) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > .01 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .01;
}

function contained(inner: HudBox, outer: HudBox) {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - .01);
  expect(inner.right).toBeLessThanOrEqual(outer.right + .01);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - .01);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + .01);
}

for (const [width, height] of [[568, 320], [844, 390], [1280, 590]]) {
  for (const me of [0, 1, 2, 3]) {
    test(`HUD可读性 ${width} / 视角${me}：比下胡无遮挡，实际花数不缩字且不动牌`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/cocos-table/index.html');
      await page.waitForFunction(() => !!(window as any).__JINLING_TABLE_READY__);
      const state = fullMeldFixture('pung');
      state.me = me; state.dealer = me; state.turn = (me + 3) % 4;
      state.externalControls = true;
      state.players = state.players.map(player => ({
        ...player, seat: (player.seat + me) % 4,
        melds: player.melds.map(meld => ({ ...meld, from: (meld.from + me) % 4 })),
      }));

      for (const count of [0, 1, 12, 20]) {
        for (const player of state.players)
          player.flowers = Array.from({ length: count }, (_, index) => 124 + index);
        state.roundMultiplier = 1;
        const result = await page.evaluate(async state => {
          const cc = await (window as any).System.import('cc');
          const table = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
          table.state = state; table.hudKey = ''; table.draw();
          const before = structuredClone((window as any).__JINLING_TABLE_LAYOUT__);
          // Alter only HUD data, within this same perspective and flower count.
          // These changes must not relayout any hand, discard, meld or flower.
          table.state.roundMultiplier = 2;
          table.state.players.forEach((player: any) => { player.score += 1; });
          table.hudKey = ''; table.draw();
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          const box = (node: any) => {
            const transform = node.getComponent(cc.UITransform);
            const x = node.position.x + 640, y = 295 - node.position.y;
            return { left: x - transform.width / 2, right: x + transform.width / 2,
              top: y - transform.height / 2, bottom: y + transform.height / 2 };
          };
          const visible = (node: any) => !!node?.activeInHierarchy &&
            (node.getComponent(cc.UIOpacity)?.opacity ?? 255) > 0;
          const probe = (name: string) => {
            const node = table.hud.getChildByName(name);
            if (!node) return null;
            const label = node.getComponent(cc.Label);
            const canvas = document.createElement('canvas'), context = canvas.getContext('2d')!;
            if (label) context.font = `${label.isBold ? 'bold ' : ''}${label.actualFontSize}px ${label.fontFamily}`;
            const measured = label && context.measureText(label.string);
            return { name, visible: visible(node), box: box(node), text: label?.string,
              fontSize: label?.fontSize, actualFontSize: label?.actualFontSize,
              lineHeight: label?.lineHeight, textWidth: measured?.width,
              textHeight: measured && measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent,
              scaleX: node.scale.x, scaleY: node.scale.y };
          };
          const upstream = (state.me + 3) % 4;
          const obstacles = [`player-avatar-ring-${upstream}`, `player-status-${upstream}`,
            `player-flower-count-box-${upstream}`, `player-name-${upstream}`]
            .map(probe).filter((node: any) => node?.visible);
          return {
            before, after: (window as any).__JINLING_TABLE_LAYOUT__,
            multiplier: probe('table-round-multiplier'), obstacles,
            players: state.players.map((player: any) => ({
              seat: player.seat, count: player.flowers.length,
              flowers: probe(`player-flower-count-${player.seat}`),
              score: probe(`player-score-${player.seat}`),
              badge: probe(`player-flower-count-box-${player.seat}`),
            })),
          };
        }, state);

        expect(result.after).toEqual(result.before);
        expect(result.multiplier).not.toBeNull();
        expect(result.multiplier!.text).toBe('比下胡 × 2');
        expect(result.multiplier!.visible).toBe(true);
        contained(result.multiplier!.box, { left: 0, right: 1280, top: 0, bottom: 590 });
        expect(result.obstacles.map(node => node!.name)).toContain(`player-status-${(me + 3) % 4}`);
        for (const obstacle of result.obstacles)
          expect(overlaps(result.multiplier!.box, obstacle!.box), `倍率被${obstacle!.name}遮挡`).toBe(false);

        for (const player of result.players) {
          const { flowers, badge, score } = player;
          expect(flowers?.visible).toBe(true);
          expect(badge?.visible).toBe(true);
          expect(score?.visible).toBe(true);
          expect(player.count).toBe(count);
          expect(flowers!.text).toBe(`✿ ×${count}`);
          expect(flowers!.fontSize).toBeGreaterThanOrEqual(18);
          expect(flowers!.actualFontSize).toBeGreaterThanOrEqual(18);
          // Cocos' wrapping SHRINK search starts at configured size + 1 and
          // may choose that extra pixel when it fits. It must never shrink.
          expect(flowers!.actualFontSize).toBeGreaterThanOrEqual(flowers!.fontSize!);
          expect(flowers!.actualFontSize).toBeLessThanOrEqual(flowers!.fontSize! + 1);
          expect(flowers!.scaleX).toBe(1);
          expect(flowers!.scaleY).toBe(1);
          expect(flowers!.box.bottom - flowers!.box.top).toBeGreaterThanOrEqual(flowers!.lineHeight!);
          expect(flowers!.textWidth).toBeLessThanOrEqual(flowers!.box.right - flowers!.box.left);
          expect(flowers!.textHeight).toBeLessThanOrEqual(flowers!.box.bottom - flowers!.box.top);
          contained(flowers!.box, badge!.box);
          contained(score!.box, badge!.box);
          expect(overlaps(flowers!.box, score!.box), `seat${player.seat}的花数与分数重叠`).toBe(false);
        }
      }
      mkdirSync('test-results/screenshots', { recursive: true });
      await page.screenshot({ path: `test-results/screenshots/player-hud-readability-${width}-me${me}.png` });
    });
  }
}

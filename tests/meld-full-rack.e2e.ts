import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tileFootprint, type SceneTile } from '../shared/table-scene';
import { fullMeldFixture } from './previews/table-full-meld-fixture';

function bounds(tiles: SceneTile[]) {
  const points = tiles.flatMap(tile => tileFootprint(tile));
  return {
    left: Math.min(...points.map(([x]) => x)),
    right: Math.max(...points.map(([x]) => x)),
    top: Math.min(...points.map(([, y]) => y)),
    bottom: Math.max(...points.map(([, y]) => y)),
  };
}

for (const [width, height] of [[1280, 590], [844, 390]]) {
  for (const kind of ['pung', 'kong'] as const) {
    test(`四家满${kind === 'pung' ? '碰' : '明杠'}：对家整排避开上家与头像 ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/cocos-table/index.html');
      await page.waitForFunction(() => !!(window as any).__JINLING_TABLE_READY__);
      const state = fullMeldFixture(kind);
      state.externalControls = true;
      const result = await page.evaluate(async state => {
        const cc = await (window as any).System.import('cc');
        const table = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
        table.state = state;
        table.draw();
        const topSeat = (state.me + 2) % 4;
        // The transparent top HUD probe is seat-named in the real renderer.
        const panel = table.hud.getChildByName(`player-panel-${topSeat}`);
        const size = panel?.getComponent(cc.UITransform);
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return {
          tiles: (window as any).__JINLING_TABLE_LAYOUT__ as SceneTile[],
          panel: panel && {
            name: panel.name, x: panel.position.x + 640, y: 295 - panel.position.y,
            w: size.width, h: size.height, visible: panel.activeInHierarchy,
          },
        };
      }, state);

      const tiles = result.tiles, baseCount = kind === 'pung' ? 3 : 4;
      const melds = tiles.filter(tile => tile.area === 'meld');
      expect(melds).toHaveLength(16 * baseCount);
      expect(new Set(melds.map(tile => tile.id.split('-').slice(0, 3).join('-'))).size).toBe(16);
      expect(melds.every(tile => !tile.stack)).toBe(true);
      for (let seat = 0; seat < 4; seat++) {
        expect(melds.filter(tile => tile.seat === seat)).toHaveLength(4 * baseCount);
        expect(tiles.filter(tile => tile.area === 'hand' && tile.seat === seat)).toHaveLength(2);
        for (let group = 0; group < 4; group++)
          expect(melds.filter(tile => tile.id.startsWith(`meld-${seat}-${group}-`))).toHaveLength(baseCount);
      }

      const topHand = tiles.filter(tile => tile.seat === 2 && tile.area === 'hand');
      const topMelds = melds.filter(tile => tile.seat === 2);
      const leftMelds = melds.filter(tile => tile.seat === 3);
      expect(bounds(topHand).left - bounds(leftMelds).right).toBeGreaterThanOrEqual(6);
      expect(bounds(topMelds).left - bounds(topHand).right).toBeCloseTo(12, 8);
      const orderedHand = [...topHand].sort((a, b) => a.x - b.x);
      expect(bounds([orderedHand[1]]).left - bounds([orderedHand[0]]).right).toBeCloseTo(12, 8);
      expect(result.panel).toMatchObject({ name: 'player-panel-2', visible: true, w: 76, h: 108 });
      expect(result.panel!.x).toBeCloseTo(954, 5);
      expect(result.panel!.x - result.panel!.w / 2 - bounds([...topHand, ...topMelds]).right).toBeGreaterThanOrEqual(6);

      mkdirSync('test-results/screenshots', { recursive: true });
      await page.screenshot({ path: `test-results/screenshots/full-${kind}-clear-${width}.png` });
    });
  }
}

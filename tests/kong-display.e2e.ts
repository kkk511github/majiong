import { test, expect } from './browser-fixtures';
import { mkdirSync } from 'node:fs';
import { viewFor } from '../shared/engine';
import type { Game } from '../shared/types';
import late from './fixtures/late-table.json' with { type: 'json' };

for (const [width, height] of [[844, 390], [1280, 590]]) {
  test(`暗杠亮一张且对家从右向左出牌 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const g = structuredClone(late) as unknown as Game;
    g.players.forEach((p, seat) => {
      if (!p) return;
      p.melds = [{ type: 'kong', tiles: [seat * 4, seat * 4 + 1, seat * 4 + 2, seat * 4 + 3], from: seat as 0|1|2|3, concealed: true }];
      p.hand = Array.from({ length: 10 }, (_, i) => 36 + seat * 12 + i);
      p.discards = Array.from({ length: 12 }, (_, i) => 72 + seat * 12 + i);
      p.flowers = [124 + seat];
    });
    const v = viewFor(g, 0);
    Object.assign(v, { phase: 'playing', turn: 1, canDiscard: false, actions: [], selfKongs: [], pending: undefined, result: undefined, deadline: Date.now() + 600000 });
    await page.routeWebSocket('**/ws', ws => {
      const server = ws.connectToServer();
      ws.onMessage(raw => server.send(raw));
      server.onMessage(raw => {
        const m = JSON.parse(String(raw));
        if (m.type === 'session') {
          ws.send(JSON.stringify({ ...m, roomCode: v.code }));
          ws.send(JSON.stringify({ type: 'state', state: v, serverNow: Date.now() }));
        } else ws.send(raw);
      });
    });
    await page.goto('/');
    const frame = () => page.frames().find(f => f.url().includes('/cocos-table/index.html'));
    await expect.poll(async () => frame()?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    await expect(async () => {
      const tiles = await frame()!.evaluate(() => (window as any).__JINLING_TABLE_LAYOUT__);
      for (let seat = 0; seat < 4; seat++) {
        const meld = tiles.filter((t: any) => t.area === 'meld' && t.seat === seat);
        expect(meld).toHaveLength(4);
        expect(meld.filter((t: any) => t.tile !== undefined).map((t: any) => t.tile)).toEqual([seat * 4]);
        expect(meld.filter((t: any) => t.pose.startsWith('cover-'))).toHaveLength(3);
      }
      const river = v.players[2]!.discards.map(tile => tiles.find((t: any) => t.area === 'river' && t.seat === 2 && t.tile === tile));
      expect(river).toHaveLength(12);
      for (let i = 1; i < river.length; i++) {
        if (i % 9) expect(river[i].x).toBeLessThan(river[i - 1].x);
        else { expect(river[i].x).toBe(river[0].x); expect(river[i].y).toBeLessThan(river[0].y); }
      }
    }).toPass();
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.screenshot({ path: `test-results/screenshots/kong-display-${width}.png` });
  });
}

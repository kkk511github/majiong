import { test, expect } from './browser-fixtures';
import { mkdirSync } from 'node:fs';
import { viewFor } from '../shared/engine';
import { RIVER_ROW_CAPACITY } from '../shared/table-scene';
import type { Game } from '../shared/types';
import late from './fixtures/late-table.json' with { type: 'json' };

for (const [width, height] of [[844, 390], [1280, 590]]) {
  test(`明杠四张并排、补杠暗杠叠中间且对家从右向左出牌 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const g = structuredClone(late) as unknown as Game;
    g.players.forEach((p, seat) => {
      if (!p) return;
      const first = seat * 16;
      p.melds = [
        { type: 'kong', tiles: [first, first + 1, first + 2, first + 3], from: ((seat + 1) % 4) as 0|1|2|3, concealed: false },
        { type: 'kong', tiles: [first + 4, first + 5, first + 6, first + 7], from: ((seat + 1) % 4) as 0|1|2|3, concealed: false, added: true },
        { type: 'kong', tiles: [first + 8, first + 9, first + 10, first + 11], from: seat as 0|1|2|3, concealed: true },
      ];
      p.hand = Array.from({ length: 4 }, (_, i) => 68 + seat * 4 + i);
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
    await expect.poll(async () => frame()?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__), { timeout: 15000 }).toBe(true);
    await expect(async () => {
      const tiles = await frame()!.evaluate(() => (window as any).__JINLING_TABLE_LAYOUT__);
      for (let seat = 0; seat < 4; seat++) {
        const meld = tiles.filter((t: any) => t.area === 'meld' && t.seat === seat);
        expect(meld).toHaveLength(12);
        for (let groupIndex = 0; groupIndex < 3; groupIndex++) {
          const group = meld.filter((t: any) => t.id.startsWith(`meld-${seat}-${groupIndex}-`));
          if (groupIndex === 0) {
            expect(group.filter((t: any) => !t.stack)).toHaveLength(4);
            expect(group.filter((t: any) => t.stack)).toHaveLength(0);
            expect(group.every((t: any) => !t.pose.includes('cross') && !t.pose.startsWith('cover-') && t.source === undefined)).toBe(true);
          } else {
            const bases = group.filter((t: any) => !t.stack);
            const middle = group.find((t: any) => t.id.endsWith('-1'));
            const upper = group.find((t: any) => t.stack);
            expect(bases).toHaveLength(3);
            expect(group.filter((t: any) => t.stack)).toHaveLength(1);
            if (seat % 2 === 1) {
              const upperEdge = seat === 1 ? upper.x + upper.w / 2 : upper.x - upper.w / 2;
              const middleEdge = seat === 1 ? middle.x + middle.w / 2 : middle.x - middle.w / 2;
              expect(upperEdge).toBeCloseTo(middleEdge, 8);
              expect(Math.abs(upper.x - middle.x)).toBeLessThan(.1);
              expect(middle.y - upper.y).toBeGreaterThanOrEqual(7.5);
              expect(middle.y - upper.y).toBeLessThanOrEqual(8.5);
              expect(upper.y - middle.y).toBeCloseTo(-8, 8);
            } else {
              expect(upper.x).toBe(middle.x);
              const inward = upper.y - middle.y;
              expect(inward).toBeLessThan(0);
              if (seat === 2) {
                expect(inward).toBeCloseTo(-4, 8);
                expect(upper.y - upper.h / 2).toBeGreaterThanOrEqual(0);
                expect(middle.y + middle.h / 2).toBeCloseTo(45, 8);
                const visibleBand = middle.y + middle.h / 2 - upper.y - upper.h / 2;
                expect(visibleBand).toBeGreaterThanOrEqual(3.5);
                expect(visibleBand).toBeLessThanOrEqual(4.5);
              }
            }
            expect(upper.z).toBeGreaterThan(Math.max(...bases.map((t: any) => t.z)));
            if (groupIndex === 1) {
              expect(bases.filter((t: any) => t.pose.includes('cross'))).toHaveLength(1);
            } else {
              expect(bases.every((t: any) => t.pose.startsWith('cover-') && t.tile === undefined)).toBe(true);
              expect(group.filter((t: any) => t.tile !== undefined).map((t: any) => t.tile)).toEqual([seat * 16 + 8]);
            }
          }
          if (seat % 2 === 1) {
            const bases = group.filter((t: any) => !t.stack).sort((a: any, b: any) => a.y - b.y);
            for (let i = 1; i < bases.length; i++) {
              const gap = bases[i].y - bases[i].h / 2 - (bases[i - 1].y + bases[i - 1].h / 2);
              expect(gap).toBeGreaterThanOrEqual(-6.6);
              expect(gap).toBeLessThanOrEqual(-6.4);
            }
          }
        }
      }
      const river = v.players[2]!.discards.map(tile => tiles.find((t: any) => t.area === 'river' && t.seat === 2 && t.tile === tile));
      expect(river).toHaveLength(12);
      for (let i = 1; i < river.length; i++) {
        if (i % RIVER_ROW_CAPACITY) expect(river[i].x).toBeLessThan(river[i - 1].x);
        else { expect(river[i].x).toBe(river[0].x); expect(river[i].y).toBeGreaterThan(river[0].y); }
      }
    }).toPass();
    mkdirSync('test-results/screenshots', { recursive: true });
    await page.screenshot({ path: `test-results/screenshots/kong-display-${width}.png` });
  });
}

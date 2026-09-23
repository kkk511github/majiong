import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { beforeAll, expect, it } from 'vitest';
import { layoutTable, tileKind, type SceneTile, type TableSceneState } from '../shared/table-scene';

// Check the actual baked pixels, not just node rectangles. A full-height
// sprite can touch its neighbour while exposing a green sidewall stripe that
// visually reads as felt between the faces.
const root = new URL('../cocos-table/assets/resources/', import.meta.url);
const atlas = JSON.parse(readFileSync(new URL('tile-atlas.json', root), 'utf8'));
const pixels = new Map<string, { data: Buffer; width: number; channels: number }>();

beforeAll(async () => {
  for (const pose of ['left', 'right', 'meld-cross-left', 'meld-cross-right']) {
    const { data, info } = await sharp(new URL(`tiles/${pose}.png`, root).pathname)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    pixels.set(pose, { data, width: info.width, channels: info.channels });
  }
});

function sample(tile: SceneTile, x: number, y: number) {
  const raw = pixels.get(tile.pose)!;
  const rect = atlas[tile.pose].rects[tileKind(tile.tile!)];
  const px = Math.max(0, Math.min(rect.w - 1, Math.floor((x - tile.x + tile.w / 2) / tile.w * rect.w)));
  const py = Math.max(0, Math.min(rect.h - 1, Math.floor((y - tile.y + tile.h / 2) / tile.h * rect.h)));
  const start = ((rect.y + py) * raw.width + rect.x + px) * raw.channels;
  return [...raw.data.subarray(start, start + 4)];
}

function fixture(seat: number, from: number, direct: boolean): TableSceneState {
  return {
    key: 'side-pixel-seam', revision: 1, me: 0, turn: 0, dealer: 0, phase: 'playing',
    code: '', round: 1, remaining: 40, countdown: '10', connected: true, disabled: false,
    practice: true, canDiscard: false, selected: null, inspectedKind: null, hintKinds: [],
    hintLabel: '', actions: [], effects: [], trusteeDisabled: false,
    players: [0, 1, 2, 3].map(s => ({
      seat: s, name: String(s), score: 150, bot: s !== 0, trustee: false,
      hand: [], handCount: 10, flowers: [], discards: [],
      melds: s === seat ? [{ type: direct ? 'kong' : 'pung', tiles: direct ? [108, 109, 110, 111] : [108, 109, 110], from, concealed: false }] : [],
    })),
  };
}

it.each([1, 3].flatMap(seat => [1, 2, 3].flatMap(relative => [false, true].map(direct => ({ seat, relative, direct })))))
('seat $seat source $relative direct $direct joins ivory edges, not exposed green walls', ({ seat, relative, direct }) => {
  const cards = layoutTable(fixture(seat, (seat + relative) % 4, direct))
    .filter(t => t.area === 'meld' && t.seat === seat).sort((a, b) => a.y - b.y);
  for (let i = 1; i < cards.length; i++) {
    const back = cards[i - 1], front = cards[i];
    const contactY = front.y - front.h / 2;
    // Sample the ivory rim inside the shared player-side edge, clear of ink
    // and rounded corners. The rear tile must still be ivory where it meets
    // the next face; the old .75px rectangle tuck sampled the green substrate.
    const x = seat === 1 ? front.x + front.w / 2 - 4 : front.x - front.w / 2 + 4;
    const [r, g, b, alpha] = sample(back, x, contactY - .4);
    expect(alpha, `${back.pose} -> ${front.pose} has a transparent seam`).toBeGreaterThanOrEqual(250);
    expect(r, `${back.pose} -> ${front.pose} exposes a green wall`).toBeGreaterThan(180);
    expect(b, `${back.pose} -> ${front.pose} exposes a green wall`).toBeGreaterThan(170);
    expect(Math.abs(r - g)).toBeLessThan(30);
  }
});

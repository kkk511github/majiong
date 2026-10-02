import { test, expect, type Page } from './browser-fixtures';
import { replayedRound } from './fixtures/replayed-round';
import type { ReplayFrame, Seat } from '../shared/types';

function motionReplay() {
  const replay = replayedRound().replay!;
  replay.id = 'replay-all-seat-motion';
  const players = [0, 1, 2, 3].map(seat => ({ hand: Array.from({ length: 13 }, (_, i) => seat * 28 + i * 2), flowers: [], melds: [], discards: [] as number[], score: 90 }));
  const frames: ReplayFrame[] = [{ at: 1000, type: 'start', turn: 0, remaining: 80, players: structuredClone(players) }];
  for (const seat of [0, 1, 2, 3] as Seat[]) {
    const drawn = seat * 28 + 1, discarded = seat * 28;
    players[seat].hand.push(drawn);
    frames.push({ at: 1000 + frames.length * 1400, type: 'draw', seat, tile: drawn, turn: seat, remaining: 79 - seat, players: structuredClone(players) });
    players[seat].hand = players[seat].hand.filter(tile => tile !== discarded);
    players[seat].discards.push(discarded);
    frames.push({ at: 1000 + frames.length * 1400, type: 'discard', seat, tile: discarded, turn: ((seat + 1) % 4) as Seat, remaining: 79 - seat, players: structuredClone(players) });
  }
  frames.push({ ...frames.at(-1)!, at: 1000 + frames.length * 1400, type: 'finish', result: { reason: 'draw', winners: [], details: {}, deltas: [0, 0, 0, 0] } });
  replay.frames = frames;
  return replay;
}
const frameFor = (page: Page) => page.frames().find(frame => frame.url().includes('/cocos-table/index.html'))!;
async function openReplay(page: Page) {
  const replay = motionReplay();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/api/replays/**', route => route.fulfill({ json: replay }));
  await page.goto('/');
  await page.getByRole('button', { name: '战绩', exact: true }).click();
  await page.getByRole('button', { name: '牌局回放', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '牌局回放', exact: true });
  await dialog.getByLabel('牌局 ID', { exact: true }).fill(replay.id);
  await dialog.getByRole('button', { name: '查看回放', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '播放回放', exact: true })).toBeEnabled({ timeout: 25000 });
  await frameFor(page).evaluate(async () => {
    const cc = await (window as any).System.import('cc'), scene = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    (window as any).motionScene = scene;
    (window as any).flights = [];
    const original = scene.startFlight.bind(scene);
    scene.startFlight = (...args: any[]) => {
      const tile = args[2];
      const event = { revision: scene.state.revision, tile: tile.tile, seat: tile.seat, area: tile.area, insert: !!args[6], scale: scene.animationScale(), moved: false };
      (window as any).flights.push(event);
      const result = original(...args), node = args[0], x = node.position.x, y = node.position.y, started = performance.now();
      // Observe rendered frames, not a 35ms wall-clock sample that can fall
      // before WebKit's first tween update. Still require actual displacement.
      const sample = () => {
        const progress = scene.tileFlights.get(tile.id)?.progress.t;
        event.moved ||= node.isValid && progress > 0 && progress < 1 && Math.hypot(node.position.x - x, node.position.y - y) > .1;
        if (!event.moved && node.isValid && performance.now() - started < args[3] * event.scale + 500) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return result;
    };
  });
  return dialog;
}
async function exposedHands(page: Page) {
  return frameFor(page).evaluate(async () => {
    const cc = await (window as any).System.import('cc'), scene = (window as any).motionScene;
    const models = cc.director.getScene().getChildByName('Table 3D models');
    return scene.state.players.map((player: any) => {
      const tiles = [...scene.tileLayout.values()].filter((t: any) => t.area === 'hand' && t.seat === player.seat) as any[];
      const faces = tiles.filter(t => t.tile !== undefined && (t.seat === scene.state.me ? scene.nodes.get(t.id)?.activeInHierarchy : models.getChildByName(t.id)?.getChildByName('Physical tile')?.getChildByName('Face')?.activeInHierarchy));
      return { seat: player.seat, faces: faces.length, count: player.handCount };
    });
  });
}

test('四家明牌在所有视角显示实际牌面，切回当前视角隐藏另外三家', async ({ page }, info) => {
  const dialog = await openReplay(page);
  expect(await dialog.locator('.modal-head').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  for (const seat of [0, 1, 2, 3]) {
    await frameFor(page).evaluate(seat => (window as any).motionScene.emit({ type: 'menu', menu: 'table', seat }), seat);
    await expect.poll(() => frameFor(page).evaluate(() => (window as any).motionScene.state.me)).toBe(seat);
    await expect.poll(() => exposedHands(page)).toEqual([0, 1, 2, 3].map(seat => ({ seat, faces: 13, count: 13 })));
    await dialog.locator('.replay-reveal').click();
    await expect.poll(() => exposedHands(page)).toEqual([0, 1, 2, 3].map(s => ({ seat: s, faces: s === seat ? 13 : 0, count: 13 })));
    await dialog.locator('.replay-reveal').click();
    await expect.poll(() => exposedHands(page)).toEqual([0, 1, 2, 3].map(seat => ({ seat, faces: 13, count: 13 })));
  }
  await page.screenshot({ path: info.outputPath('all-seats-revealed.png') });
});

for (const speed of [1, 4]) test(`四家明牌实际摸牌和保留摸牌插入动画 ${speed}倍速`, async ({ page }, info) => {
  const dialog = await openReplay(page);
  await dialog.getByLabel('回放速度').selectOption(String(speed));
  await dialog.getByRole('button', { name: '播放回放', exact: true }).click();
  await expect.poll(() => frameFor(page).evaluate(() => (window as any).motionScene.state.revision), { timeout: 20000 }).toBe(9);
  const flights = await frameFor(page).evaluate(() => (window as any).flights as { revision: number; tile: number; seat: number; area: string; insert: boolean; scale: number; moved: boolean }[]);
  await info.attach('actual-renderer-flights', { body: JSON.stringify(flights), contentType: 'application/json' });
  for (const seat of [0, 1, 2, 3]) {
    expect(flights.some(f => f.seat === seat && f.revision === seat * 2 + 1 && f.tile === seat * 28 + 1 && f.area === 'hand' && f.moved), `seat ${seat} draw`).toBe(true);
    expect(flights.some(f => f.seat === seat && f.revision === seat * 2 + 2 && f.tile === seat * 28 + 1 && f.insert && f.moved && f.scale === 1 / speed), `seat ${seat} insertion`).toBe(true);
  }
});

test('暂停逐步和拖动跳转不误播摸牌动画', async ({ page }) => {
  const dialog = await openReplay(page);
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await expect.poll(() => frameFor(page).evaluate(() => (window as any).motionScene.state.revision)).toBe(1);
  expect(await frameFor(page).evaluate(() => (window as any).flights.length)).toBe(0);
  await dialog.getByRole('button', { name: '查看结算', exact: true }).click();
  await expect.poll(() => frameFor(page).evaluate(() => (window as any).motionScene.state.revision)).toBe(9);
  expect(await frameFor(page).evaluate(() => (window as any).flights.length)).toBe(0);
});

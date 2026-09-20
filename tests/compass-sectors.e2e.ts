import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

async function enter(page: Page) {
  await page.goto("/cocos-table/index.html");
  await page.waitForFunction(() => !!(window as any).__JINLING_TABLE_READY__);
  await page.evaluate(async () => {
    const win = window as any, cc = await win.System.import("cc");
    win.__windScene = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    win.__windCC = cc;
  });
}
async function compass(page: Page) {
  return page.evaluate(() => {
    const win = window as any, c = win.__windScene, cc = win.__windCC;
    const root = c.compassRoot, frame = root.getChildByName("compass");
    const bounds = (node: any) => { const box = node.getComponent(cc.UITransform); return { x: node.position.x + 640, y: 295 - node.position.y, w: box.width, h: box.height }; };
    return {
      root: root.uuid, clock: c.countdownLabel.node.uuid, text: c.countdownLabel.string,
      winds: c.compassWinds.map((label: any) => ({ id: label.node.uuid, value: label.string })) as {id:string;value:string}[],
      sectors: c.compassHighlights.map((opacity: any) => ({ id: opacity.node.uuid, opacity: opacity.opacity })) as {id:string;opacity:number}[],
      active: c.compassActive, remembered: c.compassMemory?.lastDiscardSeat,
      compass: bounds(frame),
      counters: ["table-remaining-count", "table-flowers-count", "table-round-label", "table-round-count"].map(name => {
        const node = c.hud.getChildByName(name); return { name, text: node.getComponent(cc.Label).string, ...bounds(node) };
      }),
      tiles: win.__JINLING_TABLE_LAYOUT__.map(({ id, x, y, w, h }: any) => ({ id, x, y, w, h })),
    };
  });
}

for (const [width, height] of [[568, 320], [1280, 590]]) {
  test(`四分风位映射、单侧高亮和中心避让 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await enter(page);
    for (let me = 0; me < 4; me++) {
      let reference: Awaited<ReturnType<typeof compass>> | undefined;
      for (let seat = 0; seat < 4; seat++) {
        await page.evaluate(({ me, seat }) => {
          const c = (window as any).__windScene, s = c.demo();
          s.key = `wind-${me}`; s.me = me; s.turn = (seat + 1) % 4; s.revision = 10 + seat;
          s.actions = []; s.effects = []; s.lastDiscard = { seat, tile: s.players[seat].discards.at(-1) };
          c.state = s; c.draw();
        }, { me, seat });
        const during = await compass(page);
        expect(during.sectors.filter(sector => sector.opacity > 0).length).toBeLessThanOrEqual(1);
        await page.waitForFunction(() => (window as any).__windScene.compassHighlights.filter((opacity: any) => opacity.opacity >= 254).length === 1);
        const current = await compass(page);
        expect(current.active).toBe((seat - me + 4) % 4);
        expect(current.winds.map(wind => wind.value)).toEqual([0, 1, 2, 3].map(offset => ["东", "南", "西", "北"][(me + offset) % 4]));
        expect(current.sectors.map((sector, index) => sector.opacity > 0 ? index : -1).filter(index => index >= 0)).toEqual([current.active]);
        for (const counter of current.counters)
          expect(Math.abs(counter.x - current.compass.x) >= (counter.w + current.compass.w) / 2 || Math.abs(counter.y - current.compass.y) >= (counter.h + current.compass.h) / 2).toBe(true);
        if (reference) { expect(current.tiles).toEqual(reference.tiles); expect(current.counters).toEqual(reference.counters); }
        else reference = current;
      }
    }
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({ path: `test-results/screenshots/compass-sectors-${width}-${test.info().project.name}.png` });
  });
}

test("风位节点在倒计时、碰牌换回合中复用，同帧弃牌被碰仍正确记忆", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => {
    const c = (window as any).__windScene, s = c.demo();
    s.key = "wind-retained"; s.revision = 1; s.me = 0; s.turn = 0; s.lastDiscard = { seat: 2, tile: 116 }; s.effects = [];
    c.state = s; c.draw();
  });
  const initial = await compass(page);
  await page.evaluate(() => {
    const c = (window as any).__windScene;
    c.state = { ...c.state, countdown: "07" }; c.draw();
    c.state = { ...c.state, revision: 2, lastDiscard: undefined, turn: 1 }; c.draw();
  });
  const claimed = await compass(page);
  expect(claimed.root).toBe(initial.root); expect(claimed.clock).toBe(initial.clock);
  expect(claimed.winds.map(wind => wind.id)).toEqual(initial.winds.map(wind => wind.id));
  expect(claimed.sectors.map(sector => sector.id)).toEqual(initial.sectors.map(sector => sector.id));
  expect(claimed.active).toBe(2); expect(claimed.text).toBe("07");
  await page.evaluate(() => {
    const c = (window as any).__windScene, s = c.state;
    for (const next of [{ ...s, revision: 3, lastDiscard: { seat: 3, tile: 79 } }, { ...s, revision: 4, lastDiscard: undefined, turn: 0 }])
      window.postMessage({ scope: "jinling-table-v1", channel: "", type: "state", state: next }, location.origin);
  });
  await page.waitForFunction(() => { const c = (window as any).__windScene; return c.motionSnapshot.revision === 4 && !c.stateFrame; });
  expect((await compass(page)).remembered).toBe(3); expect((await compass(page)).active).toBe(3);
  await page.evaluate(() => {
    const c = (window as any).__windScene;
    c.state = { ...c.state, round: c.state.round + 1, revision: 5, lastDiscard: undefined, turn: 1 }; c.draw();
  });
  expect((await compass(page)).remembered).toBeUndefined(); expect((await compass(page)).active).toBe(1);
});

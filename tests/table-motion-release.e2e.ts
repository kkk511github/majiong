import { test, expect, type Page, type Frame } from "@playwright/test";
import type { TableSceneState } from "../shared/table-scene";

// These tests send the normal public bridge protocol to the built production
// iframe. No preview adapter, monkeypatch or live game service is involved.
const channel = "production-motion-regression";
function fixture(key = "motion-release"): TableSceneState {
  const hand = [0, 4, 8, 36, 40, 44, 72, 80, 81, 82, 83];
  return {
    key, revision: 1, me: 0, turn: 0, dealer: 0, phase: "playing", code: "测试",
    round: 1, rounds: 8, remaining: 70, rulesName: "进园子", roundMultiplier: 1,
    countdown: "10", connected: true, disabled: false, practice: false, canDiscard: true,
    selected: null, drawn: 83, inspectedKind: null, hintKinds: [], hintLabel: "",
    actions: [], effects: [], trusteeDisabled: true, externalControls: true,
    players: [0, 1, 2, 3].map(seat => ({
      name: ["本人", "下家", "对家", "上家"][seat], score: 150, seat, bot: seat !== 0,
      trustee: false, online: true, hand: seat === 0 ? hand : [], handCount: seat === 0 ? 11 : 10,
      flowers: [136 + seat], discards: [20 + seat, 24 + seat],
      melds: [{ type: "pung", tiles: [0, 1, 2].map(copy => [4, 13, 25, 27][seat] * 4 + copy), from: (seat + 3) % 4, concealed: false }],
    })),
  };
}
function concealed(before: TableSceneState) {
  const after = structuredClone(before);
  after.revision++; after.drawn = undefined;
  after.players[0].hand = after.players[0].hand.filter(tile => tile < 80);
  after.players[0].handCount = after.players[0].hand.length;
  after.players[0].melds.push({ type: "kong", tiles: [80, 81, 82, 83], from: 0, concealed: true });
  after.effects = [{ key: `${before.key}:1:${after.revision}:kong:0`, type: "kong", seat: 0, concealed: true }];
  return after;
}
async function table(page: Page) {
  await page.goto("/tile-catalog.html");
  await page.setContent(`<style>html,body{margin:0;background:#14382d}iframe{display:block;width:1280px;height:590px;border:0}</style><iframe title="正式牌桌" src="/cocos-table/index.html?channel=${channel}" allow="autoplay"></iframe>`);
  const frame = page.frames().find(f => f !== page.mainFrame())!;
  await frame.waitForFunction(() => (window as any).__JINLING_TABLE_READY__ === true, undefined, { timeout: 30_000 });
  expect(await frame.evaluate(() => (window as any).__JINLING_MOTION_PREVIEW__)).toBeUndefined();
  await frame.evaluate(async () => {
    const win = window as any, cc = await win.System.import("cc");
    win.__motionScene = cc.director.getScene()?.getChildByName("Canvas")?.getComponent("TableScene");
  });
  await page.evaluate(({ channel }) => {
    (window as any).__motionCommands = [];
    window.addEventListener("message", event => {
      if (event.data?.scope === "jinling-table-v1" && event.data.channel === channel && event.data.type === "command") (window as any).__motionCommands.push(event.data.command);
    });
  }, { channel });
  const send = async (state: TableSceneState) => {
    await page.evaluate(({ channel, state }) => document.querySelector("iframe")!.contentWindow!.postMessage({ scope: "jinling-table-v1", channel, type: "state", state }, location.origin), { channel, state });
    await frame.waitForFunction(({ key, revision, connected, disabled, selected }) => {
      const scene = (window as any).__motionScene;
      return scene?.state?.key === key && scene.state.revision === revision && scene.state.connected === connected && scene.state.disabled === disabled && scene.state.selected === selected && scene.motionSnapshot?.key === key && scene.motionSnapshot?.revision === revision && !scene.stateFrame;
    }, { key: state.key, revision: state.revision, connected: state.connected, disabled: state.disabled, selected: state.selected });
  };
  return { frame, send };
}
async function inspect(frame: Frame) {
  return frame.evaluate(async () => {
    const win = window as any, cc = await win.System.import("cc"), scene = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    return {
      moving: [...scene.tileFlights.keys()] as string[], held: scene.releasedTile?.tile as number | undefined,
      effects: scene.motionEffects.size as number, hud: scene.hud.children.map((node: any) => node.name) as string[],
      tiles: win.__JINLING_TABLE_LAYOUT__.map((tile: any) => {
        const node = scene.nodes.get(tile.id);
        return { id: tile.id as string, tile: tile.tile as number | undefined, area: tile.area as string, seat: tile.seat as number,
          x: tile.x as number, y: tile.y as number, actualX: node.position.x + 640, actualY: 295 - node.position.y,
          error: Math.hypot(node.position.x + 640 - tile.x, 295 - node.position.y - tile.y) };
      }) as { id: string; tile?: number; area: string; seat: number; x: number; y: number; actualX: number; actualY: number; error: number }[],
    };
  });
}
const settledMelds = async (frame: Frame) => {
  const data = await inspect(frame), melds = data.tiles.filter(tile => /^meld-0-[01]-/.test(tile.id));
  expect(melds).toHaveLength(7); expect(Math.max(...melds.map(tile => tile.error))).toBeLessThanOrEqual(.2);
};

test("production table enters and restores without replaying old tiles or action feedback", async ({ page }) => {
  const { frame, send } = await table(page), first = fixture();
  first.effects = [{ key: "historical-pung", type: "pung", seat: 0 }];
  await send(first); expect((await inspect(frame)).moving).toEqual([]); expect((await inspect(frame)).effects).toBe(0);
  const fast = concealed(first); fast.revision = first.revision + 3;
  await send(fast);
  expect((await inspect(frame)).moving.some(id => id.startsWith("meld-0-1-"))).toBe(true);
  const offline = { ...fast, connected: false }; await send(offline);
  expect((await inspect(frame)).moving).toEqual([]);
  const restored = { ...fast, revision: 20, connected: true }; await send(restored);
  expect((await inspect(frame)).moving).toEqual([]); expect((await inspect(frame)).effects).toBe(0);
  const next = fixture(); next.round = 2; next.revision = 21; await send(next);
  expect((await inspect(frame)).moving).toEqual([]);
  const replay = { ...concealed(next), presentation: "replay" as const, revision: 45 }; await send(replay);
  expect((await inspect(frame)).moving).toEqual([]); expect((await inspect(frame)).effects).toBe(0);
  await send({ ...next, presentation: "replay", revision: 25 });
  expect((await inspect(frame)).moving).toEqual([]);
});

test("settled concealed kong remains still through replacement, countdown, selection and resize", async ({ page }) => {
  const { frame, send } = await table(page), before = fixture(); await send(before);
  const kong = concealed(before); await send(kong); await page.waitForTimeout(470); await settledMelds(frame);
  const draw = structuredClone(kong); draw.revision++; draw.players[0].hand.push(68); draw.players[0].handCount++; draw.drawn = 68;
  await send(draw); await page.waitForTimeout(50); await settledMelds(frame);
  for (let index = 0; index < 4; index++) {
    await send({ ...draw, countdown: String(9 - index), selected: index % 2 ? 0 : null, effects: index === 3 ? [] : draw.effects });
    await page.waitForTimeout(55); await settledMelds(frame);
  }
  await page.setViewportSize({ width: 1360, height: 880 }); await settledMelds(frame);
  await frame.evaluate(async () => { const cc = await (window as any).System.import("cc"); cc.director.getScene().getChildByName("Canvas").getComponent("TableScene").draw(); });
  await page.waitForTimeout(70); await settledMelds(frame);
  const unknown = structuredClone(draw); unknown.key = "opponent-hidden-kong"; unknown.revision = 1; unknown.me = 1;
  unknown.players[0].hand = []; unknown.players[0].melds[1].tiles = [80]; unknown.drawn = undefined;
  await send(unknown); await send({ ...unknown, countdown: "8" });
  expect((await inspect(frame)).moving).toEqual([]);
});

test("draw follows one continuous path and repeated UI snapshots do not restart it", async ({ page }) => {
  const { frame, send } = await table(page), before = fixture(); before.players[0].hand.pop(); before.players[0].handCount--; before.drawn = undefined; await send(before);
  const draw = structuredClone(before); draw.revision++; draw.players[0].hand.push(68); draw.players[0].handCount++; draw.drawn = 68;
  await send(draw); await page.waitForTimeout(45);
  const early = (await inspect(frame)).tiles.find(tile => tile.id === "draw-68")!; expect(early.error).toBeGreaterThan(1);
  await send({ ...draw, countdown: "9" }); await page.waitForTimeout(100);
  const middle = (await inspect(frame)).tiles.find(tile => tile.id === "draw-68")!; expect(middle.error).toBeLessThan(early.error);
  await page.waitForTimeout(220);
  expect((await inspect(frame)).tiles.find(tile => tile.id === "draw-68")!.error).toBeLessThanOrEqual(.2);
});

test("slow drag holds its release point until acceptance and safely restores after rejection or disconnect", async ({ page }) => {
  const { frame, send } = await table(page); let state = fixture("drag-confirmation"); await send(state);
  const bounds = (await page.locator("iframe").boundingBox())!, scale = bounds.width / 1280;
  async function drag() {
    const card = (await inspect(frame)).tiles.find(tile => tile.id === "hand-0")!;
    const x = bounds.x + card.x * scale, y = bounds.y + card.y * scale;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 8, y - 110, { steps: 24 }); await page.waitForTimeout(90);
    const release = (await inspect(frame)).tiles.find(tile => tile.id === "hand-0")!;
    await page.mouse.up(); await page.waitForTimeout(45);
    const held = await inspect(frame), tile = held.tiles.find(tile => tile.id === "hand-0")!;
    expect(held.held).toBe(0); expect(Math.hypot(tile.actualX - release.actualX, tile.actualY - release.actualY)).toBeLessThanOrEqual(.2);
    return release;
  }
  await drag(); await send({ ...state, disabled: true });
  const accepted = structuredClone(state); accepted.revision++; accepted.players[0].hand = accepted.players[0].hand.filter(tile => tile !== 0); accepted.players[0].handCount--; accepted.players[0].discards.push(0); accepted.lastDiscard = { tile: 0, seat: 0 }; accepted.drawn = undefined; accepted.canDiscard = false;
  await send(accepted); expect((await inspect(frame)).held).toBeUndefined();
  await page.waitForTimeout(380); expect((await inspect(frame)).tiles.find(tile => tile.id === "river-0")!.error).toBeLessThanOrEqual(.2);
  state = fixture("drag-rejection"); await send(state); await drag();
  await send({ ...state, disabled: true }); await send({ ...state, disabled: false }); await page.waitForTimeout(480);
  expect((await inspect(frame)).held).toBeUndefined(); expect((await inspect(frame)).tiles.find(tile => tile.id === "hand-0")!.error).toBeLessThanOrEqual(.2);
  state = fixture("drag-disconnect"); await send(state); await drag(); await send({ ...state, connected: false });
  expect((await inspect(frame)).held).toBeUndefined(); expect((await inspect(frame)).moving).toEqual([]);
  state = fixture("drag-timeout"); await send(state); await drag(); await page.waitForTimeout(3800);
  expect((await inspect(frame)).held).toBeUndefined(); expect((await inspect(frame)).tiles.find(tile => tile.id === "hand-0")!.error).toBeLessThanOrEqual(.2);
});

test("external controls suppress the old Cocos prompt while embedded controls remain available", async ({ page }) => {
  const { frame, send } = await table(page), state = fixture();
  state.phase = "claiming"; state.turn = 3; state.canDiscard = false; state.drawn = undefined;
  state.players[0].hand = state.players[0].hand.filter(tile => tile !== 83); state.players[0].handCount--;
  state.players[3].discards.push(83); state.pending = { tile: 83, from: 3, kind: "discard", answered: false };
  state.actions = [{ id: "pung", label: "碰" }, { id: "kong", label: "杠" }, { id: "pass", label: "过" }];
  await send(state); expect((await inspect(frame)).hud).not.toContain("claim-prompt"); expect((await inspect(frame)).hud).not.toContain("button-碰");
  await send({ ...state, externalControls: false, selected: 0 });
  expect((await inspect(frame)).hud).toContain("claim-prompt"); expect((await inspect(frame)).hud).toContain("button-碰");
});

test("continuous replay retains its current action cue without animating seeks or replaying redraws", async ({ page }) => {
  const { frame, send } = await table(page), initial = { ...fixture("replay-effects"), presentation: "replay" as const, disabled: true, canDiscard: false };
  await send(initial); expect((await inspect(frame)).effects).toBe(0);
  const step = concealed(initial); await send(step);
  expect((await inspect(frame)).moving).toEqual([]); expect((await inspect(frame)).effects).toBe(1);
  await send({ ...step, selected: 0 }); expect((await inspect(frame)).effects).toBe(1);
  await page.waitForTimeout(1200); expect((await inspect(frame)).effects).toBe(0);
  await send({ ...step, selected: null }); expect((await inspect(frame)).effects).toBe(0);
  const seek = { ...step, revision: 30, effects: [{ key: "jumped-replay-pung", type: "pung", seat: 0 }] };
  await send(seek); expect((await inspect(frame)).effects).toBe(0); expect((await inspect(frame)).moving).toEqual([]);
});

test("clock updates retain the HUD, flower troughs, markers and contact shadows while a tile is flying", async ({ page }) => {
  const { frame, send } = await table(page), before = fixture("retained-scene");
  await send(before);
  const identity = () => frame.evaluate(async () => {
    const cc = await (window as any).System.import("cc"), scene = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    return { hud: scene.hud.uuid, racks: scene.racks.uuid, marks: scene.marks.uuid,
      shadows: [...scene.shadows.values()].map((node: any) => node.uuid), clock: scene.countdownLabel.string,
      tiles: [...scene.nodes.values()].map((node: any) => node.uuid) };
  });
  const first = await identity();
  for (const countdown of ["9", "8", "7"]) {
    await send({ ...before, countdown });
    const current = await identity();
    expect(current.clock).toBe(countdown);
    expect({ ...current, clock: "10" }).toEqual(first);
  }
  const after = concealed(before); await send(after);
  const flying = await identity(); expect((await inspect(frame)).moving.length).toBeGreaterThan(0);
  await send({ ...after, countdown: "6" });
  const during = await identity();
  expect({ ...during, clock: flying.clock }).toEqual(flying);
  await page.waitForTimeout(350); await settledMelds(frame);
});

test("same-frame snapshots paint once, retain confirmed cues and never stack a seat's action words", async ({ page }) => {
  const { frame, send } = await table(page), before = fixture("batched-scene"); await send(before);
  await frame.evaluate(async () => {
    const cc = await (window as any).System.import("cc"), scene = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    const draw = scene.draw; (window as any).__drawCalls = 0;
    scene.draw = function () { (window as any).__drawCalls++; return draw.call(this); };
  });
  const kong = concealed(before), replacement = structuredClone(kong);
  replacement.revision++; replacement.drawn = 68; replacement.players[0].hand.push(68); replacement.players[0].handCount++;
  replacement.effects = [{ key: "other-seat-flower", type: "flower", seat: 1 }];
  await page.evaluate(({ channel, states }) => {
    for (const state of states) document.querySelector("iframe")!.contentWindow!.postMessage({ scope: "jinling-table-v1", channel, type: "state", state }, location.origin);
  }, { channel, states: [kong, replacement] });
  await frame.waitForFunction(revision => {
    const scene = (window as any).__motionScene;
    return scene.motionSnapshot?.revision === revision && !scene.stateFrame;
  }, replacement.revision);
  const cues = () => frame.evaluate(async () => {
    const cc = await (window as any).System.import("cc"), scene = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    return { draws: (window as any).__drawCalls, cues: [...scene.motionEffects].filter((node: any) => node.name.startsWith("motion-action-")).map((node: any) => ({
      name: node.name, scale: node.scale.x, text: node.children[0]?.getComponent(cc.Label)?.string,
    })) };
  });
  const batch = await cues(); expect(batch.draws).toBe(1);
  expect(batch.cues.map(cue => cue.name).sort()).toEqual(["motion-action-0", "motion-action-1"]);
  expect(batch.cues.every(cue => cue.scale === 1)).toBe(true);
  await send({ ...replacement, effects: [{ key: "next-seat-flower", type: "flower", seat: 0 }] });
  const fresh = (await cues()).cues.filter(cue => cue.name === "motion-action-0");
  expect(fresh).toEqual([{ name: "motion-action-0", scale: 1, text: "补花" }]);
});

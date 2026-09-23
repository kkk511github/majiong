import { test, expect, type Page, type WebSocketRoute } from "./browser-fixtures";
import { act, createGame, newPlayer, seats, startRound, viewFor } from "../shared/engine";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import { newGameRules } from "../shared/nanjing-rules";
import { seededRandom } from "../shared/tiles";
import type { Game, View } from "../shared/types";

test.use({ video: "on" });

const opening = (page: Page) => page.getByRole("region", { name: "第1把开局", exact: true });
const frame = (page: Page) => page.frames().find(f => f.url().includes("/cocos-table/index.html"));

async function scene(page: Page) {
  return frame(page)!.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    const component = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    return { state: component.state, tiles: (window as any).__JINLING_TABLE_LAYOUT__ };
  });
}

async function expectPlayable(page: Page) {
  await expect(page.getByRole("navigation", { name: "牌桌工具" })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".table-opening")).toHaveCount(0, { timeout: 10000 });
  await expect.poll(async () => (await scene(page)).state?.key).not.toBe("demo");
  const before = await scene(page);
  const tile = before.tiles.find((t: any) => t.area === "hand" && t.tile === before.state.players[before.state.me].hand[0]);
  expect(tile).toBeDefined();
  const bounds = (await page.locator("#cocos-table-board iframe").boundingBox())!;
  const scale = Math.min(bounds.width / 1280, bounds.height / 590);
  await page.mouse.click(
    bounds.x + (bounds.width - 1280 * scale) / 2 + tile.x * scale,
    bounds.y + (bounds.height - 590 * scale) / 2 + tile.y * scale,
  );
  await expect.poll(async () => (await scene(page)).state.selected).toBe(tile.tile);
}

async function observeEntry(page: Page) {
  await page.addInitScript(() => {
    const audit = { openings: 0, returnOnlyScreens: 0 };
    (window as any).__openingEntryAudit = audit;
    let lastOpening: Element | null = null;
    new MutationObserver(() => {
      const opening = document.querySelector(".table-opening");
      if (opening && opening !== lastOpening) audit.openings++;
      lastOpening = opening;
      if ([...document.querySelectorAll(".cocos-loading")].some(node => node.textContent?.trim() === "返回大厅"))
        audit.returnOnlyScreens++;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
}

async function audit(page: Page) {
  return page.evaluate(() => (window as any).__openingEntryAudit as { openings: number; returnOnlyScreens: number });
}

async function captureOpeningMotion(page: Page, milliseconds: number, waitFor?: "entry" | "exit") {
  return page.evaluate(async ({ duration, waitFor }) => {
    const samples: { at: number; scale: number; x: number; y: number; opacity: number; sceneAnimation: string; overlayAnimation: string }[] = [];
    if (waitFor) {
      const limit = performance.now() + 20000;
      const selector = waitFor === "exit" ? ".table-opening.opening-exiting" : ".table-opening";
      while (!document.querySelector(selector) && performance.now() < limit)
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    const started = performance.now();
    while (performance.now() - started < duration) {
      const overlay = document.querySelector<HTMLElement>(".table-opening");
      const scene = document.querySelector<HTMLElement>(".opening-scene");
      if (!overlay || !scene) break;
      const sceneStyle = getComputedStyle(scene), overlayStyle = getComputedStyle(overlay);
      let matrix = new DOMMatrixReadOnly(sceneStyle.transform);
      for (let parent = scene.parentElement; parent && parent !== overlay; parent = parent.parentElement)
        matrix = new DOMMatrixReadOnly(getComputedStyle(parent).transform).multiply(matrix);
      samples.push({ at: performance.now() - started, scale: matrix.a, x: matrix.e, y: matrix.f,
        opacity: Number(overlayStyle.opacity), sceneAnimation: sceneStyle.animationName, overlayAnimation: overlayStyle.animationName });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return samples;
  }, { duration: milliseconds, waitFor });
}

function range(samples: Awaited<ReturnType<typeof captureOpeningMotion>>, field: "scale" | "x" | "y" | "opacity") {
  return Math.max(...samples.map(sample => sample[field])) - Math.min(...samples.map(sample => sample[field]));
}

function onlineGame(): Game {
  const game = createGame("824601", "opening-entry", newGameRules({ turnSeconds: 0, rounds: 8 }));
  game.players = seats.map(seat => ({ ...newPlayer(`opening-${seat}`, `牌友${seat + 1}`), ready: seat !== 3 }));
  game.ownerId = game.players[0]!.id;
  game.table = {
    creatorId: game.ownerId,
    groupId: "opening-entry",
    number: 1,
    createdAt: Date.now(),
    readyDeadline: Date.now() + 10000,
    settings: { ...DEFAULT_TABLE_SETTINGS, autoRenew: false },
  };
  return game;
}

async function controlledOnline(page: Page, initial: View, received: any[] = [], handle?: (message: any) => boolean) {
  let current = initial;
  let socket: WebSocketRoute;
  const push = () => socket.send(JSON.stringify({ type: "state", state: current, serverNow: Date.now() }));
  await page.routeWebSocket("**/ws", ws => {
    socket = ws;
    const server = ws.connectToServer();
    ws.onMessage(message => {
      const parsed = JSON.parse(String(message));
      received.push(parsed);
      if (handle?.(parsed)) return;
      server.send(message);
    });
    server.onMessage(message => {
      const data = JSON.parse(String(message));
      if (data.type === "session") {
        ws.send(JSON.stringify({ ...data, roomCode: current.code }));
        push();
      } else ws.send(message);
    });
  });
  return (next: View) => { current = next; push(); };
}

async function managedOpeningFromWaitingRoom(page: Page) {
  const waiting = onlineGame();
  waiting.rules.turnSeconds = 10;
  const initial = viewFor(waiting, 0);
  waiting.players.forEach(player => { player!.ready = true; });
  const first = startRound(waiting, Date.now(), seededRandom(42));
  first.openingGate = { round: 1, waiting: [0], expiresAt: Date.now() + 30000 };
  first.deadline = 0;
  const received: any[] = [];
  const push = await controlledOnline(page, initial, received, message => {
    if (message.type !== "openingComplete" || message.game !== first.id || message.round !== first.round) return false;
    if (first.openingGate) {
      delete first.openingGate;
      first.deadline = Date.now() + 10000;
      first.revision++;
      push(viewFor(first, 0));
    }
    return true;
  });
  await page.goto("/");
  await expect(page.locator(".waiting-room")).toBeVisible();
  return { start: () => push(viewFor(first, 0)), first, received };
}

test("真人首把入口：牌桌慢加载期间直接呈现开局，载入后手牌可点", async ({ page }, testInfo) => {
  await observeEntry(page);
  const entryState = () => page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    const view = client.state.view as View;
    return { revision: view.revision, discards: view.players.map(p => p?.discards),
      trustees: view.players.map(p => p?.trustee), deadline: view.deadline, canDiscard: view.canDiscard,
      remaining: view.deadline - client.now() };
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/cocos-table/index.html?*", async route => {
    await held;
    await route.continue();
  });
  try {
    const entry = await managedOpeningFromWaitingRoom(page);
    entry.start();
    await expect(opening(page)).toBeVisible({ timeout: 1500 });
    await expect(page.locator(".cocos-loading").getByRole("button", { name: "返回大厅", exact: true })).toHaveCount(0);
    const { remaining: _remaining, ...before } = await entryState();
    expect(before.deadline).toBe(0);
    expect(before.canDiscard).toBe(false);
    // A slow renderer must remain covered by the table artwork after the usual
    // duration AND the old six-second cue limit, without flashing a blank screen.
    await page.waitForTimeout(6500);
    await expect(opening(page)).toBeVisible();
    const { remaining: _duringRemaining, ...during } = await entryState();
    expect(during).toEqual(before);
    expect(entry.received.filter(message => message.type === "openingComplete")).toHaveLength(0);
    await page.screenshot({ path: testInfo.outputPath("online-opening-slow-renderer.png") });
    expect((await audit(page)).returnOnlyScreens).toBe(0);
  } finally {
    release();
  }
  await expectPlayable(page);
  // Managed play starts its full turn only after entrance confirmation; slow
  // rendering must not consume the player's first turn behind the artwork.
  const after = await entryState();
  expect(after.canDiscard).toBe(true);
  expect(after.remaining).toBeGreaterThan(8000);
  expect((await audit(page)).returnOnlyScreens).toBe(0);
});

test("真人准备倒计时后首把展示开局，下一把直接进入牌桌", async ({ page }) => {
  await observeEntry(page);
  const waiting = onlineGame();
  const received: any[] = [];
  const push = await controlledOnline(page, viewFor(waiting, 0), received);
  await page.goto("/");
  await expect(page.locator(".waiting-room")).toBeVisible();
  await expect(page.getByRole("timer", { name: /牌友4准备剩余/ })).toBeVisible();
  expect((await audit(page)).openings).toBe(0);
  waiting.players.forEach(player => { player!.ready = true; });
  const first = startRound(waiting, Date.now(), seededRandom(42));
  first.openingGate = { round: 1, waiting: [0], expiresAt: Date.now() + 30000 };
  first.deadline = 0;
  push(viewFor(first, 0));
  await expect(opening(page)).toBeVisible({ timeout: 1500 });
  await expect.poll(() => received.filter(message => message.type === "openingComplete").length).toBe(1);
  await expect(page.getByRole("region", { name: "等待其他牌友进入", exact: true })).toBeVisible();
  expect((await scene(page)).state.disabled).toBe(true);
  delete first.openingGate;
  first.deadline = Date.now() + 10000;
  first.revision++;
  push(viewFor(first, 0));
  await expectPlayable(page);
  const count = (await audit(page)).openings;
  expect(count).toBe(1);
  const second = viewFor(first, 0);
  second.round = 2;
  second.revision += 1;
  push(second);
  await expect.poll(async () => (await scene(page)).state.round).toBe(2);
  await page.waitForTimeout(300);
  await expect(page.locator(".table-opening")).toHaveCount(0);
  expect(await audit(page)).toEqual({ openings: count, returnOnlyScreens: 0 });
});

test("恢复同步先收到开局快照、后恢复connected时仍接纳同一个开局提示", async ({ page }) => {
  const waiting = onlineGame(), received: any[] = [];
  const push = await controlledOnline(page, viewFor(waiting, 0), received);
  await page.goto("/");
  await expect(page.locator(".waiting-room")).toBeVisible();
  // The fast-resume handshake sends the state packet before its synced pong.
  // Reproduce those two observable client phases separately so React commits
  // the fresh cue while connected is false, rather than batching both away.
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    (client as any).emit({ connected: false, connecting: true });
  });
  waiting.players.forEach(player => { player!.ready = true; });
  const first = startRound(waiting, Date.now(), seededRandom(42));
  first.openingGate = { round: 1, waiting: [0], expiresAt: Date.now() + 30000 };
  first.deadline = 0;
  push(viewFor(first, 0));
  await expect.poll(() => page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return { connected: client.state.connected, opening: client.state.openingCue?.game };
  })).toEqual({ connected: false, opening: first.id });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".table-opening")).toHaveCount(0);
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    (client as any).emit({ connected: true, connecting: false, notice: "" });
  });
  await expect(opening(page)).toBeVisible({ timeout: 1500 });
  await page.getByRole("button", { name: "进入牌局", exact: true }).click();
  await expect.poll(() => received.filter(message => message.type === "openingComplete").length).toBe(1);
  await expect(page.getByRole("region", { name: "等待其他牌友进入", exact: true })).toBeVisible();
  expect((await scene(page)).state.disabled).toBe(true);
  delete first.openingGate;
  first.deadline = Date.now() + 10000;
  first.revision++;
  push(viewFor(first, 0));
  await expectPlayable(page);
});

test("开局途中WebGL重载先等资源恢复，再完成动画并仅确认一次", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const waiting = onlineGame(), received: any[] = [];
  const push = await controlledOnline(page, viewFor(waiting, 0), received);
  let loads = 0, release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/cocos-table/index.html?*", async route => {
    loads++;
    if (loads > 1) await held;
    await route.continue();
  });
  try {
    await page.goto("/");
    await expect(page.locator(".waiting-room")).toBeVisible();
    waiting.players.forEach(player => { player!.ready = true; });
    const first = startRound(waiting, Date.now(), seededRandom(42));
    first.openingGate = { round: 1, waiting: [0], expiresAt: Date.now() + 30000 };
    first.deadline = 0;
    push(viewFor(first, 0));
    await expect(opening(page)).toBeVisible();
    await expect.poll(async () => frame(page)?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    expect(received.filter(message => message.type === "openingComplete")).toHaveLength(0);
    await frame(page)!.evaluate(() => document.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
    await expect.poll(() => loads).toBe(2);
    // More than the normal exit duration passes with the new renderer held.
    // Recovery must neither confirm an unready renderer nor falsely claim
    // that this client already finished and is only waiting for others.
    await page.waitForTimeout(1600);
    expect(received.filter(message => message.type === "openingComplete")).toHaveLength(0);
    await expect(page.locator(".table-opening.opening-waiting")).toHaveCount(0);
    await expect(opening(page)).toBeVisible();
    release();
    await expect.poll(async () => frame(page)?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    await expect.poll(() => received.filter(message => message.type === "openingComplete").length).toBe(1);
    await expect(page.getByRole("region", { name: "等待其他牌友进入", exact: true })).toBeVisible();
    expect((await scene(page)).state.disabled).toBe(true);
    delete first.openingGate;
    first.deadline = Date.now() + 10000;
    first.revision++;
    push(viewFor(first, 0));
    await expectPlayable(page);
    expect(received.filter(message => message.type === "openingComplete")).toHaveLength(1);
  } finally {
    release();
  }
});

test("恢复正在进行的真人首把不重播开局，也不显示返回大厅加载屏", async ({ page }) => {
  await observeEntry(page);
  const game = onlineGame();
  game.players.forEach(player => { player!.ready = true; });
  const first = startRound(game, Date.now(), seededRandom(42));
  await controlledOnline(page, viewFor(first, 0));
  await page.goto("/");
  await expectPlayable(page);
  expect(await audit(page)).toEqual({ openings: 0, returnOnlyScreens: 0 });
});

test("恢复已有四张弃牌的真人局不重播开局，四家弃牌均保留", async ({ page }) => {
  await observeEntry(page);
  const game = onlineGame();
  game.players.forEach(player => { player!.ready = true; });
  let resumed = startRound(game, Date.now(), seededRandom(42));
  for (let turn = 0; turn < 4; turn++) {
    resumed = act(resumed, resumed.turn, { type: "discard", tile: resumed.players[resumed.turn]!.hand[0] });
    for (const seat of seats) {
      if (resumed.phase === "claiming" && resumed.pending?.offers[seat] && resumed.pending.replies[seat] === undefined)
        resumed = act(resumed, seat, { type: "pass" });
    }
  }
  const discards = resumed.players.map(player => player!.discards);
  expect(discards.flat()).toHaveLength(4);
  await controlledOnline(page, viewFor(resumed, 0));
  await page.goto("/");
  await expectPlayable(page);
  expect((await scene(page)).state.players.map((player: any) => player.discards)).toEqual(discards);
  expect(await audit(page)).toEqual({ openings: 0, returnOnlyScreens: 0 });
});

test("资源失败展示可操作的重试和返回，重新加载仍是同一局", async ({ page }) => {
  let failed = false;
  await page.route("**/cocos-table/index.html?*", async route => {
    if (failed) return route.continue();
    failed = true;
    const channel = new URL(route.request().url()).searchParams.get("channel");
    await route.fulfill({
      contentType: "text/html",
      body: `<html><script>parent.postMessage({scope:'jinling-table-v1',channel:${JSON.stringify(channel)},type:'error'},location.origin)</script></html>`,
    });
  });
  const entry = await managedOpeningFromWaitingRoom(page);
  entry.start();
  await expect(page.getByText("牌桌资源加载失败", { exact: true })).toBeVisible();
  await expect(page.locator(".table-opening")).toHaveCount(0);
  await expect(page.locator(".cocos-loading").getByRole("button", { name: "返回大厅", exact: true })).toBeVisible();
  const key = await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.state.view!.id;
  });
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await expectPlayable(page);
  expect((await scene(page)).state.key).toBe(key);
});

test("正常动效：慢加载时镜头持续运动，牌桌就绪后明显推进并淡出", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/cocos-table/index.html?*", async route => { await held; await route.continue(); });
  let exitMotion: ReturnType<typeof captureOpeningMotion> | undefined;
  try {
    const entry = await managedOpeningFromWaitingRoom(page);
    entry.start();
    await expect(opening(page)).toBeVisible();
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);
    await page.waitForTimeout(1200);
    const duringLoad = await captureOpeningMotion(page, 900);
    await testInfo.attach("loading-motion.json", { body: JSON.stringify(duringLoad, null, 2), contentType: "application/json" });
    expect(duringLoad.length).toBeGreaterThan(5);
    expect(range(duringLoad, "scale") + range(duringLoad, "x") / 844 + range(duringLoad, "y") / 390).toBeGreaterThan(.002);
    exitMotion = captureOpeningMotion(page, 1500, "exit");
  } finally {
    release();
  }
  const transition = await exitMotion!;
  await testInfo.attach("entry-transition.json", { body: JSON.stringify(transition, null, 2), contentType: "application/json" });
  expect(transition.length).toBeGreaterThan(5);
  expect(range(transition, "scale")).toBeGreaterThan(.12);
  expect(range(transition, "opacity")).toBeGreaterThan(.35);
  await expectPlayable(page);
});

test("减少动态效果：慢加载不缩放，牌桌就绪后只做短淡出", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/cocos-table/index.html?*", async route => { await held; await route.continue(); });
  let exitMotion: ReturnType<typeof captureOpeningMotion> | undefined;
  try {
    const managed = await managedOpeningFromWaitingRoom(page);
    const enterMotion = captureOpeningMotion(page, 450, "entry");
    managed.start();
    await expect(opening(page)).toBeVisible();
    const entry = await enterMotion;
    await testInfo.attach("reduced-entry-fade-in.json", { body: JSON.stringify(entry, null, 2), contentType: "application/json" });
    expect(range(entry, "opacity")).toBeGreaterThan(.3);
    expect(range(entry, "scale")).toBeLessThan(.001);
    await page.waitForTimeout(500);
    const duringLoad = await captureOpeningMotion(page, 500);
    expect(duringLoad.length).toBeGreaterThan(5);
    expect(range(duringLoad, "scale")).toBeLessThan(.001);
    expect(range(duringLoad, "x") + range(duringLoad, "y")).toBeLessThan(.1);
    exitMotion = captureOpeningMotion(page, 650, "exit");
  } finally {
    release();
  }
  const transition = await exitMotion!;
  await testInfo.attach("reduced-entry-transition.json", { body: JSON.stringify(transition, null, 2), contentType: "application/json" });
  expect(transition.length).toBeGreaterThan(2);
  expect(range(transition, "scale")).toBeLessThan(.001);
  expect(range(transition, "opacity")).toBeGreaterThan(.3);
  expect(transition.at(-1)!.at).toBeLessThan(550);
  await expectPlayable(page);
});

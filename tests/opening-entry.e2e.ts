import { test, expect, type Page, type WebSocketRoute } from "./browser-fixtures";
import { act, createGame, newPlayer, seats, startRound, viewFor } from "../shared/engine";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import { newGameRules } from "../shared/nanjing-rules";
import { seededRandom } from "../shared/tiles";
import type { Game, View } from "../shared/types";

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

async function practiceFromHome(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "单人练习，快速开始", exact: true }).click();
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

async function controlledOnline(page: Page, initial: View) {
  let current = initial;
  let socket: WebSocketRoute;
  const push = () => socket.send(JSON.stringify({ type: "state", state: current, serverNow: Date.now() }));
  await page.routeWebSocket("**/ws", ws => {
    socket = ws;
    const server = ws.connectToServer();
    ws.onMessage(message => server.send(message));
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

test("真实单人练习入口：牌桌慢加载期间直接呈现开局，载入后手牌可点", async ({ page }, testInfo) => {
  await observeEntry(page);
  const localState = () => page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    const view = client.state.view as View;
    return { revision: view.revision, discards: view.players.map(p => p?.discards),
      trustees: view.players.map(p => p?.trustee), remaining: view.deadline - client.now() };
  });
  let initialRemaining = 0;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/cocos-table/index.html?*", async route => {
    await held;
    await route.continue();
  });
  try {
    await practiceFromHome(page);
    await expect(opening(page)).toBeVisible({ timeout: 1500 });
    await expect(page.locator(".cocos-loading").getByRole("button", { name: "返回大厅", exact: true })).toHaveCount(0);
    const { remaining, ...before } = await localState();
    initialRemaining = remaining;
    // A slow renderer must remain covered by the table artwork after the usual
    // duration AND the old six-second cue limit, without flashing a blank screen.
    await page.waitForTimeout(6500);
    await expect(opening(page)).toBeVisible();
    const { remaining: _remaining, ...during } = await localState();
    expect(during).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath("practice-opening-slow-renderer.png") });
    expect((await audit(page)).returnOnlyScreens).toBe(0);
  } finally {
    release();
  }
  await expectPlayable(page);
  // Loading/animation time is added back before local play resumes, so it must
  // not use up the human's ordinary turn allowance while input was unavailable.
  expect((await localState()).remaining).toBeGreaterThan(initialRemaining - 1500);
  expect((await audit(page)).returnOnlyScreens).toBe(0);
});

test("真人准备倒计时后首把展示开局，下一把直接进入牌桌", async ({ page }) => {
  await observeEntry(page);
  const waiting = onlineGame();
  const push = await controlledOnline(page, viewFor(waiting, 0));
  await page.goto("/");
  await expect(page.locator(".waiting-room")).toBeVisible();
  await expect(page.getByRole("timer", { name: /牌友4准备剩余/ })).toBeVisible();
  expect((await audit(page)).openings).toBe(0);
  waiting.players.forEach(player => { player!.ready = true; });
  const first = startRound(waiting, Date.now(), seededRandom(42));
  push(viewFor(first, 0));
  await expect(opening(page)).toBeVisible({ timeout: 1500 });
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

test("继续已有单人练习不重播开局", async ({ page }) => {
  await observeEntry(page);
  const game = onlineGame();
  delete game.table;
  game.players.forEach((player, seat) => { player!.ready = true; player!.bot = seat !== 0; });
  const first = startRound(game, Date.now(), seededRandom(42));
  const resumed = act(first, first.turn, { type: "discard", tile: first.players[first.turn]!.hand[0] });
  await page.addInitScript(game => localStorage.setItem("jinling:practice", JSON.stringify(game)), resumed);
  await page.goto("/");
  await page.getByRole("button", { name: "继续打，恢复上次练习", exact: true }).click();
  await expectPlayable(page);
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
  await practiceFromHome(page);
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

import { test, expect, type Page, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };
import { mkdirSync } from "node:fs";

const frame = (page: Page) => page.frames().find(f => f.url().includes("/cocos-table/index.html"))!;

for (const [width, height] of [[568,320], [844,390], [1280,590]]) {
  test(`正式碰杠控件展示真实操作、来源与提交反馈 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const view = viewFor(structuredClone(late) as unknown as Game, 0);
    Object.assign(view, { phase: "claiming", turn: 1, canDiscard: false, actions: ["pass", "pung", "kong", "hu"], selfKongs: [],
      pending: { tile: 56, from: 1, kind: "discard", answered: false }, result: undefined, deadline: Date.now() + 600000 });
    view.players[0]!.trustee = false;
    view.players[1]!.name = "很长的牌友昵称也不能挡住余花余牌";
    let socket: WebSocketRoute;
    const commands: any[] = [];
    const push = () => {
      socket.send(JSON.stringify({ type: "state", state: view, serverNow: Date.now() }));
      if (commands.length) socket.send(JSON.stringify({ type: "ack", requestId: commands.at(-1).requestId }));
    };
    await page.routeWebSocket("**/ws", ws => {
      socket = ws;
      const server = ws.connectToServer();
      ws.onMessage(raw => { const message = JSON.parse(String(raw)); if (message.type === "action") commands.push(message); else server.send(raw); });
      server.onMessage(raw => { const message = JSON.parse(String(raw)); if (message.type === "session") { ws.send(JSON.stringify({ ...message, roomCode: view.code })); push(); } else ws.send(raw); });
    });
    await page.goto("/");
    const controls = page.getByRole("group", { name: "碰杠胡操作" });
    const source = page.getByLabel("待响应牌", { exact: true });
    await expect(controls).toBeVisible();
    await expect(source).toContainText(`${view.players[1]!.name}打出`);
    await expect(source).toHaveAttribute("title", `${view.players[1]!.name}打出六筒`);
    await expect(source.getByRole("img", { name: "六筒" })).toBeVisible();
    await expect(controls.getByRole("button")).toHaveCount(4);
    await expect(controls.getByRole("button").last()).toHaveAccessibleName("过");
    await expect.poll(async () => frame(page)?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
    const sourceBox = (await source.boundingBox())!;
    const controlsBox = (await controls.boundingBox())!;
    const frameBox = (await page.locator("#cocos-table-board iframe").boundingBox())!;
    const scale = Math.min(frameBox.width / 1280, frameBox.height / 590);
    const left = frameBox.x + (frameBox.width - 1280 * scale) / 2;
    const top = frameBox.y + (frameBox.height - 590 * scale) / 2;
    expect(sourceBox.x + sourceBox.width).toBeLessThanOrEqual(left + 224 * scale + 1);
    expect(sourceBox.y + sourceBox.height).toBeLessThanOrEqual(top + 491 * scale - 7);
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(top + 491 * scale - 7);
    expect(controlsBox.y).toBeGreaterThan(top + 326 * scale);
    expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(left + 1148 * scale - 7);
    const buttons = await controls.getByRole("button").evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      return { w: rect.width, h: rect.height, radius: css.borderRadius, color: css.color };
    }));
    for (const button of buttons) { expect(button.w).toBeGreaterThanOrEqual(44); expect(button.h).toBeGreaterThanOrEqual(44); expect(button.radius).toBe("9px"); }
    // Source atlas is a real base-relative app asset, shared by web/native builds.
    const tile = source.getByRole("img");
    const atlas = await tile.evaluate(node => getComputedStyle(node).backgroundImage.slice(5, -2));
    expect((await page.request.get(atlas)).ok()).toBe(true);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({ path: `test-results/screenshots/claim-controls-v3-${width}.png` });
    await controls.getByRole("button", { name: "碰", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect.poll(() => commands.length).toBe(1);
    expect(commands[0].action).toEqual({ type: "pung" });
    await expect(controls.getByRole("button", { name: "碰", exact: true })).toBeDisabled();
    await expect(controls.locator(".is-chosen")).toHaveCount(1);
    await expect(controls.locator(".is-chosen")).toContainText("提交中");
    await expect(source).toContainText("正在提交操作");

    view.pending!.kind = "robKong"; view.actions = ["pass", "hu"]; view.revision++; push();
    await expect(controls.getByRole("button")).toHaveCount(2);
    await expect(source).toContainText(`${view.players[1]!.name}补杠`);
    await expect(controls.getByRole("button", { name: "胡", exact: true })).toContainText("抢杠胡");
    await expect(controls.locator(".is-chosen")).toHaveCount(0);
    view.pending!.answered = true; view.actions = []; view.revision++; push();
    await expect(source).toHaveCount(0);
    await expect(controls).toHaveCount(0);

    Object.assign(view, { phase: "playing", turn: 0, canDiscard: true, pending: undefined, actions: [], selfKongs: [0, 56] });
    view.revision++; push();
    await expect(controls.getByRole("button")).toHaveCount(2);
    await expect(source).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "杠 一万", exact: true })).toBeEnabled();
    await controls.getByRole("button", { name: "杠 六筒", exact: true }).click();
    await expect.poll(() => commands.length).toBe(2);
    expect(commands[1].action).toEqual({ type: "selfKong", tile: 56 });
    await expect(controls.getByRole("button", { name: "杠 一万", exact: true })).toBeDisabled();
  });
}

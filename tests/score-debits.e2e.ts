import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import { applyDebit, debitGame } from "./fixtures/debit-game";
import { mkdirSync } from "node:fs";

test("扣至两家归零时，先显示实际扣分，换座视角后再打开结算", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const before = debitGame("concealed", 2);
  before.players[1]!.score = 3;
  before.players[2]!.score = 7;
  const current = viewFor(before, 1);
  let socket: WebSocketRoute;
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    const server = ws.connectToServer();
    server.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "session") {
        ws.send(JSON.stringify({ ...m, roomCode: current.code }));
        ws.send(JSON.stringify({ type: "state", state: current }));
      } else ws.send(raw);
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("navigation", { name: "牌桌工具", exact: true }),
  ).toBeVisible();
  const after = viewFor(applyDebit(before, "concealed"), 1);
  socket!.send(JSON.stringify({ type: "state", state: after }));
  await expect(page.locator(".score-debit")).toHaveCount(3);
  await expect(
    page.locator('.score-debit-anchor[data-relative-seat="0"]'),
  ).toContainText("−3");
  await expect(
    page.locator('.score-debit-anchor[data-relative-seat="1"]'),
  ).toContainText("−7");
  await expect(
    page.locator('.score-debit-anchor[data-relative-seat="2"]'),
  ).toContainText("−10");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "本桌最终战绩" })).toBeVisible({
    timeout: 3500,
  });
  await expect(page.locator(".score-debit")).toHaveCount(0);
});

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [1280, 590],
]) {
  test(`真实App四家扣分位置与米金色动画 ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    let socket: WebSocketRoute;
    let current = viewFor(debitGame(), 0);
    await page.routeWebSocket("**/ws", (ws) => {
      socket = ws;
      const server = ws.connectToServer();
      server.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === "session") {
          ws.send(JSON.stringify({ ...m, roomCode: current.code }));
          ws.send(JSON.stringify({ type: "state", state: current }));
        } else ws.send(raw);
      });
    });
    const send = () =>
      socket.send(JSON.stringify({ type: "state", state: current }));
    await page.goto("/");
    const scene = () =>
      page.frames().find((f) => f.url().includes("/cocos-table/index.html"))!;
    await expect
      .poll(async () =>
        scene()?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__),
      )
      .toBe(true);
    await expect(page.locator(".cocos-loading")).toHaveCount(0);
    for (const example of ["concealed", "open", "winds", "fourSame"] as const) {
      const before = debitGame(example);
      before.id = `test-debit-${example}`;
      current = viewFor(before, 0);
      send();
      await expect(page.locator(".score-debit")).toHaveCount(0);
      await expect
        .poll(() =>
          scene().evaluate(async () => {
            const cc = await (window as any).System.import("cc");
            return cc.director
              .getScene()
              .getChildByName("Canvas")
              .getComponent("TableScene").state.key;
          }),
        )
        .toBe(before.id);
      const after = applyDebit(before, example);
      current = viewFor(after, 0);
      send();
      const expected = example === "concealed" || example === "winds" ? 3 : 1;
      await expect(page.locator(".score-debit")).toHaveCount(expected);
      const amounts = await page
        .locator(".score-debit strong")
        .allTextContents();
      expect(amounts).toEqual(
        example === "concealed" || example === "winds"
          ? ["−5", "−5", "−5"]
          : example === "open"
            ? ["−10"]
            : ["−15"],
      );
      // Freeze only the CSS keyframe for reproducible screenshots, not the live event timer.
      await page.locator(".score-debit").evaluateAll((elements) =>
        elements.forEach((e) =>
          e.getAnimations().forEach((a) => {
            a.pause();
            a.currentTime = 450;
          }),
        ),
      );
      const color = await page
        .locator(".score-debit strong")
        .first()
        .evaluate((el) => getComputedStyle(el).color);
      expect(color).toBe("rgb(232, 214, 170)");
      const box = (await page
        .locator("#cocos-table-board iframe")
        .boundingBox())!;
      const scale = Math.min(box.width / 1280, box.height / 590),
        left = box.x + (box.width - 1280 * scale) / 2,
        top = box.y + (box.height - 590 * scale) / 2;
      const tiles = await scene().evaluate(
        () => (window as any).__JINLING_TABLE_LAYOUT__,
      );
      for (const element of await page.locator(".score-debit").all()) {
        const b = (await element.boundingBox())!;
        const separated = (r: { x: number; y: number; w: number; h: number }) =>
          b.x + b.width <= r.x - r.w / 2 ||
          b.x >= r.x + r.w / 2 ||
          b.y + b.height <= r.y - r.h / 2 ||
          b.y >= r.y + r.h / 2;
        expect(
          tiles.every((t: any) =>
            separated({
              x: left + t.x * scale,
              y: top + t.y * scale,
              w: t.w * scale,
              h: t.h * scale,
            }),
          ),
          example + " blocks a tile",
        ).toBe(true);
        expect(
          separated({
            x: left + 640 * scale,
            y: top + 278 * scale,
            w: 124 * scale,
            h: 96 * scale,
          }),
        ).toBe(true);
        expect(
          await element.evaluate((el) => getComputedStyle(el).pointerEvents),
        ).toBe("none");
      }
      const folder = "output/score-debits-20260919";
      mkdirSync(folder, { recursive: true });
      await page.screenshot({
        path: `${folder}/${example}-${width}-${info.project.name}.png`,
      });
      current = { ...current, revision: current.revision + 1 };
      send();
      await expect(page.locator(".score-debit")).toHaveCount(0, {
        timeout: 3500,
      });
      current = { ...current, revision: current.revision + 1 };
      send();
      await expect(page.locator(".score-debit")).toHaveCount(0);
    }
  });
}

test("同一玩家连续扣分依次显示，重连时不补播旧流水", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  let current = viewFor(debitGame("open"), 0),
    socket: WebSocketRoute;
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    const server = ws.connectToServer();
    server.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "session") {
        ws.send(JSON.stringify({ ...m, roomCode: current.code }));
        ws.send(JSON.stringify({ type: "state", state: current }));
      } else ws.send(raw);
    });
  });
  const send = () =>
    socket.send(JSON.stringify({ type: "state", state: current }));
  await page.goto("/");
  await expect(page.locator(".cocos-loading")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "牌桌工具", exact: true }),
  ).toBeVisible();
  current = viewFor(applyDebit(debitGame("open"), "open"), 0);
  send();
  await expect(page.locator(".score-debit")).toHaveText("−10明杠");
  current = {
    ...current,
    revision: current.revision + 1,
    roundTransfers: [
      ...current.roundTransfers!,
      { from: 1, to: 0, amount: 10, reason: "花杠" },
    ],
  };
  send();
  await expect(page.locator(".score-debit")).toHaveText("−10明杠");
  await expect(page.locator(".score-debit")).toHaveText("−10花杠", {
    timeout: 3000,
  });
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "牌桌工具", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".score-debit")).toHaveCount(0);
});

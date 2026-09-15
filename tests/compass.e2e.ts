import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };

for (const [width, height] of [
  [568, 320],
  [874, 402],
  [1280, 853],
]) {
  test(`方位和两位三位倒计时各自占位 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const view = viewFor(structuredClone(late) as unknown as Game, 0);
    view.phase = "playing";
    view.turn = 0;
    view.actions = [];
    view.rules.turnSeconds = 10;
    view.table = undefined;
    view.players.forEach((p) => {
      if (p) p.resumedDeadline = undefined;
    });
    let socket: WebSocketRoute;
    const push = () => {
      view.revision++;
      socket.send(
        JSON.stringify({ type: "state", state: view, serverNow: Date.now() }),
      );
    };
    await page.routeWebSocket("**/ws", (ws) => {
      socket = ws;
      ws.connectToServer().onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === "session") {
          ws.send(JSON.stringify({ ...m, roomCode: view.code }));
          push();
        } else ws.send(raw);
      });
    });
    await page.goto("/");
    await expect(page.locator("#table-board")).toBeVisible();
    for (const seconds of [0, 9, 10, 90, 100, 300]) {
      view.deadline = Date.now() + seconds * 1000;
      push();
      await expect(page.locator(".table-center > strong")).toHaveText(
        String(seconds).padStart(2, "0"),
      );
      const issues = await page.locator(".table-center").evaluate((el) => {
        const dial = el.getBoundingClientRect();
        const number = el.querySelector("strong")!.getBoundingClientRect();
        if (
          Math.abs(
            number.left + number.width / 2 - dial.left - dial.width / 2,
          ) > 0.5 ||
          Math.abs(
            number.top + number.height / 2 - dial.top - dial.height / 2,
          ) > 0.5
        )
          return ["countdown not centered"];
        const rects = [...el.querySelectorAll(".compass-wind, strong")].map(
          (node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return {
              text: node.textContent,
              r: node.getBoundingClientRect(),
              textWidth: range.getBoundingClientRect().width,
            };
          },
        );
        return rects.flatMap((a, i) => {
          const errors = [];
          if (a.textWidth > a.r.width + 0.5) errors.push(`${a.text} too wide`);
          if (
            a.r.left < dial.left ||
            a.r.right > dial.right ||
            a.r.top < dial.top ||
            a.r.bottom > dial.bottom
          )
            errors.push(`${a.text} outside`);
          for (const b of rects.slice(i + 1))
            if (
              Math.min(a.r.right, b.r.right) > Math.max(a.r.left, b.r.left) &&
              Math.min(a.r.bottom, b.r.bottom) > Math.max(a.r.top, b.r.top)
            )
              errors.push(`${a.text} overlaps ${b.text}`);
          return errors;
        });
      });
      expect(issues).toEqual([]);
    }
    await page.screenshot({
      path: `test-results/screenshots/compass-${width}.png`,
    });
  });
}

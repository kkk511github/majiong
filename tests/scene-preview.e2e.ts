import { test, expect, type WebSocketRoute } from "./browser-fixtures";
import { viewFor } from "../shared/engine";
import type { Game } from "../shared/types";
import late from "./fixtures/late-table.json" with { type: "json" };

test("重构场景预览", async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  const v = viewFor(structuredClone(late) as unknown as Game, 0);
  v.phase = "playing";
  v.result = undefined;
  v.actions = [];
  v.selfKongs = [];
  v.canDiscard = true;
  v.players.forEach(p => { if (p) { p.handCount = 13; p.hand = []; }});
  v.players[0]!.hand = [0,4,8,16,24,32,36,48,56,72,76,80,108,112];
  v.players.forEach((p) => {
    if (p) {
      p.melds = [];
      p.discards = p.discards.slice(0, 5);
      p.flowers = p.flowers.slice(0, 2);
    }
  });
  let socket: WebSocketRoute;
  const push = () =>
    socket.send(
      JSON.stringify({ type: "state", state: v, serverNow: Date.now() }),
    );
  await page.routeWebSocket("**/ws", (ws) => {
    socket = ws;
    ws.connectToServer().onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "session") {
        ws.send(JSON.stringify({ ...m, roomCode: v.code }));
        push();
      } else ws.send(raw);
    });
  });
  await page.goto("/");
  await expect(page.locator("#table-board")).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({path:'test-results/scene-initial.png'});
  for (const p of v.players) if (p) { p.melds = [{type:'pung',tiles:[12,13,14],from:0,concealed:false}]; p.handCount=10; }
  v.actions=['pung','kong','hu','pass'];
  v.players[2]!.flowers=[124,125,126,127,128,129,130];
  v.revision++; push(); await page.waitForTimeout(1500);
  await page.screenshot({path:'test-results/scene-melds.png'});
  for (const p of v.players) if (p) { p.melds = Array.from({length:4},(_,n)=>({type:'kong',tiles:[n*4,n*4+1,n*4+2,n*4+3],from:0,concealed:false})); p.handCount=2; }
  v.revision++; push(); await page.waitForTimeout(1500);
  await page.screenshot({path:'test-results/scene-full.png'});
});

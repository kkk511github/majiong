import { test, expect } from "./browser-fixtures";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { viewFor } from "../shared/engine";
import { createRecords } from "../server/records";
import { snapshotDisplayFixture } from "./fixtures/snapshot-display";

const output = "output/rule-audit-20260920/snapshot-display";

test("快照完成时显示普通胡特效及结算标题，保留204分和三口100", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const { game, record } = snapshotDisplayFixture("749911", `snapshot-live-${test.info().project.name}`);
  const result = structuredClone(record.result);
  game.result = undefined; game.phase = "playing"; game.deadline = Date.now() + 600000;
  let socket: any;
  const push = () => socket.send(JSON.stringify({ type: "state", state: viewFor(game, 0), serverNow: Date.now() }));
  await page.routeWebSocket("**/ws", ws => {
    socket = ws; const server = ws.connectToServer();
    ws.onMessage(message => server.send(message));
    server.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type === "session") { ws.send(JSON.stringify({ ...message, roomCode: game.code })); push(); }
      else ws.send(raw);
    });
  });
  await page.goto("/");
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect.poll(() => page.frames().find(frame => frame.url().includes("/cocos-table/index.html"))?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
  game.phase = "ended"; game.result = result; game.revision++; push();
  const effect = page.getByRole("status", { name: "胡牌结果" });
  await expect(effect).toBeVisible();
  await expect(effect.locator(".win-call-art")).toHaveText("胡");
  await expect(effect.locator(".win-callout")).toHaveCount(1);
  await expect(effect.locator(".special-win-art.theme-gold")).toHaveCount(1);
  await expect(effect.locator(".special-win-title")).toHaveText("胡");
  await expect(effect.locator(".special-win-art.theme-jade")).toHaveCount(0);
  await expect(effect).not.toContainText("全球独钓");
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/live-hu-${test.info().project.name}.png` });
  await expect(effect).not.toBeVisible({ timeout: 6000 });
  const settlement = page.getByRole("dialog", { name: "本局牌面", exact: true });
  await expect(settlement.locator(".result-call-label")).toHaveText("胡");
  await settlement.getByRole("button", { name: "计分详情", exact: true }).click();
  await expect(settlement.locator(".score-breakdown summary")).toContainText("乙 · 胡");
  await expect(settlement.locator(".score-breakdown summary strong")).toHaveText("100 分 · 外包收款");
  await expect(settlement.locator(".score-items-table tfoot th")).toHaveText("快照参考牌分");
  await expect(settlement.locator(".score-items-table tfoot td")).toHaveText("204分");
  const snapshotPoints = settlement.locator(".score-items-table tbody tr").filter({ hasText: "快照加分" });
  await expect(snapshotPoints).toHaveCount(1);
  await expect(snapshotPoints.locator("td").last()).toHaveText("+50分");
  await expect(settlement.locator(".score-ledger")).toContainText("三口承包");
  await expect(settlement.locator(".score-ledger")).toContainText("100");
  await page.screenshot({ path: `${output}/settlement-hu-${test.info().project.name}.png` });
  expect(game.result).toEqual(result);
});

test("旧快照战绩列表、明细、盘面与回放统一显示胡且不改保存账单", async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  const code = test.info().project.name === "webkit" ? "749914" : "749913";
  const { game, record } = snapshotDisplayFixture(code, `snapshot-record-${test.info().project.name}`);
  game.phase = "finished";
  const database = resolve(process.env.MAHJONG_E2E_DATABASE ?? "../../work/accounts-e2e.sqlite");
  const db = new DatabaseSync(database);
  try { createRecords(db).capture(game); } finally { db.close(); }
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await page.getByLabel("战绩房间号").fill(code);
  await page.getByRole("button", { name: "查询战绩", exact: true }).click();
  await page.getByRole("button", { name: `查看房间 ${code} 最终战绩` }).click();
  const dialog = page.getByRole("dialog", { name: `房间 ${code} · 战绩详情`, exact: true });
  await expect(dialog.locator(".record-hand-heading h3")).toHaveText("第 3 把 · 胡");
  await expect(dialog.locator(".score-breakdown summary")).toContainText("乙 · 胡");
  await expect(dialog.locator(".score-breakdown summary strong")).toHaveText("100 分 · 外包收款");
  await expect(dialog.locator(".score-items-table tfoot th")).toHaveText("快照参考牌分");
  await expect(dialog.locator(".score-items-table tfoot td")).toHaveText("204分");
  const snapshotPoints = dialog.locator(".score-items-table tbody tr").filter({ hasText: "快照加分" });
  await expect(snapshotPoints).toHaveCount(1);
  await expect(snapshotPoints.locator("td").last()).toHaveText("+50分");
  const external = dialog.locator(".record-transfer-table tbody tr").filter({ hasText: "三口承包" });
  await expect(external).toContainText("丙"); await expect(external).toContainText("乙"); await expect(external).toContainText("100");
  await dialog.getByRole("button", { name: "返回整桌明细", exact: true }).click();
  await expect(dialog.getByLabel("第 3 把明细").locator(".match-result-label")).toHaveText("胡");
  await dialog.getByLabel("第 3 把明细").getByRole("button", { name: "查看盘面", exact: true }).click();
  await expect(dialog.locator('.reveal-player[aria-label="乙的本局牌面"] .reveal-identity small')).toHaveText("胡");
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: `${output}/record-hu-${test.info().project.name}.png` });
  await dialog.getByRole("button", { name: "回放第 3 把", exact: true }).click();
  const replay = page.getByRole("dialog", { name: "牌局回放", exact: true });
  await expect(replay.locator(".cocos-loading")).toHaveCount(0, { timeout: 30000 });
  await replay.getByRole("button", { name: "查看结算", exact: true }).click();
  await expect(replay.locator(".replay-table-event")).toHaveText("本局结算 · 乙胡 · 丁放铳");
  await expect(replay.locator(".win-call-art")).toHaveText("胡");
  await expect(replay.locator(".special-win-art.theme-gold")).toHaveCount(1);
  await expect(replay.locator(".special-win-title")).toHaveText("胡");
  await expect(replay.locator(".special-win-art.theme-jade")).toHaveCount(0);
  await expect(replay.getByLabel("回放桌外累计记分")).toContainText("乙 +100");
  await expect(replay.getByLabel("回放桌外累计记分")).toContainText("丙 -100");
  await page.screenshot({ path: `${output}/replay-hu-${test.info().project.name}.png` });
  const verify = new DatabaseSync(database, { readOnly: true });
  try {
    const saved = verify.prepare("SELECT record FROM round_records WHERE id=?").get(record.id)!;
    expect(JSON.parse(String(saved.record)).result).toEqual(record.result);
  } finally { verify.close(); }
});

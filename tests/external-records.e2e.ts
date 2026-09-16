import { test, expect } from "./browser-fixtures";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createRecords } from "../server/records";
import { externalRound } from "./fixtures/external-round";

for (const [width, height] of [
  [844, 390],
  [932, 430],
]) {
  test(`外包记分从真实数据库展示到每把明细和回放 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const db = new DatabaseSync(resolve("../../work/accounts-e2e.sqlite"));
    const code = String(780000 + width),
      gameId = `external-ui-${width}`;
    try {
      const records = createRecords(db);
      let game = externalRound({ gameId });
      for (let n = 1; n <= 4; n++) {
        if (n > 1)
          game = externalRound({ previous: game, multiplier: n % 2 ? 1 : 2 });
        game.code = code;
        game.replay!.code = code;
        records.capture(game);
      }
    } finally {
      db.close();
    }
    await page.goto("/");
    await page.getByRole("button", { name: "战绩", exact: true }).click();
    await page.getByLabel("战绩房间号").fill(code);
    await page.getByRole("button", { name: "查询战绩", exact: true }).click();
    const card = page.getByRole("button", {
      name: `查看房间 ${code} 最终战绩`,
    });
    await expect(card.locator(".match-points b")).toHaveText([
      "-150",
      "0",
      "+150",
      "0",
    ]);
    await card.click();
    const dialog = page.getByRole("dialog", {
      name: "牌桌战绩详情",
      exact: true,
    });
    const first = page.getByLabel("第 1 把明细");
    await expect(first.locator(".round-player-points b")).toHaveText([
      "-50",
      "0",
      "+50",
      "0",
    ]);
    await first.getByRole("button", { name: "查看牌面", exact: true }).click();
    await expect(dialog.locator(".reveal-scores").first()).toContainText(
      "含桌外 +50",
    );
    await expect(dialog.locator(".score-details")).toContainText("桌外");
    await expect(dialog.locator(".score-details")).toContainText("固定额结算");
    await dialog
      .locator(".score-details")
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    const accountRow = dialog.locator(".score-players tbody tr").first();
    await expect(accountRow.locator("td")).toHaveText([
      /甲/,
      "0",
      "-50",
      "-50",
      "+90",
    ]);
    await expect(dialog.locator(".score-ledger")).toContainText(
      "三口承包 · 桌外",
    );
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/external-details-${width}.png`,
    });
    await dialog.getByRole("button", { name: "回放第 1 把" }).click();
    const replay = page.getByRole("dialog", { name: "牌局回放", exact: true });
    await replay.getByRole("button", { name: "查看结算" }).click();
    const balances = replay.getByLabel("回放桌外累计记分");
    await expect(balances).toContainText("甲 -50");
    await expect(balances).toContainText("丙 +50");
    await expect(replay.locator(".cocos-loading")).toHaveCount(0, {
      timeout: 30000,
    });
    expect(
      await replay.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/screenshots/external-replay-${width}.png`,
    });
    // The second saved hand doubled. Replay must read its snapshot, not today's settings.
    await replay.getByRole("button", { name: "查找牌局", exact: true }).click();
    await replay.getByLabel("牌局 ID", { exact: true }).fill(`${gameId}-2`);
    await replay.getByRole("button", { name: "查看回放", exact: true }).click();
    await expect(replay.locator(".cocos-loading")).toHaveCount(0, { timeout: 30000 });
    const tableFrame = () => page.frames().find(f => f.url().includes('/cocos-table/index.html'))!;
    await expect(async () => {
      const rendered = await tableFrame().evaluate(async () => {
        const cc = await (window as any).System.import('cc');
        const scene = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
        return { id: scene.state.key, labels: scene.hud.getComponentsInChildren(cc.Label).map((l:any) => l.string) };
      });
      expect(rendered.id).toBe(`${gameId}-2`);
      expect(rendered.labels).toContain("比下胡 × 2");
      expect(rendered.labels).toContain("进园子 · 2 / 4 把");
      expect(rendered.labels).toContain("2 / 4");
    }).toPass({timeout:30000});
    await page.screenshot({ path: `test-results/screenshots/replay-multiplier-${width}.png` });
  });
}

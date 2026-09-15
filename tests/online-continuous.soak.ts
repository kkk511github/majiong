import { test, expect, type Page } from "./browser-fixtures";
import type { View } from "../shared/types";
import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const snapshot = (page: Page) =>
  page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return {
      view: client.state.view as View | null,
      error: client.state.error,
      connected: client.state.connected,
      tables: client.state.tables,
    };
  });

test("四个真实账号连续八局：托管、重连、最终战绩与空桌续开", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(1_320_000);
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ viewport: { width: 844, height: 390 } }),
    ),
  );
  const peers = await Promise.all(contexts.map((c) => c.newPage()));
  const pages = [page, ...peers],
    errors: string[] = [];
  pages.forEach((p, i) =>
    p.on("pageerror", (e) => errors.push(`${i}: ${e.message}`)),
  );
  const started = Date.now(),
    rounds: number[] = [],
    samples: unknown[] = [];
  let reconnected = false,
    final: View | null = null;
  try {
    for (const [i, c] of contexts.entries()) {
      const response = await c.request.post(
        "http://127.0.0.1:5178/api/auth/register",
        {
          data: {
            username: `soak-${randomUUID()}`,
            name: ["紫金", "秦淮", "玄武"][i],
            password: "Soak-fixture-password-42",
          },
        },
      );
      expect(response.ok()).toBe(true);
      const data = await response.json();
      expect(data.account.role).toBe("member");
      expect(data.account.canCreateTables).toBe(false);
      await c.addInitScript(
        (token) => localStorage.setItem("jinling:token", JSON.stringify(token)),
        data.token,
      );
    }
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "开一桌，等朋友", exact: true }),
    ).toBeVisible();
    // Disable early bankruptcy only in this isolated endurance fixture so all eight rounds run.
    // Shuffle, turn decisions, WebSocket delivery, settlement timing and persistence stay real.
    await page.evaluate(async () => {
      const { client } = await import("/src/game-client.ts" as string);
      const { DEFAULT_TABLE_SETTINGS } = await import(
        "/shared/table-settings.ts" as string
      );
      client.createTables(
        client.state.account.name,
        { ...DEFAULT_TABLE_SETTINGS, name: "八局联机验收" },
        { rounds: 8, turnSeconds: 10, twoBankrupt: false },
        1,
      );
    });
    await expect(page.locator(".home-table")).toHaveCount(1);
    const code = (await snapshot(page)).tables[0].code;
    for (const p of peers) {
      await p.goto("http://127.0.0.1:5178");
      await expect(
        p.getByRole("button", { name: "进入牌桌大厅", exact: true }),
      ).toBeVisible();
      await expect(p.locator(".home-create")).toHaveCount(0);
      await p.getByRole("button", { name: "加入好友桌", exact: true }).click();
      await p.getByLabel("房间号", { exact: true }).fill(code);
      await p.getByRole("button", { name: "加入房间", exact: true }).click();
      await p.getByRole("button", { name: "我准备好了", exact: true }).click();
    }
    await page
      .getByRole("button", { name: `${code} 北位入座`, exact: true })
      .click();
    await page.getByRole("button", { name: "我准备好了", exact: true }).click();
    for (const p of pages) {
      await expect(p.getByLabel("我的手牌")).toBeVisible();
      await p.getByRole("button", { name: "托管", exact: true }).click();
    }
    let revision = -1,
      progressedAt = Date.now(),
      loggedAt = 0;
    while (Date.now() - started < 1_260_000) {
      const state = await snapshot(page),
        v = state.view;
      expect(v).not.toBeNull();
      expect(state.error).toBe("");
      expect(errors).toEqual([]);
      expect(state.connected).toBe(true);
      if (v!.revision !== revision) {
        revision = v!.revision;
        progressedAt = Date.now();
      }
      expect(
        Date.now() - progressedAt,
        "服务端 35 秒没有推进牌局",
      ).toBeLessThan(35_000);
      expect(v!.players.reduce((sum, p) => sum + p!.score, 0)).toBe(360);
      for (const record of v!.history) {
        if (rounds.includes(record.round)) continue;
        expect(record.result.deltas.reduce((a, b) => a + b, 0)).toBe(0);
        for (let seat = 0; seat < 4; seat++) {
          const delta = record.result.transfers!.reduce(
            (sum, t) =>
              sum +
              (t.to === seat ? t.amount : 0) -
              (t.from === seat ? t.amount : 0),
            0,
          );
          expect(delta).toBe(record.result.deltas[seat]);
        }
        rounds.push(record.round);
        console.log(
          `完成第 ${record.round} 局，${record.result.reason}，已运行 ${Math.round((Date.now() - started) / 1000)} 秒`,
        );
      }
      if (v!.phase === "ended") {
        await expect(page.locator(".settlement-readiness")).toHaveCount(4);
        await expect(page.locator(".result-next-info")).toContainText(
          "全员就绪",
        );
      }
      if (!reconnected && v!.round >= 2 && v!.phase === "playing") {
        const before = await snapshot(peers[0]);
        await peers[0].reload();
        await expect(peers[0].getByLabel("我的手牌")).toBeVisible();
        const after = await snapshot(peers[0]);
        expect(after.view!.id).toBe(before.view!.id);
        expect(after.view!.players[after.view!.me]!.trustee).toBe(true);
        reconnected = true;
      }
      if (v!.phase === "finished") {
        final = v;
        break;
      }
      if (Date.now() - loggedAt >= 30_000) {
        const sample = {
          seconds: Math.round((Date.now() - started) / 1000),
          round: v!.round,
          phase: v!.phase,
          revision,
          nodes: await page.locator("*").count(),
        };
        samples.push(sample);
        console.log(JSON.stringify(sample));
        loggedAt = Date.now();
      }
      await page.waitForTimeout(1000);
    }
    expect(rounds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(final).not.toBeNull();
    expect(reconnected).toBe(true);
    await page.screenshot({ path: info.outputPath("final-eight-rounds.png") });
    await Promise.all(
      pages.map((p) =>
        expect(
          p.getByRole("button", { name: "返回大厅", exact: true }),
        ).toBeVisible(),
      ),
    );
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(".table-lobby")).toBeVisible({ timeout: 15_000 }),
      ),
    );
    for (const p of pages) {
      expect((await snapshot(p)).view).toBeNull();
      expect((await snapshot(p)).error).toBe("");
    }
    const renewed = (await snapshot(page)).tables.find(
      (t: { code: string }) => t.code === code,
    );
    expect(renewed.phase).toBe("waiting");
    expect(renewed.seats).toEqual([null, null, null, null]);
    const records = await page.evaluate(async () => {
      const { client } = await import("/src/game-client.ts" as string);
      return client.loadRecords(true, new URLSearchParams());
    });
    expect(records.total).toBe(1);
    expect(records.records[0].record.round).toBe(8);
    expect(records.records[0].record.matchFinished).toBe(true);
    expect(records.records[0].record.scores).toEqual(
      final!.players.map((p) => p!.score),
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "战绩", exact: true })
      .click();
    await expect(page.locator(".record-card")).toHaveCount(1);
    await page
      .getByRole("button", { name: `查看房间 ${code} 最终战绩`, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(code);
    await page.screenshot({
      path: info.outputPath("admin-one-final-record.png"),
    });
    writeFileSync(
      info.outputPath("online-soak-report.json"),
      JSON.stringify(
        {
          started: new Date(started).toISOString(),
          durationSeconds: Math.round((Date.now() - started) / 1000),
          completedRounds: rounds,
          reconnected,
          finalScores: final!.players.map((p) => p!.score),
          adminFinalRecords: records.total,
          renewedSeats: renewed.seats,
          errors,
          samples,
          scope:
            "四个真实账号、服务端真实洗牌和计时、真人账号主动托管、八局及续桌；仅关闭两家归零提前结束以覆盖八局，不代表原生键盘、网络容量或其他平台规则一致性。",
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

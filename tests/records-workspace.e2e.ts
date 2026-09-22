import { test, expect, type Page } from "./browser-fixtures";
import { recordDate, recordDayRange } from "../src/record-dates";
import { mkdirSync } from "node:fs";
import { replayedRound } from "./fixtures/replayed-round";
import type { StoredRound } from "../shared/types";
import sharp from "sharp";

const old = "2026-08-25";
const roundChanges = [
  [18, -6, -12, 0],
  [-6, 18, -12, 0],
  [30, -6, -24, 0],
  [0, -18, 18, 0],
];
function item(
  index: number,
  at = recordDayRange(recordDate(Date.now())).from +
    (14 * 60 + 36 + index * 15) * 60000,
): StoredRound {
  return {
    game: "record-" + index,
    code: String(582619 + index),
    me: 0,
    practice: false,
    record: {
      id: "record-" + index + "-final",
      at,
      round: 4,
      totalRounds: 4,
      matchFinished: true,
      initialScore: 90,
      scoreDivisor: 1,
      tableName: "好友桌",
      names: ["秦淮月", "月白", "江宁", "金陵牌友"],
      avatars: ["/api/avatars/00000000-0000-4000-8000-000000000000/" + "a".repeat(64) + ".jpg"],
      memberIds: ["100001", "100002", "100003", "100004"],
      teamNames: ["一生所爱战队", "冰茉莉战队", "日结丁战队", "日结冰战队"],
      scores: [132, 78, 60, 90],
      result: {
        reason: "hu",
        winners: [0],
        details: {},
        deltas: roundChanges[3],
      },
    },
  };
}
async function fixture(page: Page, member = false) {
  const photo = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#c15747" } }).png().toBuffer();
  await page.route("**/api/avatars/**", (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: photo,
  }));
  const today = recordDate(Date.now());
  const queries: string[] = [];
  const reads = new Map<string, number>();
  await page.route("**/api/admin/match-reads/*", (route) => {
    const game = new URL(route.request().url()).pathname.split("/").at(-1)!;
    reads.set(game, reads.get(game) ?? Date.now());
    return route.fulfill({ json: { readAt: reads.get(game) } });
  });
  if (member) {
    await page.route("**/api/auth/session", async (route) => {
      const response = await route.fetch(),
        data = await response.json();
      data.account = {
        ...data.account,
        role: "member",
        canManageAdmins: false,
        canCreateTables: false,
      };
      await route.fulfill({ response, json: data });
    });
    await page.routeWebSocket("**/ws", (ws) => {
      ws.connectToServer().onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.account)
          m.account = {
            ...m.account,
            role: "member",
            canManageAdmins: false,
            canCreateTables: false,
          };
        ws.send(JSON.stringify(m));
      });
    });
  }
  await page.route(
    member ? "**/api/records*" : "**/api/admin/records*",
    (route) => {
      const q = new URL(route.request().url()).searchParams;
      queries.push(q.toString());
      const isOld = q.get("from") === String(recordDayRange(old).from);
      const records = isOld
        ? [item(25, recordDayRange(old).from + 14 * 3600000)]
        : Array.from({ length: 20 }, (_, i) => item(i));
      const byCode = q.has("code")
        ? records.filter((r) => r.code.startsWith(q.get("code")!))
        : records;
      const byMember = q.has("member")
        ? byCode.filter((r) => r.record.memberIds?.includes(q.get("member")!))
        : byCode;
      const filtered = byMember.filter((r) =>
        q.get("read") === "unread"
          ? !reads.has(r.game)
          : q.get("read") === "read"
            ? reads.has(r.game)
            : true,
      );
      return route.fulfill({
        json: {
          records: filtered.map((r) => ({
            ...r,
            ...(!member ? { adminReadAt: reads.get(r.game) ?? null } : {}),
          })),
          total: isOld ? 1 : q.has("code") ? filtered.length : 30,
          page: Number(q.get("page") ?? 1),
          pageSize: 20,
          dates: [
            { date: today, count: 29 },
            { date: old, count: 1 },
          ],
          dateTotal: 30,
          scoreTotals: q.has("from") ? (member
            ? [{ id: "member", name: "秦淮月", points: 42 }]
            : [{ id: "member", name: "秦淮月", memberId: "100001", points: 42 }, { id: "other", name: "月白", memberId: "100002", points: -12 }]) : [],
        },
      });
    },
  );
  const played = replayedRound().history[0];
  await page.route("**/api/matches/*", (route) =>
    route.fulfill({
      json: {
        match: item(25, recordDayRange(old).from + 15 * 3600000),
        rounds: [1, 2, 3, 4].map((n) => ({
          ...item(25),
          record: {
            ...item(25).record,
            id: "REPLAY-20260825-" + n,
            at: recordDayRange(old).from + (14 * 60 + n * 15) * 60000,
            matchFinished: false,
            round: n,
            hands: member ? undefined : played.hands,
            result: { ...item(25).record.result, deltas: roundChanges[n - 1] },
            scores: [90, 90, 90, 90].map(
              (base, seat) =>
                base +
                roundChanges
                  .slice(0, n)
                  .reduce((sum, row) => sum + row[seat], 0),
            ),
          },
        })),
      },
    }),
  );
  return queries;
}
test("窄屏战绩列表展示实际头像，详情复用当前头像", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await fixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  const photo = page.locator(".match-card").first().locator(".record-avatar img");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.locator(".match-card").first().click();
  await expect(page.locator(".match-record-dialog .record-avatar img").first()).toHaveAttribute("src", /api\/avatars/);
});
for (const [width, height] of [
  [568, 320],
  [844, 390],
  [1280, 590],
]) {
  test(`战绩按日期查看整桌和每把详情 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const queries = await fixture(page);
    await page.goto("/");
    await page.getByRole("button", { name: "战绩", exact: true }).click();
    await expect(page.locator(".match-card")).toHaveCount(20);
    await expect(page.locator(".record-read")).toHaveCount(0);
    await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
    for (const label of ["战绩查询方式", "战绩阅读状态"]) {
      const bounds = await page.getByLabel(label).boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "完成", exact: true }).click();
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/records-all-${width}.png`,
    });
    const first = (await page.locator(".match-card").first().boundingBox())!;
    const list = (await page.locator(".records-list").boundingBox())!;
    expect(
      first.y + first.height,
      "一整桌的四人分数必须在列表可视高度内完整显示",
    ).toBeLessThanOrEqual(list.y + list.height + 1);
    if (width >= 844) {
      const third = (await page.locator(".match-card").nth(2).boundingBox())!;
      expect(third.y + third.height, "横屏首屏完整展示至少三桌").toBeLessThanOrEqual(list.y + list.height + 1);
    }
    const before = await page.locator(".record-dates").boundingBox();
    await page
      .locator(".records-list")
      .evaluate((el) => el.scrollTo(0, el.scrollHeight));
    expect(await page.locator(".record-dates").boundingBox()).toEqual(before);
    await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
    await page.getByLabel("选择战绩日期").fill(old);
    await expect(page.locator(".match-card")).toHaveCount(1);
    await expect(page.getByLabel("个人当日战绩")).toHaveCount(0);
    await expect(page.locator(".record-filters-toggle")).toContainText(
      "8月25日",
    );
    await page.getByRole("button", { name: "完成", exact: true }).click();
    expect(queries.at(-1)).toContain("from=" + recordDayRange(old).from);
    expect(
      await page.locator(".records-list").evaluate((el) => el.scrollTop),
    ).toBe(0);
    const sidebar = (await page.locator(".record-dates").boundingBox())!;
    expect(sidebar.y + sidebar.height).toBeLessThan(list.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const button = page.getByRole("button", {
      name: "查看房间 582644 最终战绩",
    });
    await expect(button).toContainText("100004");
    await expect(button.locator(".record-team")).toHaveCount(4);
    await expect(button.locator(".match-player-name").first()).toHaveCSS(
      "flex-wrap",
      "wrap",
    );
    const identity = await button.locator(".match-player-name").first().evaluate((node) => {
      const name = node.querySelector("strong")!,
        team = node.querySelector<HTMLElement>(".record-team")!;
      return {
        sameLine: Math.abs(name.getBoundingClientRect().top - team.getBoundingClientRect().top) < 2,
        nameComplete: name.scrollWidth <= name.clientWidth,
        teamComplete: team.scrollWidth <= team.clientWidth,
      };
    });
    expect(identity.nameComplete && identity.teamComplete).toBe(true);
    expect(identity.sameLine).toBe(width >= 1280);
    await expect(button.locator(".match-points b")).toHaveText([
      "+42",
      "-12",
      "-30",
      "0",
    ]);
    const playerEnd = (await button
      .locator(".match-player")
      .last()
      .boundingBox())!;
    const detailBox = (await button
      .locator(".match-detail-link")
      .boundingBox())!;
    expect(playerEnd.x + playerEnd.width).toBeLessThanOrEqual(detailBox.x);
    await page.screenshot({
      path: `test-results/screenshots/records-workspace-${width}.png`,
    });
    await button.click();
    const dialog = page.getByRole("dialog", {
      name: "房间 582644 · 战绩详情",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    await expect(dialog.getByLabel("第 1 把战绩详情")).toBeVisible();
    await dialog.getByRole("button", { name: "返回整桌明细", exact: true }).click();
    const firstRound = page.getByLabel("第 1 把明细");
    await expect(firstRound).toContainText("REPLAY-20260825-1");
    await expect(firstRound.locator(".round-player-points b")).toHaveText([
      "+18",
      "-6",
      "-12",
      "0",
    ]);
    await expect(
      dialog.locator(".modal-head .match-points b"),
    ).toHaveText(["+42", "-12", "-30", "0"]);
    await page.screenshot({
      path: `test-results/screenshots/records-details-${width}.png`,
    });
    const last = page.getByLabel("第 4 把明细");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toContainText("REPLAY-20260825-4");
    await expect(
      last.getByRole("button", { name: "回放", exact: true }),
    ).toBeVisible();
    await last.getByRole("button", { name: "查看盘面", exact: true }).click();
    await expect(page.getByLabel("第 4 把战绩详情")).toBeVisible();
    await expect(dialog.getByLabel("本局四家牌面")).toBeVisible();
    await expect(dialog.locator(".reveal-score-items")).toHaveCount(0);
    await dialog.getByRole("tab", {name:"本把明细",exact:true}).click();
    await expect(dialog.getByRole("columnheader", {name:"本把开始",exact:true})).toBeVisible();
    await expect(dialog.getByLabel("本局四家牌面")).toHaveCount(0);
    expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    await page.screenshot({
      path: `test-results/screenshots/records-round-${width}.png`,
    });
    await dialog
      .getByRole("button", { name: "返回整桌明细", exact: true })
      .click();
    await expect(page.getByLabel("第 1 把明细")).toBeVisible();
    await expect(button.locator(".record-read")).toContainText("✅ 已读");
    await dialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.locator(".record-filters-toggle")).toContainText(
      "8月25日",
    );
    await page.getByRole("button", { name: "刷新战绩", exact: true }).click();
    await expect(button.locator(".record-read")).toContainText("✅ 已读");
    await page.screenshot({
      path: `test-results/screenshots/records-read-${width}.png`,
    });
    await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
    const readFilter = page.getByRole("combobox", { name: "战绩阅读状态" });
    await readFilter.selectOption("unread");
    await expect(page.locator(".match-card")).toHaveCount(0);
    expect(queries.at(-1)).toContain("read=unread");
    await readFilter.selectOption("read");
    await expect(page.locator(".match-card")).toHaveCount(1);
    expect(queries.at(-1)).toContain("read=read");
    await page.getByRole("button", { name: "完成", exact: true }).click();
    await page.getByRole("button", { name: "返回大厅", exact: true }).click();
    await expect(page.locator(".records-workspace")).toHaveCount(0);
  });
}

test("普通会员可看 ID 和每把回放 ID，战队名不显示；房间查询与日期可组合", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 590 });
  const queries = await fixture(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(20);
  await expect(page.locator(".record-team")).toHaveCount(0);
  await expect(page.locator(".record-read, .record-unread")).toHaveCount(0);
  await expect(page.locator(".records-heading h1")).toHaveText("战绩");
  await page.screenshot({
    path: "test-results/screenshots/records-member-1280.png",
  });
  await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
  await page.getByLabel("选择战绩日期").fill(old);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByLabel("个人当日战绩")).toContainText("+42");
  await page.getByLabel("战绩房间号").fill("582644");
  await page.getByRole("button", { name: "查询战绩", exact: true }).click();
  await expect.poll(() => queries.at(-1)).toContain("code=582644");
  expect(queries.at(-1)).toContain("from=" + recordDayRange(old).from);
  await page.getByRole("button", { name: "查看房间 582644 最终战绩" }).click();
  const dialog = page.getByRole("dialog", {
    name: "房间 582644 · 战绩详情",
    exact: true,
  });
  await dialog.getByRole("button", { name: "返回整桌明细", exact: true }).click();
  await expect(dialog.getByLabel("第 1 把明细")).toContainText("100001");
  await expect(dialog.getByLabel("第 1 把明细")).toContainText(
    "REPLAY-20260825-1",
  );
  await expect(dialog.locator(".record-team")).toHaveCount(0);
  await dialog
    .getByLabel("第 1 把明细")
    .getByRole("button", { name: "本把明细", exact: true })
    .click();
  await expect(dialog.getByRole("columnheader", {name:"本把开始",exact:true})).toBeVisible();
  await expect(dialog.locator(".record-team")).toHaveCount(0);
});

for (const [width,height] of [[568,320],[1280,590]]) test(`本把明细分项与实付可读 ${width}`, async ({page})=>{
  await page.setViewportSize({width,height});
  await fixture(page);
  const saved=item(25);
  saved.record={...saved.record,round:1,matchFinished:false,scores:[198,54,54,54],result:{
    reason:"hu",winners:[0],deltas:[108,-36,-36,-36],
    details:{0:{total:36,kinds:[],items:[{label:"成牌",value:10},{label:"门清",value:10},{label:"硬花 6 × 2",value:12},{label:"软花 2 × 2",value:4}]}},
    transfers:([1,2,3] as const).map(from=>({from,to:0,amount:36,reason:"自摸"})),
  }};
  await page.route("**/api/matches/*",route=>route.fulfill({json:{match:saved,rounds:[saved]}}));
  await page.goto("/");await page.getByRole("button",{name:"战绩",exact:true}).click();
  await page.locator(".match-card").first().click();
  const dialog=page.getByRole("dialog",{name:/房间 .* · 战绩详情/});
  await expect(dialog.getByRole("tab",{name:"本把明细",exact:true})).toHaveAttribute("aria-selected", "true");
  const score=dialog.getByRole("table",{name:"秦淮月的胡牌计分"});
  await expect(score.locator("tbody tr")).toHaveText(["成牌底分合法成牌+10分","门清牌型加分+10分","硬花6张 × 2分/张+12分","软花2个 × 2分/个+4分"]);
  await expect(score.locator("tfoot")).toContainText("36分");
  await expect(dialog.locator(".record-transfer-table tbody tr")).toHaveCount(3);
  await expect(dialog.locator(".record-transfer-table tbody tr").first()).toContainText("月白");
  await expect(dialog.locator(".score-players tbody tr").first().locator("td")).toHaveText([/秦淮月/,"90","+108","+198"]);
  await score.scrollIntoViewIfNeeded();
  expect(await score.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/screenshots/round-score-details-${width}.png`});
});

test("管理员会员查询与返回列表位置保留", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const queries = await fixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await page.getByRole("button", { name: "筛选战绩", exact: true }).click();
  await page.getByLabel("战绩查询方式").selectOption("member");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByLabel("战绩会员ID").fill("100002");
  await page.getByRole("button", { name: "查询战绩", exact: true }).click();
  await expect.poll(() => queries.at(-1)).toContain("member=100002");
  await expect(page.locator(".match-card")).toHaveCount(20);
  await page.locator(".records-list").evaluate((el) => el.scrollTo(0, 250));
  await expect
    .poll(() => page.locator(".records-list").evaluate((el) => el.scrollTop))
    .toBe(250);
  await page.getByRole("button", { name: "返回大厅", exact: true }).click();
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await expect(page.getByLabel("战绩会员ID")).toHaveValue("100002");
  await expect(page.locator(".match-card")).toHaveCount(20);
  await expect
    .poll(() => page.locator(".records-list").evaluate((el) => el.scrollTop))
    .toBe(250);
  await page.getByLabel("战绩会员ID").fill("999999");
  await page.getByRole("button", { name: "查询战绩", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(0);
  await page.getByRole("button", { name: "我的对局", exact: true }).click();
  await expect(page.getByLabel("战绩查询方式")).toHaveCount(0);
  await expect(page.getByLabel("战绩房间号")).toBeVisible();
});

test('战绩移除摘要反馈入口，默认明细可切换把数和返回整桌',async({page})=>{
 await page.setViewportSize({width:568,height:320});await fixture(page);
 await page.goto('/');await page.getByRole('button',{name:'战绩',exact:true}).click();
 await page.locator('.match-card').first().click();
 const details=page.getByRole('dialog',{name:/房间 .* · 战绩详情/});
 await expect(details.getByRole('button',{name:'摘要 / 反馈',exact:true})).toHaveCount(0);
 await expect(details.getByRole('tab',{name:'本把明细',exact:true})).toHaveAttribute('aria-selected','true');
 await details.getByRole('navigation',{name:'选择把数'}).getByRole('button',{name:/第 2 把/}).click();
 await expect(details.getByLabel('第 2 把战绩详情')).toBeVisible();
 await details.getByRole('button',{name:'返回整桌明细',exact:true}).click();
 await expect(details.getByLabel('第 1 把明细')).toBeVisible();
 await expect(details.getByRole('button',{name:'摘要 / 反馈',exact:true})).toHaveCount(0);
});

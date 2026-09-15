import { legacyRoom } from "./browser-fixtures";
import { expect, test } from "./browser-fixtures";
import {
  act,
  botAction,
  createGame,
  newPlayer,
  seats,
  startRound,
} from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import late from "./fixtures/late-table.json" with { type: "json" };
const captures = resolve("test-results/screenshots");
test.beforeAll(() => mkdirSync(captures, { recursive: true }));

for (const [width, height] of [
  [568, 320],
  [874, 402],
])
  test(`个人页 ${width}：昵称可直接编辑，保存反馈明确，重进练习使用新名字`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "我的", exact: true })
      .click();
    const editor = page.getByLabel(/牌桌昵称/);
    expect(
      await editor.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.top >= 0 &&
          r.bottom <= innerHeight &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
    ).toBe(true);
    await editor.fill("   ");
    await page.getByRole("button", { name: "保存昵称", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "请填写 1–12 个字的昵称。",
    );
    await editor.fill("南京秦淮河边的十二字牌友");
    await page.getByRole("button", { name: "保存昵称", exact: true }).click();
    await expect(page.locator("#profile-name-status")).toContainText(
      "昵称已保存",
    );
    await expect(page.locator(".profile-card h2")).toHaveText(
      "南京秦淮河边的十二字牌友",
    );
    const clipped = await page
      .locator(".site-header, .profile-name-editor input, #profile-name-status")
      .evaluateAll((els) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.top < 0 ||
              r.bottom > innerHeight ||
              !el.contains(
                document.elementFromPoint(r.x + r.width / 2, r.bottom - 2),
              )
            );
          })
          .map((el) => el.className || el.id),
      );
    expect(clipped).toEqual([]);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: `${captures}/audit-profile-${width}.png` });
    await page.reload();
    await expect(page.locator(".header-note")).toHaveText(
      "南京秦淮河边的十二字牌友",
    );
    await page.getByRole("button", { name: /单人练习/ }).click();
    await expect(page.locator(".my-info strong")).toHaveText(
      "南京秦淮河边的十二字牌友",
    );
  });

for (const [width, height] of [
  [568, 320],
  [874, 402],
])
  test(`大厅 ${width}：继续与新开练习都可用，取消不会丢进度`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const g = createGame("练习桌", "old-practice");
    g.players = [0, 1, 2, 3].map((i) => {
      const p = newPlayer(String(i), `牌友${i}`, i > 0);
      p.ready = true;
      return p;
    });
    const saved = startRound(g, Date.now(), seededRandom(41));
    await page.addInitScript(
      (g) => localStorage.setItem("jinling:practice", JSON.stringify(g)),
      saved,
    );
    await page.goto("/");
    const fresh = page.getByRole("button", { name: "新开练习", exact: true });
    expect(
      await fresh.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.height >= 44 &&
          r.top >= 0 &&
          el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          )
        );
      }),
    ).toBe(true);
    await page.screenshot({ path: `${captures}/audit-home-${width}.png` });
    await fresh.click();
    await page.getByRole("button", { name: "保留原局", exact: true }).click();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("jinling:practice")!).id,
      ),
    ).toBe(saved.id);
    await fresh.click();
    await page.getByRole("button", { name: "开始新局", exact: true }).click();
    await expect(page.getByLabel("我的手牌")).toBeVisible();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("jinling:practice")!).id,
      ),
    ).not.toBe(saved.id);
  });

test("网络延迟时准备按钮即时反馈并阻止连点，确认后可以添加陪练", async ({
  page,
}) => {
  const sent: { type: string }[] = [];
  await page.routeWebSocket("**/ws", (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      sent.push(JSON.parse(String(message)));
      server.send(message);
    });
    server.onMessage((message) => setTimeout(() => ws.send(message), 500));
  });
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto("/");
  await legacyRoom(page);
  const ready = page.getByRole("button", { name: "我准备好了", exact: true });
  await ready.dblclick();
  await expect(
    page.getByRole("button", { name: "正在准备…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "添加电脑陪练", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".waiting-actions .primary")).toContainText(
    "还差 3 位",
  );
  expect(sent.filter((m) => m.type === "ready")).toHaveLength(1);
  await page.getByRole("button", { name: "添加电脑陪练", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "正在入座…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".waiting-status")).toContainText("已入座 2 / 4");
  await page.getByRole("button", { name: "返回大厅", exact: true }).click();
  await expect(page.locator(".waiting-room")).not.toBeVisible();
});

test("568 横屏长昵称不侵入牌池、手牌和积分", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const g = structuredClone(late);
  g.players.forEach((p, i) => (p.name = `南京秦淮河边十二字牌友${i}`));
  await page.addInitScript((g) => {
    localStorage.setItem("jinling:practice", JSON.stringify(g));
    localStorage.setItem("jinling:name", JSON.stringify(g.players[0].name));
  }, g);
  await page.goto("/");
  await page.getByRole("button", { name: /继续打/ }).click();
  const bad = await page
    .locator(".opponent-info strong, .my-info strong, .my-score")
    .evaluateAll((els) =>
      els
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width <= 0 ||
            r.top < 0 ||
            r.bottom > innerHeight ||
            r.right > innerWidth ||
            !el.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            )
          );
        })
        .map((el) => el.textContent),
    );
  expect(bad).toEqual([]);
  await page.screenshot({ path: `${captures}/audit-long-names-568.png` });
});

for (const [width, height] of [
  [568, 320],
  [874, 402],
])
  test(`战绩与玩法 ${width}：空状态入口同屏，规则只滚动内容`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "战绩", exact: true })
      .click();
    await page.getByRole("button", { name: "单人练习", exact: true }).click();
    await expect(page.locator(".records-empty")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "刷新战绩", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: `${captures}/audit-history-empty-${width}.png`,
    });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "玩法", exact: true })
      .click();
    await page.locator(".edition").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(
      page
        .getByRole("navigation")
        .getByRole("button", { name: "牌桌", exact: true }),
    ).toBeInViewport();
  });

test("568 横屏百条战绩：可以滚到最早记录、展开收支，导航保持可达", async ({
  page,
}) => {
  await page.setViewportSize({ width: 568, height: 320 });
  const room = createGame("练习桌", "history-layout");
  room.players = seats.map((seat) => {
    const p = newPlayer(String(seat), `南京牌友${seat}`, seat > 0);
    p.ready = true;
    return p;
  });
  let g = startRound(room, Date.now(), seededRandom(1));
  for (
    let step = 0;
    step < 600 && ["playing", "claiming"].includes(g.phase);
    step++
  ) {
    const seat =
      g.phase === "playing"
        ? g.turn
        : seats.find(
            (s) => g.pending!.offers[s] && g.pending!.replies[s] === undefined,
          )!;
    g = act(g, seat, botAction(g, seat)!);
  }
  expect(g.history).toHaveLength(1);
  const history = Array.from({ length: 100 }, (_, i) => ({
    game: `history-${i}`,
    code: "练习桌",
    me: 0,
    practice: true,
    record: { ...g.history[0], id: `record-${i}`, at: Date.now() - i * 60000 },
  }));
  await page.addInitScript(
    (history) =>
      localStorage.setItem("jinling:history", JSON.stringify(history)),
    history,
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "战绩", exact: true })
    .click();
  await page.getByRole("button", { name: "单人练习", exact: true }).click();
  const rows = page.locator(".record-card");
  await expect(rows).toHaveCount(20);
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "下一页战绩", exact: true }).click();
  await expect(page.locator(".records-pagination")).toContainText("5 / 5");
  await rows.last().click();
  await page.locator(".settlement-detail-toggle > summary").click();
  const ledger = page.locator(".score-ledger");
  await ledger.locator(":scope > summary").scrollIntoViewIfNeeded();
  if ((await ledger.getAttribute("open")) === null)
    await ledger.locator(":scope > summary").click();
  await page.locator(".form-note").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({ path: `${captures}/audit-history-100.png` });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "牌桌", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "南京麻将", exact: true }),
  ).toBeVisible();
});

import { legacyRoom } from "./browser-fixtures";
import { expect, test } from "./browser-fixtures";
import { createGame, newPlayer, startRound } from "../shared/engine";
import { seededRandom } from "../shared/tiles";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const captures = resolve("test-results/screenshots");
test.beforeAll(() => mkdirSync(captures, { recursive: true }));

test("先准备再补电脑，第四个座位补齐后直接发牌", async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await page.goto("/");
  await legacyRoom(page);
  await expect(page.locator(".waiting-room")).toBeVisible();
  await page.getByRole("button", { name: "我准备好了" }).click();
  await expect(page.locator(".waiting-actions .primary")).toContainText(
    "还差 3 位",
  );
  for (let i = 1; i <= 3; i++) {
    await page.getByRole("button", { name: "添加电脑陪练" }).click();
    if (i < 3)
      await expect(page.locator(".waiting-actions .primary")).toContainText(
        `还差 ${3 - i} 位`,
      );
  }
  await expect(
    page.getByLabel("我的手牌").locator(":scope > .tile"),
  ).toHaveCount(14);
  await expect(page.getByRole("timer")).toBeVisible();
  await page.screenshot({ path: captures + "/friend-ready-fixed.png" });
  await page.getByRole("button", { name: "大厅", exact: true }).click();
  await page.getByRole("button", { name: "申请解散", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("牌桌已解散");
});

for (const width of [568, 874, 932])
  test(`摸牌独立放最右 ${width}：旧牌连续，选牌不挤动，出牌后归入排序`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 568 ? 320 : 430 });
    const g = createGame("练习桌", "spacing");
    g.players = [0, 1, 2, 3].map((i) => {
      const p = newPlayer(String(i), `牌友${i}`, i > 0);
      p.ready = true;
      return p;
    });
    const playing = startRound(g, Date.now(), seededRandom(51));
    playing.lastDraw = playing.players[0]!.hand[4];
    await page.addInitScript((g) => {
      localStorage.setItem("jinling:practice", JSON.stringify(g));
      localStorage.setItem("jinling:name", JSON.stringify(g.players[0]!.name));
    }, playing);
    await page.goto("/");
    await page.getByRole("button", { name: /继续/ }).click();
    const tiles = page.getByLabel("我的手牌").locator(":scope > .tile");
    await expect(tiles).toHaveCount(14);
    const check = async () => {
      const drawn = page.locator(".hand > .tile.drawn");
      const hasDrawn = (await drawn.count()) === 1;
      if (hasDrawn) {
        await expect(tiles.last()).toHaveClass(/drawn/);
        const a = await tiles.nth((await tiles.count()) - 2).boundingBox();
        const b = await tiles.last().boundingBox();
        expect(b!.x - a!.x - a!.width).toBeGreaterThanOrEqual(9);
        expect(b!.x + b!.width).toBeLessThanOrEqual(width - 8);
      }
      const gaps = await tiles.evaluateAll((elements) =>
        elements
          .filter((el) => !el.classList.contains("drawn"))
          .slice(1)
          .map(
            (el, i) =>
              el.getBoundingClientRect().left -
              elements[i].getBoundingClientRect().right,
          ),
      );
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.7);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(4);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(-0.5);
      const clocks = await page.getByRole("timer").evaluateAll((elements) =>
        elements.map((el) => {
          const b = el.getBoundingClientRect();
          return (
            b.x >= 0 &&
            b.y >= 0 &&
            b.right <= innerWidth &&
            b.bottom <= innerHeight
          );
        }),
      );
      expect(clocks.every(Boolean)).toBe(true);
      const hiddenFlowers = await page
        .locator(".flower-rack .tile")
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return !el.contains(
                document.elementFromPoint(
                  r.x + r.width / 2,
                  r.y + r.height / 2,
                ),
              );
            })
            .map((el) => el.getAttribute("aria-label")),
        );
      expect(hiddenFlowers).toEqual([]);
      const scrolled = await page
        .locator("html,body,#root,.app,.game-wrap")
        .evaluateAll((els) =>
          els
            .filter((el) => el.scrollLeft || el.scrollTop)
            .map((el) => ({
              name: el.className || el.tagName,
              x: el.scrollLeft,
              y: el.scrollTop,
            })),
        );
      expect(scrolled).toEqual([]);
    };
    await check();
    await expect(tiles.last()).toHaveAttribute(
      "data-tile",
      String(playing.lastDraw),
    );
    await page.screenshot({ path: `${captures}/drawn-tile-${width}.png` });
    await expect(page.locator(".table-center strong")).toHaveText(/^(29|30)$/);
    await expect(page.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /金陵牌友出牌剩余/,
    );
    await tiles.nth(2).click();
    await check();
    await tiles.nth(2).click();
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("jinling:practice")!).players[0]
              .discards.length,
        ),
      )
      .toBe(1);
    await check();
    await expect(page.locator(".hand > .tile.drawn")).toHaveCount(0);
    const sorted = await tiles.evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute("data-tile"))),
    );
    expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    expect(sorted).toContain(playing.lastDraw);
    await page.screenshot({ path: `${captures}/refined-table-${width}.png` });
  });

test("音乐和音效实际输出音频，分别静音，设置持久化，后台暂停", async ({
  page,
}) => {
  await page.setViewportSize({ width: 874, height: 402 });
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    (window as any).__audioContexts = [];
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        const connect = AudioNode.prototype.connect;
        const destination = this.destination;
        AudioNode.prototype.connect = function (
          this: AudioNode,
          ...args: any[]
        ) {
          const result = (connect as any).apply(this, args);
          if (args[0] === destination) (connect as any).call(this, analyser);
          return result;
        } as typeof AudioNode.prototype.connect;
        (window as any).__audioContexts.push({ context: this, analyser });
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "背景音乐", exact: true }),
  ).toBeChecked();
  const level = () =>
    page.evaluate(() => {
      const { context, analyser } = (window as any).__audioContexts.at(-1);
      const samples = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(samples);
      return { state: context.state, peak: Math.max(...samples.map(Math.abs)) };
    });
  await expect.poll(async () => (await level()).state).toBe("running");
  await expect.poll(async () => (await level()).peak).toBeGreaterThan(0.001);
  await page.getByRole("switch", { name: "背景音乐", exact: true }).click();
  await page.getByRole("switch", { name: "游戏音效", exact: true }).click();
  await expect.poll(async () => (await level()).peak).toBeLessThan(0.0001);
  await page.getByRole("switch", { name: "游戏音效", exact: true }).click();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  // A real menu click must produce a sound while background music remains disabled.
  await page.getByRole("button", { name: "设置", exact: true }).click();
  expect((await level()).peak).toBeGreaterThan(0.0001);
  await page.getByRole("switch", { name: "背景音乐", exact: true }).click();
  await page.getByRole("slider", { name: "背景音乐音量" }).fill("25");
  await page.screenshot({ path: captures + "/audio-settings.png" });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await level()).state).toBe("suspended");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(async () => (await level()).state).toBe("running");
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("slider", { name: "背景音乐音量" })).toHaveValue(
    "25",
  );
});

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`四组碰杠与剩余手牌分区，右侧只分出一张新摸牌 ${width}`, async ({
    page,
  }) => {
    const { default: late } = await import("./fixtures/late-table.json", {
      with: { type: "json" },
    });
    const saved = structuredClone(late);
    saved.turn = 0;
    saved.players.forEach((p) => {
      p.bot = false;
      p.trustee = false;
    });
    saved.lastDraw = saved.players[0].hand.at(-1)!;
    await page.setViewportSize({ width, height });
    await page.addInitScript(
      (g) => localStorage.setItem("jinling:practice", JSON.stringify(g)),
      saved,
    );
    await page.goto("/");
    await page.getByRole("button", { name: /继续/ }).click();
    await expect(page.locator(".hand .self-melds")).toBeVisible();
    await expect(page.locator(".self-meld-label")).toHaveText("碰杠");
    await expect(page.locator(".hand > .tile")).toHaveCount(2);
    await expect(page.locator(".hand > .tile.drawn")).toHaveCount(1);
    const tiles = page.locator(".hand > .tile");
    await tiles.first().click();
    await tiles.first().click();
    await expect(page.locator(".hand > .tile")).toHaveCount(1);
    await expect(page.locator(".hand > .tile.drawn")).toHaveCount(0);
    expect(
      await page
        .locator(".hand > .tile")
        .evaluate((el) => getComputedStyle(el).marginLeft),
    ).toBe("0px");
  });
}

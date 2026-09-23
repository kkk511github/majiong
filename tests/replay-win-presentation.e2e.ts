import { test, expect, type Page } from "./browser-fixtures";
import { replayedRound } from "./fixtures/replayed-round";
import type { Result, Seat } from "../shared/types";
import { winDisplayLabel } from "../src/win-label";

const cases: { title: string; width: number; height: number; winners: Seat[]; from?: Seat; perspectives: Seat[] }[] = [
  { title: "自己点炮三家胡", width: 568, height: 320, winners: [1, 2, 3], from: 0, perspectives: [0, 1, 2, 3] },
  { title: "非零视角旁观别人点炮另一家胡", width: 932, height: 430, winners: [2], from: 1, perspectives: [3, 0] },
  { title: "对家自摸", width: 932, height: 430, winners: [2], perspectives: [0, 2] },
  { title: "流局不显示胡牌", width: 568, height: 320, winners: [], perspectives: [0] },
];

async function scene(page: Page) {
  return page.frames().find(f => f.url().includes("/cocos-table/index.html"))!.evaluate(async () => {
    const cc = await (window as any).System.import("cc");
    const component = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
    return { state: component.state, effects: component.effectsRoot.children.map((n: any) => n.name) };
  });
}

for (const c of cases) test(`回放胡牌归属：${c.title}，切换视角与播放均不重复`, async ({ page }) => {
  await page.setViewportSize({ width: c.width, height: c.height });
  const replay = replayedRound().replay!;
  if (c.from === 1) replay.names[2] = "一位名字很长的金陵麻将牌友";
  const last = replay.frames.at(-1)!;
  const result: Result = { ...last.result!, winners: c.winners, from: c.from, reason: c.winners.length ? "hu" : "draw" };
  replay.frames = [replay.frames[0], { ...last, at: replay.frames[0].at + 500, result }];
  await page.route("**/api/replays/**", route => route.fulfill({ json: replay }));
  await page.goto("/");
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    (window as any).__replayWinVoice = [];
    gameAudio.sayTile = (_key: string, phrase: number | string) => { (window as any).__replayWinVoice.push(phrase); };
  });
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await page.getByRole("button", { name: "牌局回放", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "牌局回放", exact: true });
  await dialog.getByLabel("牌局 ID", { exact: true }).fill(replay.id);
  await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
  await expect.poll(() => page.frames().find(f => f.url().includes("/cocos-table/index.html"))?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__)).toBe(true);
  await dialog.getByRole("button", { name: "查看结算", exact: true }).click();
  const effect = dialog.getByRole("status", { name: "胡牌结果" });
  const changePerspective = async (perspective: Seat) => {
    const prior = await scene(page);
    if (prior.state.me !== perspective) {
      if (await dialog.locator(".replay-controls").isVisible()) await page.mouse.click(c.width / 2, c.height / 2);
      const avatar = await page.frames().find(f => f.url().includes("/cocos-table/index.html"))!.evaluate(async seat => {
        const cc = await (window as any).System.import("cc");
        const component = cc.director.getScene().getChildByName("Canvas").getComponent("TableScene");
        const ring = component.hud.getChildByName(`player-avatar-ring-${seat}`);
        return ring && { x: ring.position.x + 640, y: 295 - ring.position.y, visible: ring.activeInHierarchy };
      }, perspective);
      expect(avatar?.visible).toBe(true);
      const frame = (await dialog.locator(".cocos-embedded iframe").boundingBox())!;
      const scale = Math.min(frame.width / 1280, frame.height / 590);
      await page.mouse.click(frame.x + (frame.width - 1280 * scale) / 2 + avatar!.x * scale, frame.y + (frame.height - 590 * scale) / 2 + avatar!.y * scale);
    }
    await expect.poll(async () => (await scene(page)).state.me).toBe(perspective);
  };

  for (const perspective of c.perspectives) {
    await changePerspective(perspective);
    await expect(effect).toHaveCount(c.winners.length ? 1 : 0);
    if (c.winners.length) {
      await expect(effect.locator(".win-callout")).toHaveCount(c.winners.length);
      await expect(effect.locator(".seat-discarder")).toHaveCount(c.from === undefined ? 0 : 1);
      for (const winner of c.winners) {
        const relative = (winner - perspective + 4) % 4;
        const callout = effect.locator(`.win-callout[data-seat="${winner}"]`);
        await expect(callout).toHaveAttribute("data-relative-seat", String(relative));
        await expect(callout.locator(".winner")).toHaveText(replay.names[winner]);
        await expect(callout.locator(".win-call-art")).toHaveText(winDisplayLabel(result,winner));
        await expect(callout).toBeInViewport();
        const bounds = (await callout.boundingBox())!;
        const center = bounds.x + bounds.width / 2;
        if (relative === 0) expect(bounds.y).toBeGreaterThan(c.height * .6);
        if (relative === 1) expect(center).toBeGreaterThan(c.width * .75);
        if (relative === 2) expect(bounds.y).toBeLessThan(c.height * .3);
        if (relative === 3) expect(center).toBeLessThan(c.width * .25);
      }
      if (c.from !== undefined) {
        const marker = effect.locator(".seat-discarder");
        await expect(marker).toHaveAttribute("data-seat", String(c.from));
        await expect(marker).toHaveAttribute("data-relative-seat", String((c.from - perspective + 4) % 4));
      }
    }
    const rendered = await scene(page);
    expect(rendered.state.effects.some((e: any) => e.type === "hu")).toBe(false);
    expect(rendered.effects.filter((name: string) => ["spine-hu", "spine-self-draw"].includes(name))).toEqual([]);
  }
  if (c.from === 1) {
    // Replays keep the result visible while paused, so rotate the cutout and
    // perspective without racing the short live-game result animation.
    for (const perspective of [3, 0] as const) {
      await changePerspective(perspective);
      for (const [left, right] of [[59, 0], [0, 59]]) {
        await dialog.locator(".cocos-embedded").evaluate((element, safe) => {
          const table = element as HTMLElement;
          table.style.setProperty("--table-safe-left", `${safe.left}px`);
          table.style.setProperty("--table-safe-right", `${safe.right}px`);
          window.dispatchEvent(new Event("resize"));
        }, { left, right });
        await expect.poll(async () => {
          const safe = (await scene(page)).state.safeArea;
          return { left: safe.left > 0, right: safe.right > 0 };
        }).toEqual({ left: left > 0, right: right > 0 });
        for (const marker of await effect.locator(".win-callout,.seat-discarder").all()) {
          const box = (await marker.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(left - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(c.width - right + 1);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(c.height);
        }
        if (perspective === 3) {
          const label = effect.locator('.winner[data-seat="2"]');
          await expect(label).toHaveAttribute("title", replay.names[2]);
          expect(await label.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        }
      }
      // Restore unmodified edges before clicking the next avatar.
      await dialog.locator(".cocos-embedded").evaluate(element => {
        (element as HTMLElement).style.setProperty("--table-safe-left", "0px");
        (element as HTMLElement).style.setProperty("--table-safe-right", "0px");
        window.dispatchEvent(new Event("resize"));
      });
      await expect.poll(async () => (await scene(page)).state.safeArea).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    }
  }
  expect(await page.evaluate(() => (window as any).__replayWinVoice)).toEqual([]);
  await dialog.locator(".replay-keyboard-controls").focus();
  await dialog.getByRole("button", { name: "回到开局", exact: true }).click();
  await expect(effect).toHaveCount(0);
  await dialog.getByRole("button", { name: "播放回放", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__replayWinVoice)).toEqual([c.winners.length ? c.from === undefined ? "自摸" : "胡了" : "流局"]);
  await expect(effect).toHaveCount(c.winners.length ? 1 : 0);
  await expect(dialog.getByRole("button", { name: "播放回放", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__replayWinVoice)).toHaveLength(1);
});

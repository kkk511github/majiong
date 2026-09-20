import { test, expect, type Page } from "@playwright/test";

const openTable = async (page: Page) => {
  await page.goto("/tests/previews/room-communication.html");
  await expect(page.getByRole("button", { name: "快捷短句", exact: true })).toBeVisible();
};

for (const [width, height] of [[568,320], [844,390], [1280,590]]) {
  test(`${width}横屏入口、浮层与最后一条短句均可操作`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await openTable(page);
    const controls = await page.locator(".room-communication-tools").boundingBox();
    await expect(page.locator(".room-communication-tools > button")).toHaveCount(1);
    const toolbar = await page.locator(".table-menu-actions").boundingBox();
    expect(controls!.y).toBeGreaterThan(toolbar!.y + toolbar!.height);
    expect(controls!.x + controls!.width).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "快捷短句", exact: true }).click();
    const panel = page.getByRole("region", { name: "快捷短句面板" });
    await expect(panel).toBeVisible();
    await expect(panel.locator(".phrase-list > button")).toHaveCount(12);
    await expect(panel).not.toContainText("表情");
    const last = panel.getByRole("button", { name: "不好意思，刚又得事耽误了一下", exact: true });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await expect(panel).not.toBeVisible();
    await expect(page.locator(".room-phrase-bubble")).toContainText("不好意思，刚又得事耽误了一下");
    expect(await page.evaluate(() => (window as any).__communication.testing.sent)).toEqual(["chat_12"]);
    await expect(page.getByRole("button", { name: "同桌语音", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "同桌语音面板" })).toHaveCount(0);
    await expect(page.locator(".hold-to-talk")).toHaveCount(0);
    await page.screenshot({ path: `output/voice-wind-design-20260920/phrases-only-ready-${width}-${test.info().project.name}.png` });
    expect(errors).toEqual([]);
  });
}

test("发送错误留面板、缺能力禁发，断线关闭且不误发", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openTable(page);
  await page.getByRole("button", { name: "快捷短句", exact: true }).click();
  await page.evaluate(() => { (window as any).__communication.testing.failNext = true; });
  await page.locator(".phrase-list > button").first().click();
  await expect(page.getByRole("alert")).toHaveText("发送失败，请重试");
  await expect(page.getByRole("region", { name: "快捷短句面板" })).toBeVisible();
  await page.evaluate(() => (window as any).__communication.setAvailable(false));
  await expect(page.locator(".phrase-list > button").first()).toBeDisabled();
  await expect(page.locator(".phrase-panel footer")).toHaveText("服务器暂未开启短句");
  await page.evaluate(() => (window as any).__communication.setConnected(false));
  await expect(page.locator(".phrase-panel")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__communication.testing.sent)).toEqual([]);
});

test("刘海安全区以及碰杠选择优先于短句浮层", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openTable(page);
  await page.locator(".cocos-game").evaluate(el => { (el as HTMLElement).style.setProperty("--table-safe-left", "44px"); (el as HTMLElement).style.setProperty("--table-safe-right", "44px"); });
  await expect.poll(async () => { const r = (await page.locator(".room-communication-tools").boundingBox())!; return r.x + r.width; }).toBeLessThanOrEqual(800);
  await page.getByRole("button", { name: "快捷短句", exact: true }).click();
  await page.evaluate(() => (window as any).__communication.setClaim(true));
  await expect(page.locator(".phrase-panel")).toHaveCount(0);
  await page.evaluate(() => (window as any).__communication.receive(0, "chat_07"));
  await expect(page.locator(".room-phrase-bubble")).toBeVisible();
  const controls = page.locator(".table-claim-actions button");
  await expect(controls).toHaveCount(3);
  for (const button of await controls.all()) {
    expect(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)); })).toBe(true);
  }
});

test("南京话男女声播放、四座气泡和静音到期", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 590 });
  const requests: string[] = [];
  page.on("request", r => { if (r.url().includes("/audio/phrases/")) requests.push(r.url()); });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).__shortStarts = [];
    AudioBufferSourceNode.prototype.start = function(...args: Parameters<AudioBufferSourceNode["start"]>) {
      if (this.buffer && !this.loop && this.buffer.duration > .25) (window as any).__shortStarts.push(this.buffer.duration);
      return start.apply(this, args);
    };
  });
  await openTable(page);
  await page.getByRole("button", { name: "快捷短句", exact: true }).click();
  await page.locator(".phrase-list > button").first().click();
  await expect.poll(() => requests.some(url => /male\/chat_01\.mp3/.test(url))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__shortStarts.length)).toBeGreaterThan(0);
  const maleStarts = await page.evaluate(() => (window as any).__shortStarts.length);
  await page.evaluate(() => (window as any).__communication.setGender("female"));
  await page.evaluate(() => (window as any).__communication.receive(1, "chat_03"));
  await expect(page.locator('.room-phrase-bubble[data-seat="1"]')).toContainText("手气好的");
  await expect.poll(() => requests.some(url => /female\/chat_03\.mp3/.test(url))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__shortStarts.length)).toBeGreaterThan(maleStarts);
  await page.evaluate(() => { (window as any).__communication.receive(2, "chat_06"); (window as any).__communication.receive(3, "chat_08"); });
  await expect(page.locator(".room-phrase-bubble")).toHaveCount(4);
  await page.screenshot({ path: `output/voice-wind-design-20260920/phrases-only-four-voices-${test.info().project.name}.png` });
  await page.evaluate(() => (window as any).__communication.setEnabled(false));
  const before = requests.length;
  await page.evaluate(() => (window as any).__communication.receive(2, "chat_10"));
  await expect(page.locator('.room-phrase-bubble[data-seat="2"]')).toContainText("好好打牌");
  await page.waitForTimeout(150);
  expect(requests.length).toBe(before);
  await expect(page.locator(".room-phrase-bubble")).toHaveCount(0, { timeout: 8000 });
});

test("只保留短句，发送与播放不申请麦克风也不上传录音", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const voiceRequests: string[] = [], recorderImports: string[] = [];
  page.on("request", request => {
    if (/\/api\/voice(?:[/?]|$)/.test(request.url())) voiceRequests.push(request.url());
    if (request.url().includes("/src/voice-recorder")) recorderImports.push(request.url());
  });
  await page.addInitScript(() => {
    (window as any).__microphoneRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => {
      (window as any).__microphoneRequests++;
      throw Error("短句不应申请麦克风");
    } } });
  });
  await openTable(page);
  await expect(page.getByRole("button", { name: "同桌语音", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "同桌语音面板" })).toHaveCount(0);
  await expect(page.locator(".hold-to-talk")).toHaveCount(0);
  await page.getByRole("button", { name: "快捷短句", exact: true }).click();
  await page.locator(".phrase-list > button").first().click();
  await expect(page.locator(".room-phrase-bubble")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__communication.testing.sent)).toEqual(["chat_01"]);
  // The received phrase's playback control also uses bundled audio only.
  await page.locator(".room-phrase-bubble").click();
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__microphoneRequests)).toBe(0);
  expect(voiceRequests).toEqual([]);
  expect(recorderImports).toEqual([]);
});

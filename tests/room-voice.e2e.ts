import { test, expect } from "./browser-fixtures";

test("完整App只保留短句，语音播放可关闭且偏好持久化", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const recordedRequests: string[] = [];
  page.on("request", request => {
    if (/\/api\/voice(?:[/?]|$)/.test(request.url())) recordedRequests.push(request.url());
  });
  await page.addInitScript(() => {
    (window as any).__microphoneRequests = 0;
    Object.defineProperty(navigator, "mediaDevices", { value: {
      getUserMedia: async () => {
        (window as any).__microphoneRequests++;
        throw Error("短句不应申请麦克风");
      },
    } });
  });

  // The account fixture and this managed table live only on the local test server.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "我的", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.createTables("短句测试牌友", {
      name: "短句本地测试桌", readyMode: "auto", autoRenew: false,
      continuousRounds: false, overtimeSeconds: 90,
    }, { rounds: 8, turnSeconds: 60 }, 1);
  });
  await expect.poll(() => page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.snapshot().createdTables?.length;
  })).toBe(1);
  const source = await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    const code = client.snapshot().createdTables![0];
    client.send({ type: "createExperienceTable", sourceCode: code });
    return code;
  });
  await expect.poll(() => page.evaluate(async source => {
    const { client } = await import("/src/game-client.ts" as string);
    const code = client.snapshot().createdTables?.[0];
    return !!code && code !== source;
  }, source)).toBe(true);
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.joinTable("短句测试牌友", client.snapshot().createdTables![0], 0);
  });
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    return client.snapshot().view?.players.filter((player: any) => player?.bot).length;
  })).toBe(3);

  const phrases = page.getByRole("button", { name: "快捷短句", exact: true });
  await expect(phrases).toBeVisible();
  await expect(page.locator(".room-communication-tools > button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "同桌语音", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "同桌语音面板" })).toHaveCount(0);
  await expect(page.locator(".hold-to-talk")).toHaveCount(0);
  await phrases.click();
  await page.locator(".phrase-list > button").first().click();
  await expect(page.locator(".room-phrase-bubble")).toBeVisible();

  await page.getByRole("button", { name: "牌桌设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "牌桌设置", exact: true });
  const playback = settings.getByRole("switch", { name: "短句语音播放", exact: true });
  await expect(playback).toHaveAttribute("aria-checked", "true");
  await playback.click();
  await expect(playback).toHaveAttribute("aria-checked", "false");
  await settings.getByRole("button", { name: "南京女声", exact: true }).click();
  await expect.poll(() => page.evaluate(() => ({
    chat: JSON.parse(localStorage.getItem("jinling:chat") ?? "null"),
    gender: JSON.parse(localStorage.getItem("jinling:voiceGender") ?? "null"),
  }))).toEqual({ chat: false, gender: "female" });
  await settings.getByRole("button", { name: "关闭", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__microphoneRequests)).toBe(0);

  await page.reload();
  await expect(page.locator("#cocos-table-board")).toBeVisible();
  await expect(phrases).toBeVisible();
  await expect(page.getByRole("button", { name: "同桌语音", exact: true })).toHaveCount(0);
  await expect(page.locator(".hold-to-talk")).toHaveCount(0);
  await page.getByRole("button", { name: "牌桌设置", exact: true }).click();
  await expect(playback).toHaveAttribute("aria-checked", "false");
  await expect(settings.getByRole("button", { name: "南京女声", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as any).__microphoneRequests)).toBe(0);
  expect(recordedRequests).toEqual([]);
});

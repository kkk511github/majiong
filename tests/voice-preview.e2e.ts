import { test, expect } from "./browser-fixtures";
import male from "../src/nanjing-male.json" with { type: "json" };

test("试听反馈、零音量提示与播放结束后恢复音乐", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const button = page.getByRole("button", { name: "试听南京话", exact: true });
  const status = page.locator(".voice-preview-status");
  const volume = page.getByRole("slider", { name: "南京话报牌音量" });
  await volume.fill("0");
  await expect(button).toBeDisabled();
  await expect(status).toContainText("音量为 0");
  await volume.fill("65");
  await button.click();
  await expect(status).toHaveText("正在试听南京话…");
  await expect(status).toHaveText("试听结束");
  await expect.poll(() => page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    const a = gameAudio as any;
    return !a.speaking && Math.abs(a.musicGain.gain.value - (a.preferences.music ? a.preferences.musicVolume : 0)) < 0.02;
  })).toBe(true);
  await button.click();
  await expect(status).toHaveText("正在试听南京话…");
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    return (gameAudio as any).speaking;
  })).toBe(false);
});

test("试听资源失败可见，不会误报播放中或持续压低音乐", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${male.file}`, async route => {
    await held;
    await route.fulfill({ status: 503, body: "unavailable" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "试听南京话", exact: true }).click();
  await expect(page.locator(".voice-preview-status")).toHaveText("正在加载试听…");
  release();
  await expect(page.locator(".voice-preview-status")).toContainText("试听未能播放");
  await page.getByRole("button", { name: "试听南京话", exact: true }).click();
  await expect(page.locator(".voice-preview-status")).toContainText("试听未能播放");
  await expect.poll(() => page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    return (gameAudio as any).speaking;
  })).toBe(false);
});

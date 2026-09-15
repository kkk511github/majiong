import { test, expect } from "./browser-fixtures";

test("大厅与牌局各自播放正确配乐，快速切换不会晚到叠播", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const setup = await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    const audio = gameAudio as any;
    audio.configure(
      { ...audio.preferences, music: true, musicVolume: 0.38 },
      false,
    );
    return true;
  });
  expect(setup).toBe(true);
  const playing = () =>
    page.evaluate(async () => {
      const { gameAudio } = await import("/src/audio.ts" as string);
      const a = gameAudio as any;
      return {
        file: a.musicTrack.file,
        duration: a.musicSource?.buffer.duration,
        running: a.context?.state,
      };
    });
  await expect
    .poll(async () => (await playing()).duration)
    .toBeGreaterThan(128);
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    const a = gameAudio as any;
    a.configure(a.preferences, true);
    a.configure(a.preferences, false);
    a.configure(a.preferences, true);
  });
  await expect.poll(async () => (await playing()).duration).toBeLessThan(62);
  expect((await playing()).file).toContain("mahjong-table.m4a");
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    gameAudio.setVisible(false);
  });
  await expect.poll(async () => (await playing()).running).toBe("suspended");
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    gameAudio.setVisible(true);
  });
  await expect.poll(async () => (await playing()).running).toBe("running");
  expect((await playing()).file).toContain("mahjong-table.m4a");
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    const a = gameAudio as any;
    a.configure(a.preferences, false);
  });
  await expect
    .poll(async () => (await playing()).duration)
    .toBeGreaterThan(128);
  expect((await playing()).file).toContain("mahjong-lobby.m4a");
});

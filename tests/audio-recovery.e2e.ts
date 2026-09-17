import { test, expect } from "./browser-fixtures";

test("后台恢复的音频时钟卡死时只重建一次，保留静音偏好", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string),
      a = gameAudio as any;
    a.configure({ ...a.preferences, music: false, soundVolume: 0.31 }, false);
    a.setVisible(false);
    await a.context.suspend();
    (window as any).oldAudioContext = a.context;
    Object.defineProperty(a.context, "currentTime", { get: () => 100 });
    a.setVisible(true);
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { gameAudio } = await import("/src/audio.ts" as string),
            a = gameAudio as any;
          return (
            a.context !== (window as any).oldAudioContext &&
            a.context?.state === "running" &&
            a.context.currentTime > 0
          );
        }),
      { timeout: 12000 },
    )
    .toBe(true);
  const state = await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string),
      a = gameAudio as any;
    return {
      old: (window as any).oldAudioContext.state,
      music: a.preferences.music,
      volume: a.preferences.soundVolume,
      source: !!a.musicSource,
    };
  });
  expect(state).toEqual({
    old: "closed",
    music: false,
    volume: 0.31,
    source: false,
  });
});

test("牌桌 iframe 内点击能重新解锁父页面音频", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { client } = await import("/src/game-client.ts" as string);
    client.practice("音频回归", { rounds: 4, turnSeconds: 30 });
  });
  await expect(page.locator("#cocos-table-board iframe")).toBeVisible();
  await expect
    .poll(() =>
      page
        .frames()
        .find((f) => f.url().includes("/cocos-table/index.html"))
        ?.evaluate(() => !!(window as any).__JINLING_TABLE_READY__),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string),
      a = gameAudio as any;
    a.unlock();
    await a.context.resume();
    await a.context.suspend();
    a.stopRecovery();
    const resume = a.context.resume.bind(a.context);
    (window as any).trustedAudioGestures = 0;
    a.context.resume = () => {
      (window as any).trustedAudioGestures++;
      return resume();
    };
  });
  const box = (await page.locator("#cocos-table-board iframe").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.63);
  await expect
    .poll(() => page.evaluate(() => (window as any).trustedAudioGestures))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { gameAudio } = await import("/src/audio.ts" as string);
        return (gameAudio as any).context.state;
      }),
    )
    .toBe("running");
});

test("系统持续拒绝恢复时停止自动重试，回到后台立即取消恢复", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string),
      a = gameAudio as any;
    a.setVisible(false);
    await a.context.suspend();
    (window as any).recoveryCalls = 0;
    (window as any).firstRecoveryContext = a.context;
    const proto = Object.getPrototypeOf(a.context);
    const resume = proto.resume;
    const clock = Object.getOwnPropertyDescriptor(proto, "currentTime");
    Object.defineProperty(proto, "currentTime", {
      configurable: true,
      get: () => 0,
    });
    (window as any).restoreResume = () => {
      proto.resume = resume;
      if (clock) Object.defineProperty(proto, "currentTime", clock);
      else delete proto.currentTime;
    };
    proto.resume = function () {
      (window as any).recoveryCalls++;
      return Promise.reject(Error("Audio session busy"));
    };
    a.setVisible(true);
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { gameAudio } = await import("/src/audio.ts" as string),
            a = gameAudio as any;
          return (
            a.context !== (window as any).firstRecoveryContext &&
            (window as any).recoveryCalls >= 4 &&
            !a.recovering &&
            !a.resumeRetry
          );
        }),
      { timeout: 16000 },
    )
    .toBe(true);
  await expect(page.locator(".audio-recovery-prompt")).toContainText(
    "声音未恢复",
  );
  const health = await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    return gameAudio.getHealth();
  });
  expect(health.phase).toBe("blocked");
  expect(health.failures).toBe(1);
  expect(health.rebuilds).toBe(1);
  await page.evaluate(async () => {
    (window as any).restoreResume();
    const { gameAudio } = await import("/src/audio.ts" as string),
      a = gameAudio as any;
    a.unlock();
    a.setVisible(false);
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { gameAudio } = await import("/src/audio.ts" as string),
          a = gameAudio as any;
        return {
          visible: a.visible,
          recovering: a.recovering,
          timer: !!a.resumeRetry,
          state: a.context.state,
        };
      }),
    )
    .toEqual({
      visible: false,
      recovering: false,
      timer: false,
      state: "suspended",
    });
  await expect(page.locator(".audio-recovery-prompt")).toHaveCount(0);
});

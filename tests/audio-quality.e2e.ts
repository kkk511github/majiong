import { test, expect } from "./browser-fixtures";

test("开局提示没有噪声、无叠播，静音与后台不会残留开局声", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { GameAudio } = await import("/src/audio.ts" as string);
    const render = async (
      duplicate: boolean,
      muted = false,
      hidden = false,
    ) => {
      const context = new OfflineAudioContext(2, 44100, 44100);
      // Offline rendering runs the production envelopes without an actual device.
      Object.defineProperty(context, "state", { get: () => "running" });
      const out = context.createGain();
      out.connect(context.destination);
      const game = new GameAudio() as any;
      game.context = context;
      game.effectsGain = out;
      game.preferences.soundVolume = muted ? 0 : 1;
      game.visible = !hidden;
      game.play("deal");
      if (duplicate) game.play("deal");
      const buffer = await context.startRendering();
      const samples = buffer.getChannelData(0);
      let peak = 0,
        jump = 0,
        energy = 0,
        tail = 0;
      for (let i = 0; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]));
        jump = Math.max(jump, Math.abs(samples[i] - (samples[i - 1] ?? 0)));
        energy += samples[i] ** 2;
        if (i > 0.6 * 44100) tail = Math.max(tail, Math.abs(samples[i]));
      }
      return { peak, jump, energy, tail };
    };
    return {
      single: await render(false),
      repeated: await render(true),
      muted: await render(false, true),
      hidden: await render(false, false, true),
    };
  });
  expect(result.single.peak).toBeGreaterThan(0.02);
  expect(result.single.peak).toBeLessThan(0.15);
  expect(result.single.jump).toBeLessThan(0.015);
  expect(result.single.tail).toBe(0);
  expect(result.repeated).toEqual(result.single);
  expect(result.muted.energy).toBe(0);
  expect(result.hidden.energy).toBe(0);
});

test("离线钢琴配乐可完整解码，循环边缘平滑，无削波", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { BACKGROUND_MUSIC } = await import("/src/audio.ts" as string);
    const context = new AudioContext();
    const data = await (await fetch(BACKGROUND_MUSIC.file)).arrayBuffer();
    const buffer = await context.decodeAudioData(data);
    let peak = 0,
      invalid = 0,
      energy = 0,
      edgePeak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const s = buffer.getChannelData(c);
      for (let i = 0; i < s.length; i++) {
        if (!Number.isFinite(s[i])) invalid++;
        peak = Math.max(peak, Math.abs(s[i]));
        energy += s[i] ** 2;
        if (i < 100 || i >= s.length - 100)
          edgePeak = Math.max(edgePeak, Math.abs(s[i]));
      }
    }
    await context.close();
    return {
      duration: buffer.duration,
      channels: buffer.numberOfChannels,
      peak,
      invalid,
      rms: Math.sqrt(energy / buffer.length / buffer.numberOfChannels),
      edgePeak,
    };
  });
  expect(result.duration).toBeGreaterThan(106);
  expect(result.duration).toBeLessThan(108);
  expect(result.channels).toBe(2);
  expect(result.peak).toBeLessThan(0.95);
  expect(result.invalid).toBe(0);
  expect(result.rms).toBeGreaterThan(0.04);
  expect(result.edgePeak).toBeLessThan(0.01);
});

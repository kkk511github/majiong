import { test, expect } from "./browser-fixtures";
test("返回前台自动恢复音乐，首次恢复失败可重试，静音设置保留", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("jinling:music", "true");
    localStorage.setItem("jinling:musicVolume", "0.38");
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        (window as any).__musicContext = this;
        (window as any).__musicLoops = 0;
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        (window as any).__musicAnalyser = analyser;
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
        const make = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = make(),
            start = source.start.bind(source);
          source.start = (...args: Parameters<typeof source.start>) => {
            if (source.loop) (window as any).__musicLoops++;
            start(...args);
          };
          return source;
        };
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__musicContext.state))
    .toBe("running");
  await expect
    .poll(() => page.evaluate(() => (window as any).__musicLoops))
    .toBe(1);
  for (const failedFirst of [false, true]) {
    await page.evaluate(async (fail) => {
      const { gameAudio } = await import("/src/audio.ts" as string);
      gameAudio.setVisible(false);
      const context = (window as any).__musicContext;
      await context.suspend();
      (window as any).__beforeTime = context.currentTime;
      if (fail) {
        const resume = context.resume.bind(context);
        let once = true;
        context.resume = () => {
          if (once) {
            once = false;
            return Promise.reject(new Error("OS audio session not ready"));
          }
          return resume();
        };
      }
    }, failedFirst);
    await expect
      .poll(() => page.evaluate(() => (window as any).__musicContext.state))
      .toBe("suspended");
    // Restore through the same lifecycle handler, without clicking to unlock sound.
    await page.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pageshow")),
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__musicContext.state))
      .toBe("running");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const a = (window as any).__musicAnalyser;
            const data = new Float32Array(a.fftSize);
            a.getFloatTimeDomainData(data);
            return Math.max(...data.map(Math.abs));
          }),
        { intervals: [50, 100, 200] },
      )
      .toBeGreaterThan(0.001);
    expect(await page.evaluate(() => (window as any).__musicLoops)).toBe(1);
    expect(
      await page.evaluate(
        () =>
          (window as any).__musicContext.currentTime >
          (window as any).__beforeTime,
      ),
    ).toBe(true);
  }
  await page.getByRole("switch", { name: "背景音乐", exact: true }).click();
  await page.evaluate(async () => {
    const { gameAudio } = await import("/src/audio.ts" as string);
    gameAudio.setVisible(false);
    await (window as any).__musicContext.suspend();
    window.dispatchEvent(new PageTransitionEvent("pageshow"));
  });
  await expect(
    page.getByRole("switch", { name: "背景音乐", exact: true }),
  ).not.toBeChecked();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { gameAudio } = await import("/src/audio.ts" as string);
        return (gameAudio as any).musicGain.gain.value;
      }),
    )
    .toBeLessThan(0.0001);
});

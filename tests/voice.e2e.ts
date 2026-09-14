import { test, expect } from "./browser-fixtures";
import { mkdirSync, readFileSync } from "node:fs";
const voice = JSON.parse(readFileSync("src/nanjing-female.json", "utf8"));

for (const [width, height] of [
  [568, 320],
  [844, 390],
  [932, 430],
]) {
  test(`南京话独立音量、试听与静音 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      localStorage.setItem("jinling:music", "false");
      localStorage.setItem("jinling:sound", "false");
      localStorage.setItem("jinling:voice", "true");
      const Base = window.AudioContext;
      (window as any).__voiceStarts = [];
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
          (window as any).__voiceAudio = { context: this, analyser };
          const create = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const source = create(),
              start = source.start.bind(source);
            source.start = (...args: Parameters<typeof source.start>) => {
              if (source.buffer && source.buffer.duration > 10)
                (window as any).__voiceStarts.push(args);
              start(...args);
            };
            return source;
          };
        }
      };
    });
    await page.goto("/");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(
      page.getByRole("switch", { name: "南京话报牌", exact: true }),
    ).toBeChecked();
    const preview = page.getByRole("button", {
      name: "试听南京话",
      exact: true,
    });
    await preview.scrollIntoViewIfNeeded();
    const hit = await preview.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.top >= 0 &&
        r.bottom <= innerHeight &&
        r.right <= innerWidth &&
        el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        )
      );
    });
    expect(hit).toBe(true);
    await page.evaluate(() => (window as any).__voiceAudio.context.suspend());
    await preview.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__voiceStarts.length))
      .toBe(1);
    const starts = await page.evaluate(() => (window as any).__voiceStarts);
    expect(starts[0]).toEqual([0, ...voice.actions["自摸"]]);
    const peak = () =>
      page.evaluate(() => {
        const analyser = (window as any).__voiceAudio.analyser;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        return Math.max(...data.map(Math.abs));
      });
    await expect.poll(peak, { intervals: [20, 30, 50] }).toBeGreaterThan(0.001);
    await page.getByRole("switch", { name: "南京话报牌", exact: true }).click();
    await expect(preview).toBeDisabled();
    await expect.poll(peak).toBeLessThan(0.0001);
    await page.getByRole("switch", { name: "南京话报牌", exact: true }).click();
    await page.getByRole("slider", { name: "南京话报牌音量" }).fill("35");
    mkdirSync("test-results/screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/screenshots/voice-settings-${width}.png`,
    });
    await page.reload();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(
      page.getByRole("slider", { name: "南京话报牌音量" }),
    ).toHaveValue("35");
    await expect(
      page.getByRole("switch", { name: "游戏音效", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("switch", { name: "背景音乐", exact: true }),
    ).not.toBeChecked();
  });
}

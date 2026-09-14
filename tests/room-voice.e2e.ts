import { test, expect, legacyRoom } from "./browser-fixtures";
import { voiceDuration } from "../shared/room-voice";
test("同桌语音按住录制、松开发送、上滑/后台取消与性别持久化", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    (window as any).__stops = 0;
    (window as any).__voiceBodies = [];
    const fetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input).includes("/api/voice/") && init?.body) {
        const buffer = await new Response(init.body).arrayBuffer();
        (window as any).__voiceBodies.push(Array.from(new Uint8Array(buffer)));
      }
      return fetch(input, init);
    };
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => {
          const session = (navigator as any).audioSession;
          if (session && session.type !== "play-and-record")
            throw Error("Capture requires play-and-record before permission");
          const c = new AudioContext(),
            o = c.createOscillator(),
            dest = c.createMediaStreamDestination();
          o.connect(dest);
          o.start();
          for (const t of dest.stream.getTracks()) {
            const stop = t.stop.bind(t);
            t.stop = () => {
              (window as any).__stops++;
              stop();
              void c.close();
            };
          }
          return dest.stream;
        },
      },
    });
  });
  const sent: Buffer[] = [];

  await page.route("**/api/voice/**", async (route) => {
    const bytes = route.request().postDataBuffer();
    sent.push(
      bytes ??
        Buffer.from(
          await page.evaluate(() => (window as any).__voiceBodies.at(-1)),
        ),
    );
    await route.fulfill({ json: { id: "test-receipt" } });
  });
  await page.goto("/");
  await legacyRoom(page);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "添加电脑陪练", exact: true })
      .click();
  await page
    .getByRole("button", { name: /准备|开始/ })
    .first()
    .click();
  await expect(page.locator("#table-board")).toBeVisible();
  await page.getByRole("button", { name: "同桌语音", exact: true }).click();
  const talk = page.locator(".hold-to-talk"),
    r = (await talk.boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await expect(talk).toContainText("松开发送");
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect.poll(() => sent.length).toBe(1);
  expect(voiceDuration(sent[0])).toBeGreaterThan(0.4);
  await page.mouse.down();
  await expect(talk).toContainText("松开发送");
  await page.waitForTimeout(500);
  await page.mouse.move(r.x + r.width / 2, r.y - 60);
  await expect(talk).toContainText("松手取消");
  await page.mouse.up();
  expect(sent.length).toBe(1);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down();
  await expect(talk).toContainText("松开发送");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.mouse.up();
  await expect(talk).toHaveText(/按住说话/);
  expect(sent.length).toBe(1);
  expect(await page.evaluate(() => (window as any).__stops)).toBe(3);
  await page.getByRole("button", { name: "关闭同桌语音" }).click();
  await page.getByRole("button", { name: "牌桌设置" }).click();
  await page.getByRole("button", { name: "南京男声", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "南京男声", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("jinling:voiceGender")!),
    ),
  ).toBe("male");
});

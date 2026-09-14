import { test, expect } from "./browser-fixtures";
import { replayedRound } from "./fixtures/replayed-round";

for (const [width, height] of [
  [568, 320],
  [874, 402],
]) {
  test(`普通会员通过ID播放、暂停、跳步和看结算 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const replay = replayedRound().replay!;
    await page.route("**/api/auth/session", async (route) => {
      const res = await route.fetch(),
        data = await res.json();
      data.account = {
        ...data.account,
        role: "member",
        canManageAdmins: false,
        canCreateTables: false,
      };
      await route.fulfill({ response: res, json: data });
    });
    await page.routeWebSocket("**/ws", (ws) => {
      ws.connectToServer().onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.account)
          m.account = {
            ...m.account,
            role: "member",
            canManageAdmins: false,
            canCreateTables: false,
          };
        ws.send(JSON.stringify(m));
      });
    });
    await page.route("**/api/replays/**", async (route) => {
      const id = route.request().url().split("/").at(-1);
      if (id === replay.id) await route.fulfill({ json: replay });
      else if (id === "legacy-1")
        await route.fulfill({
          json: {
            ...replay,
            id,
            summaryOnly: true,
            frames: [replay.frames.at(-1)],
          },
        });
      else
        await route.fulfill({
          status: 404,
          json: { error: "未找到已结束的牌局，请检查 ID" },
        });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "战绩", exact: true }).click();
    await expect(page.locator(".records-heading h1")).toHaveText("我的战绩");
    await expect(page.locator(".records-admin")).toHaveCount(0);
    const entry = page.getByRole("button", { name: "牌局回放", exact: true });
    const contrast = await entry.evaluate((el) => {
      const style = getComputedStyle(el);
      const luma = (color: string) => {
        const rgb = color
          .match(/\d+/g)!
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      const a = luma(style.color),
        b = luma(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThan(4.5);
    await page.screenshot({
      path: `test-results/screenshots/history-entry-${width}.png`,
    });
    await page.getByRole("button", { name: "牌局回放", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "牌局回放", exact: true });
    await dialog.getByLabel("牌局 ID", { exact: true }).fill(replay.id);
    await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
    await expect(dialog.locator(".replay-player")).toHaveCount(4);
    const fullscreen = await dialog.boundingBox();
    expect(fullscreen).toEqual({ x: 0, y: 0, width, height });
    await expect(dialog.locator(".replay-search")).toHaveCount(0);
    await expect(dialog.locator(".replay-table-event")).toContainText(
      "开局发牌",
    );
    await dialog.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(dialog.getByRole("slider", { name: "回放进度" })).toHaveValue(
      "1",
    );
    await dialog.getByRole("button", { name: "播放回放", exact: true }).click();
    await expect
      .poll(async () => Number(await dialog.getByRole("slider").inputValue()))
      .toBeGreaterThan(1);
    await dialog.getByRole("button", { name: "暂停回放", exact: true }).click();
    const paused = await dialog.getByRole("slider").inputValue();
    await page.waitForTimeout(1100);
    await expect(dialog.getByRole("slider")).toHaveValue(paused);
    await dialog.getByRole("button", { name: "查看结算", exact: true }).click();
    await expect(dialog.locator(".replay-table-event")).toContainText(
      "本局结算",
    );
    for (const [i, p] of replay.frames.at(-1)!.players.entries()) {
      await expect(dialog.locator(".replay-player").nth(i)).toContainText(
        `${p.score} 分`,
      );
      await expect(
        dialog
          .locator(".replay-player")
          .nth(i)
          .locator(".replay-concealed .tile"),
      ).toHaveCount(p.hand.length);
    }
    // Every perspective uses the whole table; exposed racks never overlap
    // rivers, flowers or player panels, including the final winning tile.
    for (let seat = 0; seat < 4; seat++) {
      await dialog
        .getByRole("button", {
          name: `切换到${replay.names[seat]}视角`,
          exact: true,
        })
        .click();
      const collisions = await dialog
        .locator(".replay-table")
        .evaluate((el) => {
          const cards = [...el.querySelectorAll(".tile,.tile-back")];
          const panels = [
            ...el.querySelectorAll(".replay-seat,.replay-compass"),
          ];
          const hit = (a: Element, b: Element) => {
            const x = a.getBoundingClientRect(),
              y = b.getBoundingClientRect();
            return (
              Math.min(x.right, y.right) - Math.max(x.left, y.left) > 0.7 &&
              Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 0.7
            );
          };
          return cards.flatMap((c, i) =>
            [...cards.slice(i + 1), ...panels]
              .filter((o) => hit(c, o))
              .map((o) => ({
                a: c.parentElement!.className,
                b: o.parentElement!.className,
                boxes: [
                  c.getBoundingClientRect().toJSON(),
                  o.getBoundingClientRect().toJSON(),
                ],
              })),
          );
        });
      expect(collisions, `perspective ${seat}`).toEqual([]);
    }
    await dialog
      .getByRole("button", {
        name: `切换到${replay.names[0]}视角`,
        exact: true,
      })
      .click();
    const layout = await dialog.evaluate((el) => {
      const table = el.querySelector(".replay-table")!;
      const controls = el
        .querySelector(".replay-controls")!
        .getBoundingClientRect();
      const rect = table.getBoundingClientRect();
      return {
        right: rect.right,
        bottom: controls.bottom,
        width: rect.width,
        controlsTop: controls.top,
        tableBottom: rect.bottom,
        overflow: table.scrollWidth - table.clientWidth,
      };
    });
    expect(layout.right).toBeLessThanOrEqual(width);
    expect(layout.bottom).toBeLessThanOrEqual(height);
    expect(layout.width).toBeGreaterThan(width * 0.85);
    expect(layout.tableBottom).toBeLessThanOrEqual(layout.controlsTop);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `test-results/screenshots/replay-${width}.png`,
    });
    await dialog.getByRole("button", { name: "查找牌局", exact: true }).click();
    await dialog.getByLabel("牌局 ID", { exact: true }).fill("missing-1");
    await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("未找到");
    await expect(dialog.locator(".replay-player")).toHaveCount(0);
    await dialog.getByLabel("牌局 ID", { exact: true }).fill("legacy-1");
    await dialog.getByRole("button", { name: "查看回放", exact: true }).click();
    await expect(dialog.locator(".replay-legacy")).toContainText(
      "没有历史出牌过程",
    );
    await expect(dialog.getByRole("button", { name: "播放回放" })).toHaveCount(
      0,
    );
  });
}

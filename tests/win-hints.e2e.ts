import { test, expect } from "./browser-fixtures";
for (const width of [568, 844, 1280])
  test(`长条听牌面板：全部听口与汇总、可胡状态且没有照直入口 ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width,
      height: width === 568 ? 320 : width === 844 ? 390 : 590,
    });
    await page.goto("/");
    await page.evaluate(async () => {
      const React = (
        await import("/node_modules/.vite/deps/react.js" as string)
      ).default;
      const { createRoot } = (
        await import("/node_modules/.vite/deps/react-dom_client.js" as string)
      ).default;
      const { WinHintPanel } = await import("/src/WinHintPanel.tsx" as string);
      const host = document.createElement("div");
      host.className = "app classic polished";
      host.style.cssText =
        "position:fixed;inset:0;z-index:9999;background:#123e34";
      document.body.append(host);
      const root = createRoot(host),
        commands: any[] = [];
      const state: any = {
        key: "hint-qa",
        phase: "playing",
        turn: 0,
        connected: true,
        disabled: false,
        selected: 8,
        hintDiscard: 8,
        hintKinds: Array.from({ length: 31 }, (_, i) => i),
        hintUnseen: Object.fromEntries(
          Array.from({ length: 31 }, (_, i) => [i, i % 5]),
        ),
        actions: [],
        zhaozhiAvailable: true,
      };
      (window as any).__hintQA = {
        commands,
        state,
        render: () =>
          root.render(
            React.createElement(WinHintPanel, {
              state: { ...state },
              onCommand: (c: any) => commands.push(c),
            }),
          ),
      };
      (window as any).__hintQA.render();
    });
    const panel = page.getByRole("region", { name: "胡牌提示" });
    await expect(panel).toContainText("打出后可听");
    await expect(panel.getByRole("listitem")).toHaveCount(31);
    await expect(panel.getByLabel("听牌汇总")).toContainText("31种 · 余60张");
    expect(
      await panel
        .locator(".winning-tile-list")
        .evaluate((e) => e.scrollWidth > e.clientWidth + 1),
    ).toBe(false);
    for(const item of await panel.getByRole("listitem").all()) await expect(item).toBeInViewport();
    await expect(panel.getByRole("button")).toHaveCount(0);
    const box = (await panel.boundingBox())!;
    expect(box.x + box.width).toBeLessThan(width);
    await expect(panel.getByRole("listitem").last()).toBeInViewport();
    await expect(page.getByRole("button", { name: "报照直", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__hintQA.commands)).toEqual([]);
    await page.evaluate(() => {
      const q = (window as any).__hintQA;
      q.state.hintKinds = [0];
      q.state.hintUnseen = { 0: 0 };
      q.render();
    });
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("listitem")).toHaveAttribute("aria-label", "一万，未见0张");
    await expect(panel).toContainText("1 种听口 · 合计未见0张 · 未见数含他人暗手");
    await expect(panel.getByRole("listitem")).toBeInViewport();
    await page.evaluate(() => {
      const q = (window as any).__hintQA;
      q.state.hintKinds = [];
      q.render();
    });
    await expect(panel).toHaveCount(0);
    await page.evaluate(() => {
      const q = (window as any).__hintQA;
      q.state.actions = [{ id: "hu", label: "胡" }];
      q.state.pending = { tile: 0 };
      q.render();
    });
    await expect(panel).toContainText("现在可以胡牌");
    await expect(panel.getByRole("listitem")).toHaveCount(0);
    await page.evaluate(() => {
      const q = (window as any).__hintQA;
      q.state.phase = "ended";
      q.render();
    });
    await expect(panel).toHaveCount(0);
  });

import { test, expect } from "./browser-fixtures";

test("大厅不请求战绩与回放模块，战绩加载中可返回", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", r => { if (/\/(RecordsPanel|ReplayPanel|ClubManagement|TablePermissions)\.tsx/.test(r.url())) requested.push(r.url()); });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/src/RecordsPanel.tsx*", async route => { await held; await route.continue(); });
  await page.goto("/");
  const open = page.getByRole("button", { name: "战绩", exact: true });
  await expect(open).toBeVisible();
  expect(requested).toHaveLength(0);
  await open.click();
  await expect(page.getByRole("status").filter({ hasText: "正在加载战绩" })).toBeVisible();
  await page.locator(".feature-loading").getByRole("button", { name: "返回", exact: true }).click();
  await expect(page.getByRole("button", { name: "战绩", exact: true })).toBeVisible();
  release();
  await open.click();
  await expect(page.locator(".records-workspace")).toBeVisible();
  expect(requested.some(url => /ReplayPanel/.test(url))).toBe(false);
});

test("功能模块断网显示返回与刷新，不让整页变空白", async ({ page }) => {
  await page.route("**/src/RecordsPanel.tsx*", route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "战绩", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "战绩未能打开" })).toBeVisible();
  await expect(page.locator(".feature-loading").getByRole("button", { name: "刷新页面" })).toBeVisible();
  await page.locator(".feature-loading").getByRole("button", { name: "返回", exact: true }).click();
  await expect(page.getByRole("button", { name: "战绩", exact: true })).toBeVisible();
});

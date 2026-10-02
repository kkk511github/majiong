import { test, expect, type Page } from './browser-fixtures';
import { replayedRound } from './fixtures/replayed-round';

const dialogFor = (page: Page) => page.getByRole('dialog', { name: '牌局回放', exact: true });
const tableFrame = (page: Page) => page.frames().find(frame => frame.url().includes('/cocos-table/index.html'))!;

test('真实Cocos回放首帧绘制后才开放播放，图形恢复后保持原进度', async ({ page }, info) => {
  const replay = replayedRound().replay!;
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/api/replays/**', route => route.fulfill({ json: replay }));
  await page.goto('/');
  await page.getByRole('button', { name: '战绩', exact: true }).click();
  await page.getByRole('button', { name: '牌局回放', exact: true }).click();
  const dialog = dialogFor(page);
  await dialog.getByLabel('牌局 ID', { exact: true }).fill(replay.id);
  await dialog.getByRole('button', { name: '查看回放', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '播放回放', exact: true })).toBeEnabled({ timeout: 25000 });
  const rendered = () => tableFrame(page).evaluate(async () => {
    const cc = await (window as any).System.import('cc');
    const scene = cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    return { presented: scene.replayPresented, key: scene.motionSnapshot?.key,
      revision: scene.motionSnapshot?.revision, style: scene.state?.tableStyle,
      tiles: scene.nodes.size };
  });
  expect(await rendered()).toMatchObject({ presented: true, key: replay.id, revision: 0, style: 'reference-3d' });
  expect((await rendered()).tiles).toBeGreaterThan(0);
  await expect(dialog.locator('.cocos-loading')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('replay-first-frame.png') });
  await dialog.getByRole('button', { name: '下一步', exact: true }).click();
  await expect.poll(async () => (await rendered()).revision).toBe(1);
  const oldChannel = await dialog.locator('iframe').getAttribute('src');
  await tableFrame(page).evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(dialog.locator('iframe')).not.toHaveAttribute('src', oldChannel!);
  await expect(dialog.getByRole('button', { name: '播放回放', exact: true })).toBeEnabled({ timeout: 25000 });
  await expect(dialog.getByLabel('回放进度')).toHaveValue('1');
  expect(await rendered()).toMatchObject({ presented: true, key: replay.id, revision: 1 });
});

async function setupReplay(page: Page) {
  const replay = replayedRound().replay!;
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/api/replays/**', route => route.fulfill({ json: { ...replay, id: route.request().url().split('/').pop() } }));
  // Model a slow GPU independently of completed resource loading. A green
  // default canvas must remain covered until the requested snapshot is painted.
  await page.route('**/cocos-table/index.html?*', route => {
    const channel = new URL(route.request().url()).searchParams.get('channel');
    return route.fulfill({ contentType: 'text/html', body: `<html><body style="margin:0;background:green"><canvas></canvas><script>
      const channel=${JSON.stringify(channel)};
      const emit=(type,extra={})=>parent.postMessage({scope:'jinling-table-v1',channel,type,...extra},location.origin);
      window.fixture={emit,state:null,paint(extra={}){const s=this.state;emit('frame-presented',{key:s.key,round:s.round,revision:s.revision,me:s.me,...extra});}};
      addEventListener('message',e=>{if(e.source===parent&&e.data.channel===channel&&e.data.type==='state')window.fixture.state=e.data.state;});
      emit('ready');
    </script></body></html>` });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '战绩', exact: true }).click();
  await page.getByRole('button', { name: '牌局回放', exact: true }).click();
  const dialog = dialogFor(page);
  await dialog.getByLabel('牌局 ID', { exact: true }).fill(replay.id);
  await dialog.getByRole('button', { name: '查看回放', exact: true }).click();
  await expect(dialog.locator('.cocos-loading')).toBeVisible();
  await expect.poll(() => tableFrame(page)?.evaluate(() => (window as any).fixture?.state?.revision)).toBe(0);
  return dialog;
}

test('回放资源就绪不等于首帧完成：等待绘制、拒绝旧确认、换局重新等待', async ({ page }) => {
  const dialog = await setupReplay(page);
  const play = dialog.getByRole('button', { name: '播放回放', exact: true });
  await expect(play).toBeDisabled();
  await expect(dialog.getByLabel('回放进度')).toHaveValue('0');
  await expect(dialog.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
  expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(8, 47, 69)');
  expect(await dialog.locator('.modal-body').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(8, 47, 69)');
  await tableFrame(page).evaluate(() => (window as any).fixture.paint({ key: 'old-replay' }));
  await page.waitForTimeout(700);
  await expect(play).toBeDisabled();
  await expect(dialog.getByLabel('回放进度')).toHaveValue('0');
  await tableFrame(page).evaluate(() => (window as any).fixture.paint({ channel: 'old-channel' }));
  await expect(play).toBeDisabled();
  await tableFrame(page).evaluate(() => (window as any).fixture.paint());
  await expect(play).toBeEnabled();
  await expect(dialog.locator('.cocos-loading')).toHaveCount(0);
  await dialog.getByLabel('回放速度').selectOption('4');
  await play.click();
  await expect.poll(() => dialog.getByLabel('回放进度').inputValue()).not.toBe('0');

  await dialog.getByRole('button', { name: '查找牌局', exact: true }).click();
  await dialog.getByLabel('牌局 ID', { exact: true }).fill('second-replay');
  await dialog.getByRole('button', { name: '查看回放', exact: true }).click();
  await expect(play).toBeDisabled();
  await expect(dialog.getByLabel('回放进度')).toHaveValue('0');
  await expect.poll(() => tableFrame(page)?.evaluate(() => (window as any).fixture?.state?.key)).toBe('second-replay');
  await tableFrame(page).evaluate(() => (window as any).fixture.paint());
  await expect(play).toBeEnabled();
});

test('回放画面失败时停止推进，重新加载首帧后从原位置继续', async ({ page }) => {
  const dialog = await setupReplay(page);
  await tableFrame(page).evaluate(() => (window as any).fixture.paint());
  await dialog.getByLabel('回放速度').selectOption('4');
  await dialog.getByRole('button', { name: '播放回放', exact: true }).click();
  await expect.poll(() => dialog.getByLabel('回放进度').inputValue()).not.toBe('0');
  await tableFrame(page).evaluate(() => (window as any).fixture.emit('error'));
  await expect(dialog.getByText('牌桌资源加载失败', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '暂停回放', exact: true })).toBeDisabled();
  const step = await dialog.getByLabel('回放进度').inputValue();
  await page.waitForTimeout(900);
  await expect(dialog.getByLabel('回放进度')).toHaveValue(step);
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click();
  // Reload replaces the iframe's execution context; poll the new frame rather
  // than treating that expected navigation as a replay failure.
  await expect.poll(() => tableFrame(page)?.evaluate(() => (window as any).fixture?.state?.revision).catch(() => undefined)).toBe(Number(step));
  await page.waitForTimeout(700);
  await expect(dialog.getByLabel('回放进度')).toHaveValue(step);
  await tableFrame(page).evaluate(() => (window as any).fixture.paint());
  await expect(dialog.locator('.cocos-loading')).toHaveCount(0);
  await expect.poll(() => dialog.getByLabel('回放进度').inputValue()).not.toBe(step);
});

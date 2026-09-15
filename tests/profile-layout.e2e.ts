import { test, expect } from '@playwright/test';
import { browserAccount } from './browser-fixtures';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

for (const [width,height] of [[568,320],[844,390],[1280,590]]) {
  test(`我的页面横屏 ${width}：完整显示、整行按钮可点`, async ({page,context,browserName})=>{
    await browserAccount(context,'金陵牌友');
    await page.setViewportSize({width,height});
    let left=0,bottom=0;
    if(browserName==='chromium' && width===844){left=59;bottom=21;const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{left,right:0,top:0,bottom}});}
    await page.goto('/');await page.getByRole('button',{name:'我的',exact:true}).click();
    await expect(page.getByRole('heading',{name:'我的',exact:true})).toBeVisible();
    const panel=page.locator('.profile-workspace'),nav=await page.getByRole('navigation',{name:'主导航'}).boundingBox();
    const bounds=await panel.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(left);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(nav!.y+1);
    const controls=await panel.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.hasAttribute('disabled')).map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,inside:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),width:r.width,height:r.height};}));
    expect(controls.every(c=>c.inside&&c.hit)).toBe(true);
    for(const title of ['更换头像','修改昵称','退出登录','声音设置','账号安全','帮助与反馈','用户协议与隐私','战队与会员','开桌授权']) {
      const b=await panel.getByRole('button',{name:title,exact:true}).boundingBox();expect(b!.height).toBeGreaterThanOrEqual(44);expect(b!.y+b!.height).toBeLessThanOrEqual(nav!.y);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/screenshots/profile-new-${width}-${test.info().project.name}.png`});
  });
}
test('普通会员不显示管理入口，长昵称和账号不挤出名片',async({page,context})=>{
  const a=await browserAccount(context,'南京牌友名字一共十二个字');
  const db=new DatabaseSync(resolve('../../work/accounts-e2e.sqlite'));db.prepare("UPDATE accounts SET role='member' WHERE id=?").run(a.account.id);db.close();
  await page.setViewportSize({width:844,height:390});await page.goto('/');await page.getByRole('button',{name:'我的',exact:true}).click();
  await expect(page.getByLabel('管理入口',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'战队与会员',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'开桌授权',exact:true})).toHaveCount(0);
  const authorization=await context.request.get('/api/admin/table-permissions',{headers:{Authorization:`Bearer ${a.token}`}});
  expect(authorization.status()).toBe(403);
  expect(await page.locator('.profile-personal').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.screenshot({path:`test-results/screenshots/profile-member-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'修改昵称',exact:true}).click();
  await page.getByLabel('牌桌昵称',{exact:false}).fill('金陵牌友');
  await page.getByRole('button',{name:'保存昵称',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'我的',exact:true}).click();
  await page.screenshot({path:`test-results/screenshots/profile-member-preview-${test.info().project.name}.png`});
  await page.getByRole('button',{name:'牌桌',exact:true}).click();
  await expect(page.getByRole('button',{name:/开桌/})).toHaveCount(0);
});
test('修改昵称、声音持久化、密码入口、反馈、管理和退出均可操作',async({page,context})=>{
  await browserAccount(context,'金陵牌友');await page.setViewportSize({width:844,height:390});await page.goto('/');await page.getByRole('button',{name:'我的',exact:true}).click();
  await page.getByRole('button',{name:'修改昵称',exact:true}).click();
  await page.getByLabel('牌桌昵称',{exact:false}).fill('新的牌友');await page.getByRole('button',{name:'保存昵称',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'新的牌友',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'声音设置',exact:true}).click();
  await page.getByRole('button',{name:'南京女声',exact:true}).click();await page.getByRole('slider',{name:'背景音乐音量',exact:true}).fill('55');
  await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByText('女声报牌 · 音乐与音效')).toBeVisible();
  await page.getByRole('button',{name:'账号安全',exact:true}).click();await expect(page.getByRole('dialog',{name:'修改密码',exact:true})).toBeVisible();await expect(page.getByLabel('新密码',{exact:true})).toHaveAttribute('minlength','4');await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'帮助与反馈',exact:true}).click();
  await page.getByLabel('问题或建议',{exact:false}).fill('本地自动验收：个人页面反馈');
  const sent=page.waitForResponse(r=>r.url().endsWith('/api/feedback')&&r.request().method()==='POST');await page.getByRole('button',{name:'提交反馈',exact:true}).click();expect((await sent).status()).toBe(200);await expect(page.getByRole('dialog')).toHaveCount(0);
  for(const title of ['战队与会员','开桌授权']){await page.getByRole('button',{name:title,exact:true}).click();await expect(page.getByRole('dialog',{name:title,exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();}
  await page.getByRole('button',{name:'用户协议与隐私',exact:true}).click();await expect(page.getByRole('dialog',{name:'用户协议与隐私说明'})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload();await page.getByRole('button',{name:'我的',exact:true}).click();await expect(page.getByRole('heading',{name:'新的牌友',exact:true})).toBeVisible();await expect(page.getByText('女声报牌 · 音乐与音效')).toBeVisible();
  await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'退出登录',exact:true}).click();await expect(page.getByRole('button',{name:'登录，开始相聚',exact:true})).toBeVisible();
});

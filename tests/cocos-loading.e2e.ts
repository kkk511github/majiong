import {test,expect} from './browser-fixtures';
for(const failure of ['timeout','resources'] as const)test(`牌桌${failure}分类与重试保留同一局`,async({page})=>{
 let first=true;
 await page.route('**/cocos-table/index.html?*',async route=>{
  if(!first)return route.continue();first=false;
  const channel=new URL(route.request().url()).searchParams.get('channel');
  await route.fulfill({contentType:'text/html',body:failure==='timeout'?'<html><body>loading</body></html>':`<html><script>parent.postMessage({scope:'jinling-table-v1',channel:${JSON.stringify(channel)},type:'error'},location.origin)</script></html>`});
 });
 await page.goto('/');
 const game=await page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);client.practice('加载回归',{turnSeconds:0});return client.state.view!.id;});
 const frame=page.locator('#cocos-table-board iframe');await expect(frame).toBeVisible();
 const oldUrl=await frame.getAttribute('src');
 if(failure==='timeout')await expect(page.getByText('牌桌加载超时',{exact:true})).toBeVisible({timeout:25000});
 else await expect(page.getByText('牌桌资源加载失败',{exact:true})).toBeVisible();
 await expect(page.getByText('可以重新加载牌桌，当前对局进度会保留。',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'重新加载',exact:true}).click();
 await expect(frame).not.toHaveAttribute('src',oldUrl!);
 await expect(page.getByRole('navigation',{name:'牌桌工具'})).toBeVisible({timeout:20000});
 expect(await page.evaluate(async()=>{const {client}=await import('/src/game-client.ts' as string);return client.state.view!.id;})).toBe(game);
});

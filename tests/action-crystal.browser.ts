import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const out='output/qa/action-crystal-v3';mkdirSync(out,{recursive:true});
test('crowded table keeps all four legal actions clear of its win hint',async({page},info)=>{
 await page.goto('/?actionStudio=1');await page.getByRole('button',{name:'满牌场景',exact:true}).click();
 const row=page.getByRole('group',{name:'碰杠胡操作'});await expect(row.getByRole('button')).toHaveCount(4);
 await expect(page.locator('footer output')).toContainText('65张弃牌');
 await expect.poll(()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
 await expect.poll(async()=>{const a=await row.boundingBox(),h=await page.locator('.win-hint-panel').boundingBox();return a&&h?Math.max(a.y-h.y-h.height,a.x-h.x-h.width):-1;}).toBeGreaterThanOrEqual(11.5);
 await page.screenshot({path:`${out}/${info.project.name}-crowded.png`});
});
test('crystal fire and blue effects animate independently and stop in inactive/reduced states',async({page},info)=>{
 await page.goto('/?actionStudio=1');
 const row=page.getByRole('group',{name:'碰杠胡操作'});
 await expect(row.getByRole('button')).toHaveCount(4);
 await expect.poll(()=>row.locator('img.jade-plate').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth===256))).toBe(true);
 const flame=row.locator('.fire-flow-a'),arc=row.locator('.jade-pung .blue-orbit-a');
 await expect.poll(()=>flame.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBe(256);
 await expect(row.locator('.crystal-flame')).toHaveCount(0);
 expect(await flame.evaluate(el=>getComputedStyle(el).animationName)).toBe('crystal-fire-flow');
 expect(await arc.evaluate(el=>getComputedStyle(el).animationName)).toBe('crystal-blue');
 const phase=await arc.evaluate(el=>getComputedStyle(el).strokeDashoffset);
 await page.waitForTimeout(250);
 expect(await arc.evaluate(el=>getComputedStyle(el).strokeDashoffset)).not.toBe(phase);
 expect(await row.locator('.jade-kong .blue-orbit-a').evaluate(el=>getComputedStyle(el).animationDuration)).not.toBe(await arc.evaluate(el=>getComputedStyle(el).animationDuration));
 expect(await row.locator('.jade-pass .crystal-sheen').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('crystal-sheen');
 for(const [width,height] of [[1280,590],[844,390],[568,320]]){
  await page.setViewportSize({width,height});
  // ResizeObserver applies the new canvas anchor in the next React commit.
  await expect.poll(()=>row.getByRole('button').evaluateAll(els=>Math.max(...els.map(el=>el.getBoundingClientRect().right)))).toBeLessThanOrEqual(width);
  const boxes=await row.getByRole('button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(let i=0;i<boxes.length;i++){const b=boxes[i];expect(b.w).toBeGreaterThanOrEqual(44);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(width);if(i)expect(b.x-boxes[i-1].x-boxes[i-1].w).toBeGreaterThanOrEqual(5.9);}
  await page.screenshot({path:`${out}/${info.project.name}-${width}.png`});
 }
 await page.setViewportSize({width:1280,height:590});
 await row.screenshot({path:`${out}/${info.project.name}-buttons.png`});
 await page.getByRole('button',{name:'切换禁用',exact:true}).click();
 await expect(row.locator('.crystal-aura-hu')).toBeHidden();
 await page.getByRole('button',{name:'切换禁用',exact:true}).click();
 await page.getByRole('checkbox',{name:'简化特效',exact:true}).check();
 await expect(row.locator('.crystal-aura-hu')).toBeHidden();
 await page.getByRole('checkbox',{name:'简化特效',exact:true}).uncheck();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(row.locator('.crystal-aura-hu')).toBeHidden();
 expect(await row.locator('.jade-pass .crystal-sheen').evaluate(el=>getComputedStyle(el,'::before').animationName)).toBe('none');
});
test('win hint tracks action position after narrow and letterboxed viewport changes',async({page},info)=>{
 await page.goto('/?actionStudio=1');
 const row=page.getByRole('group',{name:'碰杠胡操作'}),hint=page.getByRole('region',{name:'胡牌提示'});
 await expect(row.getByRole('button')).toHaveCount(4);
 // Equal-width resize moves the row without resizing it: reproduces the
 // ResizeObserver-only bug. Also exercise small landscape and portrait host.
 for(const [width,height] of [[1280,590],[618,798],[618,650],[656,820],[568,320],[844,390],[1280,590]]){
  await page.setViewportSize({width,height});
  await expect.poll(async()=>{const a=await row.boundingBox(),h=await hint.boundingBox();if(!a||!h)return -1;return Math.max(a.y-(h.y+h.height),a.x-(h.x+h.width),h.x-(a.x+a.width));}).toBeGreaterThanOrEqual(11.5);
  for(const b of await row.getByRole('button').all())expect(await b.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  await page.screenshot({path:`${out}/${info.project.name}-hint-gap-${width}x${height}.png`});
 }
});

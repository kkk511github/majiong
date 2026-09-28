import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const out='output/qa/action-reference-controls';mkdirSync(out,{recursive:true});
test('held main choice keeps its slot and rejects release after available actions change',async({page})=>{
 await page.goto('/?actionStudio=1&crowded=1&tableOnly=1&choice=all');
 const row=page.getByRole('group',{name:'碰杠胡操作'}),hu=row.getByRole('button',{name:'胡',exact:true});await expect(hu).toBeEnabled();
 const original=(await hu.boundingBox())!;await page.mouse.move(original.x+original.width/2,original.y+original.height/2);await page.mouse.down();
 await expect(hu).toHaveAttribute('data-state','pressed');
 await page.getByLabel('满牌布局',{exact:true}).selectOption('hu-pung');
 await expect(row.getByRole('button',{name:'杠',exact:true})).toHaveCount(0);
 const held=(await hu.boundingBox())!;expect(held.x).toBeCloseTo(original.x,1);expect(held.y).toBeCloseTo(original.y,1);expect(held.width).toBe(original.width);
 await page.mouse.up();await expect(row.locator('[data-state="pending"]')).toHaveCount(0);
 const frame=page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
 await expect.poll(()=>frame.evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.phase;})).toBe('claiming');
});
test('single and combined legal controls on crowded full-height tables',async({page},info)=>{
 test.setTimeout(120000); // Sixteen independent scene loads per browser.
 for(const [width,height] of [[1280,590],[844,390]])for(const choice of ['hu','hu-claim','pung','kong','all','hu-pung','kong-pung','multi-kong']){
  await page.setViewportSize({width,height});await page.goto(`/?actionStudio=1&crowded=1&tableOnly=1&choice=${choice}`);
  const buttons=page.getByRole('group',{name:'碰杠胡操作'}),names=choice==='hu'?['胡']:choice==='hu-claim'?['胡','过']:choice==='pung'?['碰','过']:choice==='kong'?['杠 一万']:choice==='hu-pung'?['胡','碰','过']:choice==='kong-pung'?['杠','碰','过']:choice==='multi-kong'?['胡','杠 一万','杠 二万','杠 三万']:['胡','杠','碰','过'];
  await expect(buttons.getByRole('button')).toHaveCount(names.length);
  const frame=page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
  await expect.poll(()=>frame.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
  const box=(await buttons.boundingBox())!,main=await buttons.locator('.jade-action:not(.jade-pass)').last().boundingBox();
  expect(main!.x+main!.width/2).toBeLessThanOrEqual(width*(choice==='multi-kong'?.80:.73));expect(main!.x+main!.width/2).toBeGreaterThan(width*.50);
  if(names.includes('过')){const pass=(await buttons.getByRole('button',{name:'过',exact:true}).boundingBox())!;expect(pass.width).toBeLessThan(main!.width);expect(pass.x-main!.x-main!.width).toBeGreaterThanOrEqual(11.9);expect(pass.x-main!.x-main!.width).toBeLessThanOrEqual(22.1);}
  for(const b of await buttons.getByRole('button').all())expect(await b.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  const tileRects=await frame.evaluate(()=> (window as any).__JINLING_TABLE_LAYOUT__.filter((t:any)=>['hand','flower','river','meld'].includes(t.area)).map((t:any)=>({id:t.id,x:t.x-t.w/2,y:t.y-t.h/2,w:t.w,h:t.h})));
  const fb=(await page.locator('iframe').boundingBox())!,k=Math.min(fb.width/1280,fb.height/590),ox=fb.x+(fb.width-k*1280)/2,oy=fb.y+(fb.height-k*590)/2;
  const obstacles=tileRects.map((t:any)=>({...t,x:ox+t.x*k,y:oy+t.y*k,w:t.w*k,h:t.h*k}));
  const covers=(a:any,b:any)=>Math.min(a.x+a.width,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.h)-Math.max(a.y,b.y)>1;
  const boxes=await Promise.all((await buttons.getByRole('button').all()).map(b=>b.boundingBox()));
  const overlaps=obstacles.filter((t:any)=>boxes.some(b=>covers(b!,t))).map((t:any)=>t.id);
  expect(overlaps,JSON.stringify({choice,width,box,covered:obstacles.filter((t:any)=>covers(box,t))})).toEqual([]);
  if(names.includes('胡')){
   const h=(await page.getByRole('region',{name:'胡牌提示'}).boundingBox())!;
   expect(obstacles.filter((t:any)=>covers(h,t)).map((t:any)=>t.id),'hu hint covers cards').toEqual([]);
  }
  await page.screenshot({path:`${out}/${info.project.name}-${width}-${choice}.png`});
 }
});

import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const out='output/qa/action-jade-v2';mkdirSync(out,{recursive:true});
const frame=(p:Page)=>p.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
test('all seven debit reasons identify their payer, preserve confirmed values and avoid action stamps',async({page},info)=>{
 await page.goto('/?actionStudio=1');await expect.poll(()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
 for(const [kind,label,amounts]of [['concealed','暗杠',[5,5,5]],['open','明杠',[10]],['added','补杠',[10]],['flower','花杠',[10,10,10]],['winds','四连风',[5,5,5]],['fourSame','四张同牌',[15]],['fourFollow','四家同牌',[15]]] as const){
  await page.getByLabel('罚分类型',{exact:true}).selectOption(kind);await page.getByRole('button',{name:'显示扣分',exact:true}).click();
  if(['concealed','open','added'].includes(kind)){
   await expect.poll(()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...c.actionFx.slots.values()].some((s:any)=>s.root.active&&s.kind==='kong');}),{intervals:[30,50,80]}).toBe(true);
   await expect(page.locator('.score-debit')).toHaveCount(0);await page.waitForTimeout(650);await expect(page.locator('.score-debit')).toHaveCount(0);
   await page.screenshot({path:`${out}/${info.project.name}-before-debit-${kind}.png`});
  }
  const badges=page.locator('.score-debit-anchor');await expect(badges).toHaveCount(amounts.length);expect(await badges.locator('strong').allTextContents()).toEqual(amounts.map(a=>'−'+a));
  for(const b of await badges.all()){await expect(b).toHaveAttribute('data-reason',label);await expect(b.locator('.score-debit-player')).not.toBeEmpty();expect(await b.evaluate(e=>getComputedStyle(e).pointerEvents)).toBe('none');const skin=await b.locator('.score-debit').evaluate(e=>({background:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderTopWidth,shadow:getComputedStyle(e).boxShadow,plate:getComputedStyle(e,'::before').content}));expect(skin).toEqual({background:'rgba(0, 0, 0, 0)',border:'0px',shadow:'none',plate:'none'});}
  await page.waitForTimeout(260);await page.screenshot({path:`${out}/${info.project.name}-debit-${kind}.png`});
  const cardBoxes=await badges.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
  const canvas=(await page.locator('#cocos-table-board iframe').boundingBox())!,scale=Math.min(canvas.width/1280,canvas.height/590),left=canvas.x+(canvas.width-1280*scale)/2,top=canvas.y+(canvas.height-590*scale)/2;
  const fx=await frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return [...c.actionFx.slots.values()].filter((s:any)=>s.root.active).map((s:any)=>s.rect);});
  if(['concealed','open','added'].includes(kind))expect(fx).toHaveLength(0);
  for(const b of cardBoxes)for(const f of fx){const x=left+(f.x-f.w/2)*scale,y=top+(f.y-f.h/2)*scale;expect(b.x+b.w<=x||b.x>=x+f.w*scale||b.y+b.h<=y||b.y>=y+f.h*scale).toBe(true);}
 }
 await page.getByLabel('罚分类型',{exact:true}).selectOption('capped');await page.getByRole('checkbox',{name:'比下胡×2'}).check();await page.getByRole('button',{name:'显示扣分',exact:true}).click();await expect(page.locator('.score-debit strong')).toHaveText(['−3','−7','−10']);
 await page.getByRole('button',{name:'重复事件',exact:true}).click();await expect(page.locator('.score-debit')).toHaveCount(3);await page.getByRole('button',{name:'断线重连',exact:true}).click();await expect(page.locator('.score-debit')).toHaveCount(0);await expect(page.locator('footer output')).toContainText('重连恢复');await expect(page.locator('.score-debit')).toHaveCount(0);
});
test('penalty receipts remain assigned through all four viewing seats and x2',async({page},info)=>{
 await page.setViewportSize({width:844,height:390});await page.goto('/?actionStudio=1');await expect.poll(()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
 for(const me of [0,1,2,3]){await page.getByLabel('观看座位',{exact:true}).selectOption(String(me));await page.getByLabel('罚分类型',{exact:true}).selectOption('fourSame');await page.getByRole('checkbox',{name:'比下胡×2'}).check();await page.getByRole('button',{name:'显示扣分',exact:true}).click();const badge=page.locator('.score-debit-anchor');await expect(badge).toHaveCount(1);await expect(badge).toHaveAttribute('data-seat','0');await expect(badge).toHaveAttribute('data-relative-seat',String((4-me)%4));await expect(badge.locator('strong')).toHaveText('−30');await page.screenshot({path:`${out}/${info.project.name}-penalty-perspective-${me}.png`});}
});
test('missing renderer completion cannot hold confirmed debit data indefinitely',async({page})=>{
 await page.addInitScript(()=>{if(window===window.top)window.addEventListener('message',e=>{if(e.data?.type==='action-complete')e.stopImmediatePropagation();},true);});
 await page.goto('/?actionStudio=1');await expect.poll(()=>frame(page)?.evaluate(()=>!!(window as any).__JINLING_TABLE_READY__)).toBe(true);
 await page.getByRole('button',{name:'显示扣分',exact:true}).click();
 await expect.poll(()=>frame(page).evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return c.state.players.find((p:any)=>p.seat===1)?.score;})).toBe(85);
 await expect(page.locator('.score-debit')).toHaveCount(0);
 await expect(page.locator('.score-debit')).toHaveCount(3,{timeout:4000});
 await expect(page.locator('.score-debit strong')).toHaveText(['−5','−5','−5']);
});

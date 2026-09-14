import {expect,test,type Page} from './browser-fixtures';
import {mkdirSync} from 'node:fs';
const captures='test-results/screenshots';
test.beforeAll(()=>mkdirSync(captures,{recursive:true}));
import late from './fixtures/late-table.json' with {type:'json'};
const width=844,height=390,insets={left:59,right:59,top:0,bottom:21};
async function safeArea(page:Page, size={width,height,insets}){
  await page.setViewportSize(size);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:size.insets});
}
async function unsafe(page:Page,selector:string,area=insets){
 return page.locator(selector).evaluateAll((els,safe)=>els.flatMap(el=>{
  const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left<safe.left||r.right>innerWidth-safe.right||r.top<safe.top||r.bottom>innerHeight-safe.bottom)?[{name:el.getAttribute('aria-label')||el.textContent?.slice(0,30),x:r.x,y:r.y,w:r.width,h:r.height}]:[];
 }),area);
}
test('刘海与 Home 指示条：个人页、战绩、规则和导航保留完整安全区',async({page})=>{
 await safeArea(page);await page.goto('/');
 expect(await unsafe(page,'.bottom-nav button')).toEqual([]);
 expect(await page.locator('.bottom-nav button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44))).toBe(true);
 for(const name of ['我的','战绩','玩法']){
  await page.getByRole('navigation').getByRole('button',{name,exact:true}).click();
  expect(await unsafe(page,'.page-heading,.profile-layout,.stats,.rules-content')).toEqual([]);
  await page.screenshot({path:`${captures}/safe-area-${name}-844.png`});
  expect(await page.evaluate(()=>scrollY)).toBe(0);
 }
});
for(const [width,height,edge] of [[844,390,59],[874,402,62],[932,430,62]]) test(`横屏牌桌 ${width}：菜单和托管可触摸，安全区内牌池与头像互不遮挡`,async({page})=>{
 const area={...insets,left:edge,right:edge};
 await safeArea(page,{width,height,insets:area});
 await page.addInitScript(g=>localStorage.setItem('jinling:practice',JSON.stringify(g)),late);
 await page.goto('/');await page.getByRole('button',{name:/继续打/}).click();
 const controls=page.locator('.game-topbar button,.my-info button');
 const small=await controls.evaluateAll(els=>els.flatMap(el=>{const r=el.getBoundingClientRect();return r.width<44||r.height<44?[{name:el.getAttribute('aria-label')||el.textContent,w:r.width,h:r.height}]:[]}));
 expect(small).toEqual([]);
 expect(await unsafe(page,'.game-topbar button,.my-info button,.hand > .tile',area)).toEqual([]);
 const obscured=await page.locator('.discard-field .tile,.opponent-info strong').evaluateAll(els=>els.flatMap(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el.contains(hit)?[]:[{name:el.getAttribute('aria-label')||el.textContent,by:hit?.className}];}));
 expect(obscured).toEqual([]);
 await page.screenshot({path:`${captures}/safe-area-table-${width}.png`});
 await page.getByRole('button',{name:'查看公开牌',exact:true}).click({position:{x:2,y:22}});
 expect(await unsafe(page,'.modal',area)).toEqual([]);
 await page.screenshot({path:`${captures}/safe-area-public-${width}.png`});
 await page.getByRole('button',{name:'关闭',exact:true}).click();
});

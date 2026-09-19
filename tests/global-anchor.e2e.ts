import {test,expect,type Page} from '@playwright/test';
const url='/tests/previews/global-anchor.html';
const frame=(page:Page)=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'));
async function yellow(page:Page){return frame(page)?.evaluate(async()=>{
 const cc=await (window as any).System.import('cc'),c=cc.director.getScene()?.getChildByName('Canvas')?.getComponent('TableScene');
 if(!c)return [];
 return ((window as any).__JINLING_TABLE_LAYOUT__??[]).filter((t:any)=>t.globalAnchor).map((t:any)=>({tile:t.tile,seat:t.seat,color:c.nodes.get(t.id).getComponent(cc.Sprite).color.toHEX('#rrggbb')}));
});}
async function ready(page:Page){await page.goto(url);await expect(page.locator('iframe')).toBeVisible();await expect(page.locator('.cocos-loading')).toHaveCount(0,{timeout:30000});}
async function establish(page:Page){await page.getByRole('button',{name:'碰第四嘴 · 1筒',exact:true}).click();await expect.poll(()=>yellow(page)).toEqual([]);await page.getByRole('button',{name:'打出6条',exact:true}).click();await expect.poll(()=>yellow(page)).toEqual([{tile:92,seat:0,color:'ffe16a'}]);}

test('原例实盘：黄色精确到物理牌，四个视角一致；打风险牌不能胡就不扣分',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await establish(page);
 for(const seat of ['甲','乙','丙','丁']){await expect.poll(()=>yellow(page)).toEqual([{tile:92,seat:0,color:'ffe16a'}]);await page.getByRole('button',{name:seat+'的视角',exact:true}).click();}
 await page.screenshot({path:'output/global-anchor-original-'+info.project.name+'.png',fullPage:true});
 await page.getByRole('button',{name:'乙打出五条',exact:true}).click();await expect(page.locator('.anchor-explanation')).toContainText('甲不能胡这张牌');await expect(page.locator('.anchor-bill strong')).toHaveText('0 分');
 await page.getByRole('button',{name:'换一张牌再试',exact:true}).click();await page.getByRole('button',{name:'乙选择五万',exact:true}).click();await page.getByRole('button',{name:'乙打出五万',exact:true}).click();await page.getByRole('button',{name:'甲选择胡牌',exact:true}).click();await expect(page.locator('.anchor-bill')).toContainText('普通胡牌');expect(errors).toEqual([]);
});
test('实际外包：必须选择胡牌，普通50、比下胡100；过不扣分',async({page},info)=>{
 await ready(page);await page.getByRole('button',{name:/实收：打6条/}).click();await establish(page);await page.getByRole('button',{name:'乙打出五条',exact:true}).click();await expect(page.locator('.anchor-bill strong')).toHaveText('0 分');await page.getByRole('button',{name:'甲选择过',exact:true}).click();await expect(page.locator('.anchor-bill strong')).toHaveText('0 分');
 for(const [label,amount] of [['普通局','50'],['比下胡 ×2','100']]){await page.getByRole('button',{name:label,exact:true}).click();await establish(page);await page.getByRole('button',{name:'乙打出五条',exact:true}).click();await page.getByRole('button',{name:'甲选择胡牌',exact:true}).click();await expect(page.locator('.anchor-bill strong')).toHaveText(amount+' 分');await expect(page.locator('.anchor-bill')).toContainText('（桌外）');}
 await page.screenshot({path:'output/global-anchor-settlement-'+info.project.name+'.png',fullPage:true});
});
test('改支同步去黄，暗杠补牌不架牌；可回到前一步复查',async({page},info)=>{
 await ready(page);await page.getByRole('button',{name:/改支：摸3筒/}).click();await establish(page);await page.getByRole('button',{name:'继续至甲摸3筒',exact:true}).click();await expect.poll(()=>yellow(page)).toHaveLength(1);await page.getByRole('button',{name:'打出5万 · 改听3筒',exact:true}).click();await expect.poll(()=>yellow(page)).toEqual([]);await expect(page.locator('.anchor-cleared')).toContainText('外包已清除');
 await page.getByRole('button',{name:'打6条架牌',exact:true}).click();await expect.poll(()=>yellow(page)).toHaveLength(1);
 await page.getByRole('button',{name:/例外：三碰后暗杠/}).click();await page.getByRole('button',{name:'暗杠1筒，补6条',exact:true}).click();await page.getByRole('button',{name:'打出6条',exact:true}).click();await expect.poll(()=>yellow(page)).toEqual([]);await page.screenshot({path:'output/global-anchor-concealed-'+info.project.name+'.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'乙打出五条',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:'output/global-anchor-mobile-'+info.project.name+'.png',fullPage:true});
});

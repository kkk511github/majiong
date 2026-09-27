import {test,expect} from '@playwright/test';
test('账单卡解释封顶金额并定位真实回放帧，不连接生产接口',async({page})=>{
 const network:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.includes('/api/'))network.push(r.url());});
 page.on('websocket',s=>{if(new URL(s.url()).pathname==='/ws')network.push(s.url());});
 await page.goto('/tests/previews/bill-explanation.html');
 await page.getByRole('button',{name:'解释第1笔收支',exact:true}).click();
 const card=page.getByRole('region',{name:'本笔账单解释'});
 await expect(card).toContainText('规则参考 5 分；本笔实际 5 分');
 await page.getByRole('button',{name:'余额不足封顶',exact:true}).click();
 await page.getByRole('button',{name:'解释第1笔收支',exact:true}).click();
 await expect(card).toContainText('本笔前桌内余额 3 分');await expect(card).toContainText('本笔实际 3 分');await expect(card).toContainText('余额不足');
 await page.getByRole('button',{name:'查看对应回放',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 const frame=()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'));
 await expect.poll(()=>frame()?.evaluate(()=>(window as any).__JINLING_TABLE_READY__)).toBe(true);
 await expect.poll(()=>frame()!.evaluate(async()=>{const cc=await(window as any).System.import('cc');return cc.director.getScene().getChildByName('Canvas').getComponent('TableScene').state.players[0].melds.some((m:any)=>m.type==='kong');})).toBe(true);
 expect(network).toEqual([]);
 await page.screenshot({path:'output/qa/bill-explanation-linked-replay.png'});
});

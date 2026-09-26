import {test,expect} from '@playwright/test';

test('真实牌桌三家独立摸牌背，四家同牌在结算前扣分并显示实际付款人',async({page})=>{
  await page.goto('/tests/previews/score-debits.html');
  const frame=()=>page.frames().find(f=>f.url().includes('/cocos-table/index.html'))!;
  await expect(page.getByRole('button',{name:'四家同牌',exact:true})).toBeEnabled({timeout:45000});
  for(const [i,label] of ['下家摸牌','对家摸牌','上家摸牌'].entries()){
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect.poll(()=>frame().evaluate(async()=>{
      const cc=await(window as any).System.import('cc');
      const c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
      return c.state.me;
    })).toBe((3-i)%4);
    const result=()=>frame().evaluate(async()=>{
      const cc=await(window as any).System.import('cc'),s=cc.director.getScene(),c=s.getChildByName('Canvas').getComponent('TableScene');
      const row=[...c.tileLayout.values()].filter((t:any)=>t.area==='hand'&&t.seat===0) as any[];
      const draw=row.find(t=>t.drawSlot),offset=(4-c.state.me)%4;
      const node=draw&&(offset===2?c.nodes.get(draw.id):s.getChildByName('Table 3D models').getChildByName(`standing-${draw.id}`));
      return {count:row.length,hidden:row.every(t=>t.tile===undefined),drawId:draw?.id,visible:node?.activeInHierarchy};
    });
    await expect.poll(result).toEqual({count:14,hidden:true,drawId:'hand-0-13',visible:true});
    await page.screenshot({path:`output/qa/draw-slot-${i+1}.png`});
  }
  // Reset perspective before testing the real fourth discard (no fabricated ledger).
  await page.getByRole('button',{name:'换视角',exact:true}).click();
  await page.getByRole('button',{name:'四家同牌',exact:true}).click();
  const notice=page.locator('.score-debit-penalty');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute('aria-label','秦淮 · 四家同牌扣15分');
  const state=await frame().evaluate(async()=>{
    const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
    return {phase:c.state.phase,scores:c.state.players.map((p:any)=>p.score)};
  });
  expect(['playing','claiming']).toContain(state.phase);
  expect(state.scores).toEqual([95,75,95,95]);
  await page.waitForTimeout(450);
  await page.screenshot({path:'output/qa/four-follow-immediate.png'});
  await page.waitForTimeout(2000);
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(0,{timeout:4000});
});

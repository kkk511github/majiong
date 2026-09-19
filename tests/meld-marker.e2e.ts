import { test, expect } from '@playwright/test';

test('牌面金色来源箭头：四家、回放换位、补杠与暗杠',async({page})=>{
 await page.setViewportSize({width:1280,height:590});
 await page.goto('/cocos-table/index.html');
 await page.waitForFunction(()=>!!(window as any).__JINLING_TABLE_READY__);
 for(let me=0;me<4;me++){
  const result=await page.evaluate(async(me)=>{
   const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
   const s=c.demo();s.me=me;s.presentation='replay';s.actions=[];s.lastDiscard=undefined;s.drawn=undefined;
   s.players.forEach((p:any)=>{p.handCount=1;p.hand=p.seat===me?[108]:[];p.flowers=[];
    p.melds=Array.from({length:3},(_,i)=>({type:'pung',tiles:[i*4,i*4+1,i*4+2],from:(p.seat+i+1)%4,concealed:false}));});
   c.state=s;c.draw();
   return c.marks.children.filter((n:any)=>n.name.startsWith('source-meld-')).map((n:any)=>({id:n.name,rotation:n.eulerAngles.z,hasArrow:!!n.getComponent(cc.Sprite)?.spriteFrame?.texture,width:n.getComponent(cc.UITransform).width,x:n.position.x+640,y:295-n.position.y,middle:(window as any).__JINLING_TABLE_LAYOUT__.find((t:any)=>t.id===n.name.replace('source-',''))}));
  },me);
  expect(result).toHaveLength(12);
  for(const marker of result){
   const [, ,owner,group]=marker.id.split('-');
   const source=(Number(owner)+Number(group)+1)%4,offset=(source-me+4)%4;
   expect(marker.rotation).toBeCloseTo([180,-90,0,90][offset],5);
   expect(marker.hasArrow).toBe(true);expect(marker.width).toBeGreaterThan(20);
   expect(marker.x).toBeCloseTo(marker.middle.x,5);
   expect(Math.abs(marker.y-marker.middle.y)+marker.width/2).toBeLessThan(marker.middle.h/2);
  }
 }
 await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  c.state.players[1].melds[0]={type:'kong',tiles:[0,1,2,3],from:2,concealed:false};
  c.state.players[1].melds[1]={type:'kong',tiles:[],from:1,concealed:true};c.draw();
 });
 const count=await page.evaluate(async()=>{const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');return c.marks.children.filter((n:any)=>n.name.startsWith('source-meld-')).length;});
 expect(count).toBe(11);
 // A normal table with a visible up/right/down/left supplier, for visual review.
 await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),s=c.demo();
  s.actions=[];s.lastDiscard=undefined;s.players.forEach((p:any)=>{p.handCount=10;p.hand=p.seat===0?[20,21,24,25,28,32,33,84,85,64]:[];p.melds=[{type:'pung',tiles:[56,57,58],from:(p.seat+1)%4,concealed:false}];});
  c.state=s;c.draw();
 });
 await page.screenshot({path:`test-results/screenshots/meld-arrow-${test.info().project.name}.png`});
});

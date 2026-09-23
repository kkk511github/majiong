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
   expect(marker.hasArrow).toBe(true);expect(marker.width).toBeGreaterThanOrEqual(15);
   expect(marker.x).toBeCloseTo(marker.middle.x,5);
   expect(Math.abs(marker.y-marker.middle.y)+marker.width/2).toBeLessThan(marker.middle.h/2);
  }
 }
 await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  c.state.me=0;
  c.state.players[1].melds[0]={type:'kong',tiles:[0,1,2,3],from:2,concealed:false};
  c.state.players[1].melds[1]={type:'kong',tiles:[4,5,6,7],from:2,concealed:false,added:true};
  c.state.players[1].melds[2]={type:'kong',tiles:[8,9,10,11],from:1,concealed:true};c.draw();
 });
 const kongState=await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  return {
   marks:c.marks.children.filter((n:any)=>n.name.startsWith('source-meld-')).map((n:any)=>({id:n.name,x:n.position.x+640,y:295-n.position.y})),
   groups:[0,1,2].map(group=>(window as any).__JINLING_TABLE_LAYOUT__.filter((t:any)=>t.area==='meld'&&t.seat===1&&t.id.startsWith(`meld-1-${group}-`))),
  };
 });
 expect(kongState.marks).toHaveLength(10);
 for(const [groupIndex,group] of kongState.groups.entries()){
  const bases=group.filter((t:any)=>!t.stack);
  expect(group).toHaveLength(4);
  if(groupIndex===0){
   expect(bases).toHaveLength(4);expect(group.filter((t:any)=>t.stack)).toHaveLength(0);
   expect(group.every((t:any)=>!t.pose.includes('cross')&&!t.pose.startsWith('cover-')&&t.source===undefined)).toBe(true);
   expect(kongState.marks.some((m:any)=>m.id.startsWith('source-meld-1-0-'))).toBe(false);
  }else{
   const middle=group.find((t:any)=>t.id.endsWith('-1')),upper=group.find((t:any)=>t.stack);
   expect(bases).toHaveLength(3);expect(group.filter((t:any)=>t.stack)).toHaveLength(1);
   expect(upper.x+upper.w/2).toBeCloseTo(middle.x+middle.w/2,8);
   expect(Math.abs(upper.x-middle.x)).toBeLessThan(.1);
   expect(middle.y-upper.y).toBeGreaterThanOrEqual(7.5);
   expect(middle.y-upper.y).toBeLessThanOrEqual(8.5);
   expect(upper.y-middle.y).toBeCloseTo(-8,8);
   if(groupIndex===1)expect(bases.filter((t:any)=>t.pose.includes('cross'))).toHaveLength(1);
   else expect(bases.every((t:any)=>t.pose.startsWith('cover-')&&t.tile===undefined)).toBe(true);
  }
  if(groupIndex===1){
   const marker=kongState.marks.find((m:any)=>m.id===`source-meld-1-${groupIndex}-1`)!,upper=group.find((t:any)=>t.stack)!;
   expect(marker.x).toBeCloseTo(upper.x,5);expect(marker.y).toBeCloseTo(upper.y-upper.h*.09,5);
  }
 }
 // A normal table with a visible up/right/down/left supplier, for visual review.
 await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),s=c.demo();
  s.actions=[];s.lastDiscard=undefined;s.players.forEach((p:any)=>{p.handCount=10;p.hand=p.seat===0?[20,21,24,25,28,32,33,84,85,64]:[];p.melds=[{type:'pung',tiles:[56,57,58],from:(p.seat+1)%4,concealed:false}];});
  c.state=s;c.draw();
 });
 const physical=await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  return (window as any).__JINLING_TABLE_LAYOUT__.filter((t:any)=>t.area==='meld').map((t:any)=>({
   seat:t.seat,pose:t.pose,rotation:t.rotation||0,nodeRotation:c.nodes.get(t.id)?.eulerAngles.z,hasContactShadow:!!c.shadows.get(t.id),
  }));
 });
 expect(physical.every((t:any)=>t.rotation===0&&Math.abs(t.nodeRotation)<1e-5&&t.hasContactShadow)).toBe(true);
 expect(physical.filter((t:any)=>t.seat===0).map((t:any)=>t.pose)).toEqual(['meld-bottom','meld-bottom','meld-bottom-cross']);
 expect(physical.filter((t:any)=>t.seat===1).map((t:any)=>t.pose)).toEqual(['meld-cross-right','right','right']);
 expect(physical.filter((t:any)=>t.seat===3).map((t:any)=>t.pose)).toEqual(['left','left','meld-cross-left']);
 await page.screenshot({path:`test-results/screenshots/meld-arrow-${test.info().project.name}.png`});
});

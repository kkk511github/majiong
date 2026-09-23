import { test, expect } from '@playwright/test';

test('四家副露保留来源横牌但不再绘制金色来源箭头',async({page})=>{
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
   return {
    marks:c.marks.children.filter((n:any)=>n.name.startsWith('source-meld-')).map((n:any)=>n.name),
    melds:(window as any).__JINLING_TABLE_LAYOUT__.filter((t:any)=>t.area==='meld').map((t:any)=>({
     id:t.id,seat:t.seat,x:t.x,y:t.y,pose:t.pose,rotation:t.rotation||0,nodeRotation:c.nodes.get(t.id)?.eulerAngles.z,
    })),
   };
  },me);
  expect(result.marks).toEqual([]);
  const normalPose=['meld-bottom','right','meld-bottom','left'];
  const crossPose=['meld-bottom-cross','meld-cross-right','meld-bottom-cross','meld-cross-left'];
  const screenOrder=[[0,1,2],[2,1,0],[2,1,0],[0,1,2]];
  for(let owner=0;owner<4;owner++)for(let groupIndex=0;groupIndex<3;groupIndex++){
   const offset=(owner-me+4)%4,sourceIndex=groupIndex===0?2:groupIndex===2?0:undefined;
   const group=result.melds.filter((t:any)=>t.seat===owner&&t.id.startsWith(`meld-${owner}-${groupIndex}-`));
   const logical=[...group].sort((a:any,b:any)=>Number(a.id.split('-').at(-1))-Number(b.id.split('-').at(-1)));
   expect(logical).toHaveLength(3);
   expect(logical.map((t:any)=>t.pose)).toEqual(logical.map((_:any,index:number)=>index===sourceIndex?crossPose[offset]:normalPose[offset]));
   expect(logical.every((t:any)=>t.rotation===0&&Math.abs(t.nodeRotation)<1e-5)).toBe(true);
   const physical=[...group].sort((a:any,b:any)=>offset%2?a.y-b.y:a.x-b.x).map((t:any)=>Number(t.id.split('-').at(-1)));
   expect(physical).toEqual(screenOrder[offset]);
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
   marks:c.marks.children.filter((n:any)=>n.name.startsWith('source-meld-')).map((n:any)=>n.name),
   groups:[0,1,2].map(group=>(window as any).__JINLING_TABLE_LAYOUT__.filter((t:any)=>t.area==='meld'&&t.seat===1&&t.id.startsWith(`meld-1-${group}-`))),
  };
 });
 expect(kongState.marks).toEqual([]);
 for(const [groupIndex,group] of kongState.groups.entries()){
  const bases=group.filter((t:any)=>!t.stack);
  expect(group).toHaveLength(4);
  if(groupIndex===0){
   expect(bases).toHaveLength(4);expect(group.filter((t:any)=>t.stack)).toHaveLength(0);
   expect(group.every((t:any)=>!t.pose.includes('cross')&&!t.pose.startsWith('cover-')&&t.source===undefined)).toBe(true);
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
 }
 // A normal table keeps the physical supplier turns and latest-discard pointer,
 // while the retired yellow source-arrow layer remains empty.
 await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene'),s=c.demo();
  s.actions=[];s.players.forEach((p:any)=>{p.handCount=10;p.hand=p.seat===0?[20,21,24,25,28,32,33,84,85,64]:[];p.discards=p.seat===2?[72]:[];p.melds=[{type:'pung',tiles:[56,57,58],from:(p.seat+1)%4,concealed:false}];});
  s.lastDiscard={seat:2,tile:72};
  c.state=s;c.draw();
 });
 const physical=await page.evaluate(async()=>{
  const cc=await(window as any).System.import('cc'),c=cc.director.getScene().getChildByName('Canvas').getComponent('TableScene');
  return {
   melds:(window as any).__JINLING_TABLE_LAYOUT__.filter((t:any)=>t.area==='meld').map((t:any)=>({
    seat:t.seat,pose:t.pose,rotation:t.rotation||0,nodeRotation:c.nodes.get(t.id)?.eulerAngles.z,hasContactShadow:!!c.shadows.get(t.id),
   })),
   sourceMarks:c.marks.children.filter((n:any)=>n.name.startsWith('source-meld-')).map((n:any)=>n.name),
   latestPointer:{present:!!c.pointer,active:c.pointer?.active,hasTexture:!!c.pointer?.getComponent(cc.Sprite)?.spriteFrame?.texture},
  };
 });
 expect(physical.melds.every((t:any)=>t.rotation===0&&Math.abs(t.nodeRotation)<1e-5&&t.hasContactShadow)).toBe(true);
 expect(physical.melds.filter((t:any)=>t.seat===0).map((t:any)=>t.pose)).toEqual(['meld-bottom','meld-bottom','meld-bottom-cross']);
 expect(physical.melds.filter((t:any)=>t.seat===1).map((t:any)=>t.pose)).toEqual(['meld-cross-right','right','right']);
 expect(physical.melds.filter((t:any)=>t.seat===3).map((t:any)=>t.pose)).toEqual(['left','left','meld-cross-left']);
 expect(physical.sourceMarks).toEqual([]);
 expect(physical.latestPointer).toEqual({present:true,active:true,hasTexture:true});
 await page.screenshot({path:`test-results/screenshots/meld-source-free-${test.info().project.name}.png`});
});

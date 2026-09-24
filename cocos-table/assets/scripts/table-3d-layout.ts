import { layoutLegacyTable, sceneOffset, type SceneTile, type TableSceneState } from './table-scene';
function tileSeatYaw(tile:SceneTile,state:TableSceneState) {
  if(tile.area==='river'&&sceneOffset(tile.seat,state.me)===2)return 0;
  return sceneOffset(tile.seat,state.me)*90+(tile.area==='meld'&&tile.pose.includes('cross')?90:0);
}

export const REFERENCE = { width:1280,height:589,handLeft:130,handBottom:572,handWidth:71.3,handHeight:100,compass:{x:640,y:247,w:127,h:102} };
// Match the reference table's elevated view. Do not compensate a low camera
// by rotating each seat's tiles: that tilts otherwise horizontal tile seams.
export const TABLE_CAMERA = { pitch:55*Math.PI/180, distance:13.26, focal:1326 };
export function groundAt(x:number,y:number) {
  return planeAt(x,y,0);
}
export function planeAt(x:number,y:number,height:number) {
  const {pitch:p,distance:d,focal:f}=TABLE_CAMERA, dy=(295-y)/f, depth=(d*Math.sin(p)-height)/(Math.sin(p)-dy*Math.cos(p));
  return {x:(x-640)/f*depth,z:d*Math.cos(p)+depth*(-Math.cos(p)-dy*Math.sin(p))};
}
export function screenAt(x:number,z:number,height=0) {
  const {pitch:p,distance:d,focal:f}=TABLE_CAMERA;
  const depth=d-z*Math.cos(p)-height*Math.sin(p);
  return {x:640+f*x/depth,y:295-f*(height*Math.cos(p)-z*Math.sin(p))/depth};
}
/** Footprint in the table plane, independent of sprite padding and perspective. */
export function footprint(t:{yaw:number,modelWidth:number,modelLength:number}) {
  const cross=Math.abs(Math.round(t.yaw/90))%2===1;
  return {x:cross?t.modelLength:t.modelWidth,z:cross?t.modelWidth:t.modelLength};
}
/** Upright tiles share the table's orthogonal seat axes. Perspective comes
 * exclusively from the camera, never an extra per-seat or per-card yaw. */
export function standingHandLayout(cards:Array<{id:string,x:number,y:number,w:number}>,offset:number) {
  const row=[...cards].sort((a,b)=>a.y-b.y);
  if(!row.length)return [];
  const first=row[0],last=row[row.length-1];
  const height=.48,span=row.length>1?last.y-first.y:22;
  const a=planeAt(first.x,first.y,height/2),b=planeAt(first.x,first.y+span,height/2);
  const dz=b.z-a.z,steps=Math.max(1,row.length-1);
  return row.map((t,i)=>({id:t.id,x:a.x,z:a.z+dz*i/steps,width:dz/steps-.006,height,depth:.16,yaw:offset*90}));
}
export function layout3DTable(state:TableSceneState) {
  const denseRivers=state.players.some(p=>p.discards.length>18);
  const all=layoutLegacyTable(state).map(t=>({...t,yaw:tileSeatYaw(t,state),layoutYaw:tileSeatYaw(t,state),alignmentAngle:0,alignmentPivotX:0,alignmentPivotZ:0,modelWidth:.35,modelLength:.48,modelThickness:.16,handRotation:0,groundX:0,groundZ:0}));
  for(const p of state.players) {
    const o=sceneOffset(p.seat,state.me),hand=all.filter(t=>t.seat===p.seat&&t.area==='hand').sort((a,b)=>o===0||o===2?a.x-b.x:a.y-b.y);
    const melds=all.filter(t=>t.seat===p.seat&&t.area==='meld');
    const groups=Array.from(new Set(melds.map(t=>Number(t.id.split('-')[2])))).sort((a,b)=>a-b);
    const groupGap=groups.length>2?(o===2?.08:o%2?.13:.16):.16;
    let ownCursor=130;
    groups.forEach((group,gi)=>{
      const cards=melds.filter(t=>Number(t.id.split('-')[2])===group&&!t.stack).sort((a,b)=>Number(a.id.split('-')[3])-Number(b.id.split('-')[3]));
      cards.forEach((t,i)=>{
        t.modelWidth=o===0?.40:o===2?.31:groups.length>2?.32:.35;t.modelLength=o===0?.62:o===2?.44:.48;t.modelThickness=.16;
        if(o===0){t.x=ownCursor+(t.pose.includes('cross')?36:27);t.y=540;ownCursor+=t.pose.includes('cross')?72:54;}
        // Reserve the upper tile's height even while this is still a pung:
        // upgrading must neither shift the rack nor clip its top face.
        if(o===2){t.x=483+hand.length*24.4+58+gi*88+i*28;t.y=36;}
        if(o===3){t.y=70+gi*84+i*23;t.x=320-.28*t.y;}
        if(o===1){t.y=370-gi*87-i*25;t.x=1000+.25*(t.y-300);}
      });
      if(o===0)ownCursor+=14;
      for(const t of melds.filter(t=>Number(t.id.split('-')[2])===group&&t.stack)){
        const middle=cards.find(c=>c.id.endsWith('-1'))!;
        Object.assign(t,{x:middle.x,y:middle.y,yaw:middle.yaw,modelWidth:middle.modelWidth,modelLength:middle.modelLength,modelThickness:middle.modelThickness});
      }
    });
    let leftY=97+groups.length*57,rightY=123;
    hand.forEach((t,i)=>{
      if(o===0){t.w=71.3;t.h=100;t.x=(groups.length?ownCursor+12:130)+35.65+i*71.3;t.y=522;}
      if(o===2){t.w=24.4;t.h=40;t.x=495+i*24.4;t.y=23;}
      if(o===3){t.x=267.8-.249*leftY;t.y=leftY;t.w=21*(leftY+1588)/1788;t.h=51*(leftY+1588)/1788;leftY+=20.2*(leftY+1588)/1883;}
      if(o===1){t.x=1015.5+.242*rightY;t.y=rightY;t.w=21*(rightY+1588)/1788;t.h=51*(rightY+1588)/1788;rightY+=20.2*(rightY+1588)/1883;}
    });
    all.filter(t=>t.seat===p.seat&&t.area==='flower').sort((a,b)=>p.flowers.indexOf(a.tile!)-p.flowers.indexOf(b.tile!)).forEach((t,i)=>{
      t.modelWidth=.37;t.modelLength=.51;t.modelThickness=.16;
      if(o===0){t.x=352+i*39;t.y=444;}
      if(o===2){t.x=850-i*30;t.y=82;}
      if(o===3){t.y=112+i*26;t.x=349-.14*(t.y-100);}
      if(o===1){t.y=376-i*28;t.x=980-.17*(376-t.y);}
    });
    for(const t of all.filter(t=>t.seat===p.seat&&t.area==='river')) {
      // Correct the excessive fore/aft face depth, keeping face width and
      // body thickness. Three rows now fit inside their reserved band.
      t.modelWidth=.30;t.modelLength=.37;
      const i=p.discards.indexOf(t.tile!),capacity=o%2?6:8,row=Math.floor(i/capacity),col=i%capacity;
      if(o===0){t.x=516+col*35.5;t.y=333-row*48;}
      if(o===2){t.x=750-col*34;t.y=155-row*43;}
      if(o===3){t.y=177+col*29;t.x=478-row*45-.091*(t.y-177);}
      if(o===1){t.y=312-col*27;t.x=812+row*52+.09*(t.y-312);}
    }
    // Build whole racks in one table-local coordinate system. Independent
    // screen-space slopes made physical edges drift apart under perspective.
    const place=(t:typeof all[number],x:number,z:number)=>{
      t.groundX=x;t.groundZ=z;Object.assign(t,screenAt(x,z,t.modelThickness/2));
    };
    const axis=o%2?'z':'x',edge=o%2?'x':'z',direction=o===0||o===3?1:-1;
    const bases=melds.filter(t=>!t.stack).sort((a,b)=>Number(a.id.split('-')[2])-Number(b.id.split('-')[2])||Number(a.id.split('-')[3])-Number(b.id.split('-')[3]));
    if(bases.length){
      const anchor=groundAt(bases[0].x,bases[0].y),firstSize=footprint(bases[0]);
      const ownerSide=o===0||o===1?1:-1;
      let baseline=anchor[edge]+ownerSide*firstSize[edge]/2;
      // Opposite melds occupy the space to the right of their standing hand;
      // river play order runs the other way and must not drive rack packing.
      const rackDirection=o===1?-1:1;
      let cursor=anchor[axis]-rackDirection*firstSize[axis]/2;
      const total=bases.reduce((n,t)=>n+footprint(t)[axis],0)+Math.max(0,groups.length-1)*groupGap;
      if(o===2){
        // Right edge is before the opposite portrait. Allocate melds first,
        // then reserve a separate hand run on their left, never underneath.
        cursor=groundAt(858,bases[0].y).x-total;
        const left=screenAt(cursor,anchor.z).x;
        const handLeft=Math.min(483,left-18-hand.length*24.4);
        hand.forEach((t,i)=>{t.x=handLeft+12.2+i*24.4;});
      }
      if(o===0){
        const projectedEnd=screenAt(cursor+total,anchor.z).x+14+hand.length*71.3;
        if(projectedEnd>1185)cursor=groundAt(1185-14-hand.length*71.3,bases[0].y).x-total;
      }
      // One continuous side rail, including full four-kong fixtures. A lower
      // tabletop camera and taller physical body leave enough depth without
      // splitting groups into a second column or shrinking their footprints.
      if(o%2===1){
        const start=groundAt(o===3?265:1125,o===3?(groups.length>2?20:40):(groups.length>2?525:438));
        cursor=start[axis]-rackDirection*firstSize[axis]/2;
        baseline=start[edge]+ownerSide*firstSize[edge]/2;
      }
      groups.forEach((group,gi)=>{
        const cards=bases.filter(t=>Number(t.id.split('-')[2])===group).sort((a,b)=>Number(a.id.split('-')[3])-Number(b.id.split('-')[3]));
        for(const t of cards){
          const size=footprint(t),point={x:0,z:0};
          point[axis]=cursor+rackDirection*size[axis]/2;
          point[edge]=baseline-ownerSide*size[edge]/2;
          place(t,point.x,point.z);cursor+=rackDirection*size[axis];
        }
        if(gi<groups.length-1)cursor+=rackDirection*groupGap; // Only separate groups.
      });
      for(const t of melds.filter(t=>t.stack)){
        const target=bases.find(b=>b.id===t.id.replace(/-3$/,'-1'))!;
        place(t,target.groundX,target.groundZ);
      }
      if(o===0){
        const right=screenAt(cursor,anchor.z).x;
        hand.forEach((t,i)=>{t.x=right+14+35.65+i*71.3;});
      }
      if(o%2===1){
        // Stand the remaining hand on the very same rail after the melds.
        // Its thin edge occupies depth, not a second parallel column.
        let handCursor=cursor+rackDirection*.28;
        for(const t of hand){
          t.groundX=baseline-ownerSide*.08;t.groundZ=handCursor;
          const point=screenAt(t.groundX,t.groundZ,.30);
          t.x=point.x;t.y=point.y;t.w=20;t.h=49;
          handCursor+=rackDirection*.35;
        }
      }
    }
    const flowers=all.filter(t=>t.seat===p.seat&&t.area==='flower').sort((a,b)=>p.flowers.indexOf(a.tile!)-p.flowers.indexOf(b.tile!));
    if(flowers.length){
      let origin=groundAt(flowers[0].x,flowers[0].y);
      if(o===1)origin=groundAt(995,376);
      if(o===3)origin=groundAt(322,112);
      flowers.forEach((t,i)=>{
        const point={...origin};point[axis]+=direction*i*footprint(t)[axis];place(t,point.x,point.z);
      });
    }
    const rivers=all.filter(t=>t.seat===p.seat&&t.area==='river').sort((a,b)=>p.discards.indexOf(a.tile!)-p.discards.indexOf(b.tile!));
    if(rivers.length){
      let origin=groundAt(rivers[0].x,rivers[0].y);
      const capacity=10;
      if(!denseRivers&&o===1)origin=groundAt(rivers[0].x+14,rivers[0].y);
      if(!denseRivers&&o===3)origin=groundAt(rivers[0].x-10,rivers[0].y);
      if(denseRivers){
        // Four disjoint tabletop rectangles, including the outer tile edges.
        // A 0.20-world-unit corner gutter keeps perspective sidewalls clear.
        const anchors=[{x:-1.575,z:.67},{x:2.19,z:1.175},{x:1.575,z:-1.60},{x:-2.19,z:-2.05}];
        origin=anchors[o];
      }
      // Fixed horizontal bands exist from the first discard onwards, not
      // only when the table becomes dense: hand / flowers / three rows / HUD.
      if(o===0)origin=groundAt(500,326);
      if(o===2)origin=groundAt(760,179);
      if(o===1)origin={x:2.06,z:.95};
      if(o===3)origin={x:-2.06,z:-1.825};
      // The reference's second row starts beside its first tile, towards
      // the owner (away from the compass), not over the middle wind panel.
      const outward=o===0||o===1?1:-1;
      rivers.forEach((t,i)=>{
        const point={...origin},size=footprint(t);
        point[axis]+=direction*(i%capacity)*size[axis];
        point[edge]+=outward*Math.floor(i/capacity)*size[edge];
        place(t,point.x,point.z);
      });
    }
    // Replays/settlement legally reveal other hands. Show those as face-up
    // solids in the same reserved rail, not thin standing-edge sprites.
    const exposed=hand.filter(t=>p.seat!==state.me&&t.tile!==undefined);
    if(o%2===1&&exposed.length){
      const rail=standingHandLayout(hand,o);
      exposed.forEach(t=>{
        const slot=rail.find(r=>r.id===t.id)!;
        t.modelWidth=Math.min(.35,slot.width+.006);t.modelLength=.48;
        const ownerSide=o===1?1:-1;
        const x=bases.length?t.groundX:slot.x,z=bases.length?t.groundZ:slot.z;
        place(t,x-ownerSide*(.48-.16)/2,z+(o===3?.10:-.10));
      });
    }else if(o===2)exposed.forEach(t=>{
      t.modelWidth=.28;t.modelLength=.44;const at=groundAt(t.x,30);place(t,at.x,at.z);
    });
  }
  // A near-full right rack owns the lower-right corner. Keep a fourteen-tile
  // local hand (including its draw gap) inside the remaining rail.
  if((state.players.find(p=>sceneOffset(p.seat,state.me)===1)?.melds.length??0)>=3){
    const hand=all.filter(t=>t.area==='hand'&&t.seat===state.me).sort((a,b)=>a.x-b.x);
    if(hand.length){
      const left=hand[0].x-hand[0].w/2,drawGap=hand.some(t=>t.id.startsWith('draw-'))?18:0;
      const width=Math.min(71.3,(1068-left-drawGap)/hand.length);
      hand.forEach((t,i)=>{t.w=width;t.x=left+width*(i+.5);});
    }
  }
  // Shared visible bounds drive clicks, drag targets, markers and React overlays.
  for(const t of all) {
    t.rotation=0;t.shear=0;
    if(t.area==='hand'&&(t.seat===state.me||t.tile===undefined)) {
      if(t.seat===state.me&&t.selected)t.y-=18;
      if(t.tile===state.drawn&&t.id.startsWith('draw-')){
        const offset=sceneOffset(t.seat,state.me);
        if(offset===0)t.x+=18;
        else if(offset===2)t.x-=12;
        else t.y+=offset===1?-12:12;
      }
      continue;
    }
    const angle=t.yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),points=[];
    for(const x of [-t.modelWidth/2,t.modelWidth/2])for(const z of [-t.modelLength/2,t.modelLength/2])for(const h of [0,t.modelThickness])
      points.push(screenAt(t.groundX+c*x+s*z,t.groundZ-s*x+c*z,h+(t.stack?t.modelThickness:0)));
    const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y)),bottom=Math.max(...points.map(p=>p.y));
    t.x=(left+right)/2;t.y=(top+bottom)/2;t.w=right-left;t.h=bottom-top;
  }
  return all;
}
export type Table3DTile=ReturnType<typeof layout3DTable>[number];

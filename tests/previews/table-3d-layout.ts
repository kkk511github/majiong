import { layoutTable, sceneOffset, type SceneTile, type TableSceneState } from '../../shared/table-scene';

/** Right-hand table coordinates: X right, Y height, Z toward the local player.
 * An upright glyph's top points away from its owner. Never orient all rivers
 * toward the observer, and never rotate a baked image/thickness sideways. */
export function tileSeatYaw(tile: SceneTile, state: TableSceneState): number {
  const seat = sceneOffset(tile.seat, state.me);
  const turned = tile.area === 'meld' && tile.pose.includes('cross');
  return seat * 90 + (turned ? 90 : 0);
}

export function studyTiles(state: TableSceneState) {
  const sin = Math.sin(55 * Math.PI / 180);
  const tiles = layoutTable(state).map(tile => ({ ...tile, yaw: tileSeatYaw(tile, state), modelWidth: 0, modelLength: 0, modelThickness: 0 }));
  function size(tile: typeof tiles[number], width: number) {
    tile.modelWidth=width/100;tile.modelLength=width*1.4/100;tile.modelThickness=width*.18/100;
    const sideways=Math.abs(Math.sin(tile.yaw*Math.PI/180))>.5;
    tile.w=sideways?width*1.4:width;tile.h=(sideways?width:width*1.4)*sin;
  }
  for (const player of state.players) {
    const offset=sceneOffset(player.seat,state.me);
    const melds=tiles.filter(t=>t.seat===player.seat&&t.area==='meld');
    const width=offset===0?50:offset===2?28:26;
    for(const tile of melds)size(tile,width);
    let cursor=offset===0?150:offset===2?892:offset===3?40:512;
    const groups=[...new Set(melds.map(t=>Number(t.id.split('-')[2])))].sort((a,b)=>a-b);
    for(const group of groups) {
      const cards=melds.filter(t=>Number(t.id.split('-')[2])===group&&!t.stack).sort((a,b)=>Number(a.id.split('-')[3])-Number(b.id.split('-')[3]));
      for(const card of cards) {
        const span=offset%2?card.h:card.w;
        if(offset===0){card.x=cursor+span/2;card.y=618-card.h/2;cursor+=span;}
        if(offset===2){card.x=cursor-span/2;card.y=-4+card.h/2;cursor-=span;}
        if(offset===3){card.x=232+card.w/2;card.y=cursor+span/2;cursor+=span;}
        if(offset===1){card.x=1080-card.w/2;card.y=cursor-span/2;cursor-=span;}
      }
      cursor+=(offset===0||offset===3?1:-1)*(offset===0?14:10);
      for(const top of melds.filter(t=>Number(t.id.split('-')[2])===group&&t.stack)) {
        const middle=cards.find(t=>t.id.endsWith('-1'))!;
        Object.assign(top,{x:middle.x,y:middle.y,w:middle.w,h:middle.h,yaw:middle.yaw,modelWidth:middle.modelWidth,modelLength:middle.modelLength,modelThickness:middle.modelThickness});
      }
    }
    const hands=tiles.filter(t=>t.seat===player.seat&&t.area==='hand').sort((a,b)=>offset===0?a.x-b.x:offset===2?b.x-a.x:offset===3?a.y-b.y:b.y-a.y);
    if(groups.length)cursor+=(offset===0||offset===3?1:-1)*10;
    else cursor=offset===0?Math.max(150,(1280-hands.length*65)/2):offset===2?892:offset===3?80:475;
    for(const [index,hand] of hands.entries()) {
      if(offset===0){if(hand.id.startsWith('draw-'))cursor+=15;hand.x=cursor+hand.w/2;hand.y=618-hand.h/2;cursor+=hand.w;}
      if(offset===2){if(hand.id.startsWith('draw-'))cursor-=12;hand.x=cursor-hand.w/2;hand.y=-4;cursor-=hand.w;}
      if(offset===3){hand.x=232+hand.w/2;hand.y=cursor+hand.h/2+index*18;}
      if(offset===1){hand.x=1080-hand.w/2;hand.y=cursor-hand.h/2-index*18;}
    }
    const flowers=tiles.filter(t=>t.seat===player.seat&&t.area==='flower');
    flowers.forEach((tile,i)=>{
      // One physical flower model for every player, with only seat rotation.
      size(tile,30);
      if(offset===0){tile.x=335+i*30;tile.y=500;}
      if(offset===2){tile.x=880-i*30;tile.y=54;}
      if(offset===3){tile.x=300+Math.floor(i/10)*46;tile.y=156+(i%10)*30*sin;}
      if(offset===1){tile.x=1010-Math.floor(i/10)*46;tile.y=414-(i%10)*30*sin;}
    });
    const rivers=tiles.filter(t=>t.seat===player.seat&&t.area==='river');
    rivers.forEach(tile=>{
      size(tile,26);
      const i=player.discards.indexOf(tile.tile!),row=Math.floor(i/10),col=i%10;
      if(offset===0){tile.x=500+col*27;tile.y=450-row*32;}
      if(offset===2){tile.x=778-col*27;tile.y=116+row*32;}
      if(offset===3){tile.x=390+row*38;tile.y=140+col*22;}
      if(offset===1){tile.x=920-row*38;tile.y=415-col*22;}
    });
  }
  return tiles;
}

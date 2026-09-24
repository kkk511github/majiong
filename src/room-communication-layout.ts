import type { TableSafeArea,TableSceneState } from "../shared/table-scene";
import { tableOverlayLayout } from "./table-overlay-layout";

type Bounds = { left: number; top: number; width: number; height: number };

/** Anchor to the rendered table's player plates, including letterboxing and
 * cutouts. The phrase entrance occupies the free rail between the portraits. */
export function roomCommunicationLayout(host: Bounds, frame: Bounds, safe?: TableSafeArea, toolbarBottom = 104,tableStyle?:TableSceneState['tableStyle']) {
  const table = tableOverlayLayout(host, frame, safe,tableStyle);
  const { scale, left, top, players, handTop } = table;
  const size = Math.max(44, Math.min(56, 52 * scale));
  const railTop = top + (players[1].plateY + players[1].h / 2) * scale + 6;
  const railBottom = handTop - 12;
  const compact = host.width < 720;
  const width = size;
  const height = size;
  const railRight = Math.min(host.width - table.safeRight, left + (players[1].x + players[1].w / 2) * scale);
  const railLeft = Math.min(railRight - width, left + players[1].x * scale - size / 2);
  const railY = Math.max(railTop, (railTop + railBottom - height) / 2);
  const panelTop = Math.max(top + 96 * scale, toolbarBottom + 8);
  const panelRight = compact ? railRight : railLeft - 8;
  // The compass plus the round counter ends before canvas x=790.
  const panelWidth = Math.max(0, Math.min(336, panelRight - left - 790 * scale));
  const panelHeight = Math.max(0, Math.min(366, handTop - panelTop - 12));
  return {
    ...table, compact, size,viewportWidth:host.width,
    rail: { left: railLeft, top: railY, width, height },
    panel: { left: panelRight - panelWidth, top: panelTop, width: panelWidth, height: panelHeight },
  };
}

/** Speech stays by its speaker's portrait; never place it over the compass. */
export function roomPhrasePosition(layout: ReturnType<typeof roomCommunicationLayout>, offset: number) {
  const { left, top, scale, players } = layout;
  const p = players[offset];
  if(layout.tableStyle==='reference-3d'){
    const modernWidth=Math.min(180*scale,238),font=Math.max(11,Math.min(15,15*scale)),bubbleHeight=font*2.8+16;
    const avatarX=offset===0?p.x-p.w/2+27:p.x;
    const avatarY=offset===0?p.y-28:offset===2?p.y-p.h/2+30:p.y;
    const clampLeft=(x:number,w:number)=>Math.max(layout.safeLeft,Math.min(layout.viewportWidth-layout.safeRight-w,x));
    if(offset===0||offset===3){
      const width=Math.min(modernWidth,Math.max(48,left+174*scale-layout.safeLeft));
      return {left:clampLeft(left+avatarX*scale-width/2,width),top:Math.max(top+4,top+(avatarY-28)*scale-bubbleHeight-8),width};
    }
    if(offset===2)return {left:clampLeft(left+(avatarX+38)*scale,modernWidth),top:Math.max(top+4,top+(avatarY-32)*scale),width:modernWidth};
    return {left:clampLeft(left+avatarX*scale-modernWidth/2,modernWidth),top:top+(p.plateY+p.h/2)*scale+8,width:modernWidth};
  }
  const width = Math.min(238, 340 * scale);
  if (offset === 0) return { left: left + (p.x + p.w / 2 + 12) * scale, top: Math.min(top + 401 * scale, layout.handTop - 2 * Math.max(11, Math.min(15, 15 * scale)) * 1.4 - 24), width };
  if (offset === 3) return { left: left + (p.x + p.w / 2 + 12) * scale, top: top + 182 * scale, width };
  const rightEdge = left + (p.x - p.w / 2 - 12) * scale;
  if (offset === 2) return { left: rightEdge - width, top: top + 66 * scale, width };
  return { left: rightEdge - width, top: top + 167 * scale, width };
}

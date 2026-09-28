import {
  claimPrompt,
  layoutPlayerHud,
  layoutTable,
  sceneOffset,
  type TableSceneState,
  type SceneTile,
} from "../shared/table-scene";
import {handActionAnchor} from '../shared/action-anchors';

export const DEBIT_WIDTH = 108,
  DEBIT_HEIGHT = 76,
  DEBIT_RISE = 0;
export type DebitObstacle = { x: number; y: number; w: number; h: number };
type Box = DebitObstacle;
export const debitSeparated = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) >= (a.w + b.w) / 2 + 4 ||
  Math.abs(a.y - b.y) >= (a.h + b.h) / 2 + 4;

/** Reserve the entire upward animation path, including on densely occupied tables. */
export function scoreDebitPosition(
  state: TableSceneState,
  seat: number,
  controls: Box[] = [],
  previous?:{x:number;y:number},
  metrics={w:DEBIT_WIDTH,h:DEBIT_HEIGHT},
  tiles:readonly SceneTile[]=layoutTable(state),
) {
  const offset = sceneOffset(seat, state.me);
  const hand=handActionAnchor(state,seat,tiles),dx=640-hand.x,dy=295-hand.y,distance=Math.max(1,Math.hypot(dx,dy));
  const preferred={x:hand.x+dx/distance*150,y:hand.y+dy/distance*150};
  const zones = [
    { left: 230, right: 1110, top: 395, bottom: 466 },
    { left: 918, right: 1120, top: 150, bottom: 420 },
    // The opposite third discard row and a full side meld rail can jointly
    // occupy the former upper-left reserve. Search the remaining felt around
    // the opposite rack; this only moves the transient badge, never scores.
    { left: 164, right: 1110, top: 30, bottom: 455 },
    // The upstream meld/river rail now lives farther toward the centre. Keep
    // the search bay wide enough to find the lower-centre felt gap on a dense
    // 27-tile table; this only moves the transient debit badge, never scores.
    { left: 164, right: 520, top: 120, bottom: 455 },
  ];
  const hud = [0, 1, 2, 3].map((o) => {
    const p = layoutPlayerHud(o, state.safeArea,state.tableStyle);
    return { ...p, y: p.plateY };
  });
  const obstacles: Box[] = [
    ...tiles,
    ...hud,
    ...controls,
    { x: 640, y: 278, w: 124, h: 96 },
    { x: 548, y: 280, w: 66, h: 66 },
    { x: 732, y: 280, w: 66, h: 66 },
    ...(state.tableStyle === 'reference-3d' ? [
      { x: 640, y: 247, w: 127, h: 102 },
      { x: 531, y: 253, w: 66, h: 60 },
      { x: 772, y: 251, w: 66, h: 60 },
    ] : []),
  ];
  if (claimPrompt(state)) obstacles.push({ x: 122, y: 388, w: 196, h: 76 });
  const fits = (x: number, y: number) =>
    x-metrics.w*.54>=(state.safeArea?.left??0)+6&&x+metrics.w*.54<=1274-(state.safeArea?.right??0)&&y-metrics.h*.54>=(state.safeArea?.top??0)+6&&y+metrics.h*.54<=584-(state.safeArea?.bottom??0)&&obstacles.every((b) =>
      debitSeparated(
        {
          x,
          y: y - DEBIT_RISE / 2,
          w: metrics.w*1.08,
          h: metrics.h*1.08 + DEBIT_RISE,
        },
        b,
      ),
    );
  if(previous&&fits(previous.x,previous.y))return previous;
  if (fits(preferred.x, preferred.y)) return preferred;
  const searchZones = [zones[offset]];
  // The new single-row meld rails can completely fill the former side bay.
  // Try free felt elsewhere rather than silently dropping a confirmed debit.
  if (state.tableStyle === 'reference-3d')
    searchZones.push({ left: 164, right: 1110, top: 45, bottom: 455 });
  // Fully occupied three-row rivers can consume the inner bays. Portrait-side
  // gaps are allowed, while the same HUD/card/safe-area exclusions still apply.
  searchZones.push({left:Math.ceil((state.safeArea?.left??0)+metrics.w*.54+6),right:Math.floor(1274-(state.safeArea?.right??0)-metrics.w*.54),top:Math.ceil((state.safeArea?.top??0)+metrics.h*.54+6),bottom:Math.floor(584-(state.safeArea?.bottom??0)-metrics.h*.54)});
  for (const zone of searchZones) {
    let best: {x:number;y:number;distance:number} | undefined;
    for (let y = zone.top; y <= zone.bottom; y += 6)
      for (let x = zone.left; x <= zone.right; x += 6) {
        const distance = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
        if ((!best || distance < best.distance) && fits(x, y)) best = {x,y,distance};
      }
    if (best) return {x:best.x,y:best.y};
  }
  return null;
}

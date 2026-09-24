import { layoutPlayerHud, type TableSafeArea,type TableSceneState } from "../shared/table-scene";
/** Match the Cocos 1280×590 canvas, including letterboxing and the local avatar. */
export function tableOverlayLayout(
  host: { left: number; top: number; width: number; height: number },
  frame: { left: number; top: number; width: number; height: number },
  safeArea?:TableSafeArea,
  style?:TableSceneState['tableStyle'],
) {
  const scale = Math.min(frame.width / 1280, frame.height / 590);
  const left = frame.left - host.left + (frame.width - 1280 * scale) / 2;
  const top = frame.top - host.top + (frame.height - 590 * scale) / 2;
  const handTop = top + (style==='reference-3d'?472:491) * scale;
  const players=[0,1,2,3].map(offset=>layoutPlayerHud(offset,safeArea,style));
  // Claim buttons stay on the lower-right rail. The local portrait now lives
  // on the lower-left beside the hand, so it must not define this edge.
  const actionEdge = left + Math.min(1140, 1280 - (safeArea?.right ?? 0)) * scale - 8;
  // The public source cue lives in the empty lower-left bay. Its right edge
  // stays before the side hand; small screens keep a readable, compact height.
  const sourceLeft = Math.max(8, left + Math.max(24, (safeArea?.left ?? 0) + 8) * scale);
  const sourceHeight = Math.max(44, Math.min(76, 76 * scale));
  const localTop=top+(players[0].plateY-players[0].h/2)*scale;
  return {
    scale, left, top, handTop, actionEdge,players,tableStyle:style,
    sourceLeft,
    // Keep the compact source card just clear of the transparent local HUD
    // bounds on the narrowest canvas; the portrait/flower pieces themselves
    // are painted separately and do not occupy this overlay rail.
    sourceTop: Math.min(top + 350 * scale, localTop - sourceHeight - 1),
    sourceWidth: Math.max(0, Math.min((style==='reference-3d'?140:196) * scale, left + (style==='reference-3d'?156:224) * scale - sourceLeft)),
    sourceHeight,
    contentRight:left+1140*scale,
    safeLeft:Math.max(8,left+(safeArea?.left??0)*scale),
    safeRight:Math.max(8,host.width-left-(1280-(safeArea?.right??0))*scale),
    actionBottom: Math.max(8, host.height - handTop + 8),
    // Keep the geometric boundary inside the available pixel after floating
    // point scaling on narrow canvases.
    actionRight: Math.max(8, host.width - actionEdge + 1e-6),
    actionMaxWidth: Math.max(0, actionEdge - Math.max(8, left + (players[0].x + players[0].w / 2) * scale + 8)),
  };
}

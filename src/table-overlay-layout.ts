import { layoutPlayerHud, type TableSafeArea } from "../shared/table-scene";
/** Match the Cocos 1280×590 canvas, including letterboxing and the local avatar. */
export function tableOverlayLayout(
  host: { left: number; top: number; width: number; height: number },
  frame: { left: number; top: number; width: number; height: number },
  safeArea?:TableSafeArea,
) {
  const scale = Math.min(frame.width / 1280, frame.height / 590);
  const left = frame.left - host.left + (frame.width - 1280 * scale) / 2;
  const top = frame.top - host.top + (frame.height - 590 * scale) / 2;
  const handTop = top + 491 * scale;
  // The local avatar/status plate starts at canvas x=1148. Keep an 8px gap.
  const players=[0,1,2,3].map(offset=>layoutPlayerHud(offset,safeArea));
  const actionEdge = left + (players[0].x-50) * scale - 8;
  return {
    scale, left, top, handTop, actionEdge,players,
    contentRight:left+Math.min(1140,players[0].x-58)*scale,
    safeLeft:Math.max(8,left+(safeArea?.left??0)*scale),
    safeRight:Math.max(8,host.width-left-(1280-(safeArea?.right??0))*scale),
    actionBottom: Math.max(8, host.height - handTop + 8),
    actionRight: Math.max(8, host.width - actionEdge),
    actionMaxWidth: Math.max(0, actionEdge - Math.max(8, left + 116 * scale)),
  };
}

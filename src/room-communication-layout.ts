import type { TableSafeArea } from "../shared/table-scene";
import { tableOverlayLayout } from "./table-overlay-layout";

type Bounds = { left: number; top: number; width: number; height: number };

/** Anchor to the rendered table's player plates, including letterboxing and
 * cutouts. The phrase entrance occupies the free rail between the portraits. */
export function roomCommunicationLayout(host: Bounds, frame: Bounds, safe?: TableSafeArea, toolbarBottom = 104) {
  const table = tableOverlayLayout(host, frame, safe);
  const { scale, left, top, players, handTop } = table;
  const size = Math.max(44, Math.min(56, 52 * scale));
  const railTop = top + (players[1].plateY + players[1].h / 2) * scale + 6;
  const railBottom = top + (players[0].plateY - players[0].h / 2) * scale - 6;
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
    ...table, compact, size,
    rail: { left: railLeft, top: railY, width, height },
    panel: { left: panelRight - panelWidth, top: panelTop, width: panelWidth, height: panelHeight },
  };
}

/** Speech stays by its speaker's portrait; never place it over the compass. */
export function roomPhrasePosition(layout: ReturnType<typeof roomCommunicationLayout>, offset: number) {
  const { left, top, scale, players } = layout;
  const p = players[offset];
  const width = Math.min(238, 340 * scale);
  if (offset === 3) return { left: left + (p.x + p.w / 2 + 12) * scale, top: top + 182 * scale, width };
  const rightEdge = left + (p.x - p.w / 2 - 12) * scale;
  if (offset === 2) return { left: rightEdge - width, top: top + 66 * scale, width };
  if (offset === 0) {
    const line = Math.max(11, Math.min(15, 15 * scale)) * 1.4;
    const edge = layout.compact ? Math.min(rightEdge, layout.rail.left - 10) : rightEdge;
    return { left: edge - width, top: Math.min(top + 401 * scale, layout.handTop - 2 * line - 24), width };
  }
  return { left: rightEdge - width, top: top + 167 * scale, width };
}

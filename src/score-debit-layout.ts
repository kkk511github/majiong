import {
  claimPrompt,
  layoutPlayerHud,
  layoutTable,
  sceneOffset,
  type TableSceneState,
} from "../shared/table-scene";

export const DEBIT_WIDTH = 92,
  DEBIT_HEIGHT = 58,
  DEBIT_RISE = 14;
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
) {
  const offset = sceneOffset(seat, state.me);
  const preferred = [
    { x: 650, y: 440 },
    { x: 935, y: 260 },
    { x: 650, y: 125 },
    { x: 385, y: 265 },
  ][offset];
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
    const p = layoutPlayerHud(o, state.safeArea);
    return { ...p, y: p.plateY };
  });
  const obstacles: Box[] = [
    ...layoutTable(state),
    ...hud,
    ...controls,
    { x: 640, y: 278, w: 124, h: 96 },
    { x: 548, y: 280, w: 66, h: 66 },
    { x: 732, y: 280, w: 66, h: 66 },
  ];
  if (claimPrompt(state)) obstacles.push({ x: 122, y: 388, w: 196, h: 76 });
  const fits = (x: number, y: number) =>
    obstacles.every((b) =>
      debitSeparated(
        {
          x,
          y: y - DEBIT_RISE / 2,
          w: DEBIT_WIDTH,
          h: DEBIT_HEIGHT + DEBIT_RISE,
        },
        b,
      ),
    );
  if (fits(preferred.x, preferred.y)) return preferred;
  const zone = zones[offset],
    candidates = [];
  for (let y = zone.top; y <= zone.bottom; y += 6)
    for (let x = zone.left; x <= zone.right; x += 6)
      if (fits(x, y))
        candidates.push({
          x,
          y,
          distance: (x - preferred.x) ** 2 + (y - preferred.y) ** 2,
        });
  const best = candidates.sort((a, b) => a.distance - b.distance)[0];
  return best ? { x: best.x, y: best.y } : null;
}

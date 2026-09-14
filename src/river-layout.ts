// Reserve every slot from the available felt. Discard counts never resize tiles.
export function riverLayoutFor(
  width: number,
  height: number,
  spread = 0,
  maxTrackBottom = Infinity,
) {
  const baselineWidth = width - 2 * spread;
  const compass = baselineWidth < 420 ? 68 : 82;
  const playerGap = 9,
    rowGap = 2;
  let tileHeight = 14;
  for (let h = 42; h >= 14; h--) {
    const w = h * 0.72;
    if (
      Math.max(4 * h + 4 + compass + 12, 8 * w + 2 * h + rowGap + playerGap) <=
        height &&
      Math.max(8 * w + 8 * h + 12 + 2 * playerGap, 24 * w + 2 * playerGap) <=
        baselineWidth
    ) {
      tileHeight = h;
      break;
    }
  }
  const topOffset = height < 300 && baselineWidth > 300 ? -8 : 0;
  // The old enlargement could extend past the field into a raised hand.
  // Reserve two horizontal rows and eight sideways tiles, plus their gaps.
  // This limit depends only on the viewport, never on the number of discards.
  tileHeight = Math.min(
    tileHeight * 1.44,
    (maxTrackBottom - topOffset - 6) / 7.76,
  );
  const tileWidth = tileHeight * 0.72;
  const farTileHeight = tileHeight;
  const farTileWidth = tileWidth;
  const trackGap = 5;
  // Keep the original size calculation: the extra space is for larger public
  // tiles, not a new fit-to-count scale that would undo the 20% increase.
  const trackHeight = Math.max(
    height,
    8 * farTileWidth + 2 * farTileHeight + 1 + trackGap,
    8 * farTileWidth + 2 * tileHeight + 1 + trackGap,
  );
  return {
    width,
    height: trackHeight,
    ownHeight: Math.max(
      height,
      8 * farTileWidth + 2 * tileHeight + 1 + trackGap,
    ),
    topShift: Math.max(0, 12 * farTileWidth + trackGap - width / 2 - 30),
    topOffset,
    compass,
    compassWidth: compass,
    tileHeight,
    tileWidth,
    farTileHeight,
    farTileWidth,
    columns: 8,
    rows: 4,
    sideColumns: 8,
    sideRows: 4,
    rowGap: 1,
    playerGap: trackGap,
    centerShift: 0,
    sideInset: 0,
    riverWidth: 8 * tileWidth,
    riverHeight: 4 * tileHeight + 6,
    sideWidth: 4 * tileHeight + 6,
    sideHeight: 8 * tileWidth,
    farRiverWidth: 8 * farTileWidth,
    farRiverHeight: 4 * farTileHeight + 6,
    farSideWidth: 4 * farTileHeight + 6,
    farSideHeight: 8 * farTileWidth,
  };
}
export function riverSlot(
  l: ReturnType<typeof riverLayoutFor>,
  seat: number,
  index: number,
) {
  const h = seat === 0 ? l.tileHeight : l.farTileHeight,
    w = seat === 0 ? l.tileWidth : l.farTileWidth,
    row = Math.floor(index / 8),
    col = index % 8;
  const left = l.width / 2 - 4 * l.farTileWidth - l.playerGap,
    right = l.width / 2 + 4 * l.farTileWidth + l.playerGap;
  if (seat === 0)
    return row < 2
      ? {
          left: l.width / 2 - 4 * w + col * w,
          top: l.topOffset + l.ownHeight - h - row * (h + 1),
        }
      : {
          left: left - 8 * w + col * w - 8,
          top: l.topOffset + l.ownHeight - h - (row - 2) * (h + 1),
        };
  if (seat === 2)
    return row < 2
      ? {
          left: l.width / 2 - 4 * w + (7 - col) * w - l.topShift,
          top: l.topOffset + row * (h + 1),
        }
      : {
          left: right + (7 - col) * w - l.topShift,
          top: l.topOffset + (row - 2) * (h + 1),
        };
  if (seat === 1)
    return {
      left: right + row * (h + 1),
      top: l.topOffset + l.height - 8 * w + col * w,
    };
  return {
    left: left - h - row * (h + 1) - l.topShift,
    top: l.topOffset + (7 - col) * w,
  };
}

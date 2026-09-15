// Reserve every slot from the available felt. Discard counts never resize tiles.
export function riverLayoutFor(
  width: number,
  height: number,
  spread = 0,
  maxTrackBottom = Infinity,
  tileScale = 1,
  sideColumns = 6,
  baselineHeight = height,
  maxTileHeight = Infinity,
) {
  const baselineWidth = width - 2 * spread;
  let compass = baselineHeight < 210 ? 62 : 82;
  const playerGap = 9,
    rowGap = 2;
  let tileHeight = 14;
  for (let h = 42; h >= 14; h--) {
    const w = h * 0.72;
    if (
      Math.max(4 * h + 4 + compass + 12, 8 * w + 2 * h + rowGap + playerGap) <=
        baselineHeight &&
      Math.max(8 * w + 8 * h + 12 + 2 * playerGap, 24 * w + 2 * playerGap) <=
        baselineWidth
    ) {
      tileHeight = h;
      break;
    }
  }
  const topOffset = 0;
  // The old enlargement could extend past the field into a raised hand.
  // Reserve two horizontal rows and eight sideways tiles, plus their gaps.
  // This limit depends only on the viewport, never on the number of discards.
  tileHeight = Math.min(
    tileHeight * 1.44 * tileScale,
    maxTileHeight,
    (maxTrackBottom - compass - 12) / 4,
    (maxTrackBottom - topOffset - 6) / (sideColumns * 0.72 + 2),
  );
  // Apply the requested increase AFTER the old viewport caps. Otherwise those
  // caps silently cancel it on phones. Slots use this same fixed larger size.
  tileHeight *= 1.2;
  compass = 72;
  if (tileScale > 1)
    compass = Math.min(
      compass,
      Math.max(62, maxTrackBottom - 4 * tileHeight - 12),
    );
  const tileWidth = tileHeight * 0.72;
  const farTileHeight = tileHeight;
  const farTileWidth = tileWidth;
  const trackGap = 5;
  // Keep the original size calculation: the extra space is for larger public
  // tiles, not a new fit-to-count scale that would undo the 20% increase.
  const trackHeight = Math.max(
    height,
    4 * tileHeight + compass + 2,
    tileScale > 1 ? 4 * tileHeight + compass + 12 : 0,
    sideColumns * farTileWidth + 2 * farTileHeight + 1 + trackGap,
    sideColumns * farTileWidth + 2 * tileHeight + 1 + trackGap,
  );
  const ownHeight = Math.max(height, 4 * tileHeight + compass + 2);
  return {
    width,
    height: trackHeight,
    ownHeight,
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
    sideColumns,
    sideRows: Math.ceil(32 / sideColumns),
    rowGap: 1,
    playerGap: trackGap,
    centerShift: 0,
    sideInset: 0,
    riverWidth: 8 * tileWidth,
    riverHeight: 4 * tileHeight + 6,
    sideWidth: Math.ceil(32 / sideColumns) * (tileHeight + 1) + 2,
    sideHeight: sideColumns * tileWidth,
    farRiverWidth: 8 * farTileWidth,
    farRiverHeight: 4 * farTileHeight + 6,
    farSideWidth: Math.ceil(32 / sideColumns) * (farTileHeight + 1) + 2,
    farSideHeight: sideColumns * farTileWidth,
  };
}
export function riverSlot(
  l: ReturnType<typeof riverLayoutFor>,
  seat: number,
  index: number,
) {
  const h = seat === 0 ? l.tileHeight : l.farTileHeight,
    w = seat === 0 ? l.tileWidth : l.farTileWidth,
    columns = seat % 2 ? l.sideColumns : l.columns,
    row = Math.floor(index / columns),
    col = index % columns;
  const lane = Math.max(4 * l.farTileWidth, 67),
    left = l.width / 2 - lane - l.playerGap,
    right = l.width / 2 + lane + l.playerGap;
  if (seat === 0)
    return row < 2
      ? {
          left: l.width / 2 - 4 * w + col * w,
          top: l.topOffset + l.ownHeight - h - row * (h + 1),
        }
      : {
          left: left - 8 * w + col * w - 8,
          top: l.topOffset + l.height - h - (row - 2) * (h + 1),
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
      top: l.topOffset + l.height - l.sideColumns * w + col * w,
    };
  return {
    left: left - h - row * (h + 1) - l.topShift,
    top: l.topOffset + (l.sideColumns - 1 - col) * w,
  };
}

/** Redesigned table uses the full felt and the same rigid tile at every seat. */
export function tableRiverLayout(width: number, height: number, viewportHeight = height + 210) {
  const h = Math.min(48, (viewportHeight / 590) * 48, (width / 1280) * 48);
  const w = h * 0.72;
  return {
    ...riverLayoutFor(width, height),
    width,
    height,
    ownHeight: height,
    topOffset: 0,
    topShift: 0,
    tileHeight: h,
    tileWidth: w,
    farTileHeight: h,
    farTileWidth: w,
    compass: 82,
    compassWidth: 82,
    sideColumns: 8,
    sideRows: 4,
    playerGap: 12,
    riverWidth: w * 8,
    farRiverWidth: w * 8,
    riverHeight: h * 4 + 6,
    farRiverHeight: h * 4 + 6,
    sideHeight: w * 8,
    farSideHeight: w * 8,
    sideWidth: h * 4 + 6,
    farSideWidth: h * 4 + 6,
  };
}

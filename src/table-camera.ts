/** Camera and anchors measured from the approved 2152 × 980 reference.
 * The felt fills the viewport; all physical pieces share a uniform scale.
 * Only overflow rows are packed into adjacent clear felt, never scaled down. */
export const tableCamera = (width: number, height: number) => ({
  unit: Math.min(width / 1280, height / 590),
  width,
  height,
});

export function referenceRiverSlot(
  layout: { width: number; tileWidth: number; tileHeight: number },
  seat: number,
  index: number,
  viewportHeight: number,
) {
  const { width: w, tileWidth: tw, tileHeight: th } = layout;
  const { unit } = tableCamera(w, viewportHeight);
  const row = Math.floor(index / 8), col = index % 8;
  const originY = 100 * unit;
  if (seat === 0) return { left: w * .42 + col * tw, top: viewportHeight * .54 - originY + row * (th + 4 * unit) };
  if (seat === 2) return { left: w * .446 + (7 - col) * tw, top: viewportHeight * .255 - originY - row * (th + 4 * unit) };
  return {
    left: w * (seat === 1 ? .625 : .335) + (seat === 1 ? 1 : -1) * row * (th + 4 * unit),
    top: viewportHeight * .30 - originY + col * tw,
  };
}

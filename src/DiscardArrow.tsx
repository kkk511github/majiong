import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

type Edge = "top" | "right" | "bottom" | "left";
type Direction = "down" | "left" | "up" | "right";
type Rect = { left: number; top: number; right: number; bottom: number };
const pointsIntoTile: Record<Edge, Direction> = {
  top: "down",
  right: "left",
  bottom: "up",
  left: "right",
};
const intersects = (a: Rect, b: Rect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Position and direction are one decision: the tip always points into its tile. */
export function DiscardArrow({
  offset,
  row,
  label,
  layoutKey,
}: {
  offset: number;
  row: number;
  label: string;
  layoutKey: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [marker, setMarker] = useState<{
    style: CSSProperties;
    direction: Direction;
  }>({
    style: { visibility: "hidden" },
    direction: "down",
  });
  useLayoutEffect(() => {
    const arrow = ref.current;
    const target = arrow?.parentElement;
    const board = target?.closest("#table-board,.replay-table");
    if (!arrow || !target || !board) return;
    const place = () => {
      const t = target.getBoundingClientRect();
      const bounds = board.getBoundingClientRect();
      const obstacles = [
        ...board.querySelectorAll(
          ".river-tile,.hand .tile,.flower-rack .tile,.opponent-rack .tile,.opponent-rack .tile-back,.table-center,.claim-source,.game-actions button,.opponent-info,.replay-rack .tile,.replay-rack .tile-back,.replay-flowers .tile,.replay-seat,.replay-compass",
        ),
      ]
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect: r }) => r.width && r.height);
      // Side rivers grow outwards. The first row points in from the centre;
      // subsequent rows use the outer edge if the preceding row is in the way.
      const preferred: Edge =
        offset === 1
          ? row === 0
            ? "left"
            : "right"
          : offset === 3
            ? row === 0
              ? "right"
              : "left"
            : offset === 2
              ? "bottom"
              : "top";
      const edges = [
        preferred,
        ...(["top", "right", "bottom", "left"] as Edge[]).filter(
          (edge) => edge !== preferred,
        ),
      ];
      for (const size of [14, 10, 4]) {
        const travel = size === 4 ? 0 : 2;
        const padding = size === 4 ? 0.1 : 1;
        for (const gap of size === 4 ? [0.5, 1, 3, 6] : [3, 6, 10, 16, 22]) {
          for (const edge of edges) {
            const vertical = edge === "top" || edge === "bottom";
            const w = vertical ? (size === 4 ? 10 : size * 0.7) : size;
            const h = vertical ? size : size === 4 ? 10 : size * 0.7;
            for (const align of [0.5, 0.2, 0.8]) {
              const x =
                edge === "left"
                  ? t.left - gap - w
                  : edge === "right"
                    ? t.right + gap
                    : t.left + (t.width - w) * align;
              const y =
                edge === "top"
                  ? t.top - gap - h
                  : edge === "bottom"
                    ? t.bottom + gap
                    : t.top + (t.height - h) * align;
              // Reserve the full 2px animation path, plus a 1px clear border.
              const swept = {
                left: x - padding - (edge === "left" ? travel : 0),
                top: y - padding - (edge === "top" ? travel : 0),
                right: x + w + padding + (edge === "right" ? travel : 0),
                bottom: y + h + padding + (edge === "bottom" ? travel : 0),
              };
              if (
                swept.left < bounds.left ||
                swept.top < bounds.top ||
                swept.right > bounds.right ||
                swept.bottom > bounds.bottom ||
                obstacles.some(({ rect }) => intersects(swept, rect))
              )
                continue;
              // Never jump over a different tile to find empty space: that
              // would make the pointer appear to identify the intervening tile.
              const sightline = vertical
                ? {
                    left: x + w / 2 - 1,
                    right: x + w / 2 + 1,
                    top: edge === "top" ? y + h : t.bottom,
                    bottom: edge === "top" ? t.top : y,
                  }
                : {
                    left: edge === "left" ? x + w : t.right,
                    right: edge === "left" ? t.left : x,
                    top: y + h / 2 - 1,
                    bottom: y + h / 2 + 1,
                  };
              if (
                obstacles.some(
                  ({ el, rect }) =>
                    el !== target && intersects(sightline, rect),
                )
              )
                continue;
              setMarker({
                direction: pointsIntoTile[edge],
                style: {
                  left: x - t.left,
                  top: y - t.top,
                  width: w,
                  height: h,
                  "--pointer-travel": `${travel}px`,
                } as CSSProperties,
              });
              return;
            }
          }
        }
      }
      // The tile's gold outline remains available on a fully crowded board.
      setMarker((previous) => ({
        ...previous,
        style: { visibility: "hidden" },
      }));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(board);
    return () => observer.disconnect();
  }, [offset, row, layoutKey]);
  return (
    <span
      ref={ref}
      className="last-discard-arrow"
      data-direction={marker.direction}
      data-row={row}
      aria-label={label}
      style={marker.style}
    />
  );
}

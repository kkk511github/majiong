import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** A floating world-up pointer: all seats point vertically down at their last tile. */
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
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const target = ref.current?.parentElement;
    const board = target?.closest("#table-board,.replay-table");
    if (!target || !board) return;
    const place = () => {
      const t = target.getBoundingClientRect(),
        b = board.getBoundingClientRect();
      const faces = [
        ...board.querySelectorAll(
          ".river-tile,.hand .tile,.seat-meld,.seat-wall,.seat-flower-slot,.flower-rack .tile,.table-center",
        ),
      ]
        .filter((el) => el !== target)
        .map((el) => {
          const r = el.getBoundingClientRect();
          // Keep the symbol-bearing central face readable, including adjacent rows.
          return {
            left: r.left + r.width * 0.2,
            right: r.right - r.width * 0.2,
            top: r.top + r.height * 0.2,
            bottom: r.bottom - r.height * 0.15,
          };
        });
      const options = [];
      for (const size of [24, 20, 16, 12])
        for (const align of [0.5, 0.02, 0.98]) {
          const w = size * 0.8,
            x = t.left + t.width * align - w / 2,
            y = t.top - size - 2;
          if (x < b.left || x + w > b.right || y < b.top) continue;
          const overlap = faces.reduce(
            (sum, r) =>
              sum +
              Math.max(0, Math.min(x + w, r.right) - Math.max(x, r.left)) *
                Math.max(
                  0,
                  Math.min(y + size, r.bottom) - Math.max(y - 2, r.top),
                ),
            0,
          );
          options.push({
            x,
            y,
            w,
            size,
            score:
              overlap * 1000 + (24 - size) * 2 + Math.abs(align - 0.5) * 10,
          });
        }
      const best = options.sort((a, b) => a.score - b.score)[0];
      if (best)
        setStyle({
          left: best.x - t.left,
          top: best.y - t.top,
          width: best.w,
          height: best.size,
        });
    };
    // River row placement runs in the parent's layout effect; read its final geometry.
    const frame = requestAnimationFrame(place);
    const observer = new ResizeObserver(place);
    observer.observe(board);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [offset, row, layoutKey]);
  return (
    <span
      ref={ref}
      className="last-discard-arrow floating-discard-pointer"
      data-direction="down"
      data-row={row}
      aria-label={label}
      style={style}
    >
      <img
        src={`${import.meta.env.BASE_URL}art/effects/discard-pointer-gold-v1.png`}
        alt=""
        draggable={false}
      />
    </span>
  );
}

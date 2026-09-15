import { useLayoutEffect } from "react";

/** Keep the full-size, single-row choices in free felt above the player's hand.
 * Moving a row must never resize rivers or cover a raised/just-drawn tile. */
export function useActionPlacement(layoutKey: string) {
  useLayoutEffect(() => {
    const board = document.getElementById("table-board");
    const bar = board?.querySelector<HTMLElement>(".hand-feedback .action-bar");
    const actions = bar?.querySelector<HTMLElement>(".game-actions");
    const anchor = bar?.parentElement;
    if (!board || !bar || !actions || !anchor) return;
    const place = () => {
      const boardBox = board.getBoundingClientRect();
      const hand = board.querySelector<HTMLElement>(".hand")!;
      const handBox = hand.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      const w = actions.offsetWidth,
        h = actions.offsetHeight;
      if (!w || !h) return;
      const occupied = [
        ...board.querySelectorAll<HTMLElement>(
          ".discard-field .surface-tile,.seat-wall,.seat-meld,.seat-flower-slot,.flower-rack,.hand .tile,.hand-listening,.table-hud,.my-info > div:first-child",
        ),
      ]
        .filter(
          (el) =>
            el.getClientRects().length &&
            getComputedStyle(el).visibility !== "hidden",
        )
        .map((el) => el.getBoundingClientRect());
      const inset = 12;
      const minX = boardBox.left + inset,
        maxX = boardBox.right - inset - w;
      const minY = boardBox.top + boardBox.height * 0.45;
      const maxY = handBox.top - h - 2;
      const preferredX = a.right - w;
      const xs = [
        ...new Set([
          preferredX,
          minX,
          maxX,
          ...occupied.flatMap((b) => [b.right + 4, b.left - w - 4]),
        ]),
      ].filter((x) => x >= minX && x <= maxX);
      const ys = [
        ...new Set([
          maxY,
          ...occupied.flatMap((b) => [b.bottom + 4, b.top - h - 4]),
        ]),
      ].filter((y) => y >= minY && y <= maxY);
      const choices = xs
        .flatMap((x) =>
          ys.map((y) => ({
            x,
            y,
            score: Math.abs(x - preferredX) + 4 * (maxY - y),
          })),
        )
        .sort((p, q) => p.score - q.score);
      const position = choices.find(({ x, y }) =>
        occupied.every(
          (b) =>
            x + w <= b.left - 1 ||
            x >= b.right + 1 ||
            y + h <= b.top - 1 ||
            y >= b.bottom + 1,
        ),
      );
      if (!position) {
        bar.dataset.placement = "unresolved";
        return;
      }
      bar.dataset.placement = "clear";
      Object.assign(bar.style, {
        left: `${position.x - a.left}px`,
        top: `${position.y - a.top}px`,
        right: "auto",
        bottom: "auto",
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(board);
    observer.observe(actions);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [layoutKey]);
}

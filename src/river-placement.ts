import { useLayoutEffect } from "react";

type Box = { x: number; y: number; width: number; height: number };
const clear = (a: Box, b: Box, gap = 3) =>
  a.x + a.width + gap <= b.x ||
  b.x + b.width + gap <= a.x ||
  a.y + a.height + gap <= b.y ||
  b.y + b.height + gap <= a.y;

/** Keep complete, fixed-size river rows in free felt. Counts never affect scale.
 * A row keeps its anchor while it grows; new melds may require relocating a row.
 * All four seats share one occupancy map, including flowers and the dial. */
export function useRiverPlacement(key: string) {
  useLayoutEffect(() => {
    const field = document.querySelector<HTMLElement>(
      "#table-board .discard-field",
    );
    const board = document.getElementById("table-board");
    if (!field || !board) return;
    const place = () => {
      const f = field.getBoundingClientRect(),
        b = board.getBoundingClientRect();
      const rect = (el: Element): Box => {
        const r = el.getBoundingClientRect();
        return {
          x: r.left - f.left,
          y: r.top - f.top,
          width: r.width,
          height: r.height,
        };
      };
      const occupied = [
        ...board.querySelectorAll<HTMLElement>(
          ".standing-tile,.seat-tiles-top .seat-meld,.seat-flower-slot,.flower-rack,.action-clearance,.opponent-info,.my-info > div:first-child,.table-hud,.hand .tile,.hand-listening",
        ),
      ]
        .filter(
          (el) =>
            el.getClientRects().length &&
            getComputedStyle(el).visibility !== "hidden",
        )
        .map(rect)
        .filter((r) => r.width > 0 && r.height > 0);
      let unresolved = 0;
      // The background is a measured trapezoid. Public tiles cannot escape onto
      // the wooden rails, even in a long round with four exposed sets.
      const inFelt = (r: Box) => {
        const fraction = Math.max(0, Math.min(1, (r.y + f.top - b.top) / b.height));
        const margin = f.width * (.185 - .14 * fraction) + 4;
        return r.x >= margin && r.x + r.width <= f.width - margin;
      };
      const placeMelds = () => {
      // Public meld sets share the same collision map as the rivers. Reset
      // yesterday's offsets before reading their designed seat-lane anchors.
      const melds = [...board.querySelectorAll<HTMLElement>(
        ".seat-tiles-left > .seat-melds .seat-meld,.seat-tiles-right > .seat-melds .seat-meld"
      )];
      melds.forEach(node => { node.style.transform = ""; });
      for (const node of melds) {
        const box = rect(node);
        const leftSeat = !!node.closest(".seat-tiles-left");
        const x0 = leftSeat ? f.width * .12 : f.width * .57;
        const x1 = leftSeat ? f.width * .43 : f.width * .92;
        const y0 = 0, y1 = f.height;
        const fits = (x: number, y: number) => x >= x0 && x + box.width <= x1 &&
          y >= y0 && y + box.height <= y1 && inFelt({...box,x,y}) && occupied.every(r => clear({...box,x,y},r));
        let best = fits(box.x,box.y) ? {x:box.x,y:box.y} : undefined;
        if (!best) {
          let distance = Infinity;
          for (let y=y0; y<=y1-box.height; y+=3) for (let x=x0; x<=x1-box.width; x+=3) {
            const d=(x-box.x)**2 + (y-box.y)**2;
            if(d<distance && fits(x,y)){best={x,y};distance=d;}
          }
        }
        if(best) {
          node.style.transform=`translate(${best.x-box.x}px,${best.y-box.y}px)`;
          occupied.push({...box,...best});
        } else { unresolved++; occupied.push(box); }
      }
      };
      const bounds = {
        left: Math.max(8, b.left - f.left + 8),
        right: Math.min(f.width - 8, b.right - f.left - 8),
        top: b.top - f.top + 5,
        bottom: f.height,
      };
      const groups: {
        seat: number;
        nodes: HTMLElement[];
        width: number;
        height: number;
        x: number;
        y: number;
        index: number;
        step: number;
      }[] = [];
      for (let seat = 0; seat < 4; seat++) {
        const river = field.querySelector<HTMLElement>(`.discards-${seat}`)!;
        const tiles = [...river.querySelectorAll<HTMLElement>(".river-tile")];
        const cols = Number(river.dataset.columns);
        for (let index = 0; index < tiles.length; index += cols) {
          const nodes = tiles.slice(index, index + cols);
          const reserved = nodes.length;
          const first = nodes[0];
          const r = first.getBoundingClientRect();
          const positions = nodes.map((n) => ({
            x: Number(n.dataset.slotLeft ?? parseFloat(n.style.left)),
            y: Number(n.dataset.slotTop ?? parseFloat(n.style.top)),
          }));
          const x = Math.min(...positions.map((p) => p.x)),
            y = Math.min(...positions.map((p) => p.y));
          groups.push({
            seat,
            nodes,
            width: seat % 2 ? r.width : r.width * reserved,
            height: seat % 2 ? r.height * reserved : r.height,
            x,
            y,
            index,
            step: seat % 2 ? r.height : r.width,
          });
        }
      }
      // Preserve first rows before overflow rows; their central anchors define ownership.
      groups.sort((a, b) => a.index - b.index || a.seat - b.seat);
      let meldsPlaced = false;
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        if (!meldsPlaced && g.index > 0) { placeMelds(); meldsPlaced = true; }
        const fits = (x: number, y: number) =>
          x >= bounds.left &&
          y >= bounds.top &&
          x + g.width <= bounds.right &&
          y + g.height <= bounds.bottom &&
          inFelt({x,y,width:g.width,height:g.height}) &&
          occupied.every((r) =>
            clear({ x, y, width: g.width, height: g.height }, r),
          );
        let best = fits(g.x, g.y) ? { x: g.x, y: g.y } : undefined;
        if (!best) {
          const xs = [
            ...new Set([
              g.x,
              bounds.left,
              bounds.right - g.width,
              ...occupied.flatMap((r) => [
                r.x + r.width + 4,
                r.x - g.width - 4,
              ]),
            ]),
          ];
          const ys = [
            ...new Set([
              g.y,
              bounds.top,
              bounds.bottom - g.height,
              ...occupied.flatMap((r) => [
                r.y + r.height + 4,
                r.y - g.height - 4,
              ]),
            ]),
          ];
          const candidates = xs.flatMap((x) =>
            ys
              .filter((y) => fits(x, y))
              .map((y) => ({
                x,
                y,
                score: (x - g.x) ** 2 + (y - g.y) ** 2 * (g.seat % 2 ? 2 : 4),
              })),
          );
          best = candidates.sort((a, b) => a.score - b.score)[0];
        }
        if (!best) {
          // Boundary candidates may miss a narrow gap between projected lanes.
          let distance = Infinity;
          for (let y = bounds.top; y <= bounds.bottom - g.height; y += 4)
            for (let x = bounds.left; x <= bounds.right - g.width; x += 4) {
              const d = (x-g.x)**2 + (y-g.y)**2;
              if (d < distance && fits(x,y)) { best = {x,y}; distance = d; }
            }
        }
        if (!best && g.nodes.length > 1) {
          // A long side row can be blocked by a rare large flower rack. Split
          // that overflow into shorter intact rows, never shrink any tile.
          const half = Math.ceil(g.nodes.length / 2);
          const parts = [g.nodes.slice(0, half), g.nodes.slice(half)];
          const additions = parts.map((nodes, i) => ({
            ...g, nodes, index: Math.max(16, g.index),
            width: g.seat % 2 ? g.width : nodes.length * g.step,
            height: g.seat % 2 ? nodes.length * g.step : g.height,
            x: g.x + (g.seat % 2 ? i * (g.width + 4) : 0),
            y: g.y + (g.seat % 2 ? 0 : i * (g.height + 4)),
          }));
          groups.splice(gi + 1, 0, ...additions);
          continue;
        }
        if (!best) {
          unresolved++;
          continue;
        }
        occupied.push({ ...best, width: g.width, height: g.height });
        g.nodes.forEach((node, i) => {
          const col = i;
          node.style.left = `${best!.x + (g.seat % 2 ? 0 : col * g.step)}px`;
          node.style.top = `${best!.y + (g.seat % 2 ? col * g.step : 0)}px`;
        });
      }
      if (!meldsPlaced) placeMelds();
      field.dataset.placement = unresolved
        ? `unresolved-${unresolved}`
        : "clear";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(field);
    return () => observer.disconnect();
  }, [key]);
}

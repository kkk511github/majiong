import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { ReplayFrame, RoundReplay, Seat } from "../shared/types";
import { signedScore } from "../shared/settlement";
import { kind } from "../shared/tiles";
import { Tile, TileBack } from "./Tile";
import { DiscardArrow } from "./DiscardArrow";
import { riverLayoutFor, riverSlot } from "./river-layout";

export function ReplayTable({
  data,
  step,
  perspective,
  setPerspective,
  reveal,
  animate,
}: {
  data: RoundReplay;
  step: number;
  perspective: Seat;
  setPerspective: (seat: Seat) => void;
  reveal: boolean;
  animate: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 340 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const frame = data.frames[step];
  const preceding = data.frames.slice(0, step + 1).reverse();
  const { width: w, height: h } = size;
  const ownH = Math.min(76, h * 0.18, (w - (w < 650 ? 204 : 240)) / 14 / 0.72);
  const topH = Math.min(34, h * 0.088);
  const sideH = Math.min(30, (h - ownH - topH - 34) / 14 / 0.72);
  const publicH = Math.min(30, h * 0.085);
  const fieldHeight = h - ownH - topH - 25;
  const riverGap = Math.max(8, (w - 650) * 0.19);
  const riverH = Math.min(
    42,
    (fieldHeight - 5) / 6.32,
    (w / 2 - (w < 650 ? 88 : 112) - riverGap) / 8.88,
  );
  const layout = {
    ...riverLayoutFor(w * 0.85, fieldHeight),
    tileHeight: riverH,
    tileWidth: riverH * 0.72,
    farTileHeight: riverH,
    farTileWidth: riverH * 0.72,
    height: fieldHeight,
    ownHeight: fieldHeight,
    topOffset: 0,
    topShift: 0,
    playerGap: riverGap,
    rowGap: 1,
  };
  const fieldLeft = (w - layout.width) / 2;
  const fieldTop = topH + 12;
  const last = preceding.find((f) => f.type === "discard");
  const lastDiscard =
    last?.seat !== undefined &&
    last.tile !== undefined &&
    frame.players[last.seat].discards.includes(last.tile)
      ? { seat: last.seat, tile: last.tile }
      : undefined;
  const vars = {
    "--replay-own-h": `${ownH}px`,
    "--replay-public-h": `${publicH}px`,
  } as CSSProperties;
  return (
    <div
      ref={ref}
      className={`replay-table ${animate ? "replay-running" : ""}`}
      aria-label="四家牌桌录像"
      style={vars}
    >
      <div className="replay-table-brand" aria-hidden="true">
        南京麻将<span>牌 局 回 放</span>
      </div>
      {frame.players.map((player, seat) => {
        const offset = (seat - perspective + 4) % 4;
        const tileH = offset === 0 ? ownH : offset === 2 ? topH : sideH;
        const tileW = tileH * 0.72;
        const drawn = preceding.find(
          (f) =>
            f.seat === seat &&
            [
              "draw",
              "discard",
              "pung",
              "kong",
              "concealedKong",
              "addedKong",
            ].includes(f.type),
        );
        const drawnTile =
          drawn?.type === "draw" && player.hand.includes(drawn.tile!)
            ? drawn.tile
            : undefined;
        const sorted = [...player.hand]
          .sort((a, b) => kind(a) - kind(b) || a - b)
          .filter((t) => t !== drawnTile);
        if (drawnTile !== undefined) sorted.push(drawnTile);
        const meldCount = player.melds.reduce((n, m) => n + m.tiles.length, 0);
        const extraWinningTile =
          frame.result?.from !== undefined &&
          frame.result.winningTile !== undefined &&
          frame.result.winners.includes(seat as Seat) &&
          !player.hand.includes(frame.result.winningTile);
        const length =
          (player.hand.length + meldCount * (offset === 0 ? 0.62 : 1)) *
            (tileW + 1) +
          player.melds.length * 5 +
          (drawnTile === undefined ? 0 : 7) +
          (extraWinningTile ? tileW + 8 : 0);
        const rackStyle: CSSProperties =
          offset === 0
            ? { left: w < 650 ? 82 : 100, bottom: 7 }
            : offset === 2
              ? { left: (w - length) / 2, top: 7 }
              : offset === 1
                ? {
                    left: w - (w < 650 ? 70 : 88),
                    top: (h - ownH + topH - length) / 2,
                    transform: "rotate(90deg)",
                  }
                : {
                    left: w < 650 ? 70 : 88,
                    top: (h - ownH + topH + length) / 2,
                    transform: "rotate(-90deg)",
                  };
        return (
          <article
            key={seat}
            className={`replay-player replay-seat-${offset} ${frame.seat === seat ? "replay-active" : ""}`}
            aria-label={`${data.names[seat]}的回放牌面`}
          >
            <button
              className="replay-seat"
              onClick={() => setPerspective(seat as Seat)}
              aria-label={`切换到${data.names[seat]}视角`}
              aria-pressed={perspective === seat}
            >
              <b>
                {["东", "南", "西", "北"][seat]} · {data.names[seat]}
              </b>
              <span>{player.score} 分</span>
              {frame.result && (
                <strong
                  className={frame.result.deltas[seat] > 0 ? "positive" : ""}
                >
                  本局 {signedScore(frame.result.deltas[seat])}
                  {frame.result.winners.includes(seat as Seat) ? " · 胡" : ""}
                </strong>
              )}
            </button>
            <div
              className="replay-rack"
              style={
                {
                  ...rackStyle,
                  "--rack-h": `${tileH}px`,
                  "--rack-w": `${tileW}px`,
                } as CSSProperties
              }
              aria-label="手牌与碰杠"
            >
              {player.melds.map((m, i) => (
                <span
                  className="replay-meld"
                  key={i}
                  title={m.concealed ? "暗杠" : m.type === "kong" ? "杠" : "碰"}
                >
                  {m.tiles.map((t) => (
                    <Tile key={t} tile={t} />
                  ))}
                </span>
              ))}
              <span className="replay-concealed">
                {sorted.map((t) => (
                  <span
                    key={t}
                    className={`${t === drawnTile ? "replay-drawn" : ""} ${frame.type === "draw" && frame.tile === t ? "replay-new-tile" : ""}`}
                  >
                    {reveal || offset === 0 || frame.result ? (
                      <Tile tile={t} />
                    ) : (
                      <TileBack />
                    )}
                  </span>
                ))}
              </span>
              {frame.result?.from !== undefined &&
                frame.result.winningTile !== undefined &&
                frame.result.winners.includes(seat as Seat) &&
                !player.hand.includes(frame.result.winningTile) && (
                  <span className="replay-drawn replay-winning-tile">
                    <Tile tile={frame.result.winningTile} />
                  </span>
                )}
            </div>
            <div
              className="replay-flowers"
              aria-label={`${data.names[seat]}花牌 ${player.flowers.length}张`}
            >
              <span>花 {player.flowers.length}</span>
              <div>
                {player.flowers.map((t) => (
                  <Tile key={t} tile={t} />
                ))}
              </div>
            </div>
            <div
              className="replay-river"
              data-offset={offset}
              style={{ left: fieldLeft, top: fieldTop }}
              aria-label={`${data.names[seat]}弃牌`}
            >
              {player.discards.map((t, index) => {
                const slot =
                  offset === 1
                    ? {
                        left:
                          layout.width / 2 +
                          4 * layout.tileWidth +
                          riverGap +
                          Math.floor(index / 6) * (riverH + 1),
                        top:
                          fieldHeight -
                          6 * layout.tileWidth +
                          (index % 6) * layout.tileWidth,
                      }
                    : offset === 3
                      ? {
                          left:
                            layout.width / 2 -
                            4 * layout.tileWidth -
                            riverGap -
                            riverH -
                            Math.floor(index / 6) * (riverH + 1),
                          top: (5 - (index % 6)) * layout.tileWidth,
                        }
                      : riverSlot(layout, offset, index);
                const sideways = offset === 1 || offset === 3;
                const recent =
                  lastDiscard?.seat === seat && lastDiscard.tile === t;
                return (
                  <span
                    key={t}
                    className={`river-tile ${recent ? "recent-discard" : ""} ${frame.type === "discard" && frame.tile === t ? "replay-new-discard" : ""}`}
                    style={{
                      ...slot,
                      width: sideways ? layout.tileHeight : layout.tileWidth,
                      height: sideways ? layout.tileWidth : layout.tileHeight,
                    }}
                  >
                    <span
                      className="replay-tile-face"
                      style={{
                        width: layout.tileWidth,
                        height: layout.tileHeight,
                        transform: `translate(-50%,-50%) rotate(${[0, 90, 180, -90][offset]}deg)`,
                      }}
                    >
                      <Tile tile={t} />
                    </span>
                    {recent && (
                      <DiscardArrow
                        offset={offset}
                        row={Math.floor(index / (sideways ? 6 : 8))}
                        label="刚打出的牌"
                        layoutKey={`${step}:${w}:${h}:${perspective}`}
                      />
                    )}
                  </span>
                );
              })}
            </div>
          </article>
        );
      })}
      <div
        className="replay-compass"
        style={{
          top: fieldTop + fieldHeight / 2,
          width: Math.min(76, fieldHeight - 4 * riverH - 4),
          height: Math.min(76, fieldHeight - 4 * riverH - 4),
        }}
        aria-label="回放方位与余牌"
      >
        {[2, 3, 1, 0].map((offset) => (
          <span key={offset} className={`replay-wind-${offset}`}>
            {["东", "南", "西", "北"][(perspective + offset) % 4]}
          </span>
        ))}
        <strong>
          {frame.remaining}
          <small>余牌</small>
        </strong>
      </div>
    </div>
  );
}

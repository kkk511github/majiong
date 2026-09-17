import type { CSSProperties } from "react";
import type { PublicPlayer, Seat, Tile } from "../shared/types";
import { kind, tileName } from "../shared/tiles";
import { TILE_FRAMES, frameStyle } from "./tile-art";
import { MeldSourceArrow } from "./MeldSourceArrow";
import { meldDisplayTiles } from "../shared/table-scene";

/** All public tiles share one face, physical proportion, depth and light source.
 * Only the face rotates with the owner; the ivory/green thickness stays down
 * towards the camera. Concealed racks are actual standing backs, not face sprites. */
export function SurfaceTile({ tile, offset = 0, stacked = false }: {
  tile?: Tile; offset?: number; stacked?: boolean;
}) {
  return <span className={`surface-tile ${tile === undefined ? "concealed-surface" : ""} ${stacked ? "stacked-kong" : ""}`}
    role="img" aria-label={tile === undefined ? "暗牌" : tileName(tile)} data-offset={offset}>
    <span className="surface-plate"><span className="surface-face" style={tile === undefined ? undefined : frameStyle(TILE_FRAMES[kind(tile)])} /></span>
  </span>;
}

export function TableSeatTiles({ player, seat, me, names, position }: {
  player: PublicPlayer; seat: Seat; me: Seat; names: string[]; position: string;
}) {
  const offset = (seat - me + 4) % 4;
  const side = offset % 2 === 1;
  return <div className={`seat-tiles seat-tiles-${position}`} style={{
    "--flower-lanes": Math.max(1, Math.ceil(player.flowers.length / (side ? 8 : 10))),
    "--meld-rows": Math.min(2, player.melds.length),
    "--flower-length": Math.min(side ? 8 : 10, player.flowers.length),
  } as CSSProperties}>
    <div className="seat-wall" aria-label={`${player.name}手牌，共${player.handCount}张`}>
      {(player.hand.length ? player.hand : Array.from({ length: player.handCount }, () => undefined)).map((t, i) =>
        <span className={`standing-tile ${t === undefined ? "standing-back" : "standing-revealed"}`} key={t ?? `back-${i}`}>
          {t !== undefined && <SurfaceTile tile={t} offset={offset} />}
        </span>)}
      {!side && SeatMelds()}
    </div>
    {player.flowers.length > 0 && <div className="seat-flower-slot" role="group" aria-label={`${player.name}花牌，共${player.flowers.length}张`}>
      <span className="seat-flower-count">花 {player.flowers.length}</span>
      <div className="seat-flowers">{player.flowers.map(t => <SurfaceTile key={t} tile={t} offset={offset} />)}</div>
    </div>}
    {side && SeatMelds()}
  </div>;

  function SeatMelds() {
    return <div className="seat-melds">{player.melds.map((m, i) => {
      const tiles = meldDisplayTiles(m);
      return <div className="seat-meld" key={i} data-meld-type={m.type} data-concealed={m.concealed}>
        {tiles.map((t, n) => <SurfaceTile key={n} tile={t} offset={offset} stacked={!side && m.type === "kong" && n === 3} />)}
        <MeldSourceArrow meld={m} me={me} owner={seat} sourceName={names[m.from]} />
      </div>;
    })}</div>;
  }
}

import { kind, tileName } from "../shared/tiles";
import type { Tile as TileId } from "../shared/types";
import "./vivid-tiles.css";
import { BACK_FRAME, TILE_FRAMES, frameStyle } from "./tile-art";

export function TileFace({ tile }: { tile: TileId }) {
  return (
    <span
      className="tile-art vivid-tile"
      style={frameStyle(TILE_FRAMES[kind(tile)])}
    />
  );
}
export function Tile({
  tile,
  small = false,
  selected = false,
  last = false,
  onClick,
  interactive = false,
  disabled = false,
}: {
  tile: TileId;
  small?: boolean;
  selected?: boolean;
  last?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  disabled?: boolean;
}) {
  const className = `tile ${small ? "small" : ""} ${selected ? "selected" : ""} ${last ? "drawn" : ""}`;
  return onClick || interactive ? (
    <button
      className={className}
      data-tile={tile}
      disabled={disabled}
      aria-label={`选择${tileName(tile)}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <TileFace tile={tile} />
    </button>
  ) : (
    <span className={className} role="img" aria-label={tileName(tile)}>
      <TileFace tile={tile} />
    </span>
  );
}
export function TileBack() {
  return (
    <span className="tile-back">
      <span className="tile-art vivid-tile" style={frameStyle(BACK_FRAME)} />
    </span>
  );
}

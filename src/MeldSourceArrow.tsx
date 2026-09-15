import type { Meld, Seat } from "../shared/types";

export function meldSourceDirection(from: Seat, me: Seat) {
  return (["down", "right", "up", "left"] as const)[(from - me + 4) % 4];
}

/** A permanent provenance marker, independent of the most recent discard. */
export function MeldSourceArrow({
  meld,
  me,
  owner,
  sourceName,
}: {
  meld: Meld;
  me: Seat;
  owner: Seat;
  sourceName: string;
}) {
  if (meld.concealed || meld.from === owner) return null;
  const label = `${meld.type === "kong" ? "杠" : "碰"}牌来源：${sourceName}`;
  return (
    <span
      className="meld-source-arrow"
      data-direction={meldSourceDirection(meld.from, me)}
      data-source-seat={meld.from}
      role="img"
      aria-label={label}
      title={label}
    >
      <svg viewBox="190 161 867 902" aria-hidden="true"><image href="/meld-source-dart.png" width="1254" height="1254" /></svg>
    </span>
  );
}

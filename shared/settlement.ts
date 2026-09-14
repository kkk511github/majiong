import type { RoundRecord } from "./types";
export const signedScore = (value: number) =>
  value > 0 ? `+${value}` : String(value);
export function settlementRows(record: RoundRecord) {
  const initial = record.settlementBase ?? record.initialScore ?? 0,
    divisor = record.scoreDivisor ?? 1;
  return record.names
    .map((name, seat) => ({
      seat,
      name,
      id: record.playerIds?.[seat] ?? "",
      score: record.scores[seat],
      net: record.scores[seat] - initial,
      recorded: (record.scores[seat] - initial) / divisor,
    }))
    .sort((a, b) => b.net - a.net || a.seat - b.seat)
    .map((row, _, rows) => ({
      ...row,
      rank: 1 + rows.filter((other) => other.net > row.net).length,
    }));
}
export function settlementTime(at: number) {
  const d = new Date(at),
    pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

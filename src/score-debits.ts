import type { ScoreTransfer, Seat, View } from "../shared/types";

export const SCORE_DEBIT_MS = 1800;
const labels: Partial<Record<ScoreTransfer["reason"], string>> = {
  直杠: "明杠",
  补杠: "补杠",
  暗杠: "暗杠",
  花杠: "花杠",
  四连风: "四连风",
  四家跟牌: "四家同牌",
  四张同牌: "四张同牌",
};
export interface ScoreDebit {
  key: string;
  seat: Seat;
  amount: number;
  label: string;
}
export const isDiscardPenalty = (event: ScoreDebit) =>
  event.label === "四家同牌" || event.label === "四张同牌";
export const scoreDebitDuration = (event: ScoreDebit) =>
  isDiscardPenalty(event) ? 3600 : SCORE_DEBIT_MS;
const sameTransfer = (a: ScoreTransfer, b: ScoreTransfer) =>
  a.from === b.from &&
  a.to === b.to &&
  a.amount === b.amount &&
  a.reason === b.reason &&
  a.scope === b.scope;

/** Only newly confirmed in-hand payments. Never infer amounts from score changes. */
export function scoreDebits(
  before: View | null,
  after: View | null,
): ScoreDebit[] {
  if (
    !before ||
    !after ||
    before.id !== after.id ||
    before.me !== after.me ||
    after.revision <= before.revision ||
    after.phase === "waiting"
  )
    return [];
  const nextRound = after.round === before.round + 1;
  if (after.round !== before.round && !nextRound) return [];
  if (nextRound && !["waiting", "ended", "finished"].includes(before.phase))
    return [];
  const previous = nextRound ? [] : before.roundTransfers;
  const current = after.roundTransfers;
  // Older servers can omit the ledger; do not guess or replay a partial history.
  if (
    !previous ||
    !current ||
    previous.length > current.length ||
    previous.some((entry, i) => !sameTransfer(entry, current[i]))
  )
    return [];
  const groups = new Map<string, ScoreDebit>();
  current.slice(previous.length).forEach((entry, index) => {
    const label = labels[entry.reason];
    if (
      !label ||
      entry.scope ||
      entry.from === entry.to ||
      !after.players[entry.from] ||
      !Number.isFinite(entry.amount) ||
      entry.amount <= 0
    )
      return;
    const group = `${entry.from}:${entry.reason}`;
    const existing = groups.get(group);
    if (existing) existing.amount += entry.amount;
    else
      groups.set(group, {
        key: `${after.id}:${after.round}:${previous.length + index}:${group}`,
        seat: entry.from,
        amount: entry.amount,
        label,
      });
  });
  return [...groups.values()];
}

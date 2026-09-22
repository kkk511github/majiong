import type { Game, Seat, View } from "./types";

type TimedGame = Pick<
  Game,
  "table" | "phase" | "turn" | "deadline" | "overtimeCharged"
> & {
  players: ({ online?: boolean; overtimeUsedMs?: number; resumedDeadline?: number } | null)[];
};
const OFFLINE_OVERTIME_MS = 90_000;
function overtimeLimit(g: TimedGame, seat: Seat): number {
  const configured = (g.table?.settings.overtimeSeconds ?? 0) * 1000;
  return g.players[seat]?.online === false
    ? configured || OFFLINE_OVERTIME_MS
    : configured;
}
export function decisionDeadline(g: TimedGame, seat: Seat): number {
  return g.players[seat]?.resumedDeadline ?? g.deadline;
}
export function overtimeRemaining(
  g: TimedGame,
  seat: Seat,
  now: number,
): number {
  const limit = overtimeLimit(g, seat);
  const p = g.players[seat];
  const deadline = decisionDeadline(g, seat);
  const elapsed =
    !g.overtimeCharged?.includes(seat) && deadline > 0
      ? Math.max(0, now - deadline)
      : 0;
  return Math.max(0, limit - (p?.overtimeUsedMs ?? 0) - elapsed);
}
export function overtimeExpired(
  g: TimedGame,
  seat: Seat,
  now: number,
): boolean {
  return (
    decisionDeadline(g, seat) > 0 &&
    now >= decisionDeadline(g, seat) &&
    overtimeRemaining(g, seat, now) === 0
  );
}
/** Charge an active clock once; act() clones state so invalid input cannot consume time. */
export function chargeOvertime(g: Game, seat: Seat, now: number): void {
  const p = g.players[seat],
    limit = overtimeLimit(g, seat);
  const active =
    g.phase === "playing"
      ? g.turn === seat
      : g.phase === "claiming" &&
        !!g.pending?.offers[seat] &&
        g.pending.replies[seat] === undefined;
  if (
    !p ||
    p.bot ||
    !limit ||
    !active ||
    !decisionDeadline(g, seat) ||
    g.overtimeCharged?.includes(seat)
  )
    return;
  p.overtimeUsedMs = Math.min(
    limit,
    (p.overtimeUsedMs ?? 0) + Math.max(0, now - decisionDeadline(g, seat)),
  );
  (g.overtimeCharged ??= []).push(seat);
}
/** Resume only this player's clock; other claimants keep their existing deadline. */
export function setTrustee(
  g: Game,
  seat: Seat,
  enabled: boolean,
  now: number,
): void {
  const p = g.players[seat];
  if (!p) throw Error("玩家不在牌桌上");
  if (enabled && g.table?.settings.trusteeMode === "disabled")
    throw Error("本桌已关闭托管");
  const wasAutomatic = p.trustee || p.trusteeLocked;
  // Switching to automatic play must not erase time already spent deciding.
  if (enabled && !wasAutomatic) chargeOvertime(g, seat, now);
  p.trustee = enabled;
  if (!enabled) {
    p.trusteeLocked = false;
    p.trusteeRounds = 0;
    if (wasAutomatic) {
      const active =
        (g.phase === "playing" && g.turn === seat) ||
        (g.phase === "claiming" &&
          !!g.pending?.offers[seat] &&
          g.pending.replies[seat] === undefined);
      if (active) {
        // Give a returning player one normal decision window. Repeated toggles
        // in the same decision preserve unused normal time without refilling it.
        p.resumedDeadline = !g.rules.turnSeconds
          ? 0
          : p.resumedDeadline === undefined
            ? now + g.rules.turnSeconds * 1000
            : Math.max(p.resumedDeadline, now);
        g.overtimeCharged = g.overtimeCharged?.filter((s) => s !== seat);
      }
    }
  }
}
/** The ten-second preparation clock begins only when all four seats are occupied. */
export function refreshReadyDeadline(g: Game, now: number): boolean {
  if (!g.table) return false;
  const s = g.table.settings,
    previous = g.table.readyDeadline;
  if (
    g.phase !== "waiting" ||
    s.readyMode !== "manual" ||
    !s.kickUnready ||
    !g.players.every(Boolean)
  )
    g.table.readyDeadline = undefined;
  else g.table.readyDeadline ??= now + s.kickAfterSeconds * 1000;
  return previous !== g.table.readyDeadline;
}
export function unreadyExpired(g: Game, seat: Seat, now: number): boolean {
  const p = g.players[seat];
  return (
    !!p && !p.ready && !!g.table?.readyDeadline && now >= g.table.readyDeadline
  );
}
export function decisionCountdown(
  v: View,
  now: number,
): { seconds: number; overtime: boolean } {
  const seat = v.phase === "claiming" && v.actions.length ? v.me : v.turn;
  const deadline = decisionDeadline(v, seat);
  const overtime =
    overtimeLimit(v, seat) > 0 && deadline > 0 && now >= deadline;
  return {
    overtime,
    seconds: Math.max(
      0,
      Math.ceil(
        (overtime ? overtimeRemaining(v, seat, now) : deadline - now) / 1000,
      ),
    ),
  };
}

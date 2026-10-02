import { createHash } from "node:crypto";
import type { ClientMessage, Game } from "../shared/types";

export const ROOM_COMMANDS = new Set(["ready", "addBot", "action", "trustee", "leave", "dissolve"]);
type Receipt = NonNullable<Game["commandReceipts"]>[number];
const canonical = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]))
    : value;
export function commandDigest(message: ClientMessage) {
  return createHash("sha256").update(JSON.stringify(canonical(message))).digest("hex");
}
/** Room receipts commit with the state; recent departures also survive socket replacement.
 * The latter cache is intentionally bounded and is not a restart-safe global ledger. */
export function createCommandReceipts() {
  const recent = new Map<string, { receipt: Receipt; at: number }>();
  const key = (account: string, requestId: string) => JSON.stringify([account, requestId]);
  return {
    find(account: string, requestId: string, game?: Game) {
      const saved = game?.commandReceipts?.find(r => r.account === account && r.requestId === requestId);
      if (saved) return saved;
      const entry = recent.get(key(account, requestId));
      if (entry && performance.now() - entry.at < 600_000) return entry.receipt;
      recent.delete(key(account, requestId));
    },
    append(game: Game, receipt: Receipt) {
      game.commandReceipts = [...(game.commandReceipts ?? []).slice(-511), receipt];
    },
    committed(receipt: Receipt) {
      recent.set(key(receipt.account, receipt.requestId), { receipt, at: performance.now() });
      while (recent.size > 4096) recent.delete(recent.keys().next().value!);
    },
  };
}

import type { StoredRound } from "../shared/types";

export const RECORDS_POLL_MS = 5000;
export const RECORDS_HIGHLIGHT_MS = 15000;

/** The unfiltered completed-table feed is independent of pagination and read filters. */
export class CompletedTableArrivals {
  private initialized = false;
  private newestAt = -Infinity;
  private seen = new Set<string>();

  observe(records: StoredRound[]): string[] {
    const arrivals: string[] = [];
    for (const item of records) {
      if (!item.game || !Number.isFinite(item.record.at)) continue;
      if (
        this.initialized &&
        !this.seen.has(item.game) &&
        item.record.at >= this.newestAt
      )
        arrivals.push(item.game);
    }
    for (const item of records) {
      if (!item.game || !Number.isFinite(item.record.at)) continue;
      this.seen.add(item.game);
      this.newestAt = Math.max(this.newestAt, item.record.at);
    }
    // Remember ties and out-of-order responses without growing for a long admin session.
    while (this.seen.size > 1000)
      this.seen.delete(this.seen.values().next().value!);
    this.initialized = true;
    return [...new Set(arrivals)];
  }
}

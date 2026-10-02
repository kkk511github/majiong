import { monitorEventLoopDelay } from "node:perf_hooks";

/** Aggregate only: no SQL, account IDs, room state or credentials. */
export function createStorageHealth() {
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  let attempts = 0, failures = 0, busyFailures = 0, totalMs = 0, maxMs = 0;
  return {
    record(started: number, error?: unknown) {
      const elapsedMs = performance.now() - started;
      attempts++; totalMs += elapsedMs; maxMs = Math.max(maxMs, elapsedMs);
      if (error) {
        failures++;
        if (/locked|busy/i.test(error instanceof Error ? error.message : String(error))) busyFailures++;
      }
    },
    snapshot: () => ({ attempts, failures, busyFailures, totalMs, maxMs,
      eventLoopP95Ms: lag.percentile(95) / 1e6, eventLoopMaxMs: lag.max / 1e6 }),
    close: () => lag.disable(),
  };
}

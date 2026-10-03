import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { hintInteractionView, actionRailScenarios } from '../tests/fixtures/app-interaction';
import * as hints from '../src/listening-hints';
import { tableActionRail } from '../src/table-action-rail';
import { tableOverlayLayout } from '../src/table-overlay-layout';
import type { View } from '../shared/types';

// Before the optimization this module is absent. The same fixtures/measurement
// protocol also run on that version, so the paired report has a real baseline.
type Cache = { readyDiscards(view: View): number[]; hints(view: View, discard?: number): number[] };
let cache: Cache | undefined;
const cacheModule = new URL('../src/listening-hint-cache.ts', import.meta.url);
if (existsSync(cacheModule)) {
  const module = await import(cacheModule.href);
  cache = new module.ListeningHintCache();
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function measure(work: () => unknown, count: number) {
  for (let i = 0; i < 5; i++) work();
  const times = Array.from({ length: count }, () => { const start = performance.now(); work(); return performance.now() - start; }).sort((a, b) => a - b);
  return { samples: count, medianMs: times[Math.floor(count / 2)], p95Ms: times[Math.floor(count * .95)] };
}
const view = hintInteractionView();
const snapshots = Array.from({ length: 30 }, (_, index) => {
  const next = structuredClone(view); next.revision += index;
  next.players[1]!.score += index; next.players[2]!.online = index % 2 === 0;
  next.players[3]!.discards = [60 + index % 4]; return next;
});
let hintOutput: unknown;
const preview = (v: View, discard: number) => cache ? cache.hints(v, discard) : hints.listeningHints(v.players[v.me]!, v.rules, discard, v.players, { seat: v.me, earthlyWaits: v.earthlyWaits });
const ready = (v: View) => cache ? cache.readyDiscards(v) : hints.readyDiscardTiles(v);
const snapshotUpdates = measure(() => {
  hintOutput = snapshots.map(v => [ready(v), preview(v, 32)]);
}, 30);
const repeatedSelections = measure(() => {
  hintOutput = Array.from({ length: 30 }, (_, index) => preview(view, view.players[0]!.hand[index % 14]));
}, 50);
// Include unseen counts separately: public discards must update even on a cache hit.
const publicCounts = snapshots.map(v => hints.unseenHintCounts(v, [15]));
const scenarios = actionRailScenarios();
const layouts = scenarios.map(s => tableOverlayLayout(s.host, s.frame, s.state.safeArea, s.state.tableStyle));
let railOutput: unknown;
const rail = measure(() => {
  railOutput = scenarios.map((s, i) => tableActionRail(s.state, layouts[i], s.host.height));
}, 12);
const result = {
  measuredAt: new Date().toISOString(), node: process.version, cachedHints: !!cache,
  notes: 'Synthetic same-hand UI snapshots; Node main-thread work, not device FPS or network latency. Selection batches contain 30 choices; layout batches contain all scenarios.',
  snapshotUpdates, repeatedSelections, actionRail: { ...rail, scenarios: scenarios.length },
  fingerprints: { hints: digest(hintOutput), unseen: digest(publicCounts), actionRail: digest(railOutput) },
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const path = process.argv[outputIndex + 1]; if (!path || path.startsWith('-')) throw Error('Missing output path');
  writeFileSync(path, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
console.log(JSON.stringify(result, null, 2));

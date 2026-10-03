import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import * as currentEngine from '../shared/engine';
import * as currentRules from '../shared/nanjing-rules';
import * as currentTiles from '../shared/tiles';
import * as currentSettlement from '../shared/settlement';
import { createRecords as currentRecords } from '../server/records';
import { externalRound as currentExternal } from '../tests/fixtures/external-round';
import type { Action, Game, RoundRecord, Rules, Seat } from '../shared/types';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const serialized = (value: unknown) => JSON.stringify(value, (key, item) => {
  if (key === 'readAt' || key === 'adminReadAt') return item == null ? null : 'read';
  if (item && typeof item === 'object' && !Array.isArray(item))
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  return item;
});
function equal(old: unknown, current: unknown, label: string) {
  assert.equal(sha(serialized(current)), sha(serialized(old)), label);
}
function live(g: Game) {
  const { commandReceipts: _receipts, replay, history: _history, ...state } = g;
  if (!replay) return state;
  const { frames, ...metadata } = replay;
  return { ...state, replay: { ...metadata, frameCount: frames.length, latestFrame: frames.at(-1) } };
}

/** Synthetic inputs only. Exports a historical commit into a private temp
 * directory and compares it to the working tree. Never opens a deployment DB. */
export async function checkGameplayCompatibility(options: { baseline?: string; seeds?: number } = {}) {
  const baseline = options.baseline ?? '2768411', seeds = options.seeds ?? 8;
  if (baseline.startsWith('-') || !Number.isInteger(seeds) || seeds < 1 || seeds > 24)
    throw Error('Invalid baseline or seed count (1..24)');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  const commit = git('rev-parse', '--verify', baseline + '^{commit}').toString().trim();
  const protectedFiles = [
    'shared/scoring.ts', 'shared/scoring-nanjing.ts', 'shared/nanjing-rules.ts',
    'shared/reference-rules.ts', 'shared/settlement.ts', 'shared/tiles.ts',
    'shared/timing.ts', 'shared/table-settings.ts', 'shared/replay.ts',
  ];
  const sourceChecks = protectedFiles.map(file => {
    const oldHash = sha(git('show', commit + ':' + file));
    const currentHash = sha(readFileSync(join(root, file)));
    assert.equal(currentHash, oldHash, file + ' changed from the gameplay baseline');
    return { file, sha256: currentHash, identical: true };
  });
  const beforeEngine = git('show', commit + ':shared/engine.ts').toString();
  const afterEngine = readFileSync(join(root, 'shared/engine.ts'), 'utf8');
  // Exactly one allowed engine difference: private receipts must not reach a View.
  equal(beforeEngine.replace('    commandReceipts: _commandReceipts,\n', ''),
    afterEngine.replace('    commandReceipts: _commandReceipts,\n', ''), 'engine changed beyond omitting private receipts');
  const defaults = (source: string) => source.match(/export const DEFAULT_RULES: Rules = \{[\s\S]*?\n\};/)?.[0];
  const oldDefaults = defaults(git('show', commit + ':shared/types.ts').toString());
  assert.ok(oldDefaults, 'Baseline default rules missing');
  equal(oldDefaults, defaults(readFileSync(join(root, 'shared/types.ts'), 'utf8')), 'default rules changed');
  const dir = mkdtempSync(join(tmpdir(), 'mahjong-gameplay-compat-'));
  const opened: DatabaseSync[] = [];
  try {
    execFileSync('tar', ['-x', '-C', dir], { input: git('archive', commit, 'server', 'shared', 'tests/fixtures', 'package.json') });
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
    const load = (path: string) => import(pathToFileURL(join(dir, path)).href);
    const engine = await load('shared/engine.ts') as typeof currentEngine;
    const rules = await load('shared/nanjing-rules.ts') as typeof currentRules;
    const tiles = await load('shared/tiles.ts') as typeof currentTiles;
    const settlement = await load('shared/settlement.ts') as typeof currentSettlement;
    const records = await load('server/records.ts') as { createRecords: typeof currentRecords };
    const external = await load('tests/fixtures/external-round.ts') as { externalRound: typeof currentExternal };
    const actions: Record<string, number> = {}, finishes: Record<string, number> = {};
    let tables = 0, rounds = 0, steps = 0, views = 0;
    const trace = createHash('sha256');
    const profiles: Rules['id'][] = ['nj-casual-v1', 'nj-garden-v2', 'nj-open-v2', 'nj-garden-b-v3'];
    for (const profile of profiles) for (const policy of ['bot', 'trustee'] as const) for (let seed = 1; seed <= seeds; seed++) {
      const id = `compat-${profile}-${policy}-${seed}`;
      const configure = (e: typeof currentEngine, r: typeof currentRules) => {
        const g = e.createGame('135790', id, { ...r.ruleDefaults(profile), rounds: 8 });
        g.scoreDivisor = [1, 2, 5][(seed - 1) % 3];
        g.settlementBase = 100;
        g.players = e.seats.map(seat => ({ ...e.newPlayer(String(seat), `牌友${seat}`, policy === 'bot'), ready: true, trustee: policy === 'trustee' }));
        return g;
      };
      let old = configure(engine, rules), next = configure(currentEngine, currentRules), now = 1000;
      tables++;
      while (old.phase !== 'finished') {
        assert.ok(old.round < 8, id + ' exceeded eight rounds');
        // Human seats explicitly ready for the next hand; trustees do not
        // change the game's existing manual preparation rule.
        for (const seat of engine.seats) {
          old.players[seat]!.ready = true;
          next.players[seat]!.ready = true;
        }
        const deal = seed * 100 + old.round + 1;
        old = engine.startRound(old, now, tiles.seededRandom(deal));
        next = currentEngine.startRound(next, now, currentTiles.seededRandom(deal));
        equal(old, next, id + ' deal');
        rounds++;
        for (let step = 0; step < 600 && ['playing', 'claiming'].includes(old.phase); step++) {
          const label = `${id} round=${old.round} step=${step}`;
          const seat = old.phase === 'playing' ? old.turn : engine.seats.find(s => old.pending?.offers[s] && old.pending.replies[s] === undefined)!;
          const choice = (e: typeof currentEngine, g: Game): Action | null => policy === 'bot' ? e.botAction(g, seat) : e.trusteeAction(g, seat);
          const action = choice(engine, old);
          assert.ok(action, label + ' lacks legal action');
          equal(action, choice(currentEngine, next), label + ' legal action');
          for (const viewer of engine.seats) {
            equal(engine.viewFor(old, viewer), currentEngine.viewFor(next, viewer), label + ' view=' + viewer);
            views++;
          }
          now += 1000;
          old = engine.act(old, seat, action, now);
          next = currentEngine.act(next, seat, action, now);
          equal(live(old), live(next), label + ' state/score/ledger/replay-frame');
          trace.update(serialized({ label, seat, action, state: sha(serialized(live(next))) }) + '\n');
          actions[action.type] = (actions[action.type] ?? 0) + 1;
          steps++;
        }
        assert.ok(['ended', 'finished'].includes(old.phase), id + ' did not complete');
        // Full histories and every replay frame are checked at each hand end.
        equal(old, next, id + ' complete hand/history/replay');
        equal(settlement.settlementRows(old.history.at(-1)!), currentSettlement.settlementRows(next.history.at(-1)!), id + ' settlement');
        const reason = old.result!.reason;
        finishes[reason] = (finishes[reason] ?? 0) + 1;
      }
    }
    const special: Game[] = [];
    let blockedZeroBalanceCases = 0;
    for (const profile of ['nj-garden-v2', 'nj-garden-b-v3'] as const)
      for (const kind of ['three', 'pure', 'global'] as const)
        for (const multiplier of [1, 2]) for (const payerBalance of [0, 4, 90])
          for (const robbed of kind === 'global' ? [false] : [false, true]) {
            const config = { rules: { id: profile }, kind, multiplier, payerBalance, robbed, gameId: `special-${special.length}` };
            const old = external.externalRound(config), next = currentExternal(config);
            equal(old, next, serialized(config) + ' external/robbed-kong result');
            if (payerBalance === 0 && kind !== 'three') {
              // Existing rules forbid claiming against a zero-balance discarder
              // or added-kong player. Such a case must not fabricate a settlement.
              assert.equal(old.history.length, 0, 'Zero-balance payer unexpectedly settled');
              assert.equal(old.phase, 'playing');
              assert.equal(engine.viewFor(old, 2).actions.includes('hu'), false);
              equal(engine.viewFor(old, 2), currentEngine.viewFor(next, 2), 'zero-balance hu restriction');
              blockedZeroBalanceCases++;
              continue;
            }
            assert.ok(old.history.at(-1), serialized(config) + ' baseline fixture did not settle; phase=' + old.phase);
            equal(settlement.settlementRows(old.history.at(-1)!), currentSettlement.settlementRows(next.history.at(-1)!), serialized(config) + ' external settlement');
            special.push(next);
          }
    for (const multiplier of [1, 2]) {
      const first = { kind: 'three' as const, multiplier, alsoWin: true, gameId: `multi-${multiplier}` };
      const old = external.externalRound(first), next = currentExternal(first);
      equal(old, next, 'multiwinner external ledger');
      assert.equal(old.result!.winners.length, 2, 'Fixture must actually have two winners');
      const second = { ...first, multiplier: 2 };
      const oldSecond = external.externalRound({ ...second, previous: old });
      const nextSecond = currentExternal({ ...second, previous: next });
      equal(oldSecond, nextSecond, 'next hand cumulative external ledger/multiplier');
      special.push(nextSecond);
    }
    const setup = (factory: typeof currentRecords) => {
      const db = new DatabaseSync(':memory:'); opened.push(db);
      db.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY,username TEXT,name TEXT,role TEXT);
        CREATE TABLE account_numbers(account_id TEXT PRIMARY KEY,member_id INTEGER UNIQUE);
        CREATE TABLE rooms(state TEXT); CREATE TABLE table_archives(state TEXT);
        INSERT INTO accounts VALUES('admin','admin','管理员','admin');`);
      for (let i = 0; i < 4; i++) {
        db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run('external-' + i, 'member-' + i, ['甲', '乙', '丙', '丁'][i], 'member');
        db.prepare('INSERT INTO account_numbers VALUES(?,?)').run('external-' + i, 100001 + i);
      }
      const api = factory(db, id => 'fixture-avatar-' + id);
      const insert = (source: string, record: RoundRecord, game: string, privateNames: number) =>
        db.prepare(`INSERT INTO ${source} VALUES(?,?,?,?,?,?,?)`).run(record.id, game, '789123', record.at, JSON.stringify(record.playerIds), privateNames, JSON.stringify(record));
      for (const [i, g] of special.entries()) {
        for (const r of g.history) insert('round_records', r, g.id, i % 2);
        insert('match_records', { ...g.history.at(-1)!, id: g.id + '-final', matchFinished: true }, g.id, i % 2);
      }
      // Legacy missing baseline, null fields, negative balances and every supported divisor.
      for (let i = 0; i < 6; i++) {
        const r: RoundRecord = { ...special[0].history[0], id: 'legacy-' + i,
          names: ['甲', '乙', '丙', '丁'], scores: [210, 130, -10, 30],
          ...(i % 2 ? { initialScore: 90 } : { initialScore: undefined }),
          settlementBase: undefined, scoreDivisor: [1, 2, 5][i % 3],
          externalScores: i % 2 ? [50, -50, 0, 0] : undefined };
        insert('match_records', r, r.id, i % 2);
        insert('round_records', r, r.id, i % 2);
      }
      return api;
    };
    const beforeRecords = setup(records.createRecords), afterRecords = setup(currentRecords);
    let recordChecks = 0;
    for (const scope of ['matches', 'rounds']) for (const admin of [true, false])
      for (const page of ['1', '2', '5']) for (const calendar of ['0', '1'])
        for (const filter of [{}, { from: '0', to: '10000' }, { code: '789' },
          ...(admin ? [{ member: '100001' }, { member: '999999' }, { read: 'unread' }] : [])]) {
          const query = new URLSearchParams({ scope, page, calendar });
          for (const [key, value] of Object.entries(filter)) if (value !== undefined) query.set(key, value);
          const viewer = admin ? 'admin' : 'external-0';
          equal(beforeRecords.list(query, viewer, admin), afterRecords.list(query, viewer, admin), 'records list ' + query + ' admin=' + admin);
          recordChecks++;
        }
    for (const g of special) for (const admin of [true, false]) {
      equal(beforeRecords.details(g.id, admin ? 'admin' : 'external-0', admin),
        afterRecords.details(g.id, admin ? 'admin' : 'external-0', admin), 'details ' + g.id + ' admin=' + admin);
      recordChecks++;
    }
    for (const file of ['tests/fixtures/external-round.ts', 'tests/fixtures/replayed-round.ts'])
      assert.equal(sha(git('show', commit + ':' + file)), sha(readFileSync(join(root, file))), 'Baseline fixture itself changed: ' + file);
    const privacy = special[0];
    privacy.commandReceipts = [{ account: 'internal-fixture', requestId: 'private-request', type: 'action', digest: 'private-digest' }];
    for (const seat of currentEngine.seats) {
      assert.equal(Object.hasOwn(currentEngine.viewFor(privacy, seat), 'commandReceipts'), false);
      equal(engine.viewFor({ ...privacy, commandReceipts: undefined }, seat), currentEngine.viewFor(privacy, seat), 'receipt omission only');
    }
    return { kind: 'gameplay-compatibility', at: new Date().toISOString(), baseline: commit,
      candidate: git('rev-parse', 'HEAD').toString().trim(), candidateIncludesWorkingTree: true,
      candidateSourceHashes: Object.fromEntries([...protectedFiles, 'shared/engine.ts', 'shared/types.ts',
        'server/service.ts', 'server/records.ts', 'server/record-participants.ts',
        'server/command-receipts.ts', 'src/game-client.ts', 'src/App.tsx',
        'src/LiveCocosTable.tsx', 'src/listening-hints.ts', 'src/listening-hint-cache.ts',
        'src/table-action-rail.ts'].map(file => [file, sha(readFileSync(join(root, file)))])),
      passed: true, sourceChecks, engineChange: 'Only private commandReceipts omitted from player View',
      defaultRulesIdentical: true, profiles, seedsPerProfileAndPolicy: seeds, policies: ['bot', 'trustee'],
      tables, rounds, steps, publicViewsCompared: views, actions, finishes,
      specialCases: special.length, blockedZeroBalanceCases, recordResponseChecks: recordChecks, traceSha256: trace.digest('hex'),
      note: 'Deterministic synthetic engine, ledger, replay, settlement and records comparison. Socket deadline/revision validation is covered by server tests; production database and native devices are not exercised.' };
  } finally {
    for (const db of opened) db.close();
    // Only the private directory created by this invocation is removed.
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), flags = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--baseline', '--seeds', '--output'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || flags.has(args[i]))
        throw Error('Usage: npm run check:gameplay:compat -- [--baseline 2768411] [--seeds 8] [--output new-report.json]');
      flags.set(args[i], args[i + 1]);
    }
    if (flags.has('--output') && existsSync(flags.get('--output')!)) throw Error('Output already exists');
    const report = await checkGameplayCompatibility({ baseline: flags.get('--baseline'), seeds: flags.has('--seeds') ? Number(flags.get('--seeds')) : undefined });
    const json = JSON.stringify(report, null, 2) + '\n';
    if (flags.has('--output')) writeFileSync(flags.get('--output')!, json, { flag: 'wx' });
    console.log(json);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Gameplay comparison failed');
    process.exitCode = 1;
  }
}

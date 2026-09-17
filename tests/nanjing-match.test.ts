import { expect, it } from "vitest";
import { act, botAction, createGame, newPlayer, seats, startRound, viewFor } from "../shared/engine";
import { ruleDefaults } from "../shared/nanjing-rules";
import { roundNet, settlementRows } from "../shared/settlement";
import { seededRandom } from "../shared/tiles";
import type { Game, Rules } from "../shared/types";

function verifyAccounts(game: Game, where: string) {
  const table = [0, 0, 0, 0], outside = [0, 0, 0, 0];
  for (const bill of game.roundTransfers ?? []) {
    expect(bill.from, where).not.toBe(bill.to);
    expect(Number.isSafeInteger(bill.amount), where).toBe(true);
    expect(bill.amount, where).toBeGreaterThan(0);
    const ledger = bill.scope === "external" ? outside : table;
    ledger[bill.from] -= bill.amount;
    ledger[bill.to] += bill.amount;
  }
  for (const seat of seats) {
    expect(game.players[seat]!.score, where).toBe(game.roundStartScores[seat] + table[seat]);
    expect(game.players[seat]!.externalScore ?? 0, where).toBe((game.roundStartExternalScores?.[seat] ?? 0) + outside[seat]);
  }
  expect(game.players.reduce((n, p) => n + p!.score, 0), where).toBe(360);
  expect(game.players.reduce((n, p) => n + (p!.externalScore ?? 0), 0), where).toBe(0);
  if (game.rules.twoBankrupt) expect(game.players.every(p => p!.score >= 0), where).toBe(true);
}

it.each(["nj-garden-v2", "nj-open-v2", "nj-garden-b-v3"] as Rules["id"][])(
  "%s：24桌连续八把验证累计、换庄、倍率、历史快照及终桌守恒",
  (id) => {
    const reached = new Set<number>();
    let earlyEnds = 0;
    for (let seed = 1; seed <= 24; seed++) {
      let game = createGame("135790", `full-${id}-${seed}`, { ...ruleDefaults(id), rounds: 8 });
      game.settlementBase = 100;
      game.players = seats.map(seat => newPlayer(String(seat), `牌友${seat}`, true));
      let now = 1000;
      while (game.phase !== "finished") {
        expect(game.round).toBeLessThan(8);
        const frozenHistory = JSON.stringify(game.history), previous = game;
        const nextRound = game.round + 1;
        const where = `${id} seed=${seed} round=${nextRound}`;
        game = startRound(game, now, seededRandom(seed * 100 + nextRound));
        reached.add(game.round);
        expect(game.round, where).toBe(nextRound);
        expect(game.ruleState!.multiplier, where).toBe(previous.ruleState?.nextMultiplier ?? 1);
        expect(game.dealer, where).toBe(previous.round && !previous.ruleState!.keepDealer ? (previous.dealer + 1) % 4 : previous.dealer);
        expect(game.roundStartScores, where).toEqual(previous.players.map(p => p!.score));
        expect(game.roundStartExternalScores, where).toEqual(previous.players.map(p => p!.externalScore ?? 0));
        expect(game.replay!.multiplier, where).toBe(game.ruleState!.multiplier);
        expect(game.replay!.rules, where).toEqual(game.rules);
        verifyAccounts(game, where);
        for (let step = 0; step < 600 && ["playing", "claiming"].includes(game.phase); step++) {
          now += 100;
          const seat = game.phase === "playing" ? game.turn : seats.find(s => game.pending?.offers[s] && game.pending.replies[s] === undefined)!;
          const action = botAction(game, seat);
          expect(action, `${where} step=${step}`).toBeTruthy();
          game = act(game, seat, action!, now);
          const physical = [...game.wall, ...game.players.flatMap(p => [...p!.hand, ...p!.flowers, ...p!.discards, ...p!.melds.flatMap(m => m.tiles)])];
          expect(physical, where).toHaveLength(144);
          expect(new Set(physical).size, where).toBe(144);
          verifyAccounts(game, where);
        }
        expect(["ended", "finished"], where).toContain(game.phase);
        expect(game.history, where).toHaveLength(nextRound);
        expect(JSON.stringify(game.history.slice(0, -1)), where).toBe(frozenHistory);
        const saved = game.history.at(-1)!;
        expect(saved.result, where).toEqual(game.result);
        expect(saved.scores, where).toEqual(game.players.map(p => p!.score));
        expect(saved.externalScores, where).toEqual(game.players.map(p => p!.externalScore ?? 0));
        expect(game.replay!.frames.at(-1)!.result, where).toEqual(game.result);
        for (const seat of seats) {
          const live = viewFor(game, seat);
          expect(live.roundMultiplier, where).toBe(saved.multiplier);
          expect(game.history.reduce((n, r) => n + roundNet(r.result, seat), 0), where)
            .toBe(game.players[seat]!.score - 90 + (game.players[seat]!.externalScore ?? 0));
        }
      }
      expect(game.round).toBeLessThanOrEqual(8);
      if (game.round < 8) earlyEnds++;
      const final = settlementRows(game.history.at(-1)!);
      expect(final.reduce((n, row) => n + row.recorded, 0)).toBe(-20);
      expect(() => startRound(game)).toThrow();
    }
    // The audit must actually reach later hands, not pass solely on early bankruptcies.
    expect([...reached].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    if (id !== "nj-open-v2") expect(earlyEnds).toBeGreaterThan(0);
    else expect(earlyEnds).toBe(0);
  },
  120000,
);

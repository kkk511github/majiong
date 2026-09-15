import {
  act,
  botAction,
  createGame,
  newPlayer,
  seats,
  startRound,
} from "../shared/engine";
import { seededRandom } from "../shared/tiles";
const totals: Record<string, number> = {
  hu: 0,
  draw: 0,
  bankrupt: 0,
  stuck: 0,
};
const wins = [0, 0, 0, 0];
for (let seed = 1; seed <= 1000; seed++) {
  let g = createGame("123456", "sim-" + seed, {
    rounds: 8,
    flowerDouble: true,
    seaBottom: true,
    twoBankrupt: true,
    protectWinner: true,
    turnSeconds: 10,
  });
  g.players = seats.map((s) => ({
    ...newPlayer("p" + s, "p" + s),
    ready: true,
  }));
  g = startRound(g, 1000, seededRandom(seed));
  let steps = 0;
  while (["playing", "claiming"].includes(g.phase) && steps++ < 600) {
    const seat =
      g.phase === "playing"
        ? g.turn
        : seats.find(
            (s) => g.pending!.offers[s] && g.pending!.replies[s] === undefined,
          )!;
    const action = botAction(g, seat);
    if (!action) break;
    g = act(g, seat, action, 1000 + steps * 100);
  }
  if (!g.result) totals.stuck++;
  else if (g.result.winners.length) {
    totals.hu++;
    g.result.winners.forEach((s) => wins[s]++);
  } else totals[g.result.reason === "bankrupt" ? "bankrupt" : "draw"]++;
}
console.log(
  JSON.stringify(
    {
      games: 1000,
      totals,
      wins,
      scope:
        "Current simple bot policy, fixed reproducible seeds 1–1000; not human win-rate prediction",
    },
    null,
    2,
  ),
);

import {
  act,
  botAction,
  createGame,
  newPlayer,
  seats,
  startRound,
} from "../../shared/engine";
import { seededRandom } from "../../shared/tiles";
export function replayedRound(seed = 43) {
  let g = createGame("234567", "replay-fixture", {
    twoBankrupt: false,
    rounds: 4,
  });
  g.players = seats.map((s) => newPlayer(`player-${s}`, `牌友${s + 1}`, true));
  g = startRound(g, 1000, seededRandom(seed));
  for (let i = 0; i < 1000 && ["playing", "claiming"].includes(g.phase); i++) {
    const seat =
      g.phase === "claiming" ? seats.find((s) => botAction(g, s))! : g.turn;
    const action = botAction(g, seat);
    if (!action) throw Error("No replay fixture action");
    g = act(g, seat, action, 2000 + i * 1000);
  }
  if (!["ended", "finished"].includes(g.phase))
    throw Error("Replay fixture did not finish");
  return g;
}

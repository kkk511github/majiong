import {
  act,
  botAction,
  createGame,
  newPlayer,
  seats,
  startRound,
} from "../../shared/engine";
import { seededRandom } from "../../shared/tiles";
export function completedRound() {
  for (let seed = 1; seed <= 20; seed++) {
    const room = createGame("练习桌", `settlement-${seed}`);
    room.players = seats.map((seat) => {
      const p = newPlayer(
        `p${seat}`,
        ["金陵牌友", "秦淮", "钟山", "莫愁"][seat],
        seat > 0,
      );
      p.ready = true;
      return p;
    });
    let g = startRound(room, Date.now(), seededRandom(seed));
    for (
      let step = 0;
      step < 600 && ["playing", "claiming"].includes(g.phase);
      step++
    ) {
      const seat =
        g.phase === "playing"
          ? g.turn
          : seats.find(
              (s) =>
                g.pending!.offers[s] && g.pending!.replies[s] === undefined,
            )!;
      g = act(g, seat, botAction(g, seat)!);
    }
    if (g.result?.reason === "hu") return g;
  }
  throw Error("No completed winning fixture");
}

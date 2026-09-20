import type { Result, Seat, View } from "../shared/types";
import { gameFeedback } from "./game-feedback";
import { isRobbedKongWinner } from "./win-label";

const patterns = [
  "天胡",
  "地胡",
  "三豪华七对",
  "双豪华七对",
  "豪华七对",
  "七对",
  "清一色",
  "混一色",
  "字一色",
  "对对胡",
  "全球独钓",
  "无花果",
  "门清",
];

/** Announce only patterns already scored by the server; never infer from concealed tiles. */
export function winPhrases(result: Result, seat: Seat): string[] {
  if (!result.winners.includes(seat)) return [];
  if (result.details[seat]?.snapshot === true) return ["胡了"];
  const labels = result.details[seat]?.items.map((i) => i.label) ?? [];
  const has = (name: string) => labels.some((label) => label.startsWith(name));
  const main =
    has("大杠开花") || has("小杠开花")
      ? "杠上开花"
      : has("海底捞月")
        ? "海底捞月"
        : isRobbedKongWinner(result, seat)
          ? "抢杠胡"
          : has("补花胡")
            ? "补花胡"
            : result.from === undefined
              ? "自摸"
              : "胡了";
  return [main, ...patterns.filter(has).slice(0, 2)];
}

export function actionVoices(before: View | null, after: View | null) {
  const events = gameFeedback(before, after);
  // The initial flower racks are part of the deal, not live replacements.
  // Do not enqueue them: decoding can otherwise finish after the entrance and
  // announce a stale "补花" even though no player has just drawn a flower.
  const dealing = events.some((event) => event.type === "deal");
  const phrases: { key: string; phrase: string }[] = [];
  for (const e of events) {
    const add = (phrase: string) =>
      phrases.push({ key: `${e.key}:${phrase}`, phrase });
    if (e.type === "pung") add("碰");
    if (e.type === "kong")
      add(e.concealed ? "暗杠" : e.upgraded ? "补杠" : "杠");
    if (e.type === "flower" && !dealing) add("补花");
    if (e.type === "hu" && after?.result)
      add("胡了");
  }
  if (
    before &&
    after &&
    before.id === after.id &&
    before.me === after.me &&
    before.round === after.round &&
    after.revision > before.revision &&
    !before.result &&
    after.result?.reason === "draw"
  )
    phrases.push({ key: `${after.id}:${after.round}:draw`, phrase: "流局" });
  // Several flower replacements and simultaneous winners may share a snapshot.
  return phrases.filter(
    (p, i) => phrases.findIndex((other) => other.phrase === p.phrase) === i,
  );
}

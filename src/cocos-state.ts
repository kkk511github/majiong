import { unseenHintCounts } from "./listening-hints";
import type { View } from "../shared/types";
import type { TableSceneState } from "../shared/table-scene";
import type { GameFeedback } from "./game-feedback";
import { avatarURL } from "./game-client";
import { ruleDisplayName } from "../shared/nanjing-rules";

export function cocosState(
  view: View,
  ui: {
    connected: boolean;
    disabled: boolean;
    practice: boolean;
    countdown: string;
    selected: number | null;
    drawn?: number;
    inspectedKind: number | null;
    hintKinds: number[];
    hintLabel: string;
    hintDiscard?: number;
    effects: GameFeedback[];
  },
): TableSceneState {
  const reveal = ["ended", "finished"].includes(view.phase);
  const actions = view.actions.map((id) => ({
    id,
    label:
      id === "pass"
        ? "过"
        : id === "pung"
          ? "碰"
          : id === "kong"
            ? "杠"
            : view.pending
              ? "胡"
              : "自摸",
  }));
  return {
    hintUnseen: unseenHintCounts(view, ui.hintKinds),
    zhaozhiAvailable: false,
    zhaozhi: false,
    key: view.id,
    revision: view.revision,
    me: view.me,
    turn: view.turn,
    dealer: view.dealer,
    phase: view.phase,
    code: view.code,
    round: view.round,
    rulesName: ruleDisplayName(view.rules),
    roundMultiplier: view.roundMultiplier,
    nextRoundMultiplier:
      view.phase === "ended" ? view.nextRoundMultiplier : undefined,
    rounds: view.rules.rounds,
    remaining: view.remaining,
    canDiscard: view.canDiscard,
    ...ui,
    // Explicitly project fields. Do not spread a Game or Player into the bridge.
    players: view.players.flatMap((p, seat) =>
      p
        ? [
            {
              name: p.name,
              score: p.score,
              seat,
              bot: p.bot,
              trustee: p.trustee,
              online: p.online,
              avatar: avatarURL(p.avatar),
              hand: seat === view.me || reveal ? [...p.hand] : [],
              handCount: p.handCount,
              flowers: [...p.flowers],
              discards: [...p.discards],
              melds: p.melds.map((m) => ({
                type: m.type,
                from: m.from,
                concealed: m.concealed,
                tiles:
                  m.concealed && seat !== view.me && !reveal
                    ? m.tiles.slice(0, 1)
                    : [...m.tiles],
              })),
            },
          ]
        : [],
    ),
    effects: ui.effects.map((e) => ({
      ...e,
      selfDraw: e.type === "hu" && view.result?.from === undefined,
    })),
    actions: [
      ...actions,
      ...view.selfKongs.map((tile) => ({ id: "selfKong", label: "杠", tile })),
    ],
    lastDiscard: view.lastDiscard
      ? { tile: view.lastDiscard.tile, seat: view.lastDiscard.seat }
      : undefined,
    pending: view.pending ? { ...view.pending } : undefined,
    trusteeDisabled:
      ui.disabled ||
      (!view.players[view.me]?.trustee &&
        view.table?.settings.trusteeMode === "disabled"),
  };
}

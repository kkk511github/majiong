import type { Game, Player, TableSettings, TableSummary } from "./types";

/** Shared by dealing and the between-round UI: ready alone does not override an offline seat. */
export function playerPreparation(
  player: Pick<
    Player,
    "ready" | "online" | "bot" | "trustee" | "awaitingReady"
  > | null,
  settings?: TableSettings,
) {
  const available =
    !!player && !!(player.bot || player.online || settings?.offlineStart);
  const prepared =
    !!player &&
    !!(
      player.ready ||
      (!player.awaitingReady &&
        (player.trustee || settings?.readyMode === "auto"))
    );
  return { available, prepared, canStart: available && prepared };
}

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  name: "南京好友桌",
  visibility: "public",
  readyMode: "manual",
  autoRenew: true,
  resultSeconds: 10,
  offlineStart: false,
  kickOffline: true,
  kickUnready: true,
  kickAfterSeconds: 10,
  trusteeMode: "match",
  trusteeRounds: 3,
  scoreMultiplier: 0.5,
  overtimeSeconds: 90,
  overtimePerTurn: true,
  continuousRounds: true,
  allowDissolve: true,
  privacy: "open",
};

export function normalizeTableSettings(
  input: Partial<TableSettings> = {},
): TableSettings {
  const s = { ...DEFAULT_TABLE_SETTINGS };
  if (input.name !== undefined) {
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.trim().length > 16 ||
      /[\x00-\x1f]/.test(input.name)
    )
      throw Error("玩法名称需要 1–16 个字");
    s.name = input.name.trim();
  }
  const enums = {
    visibility: ["public", "code"],
    readyMode: ["auto", "manual"],
    trusteeMode: ["match", "round", "dissolve", "afterRounds", "disabled"],
    privacy: ["open", "lobby", "all"],
  } as const;
  for (const key of Object.keys(enums) as (keyof typeof enums)[]) {
    if (input[key] !== undefined) {
      if (!(enums[key] as readonly unknown[]).includes(input[key]))
        throw Error("牌桌设置无效");
      Object.assign(s, { [key]: input[key] });
    }
  }
  for (const key of [
    "autoRenew",
    "offlineStart",
    "kickOffline",
    "kickUnready",
    "allowDissolve",
    "overtimePerTurn",
    "continuousRounds",
  ] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") throw Error("牌桌设置无效");
      s[key] = input[key];
    }
  }
  for (const [key, min, max] of [
    ["kickAfterSeconds", 10, 60],
    ["trusteeRounds", 1, 8],
  ] as const) {
    if (input[key] !== undefined) {
      if (
        !Number.isInteger(input[key]) ||
        input[key]! < min ||
        input[key]! > max
      )
        throw Error(
          `${key === "kickAfterSeconds" ? "离座时间需要 10–60 秒" : "托管局数需要 1–8 局"}`,
        );
      s[key] = input[key]!;
    }
  }
  if (input.resultSeconds !== undefined) {
    if (![5, 10].includes(input.resultSeconds))
      throw Error("结算展示时间为 5 秒或 10 秒");
    s.resultSeconds = input.resultSeconds;
  }
  if (input.scoreMultiplier !== undefined) {
    if (![0.2, 0.5, 1].includes(input.scoreMultiplier))
      throw Error("记分倍率请选择 0.2、0.5 或 1");
    s.scoreMultiplier = input.scoreMultiplier;
  }
  if (input.overtimeSeconds !== undefined) {
    if (
      !Number.isInteger(input.overtimeSeconds) ||
      input.overtimeSeconds < 0 ||
      input.overtimeSeconds > 300
    )
      throw Error("累计超时时间需要 0–300 秒");
    s.overtimeSeconds = input.overtimeSeconds;
  }
  if (s.trusteeMode === "disabled" && s.offlineStart)
    throw Error("关闭托管时需要所有牌友在线开局");
  return s;
}

export function tableSummary(g: Game, viewer: string): TableSummary {
  const table = g.table!;
  return {
    code: g.code,
    name: table.settings.name,
    number: table.number,
    phase: g.phase,
    round: g.round,
    rules: g.rules,
    settings: table.settings,
    managed: table.creatorId === viewer,
    seats: g.players.map((p, i) =>
      p
        ? {
            name:
              table.settings.privacy !== "open" && p.id !== viewer
                ? `牌友${i + 1}`
                : p.name,
            online: p.online,
            ready: p.ready,
            isMe: p.id === viewer,
          }
        : null,
    ),
  };
}

export function resultWait(
  g: Pick<Game, "table" | "history" | "phase">,
  now: number,
): number {
  if (!g.table) return 0;
  const at =
    g.phase === "finished"
      ? (g.table.finishedAt ?? g.history.slice(-1)[0]?.at)
      : g.history.slice(-1)[0]?.at;
  return at === undefined
    ? 0
    : Math.max(
        0,
        at +
          (g.phase === "ended" && g.table.settings.continuousRounds
            ? 10
            : g.table.settings.resultSeconds) *
            1000 -
          now,
      );
}

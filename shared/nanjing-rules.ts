import { DEFAULT_RULES, type Rules } from "./types";

const GARDEN_V2_RULES: Rules = {
  ...DEFAULT_RULES,
  id: "nj-garden-v2",
  turnSeconds: 10,
  flowerDouble: true,
  seaBottom: true,
  twoBankrupt: true,
  protectWinner: true,
  biXiaHu: "next",
  doubleSidePayments: true,
  successorDouble: true,
  fourWinds: true,
  discardPenalties: true,
};
/** Rule IDs preserve saved games and replays when the current profile changes. */
export const DEFAULT_NEW_RULES: Rules = {
  ...GARDEN_V2_RULES,
  id: "nj-garden-b-v3",
  rounds: 8,
};
export function isNanjingB(rules: Pick<Rules, "id">) {
  return rules.id === "nj-garden-b-v3";
}
export function isGarden(rules: Pick<Rules, "id">) {
  return rules.id === "nj-garden-v2" || isNanjingB(rules);
}
export function isNanjingV2(rules: Rules) {
  return isGarden(rules) || rules.id === "nj-open-v2";
}
/** Missing replay snapshots must not be labelled with today's default rules. */
export function ruleDisplayName(rules?: Pick<Rules, "id">): string | undefined {
  return rules && isNanjingB(rules)
    ? "进园子 B档"
    : rules?.id === "nj-garden-v2"
    ? "进园子"
    : rules?.id === "nj-open-v2"
      ? "敞开头"
      : rules?.id === "nj-casual-v1"
        ? "原休闲规则"
        : undefined;
}
export function newGameRules(input: Partial<Rules> = {}): Rules {
  const id = input.id ?? DEFAULT_NEW_RULES.id;
  return {
    ...ruleDefaults(id), ...input, id,
    ...(isNanjingB({ id }) ? { flowerDouble: true, twoBankrupt: true } : {}),
  };
}
export function ruleDefaults(id: Rules["id"]): Rules {
  if (id === "nj-casual-v1") return { ...DEFAULT_RULES };
  if (id === "nj-garden-v2") return { ...GARDEN_V2_RULES };
  if (id === "nj-garden-b-v3") return { ...DEFAULT_NEW_RULES };
  if (id === "nj-open-v2")
    return {
      ...GARDEN_V2_RULES,
      id,
      twoBankrupt: false,
      protectWinner: false,
    };
  throw Error("不支持的南京麻将规则版本");
}
export function nanjingValues(rules: Rules) {
  const garden = isGarden(rules), b = isNanjingB(rules);
  return {
    name: b ? "南京麻将·进园子 B档" : garden ? "南京麻将·进园子" : "南京麻将·敞开头",
    base: garden ? 10 : 20,
    closed: garden ? 10 : 20,
    mixed: b ? 30 : garden ? 20 : 40,
    pure: b ? 40 : garden ? 30 : 60,
    winds: b ? 100 : garden ? 30 : 60,
    triplets: b ? 30 : garden ? 20 : 40,
    global: b ? 50 : garden ? 30 : 60,
    seven: b ? [50, 100, 120, 160] : garden ? [30, 80, 120, 160] : [80, 160, 240, 320],
    absolute: b ? 30 : garden ? 20 : 60,
    noFlower: b ? 30 : garden ? 20 : 40,
    smallReplacement: garden ? 10 : 20,
    largeReplacement: garden ? 20 : 0,
    largeReplacementMultiplier: garden ? 1 : 2,
    earthly: 30,
    heavenly: b ? 400 : 0,
    seaBottom: 20,
    openKongPoints: b ? 10 : 6 * flowerFactor(rules),
    concealedKongPoints: b ? 5 : 3 * flowerFactor(rules),
    flowerKongPoints: b ? 10 : 6 * flowerFactor(rules),
    penaltyFlowers: 6,
    fourWindsFlowers: 5,
  };
}
export function flowerFactor(rules: Rules) {
  return isNanjingB(rules) ? 2 : rules.flowerDouble === false ? 1 : 2;
}

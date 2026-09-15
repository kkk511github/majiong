import { DEFAULT_RULES, type Rules } from "./types";

/** New tables use 南京进园子. Existing nj-casual-v1 games retain their immutable algorithm. */
export const DEFAULT_NEW_RULES: Rules = {
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
export function isNanjingV2(rules: Rules) {
  return rules.id === "nj-garden-v2" || rules.id === "nj-open-v2";
}
export function newGameRules(input: Partial<Rules> = {}): Rules {
  const id = input.id ?? DEFAULT_NEW_RULES.id;
  return { ...ruleDefaults(id), ...input, id };
}
export function ruleDefaults(id: Rules["id"]): Rules {
  if (id === "nj-casual-v1") return { ...DEFAULT_RULES };
  if (id === "nj-garden-v2") return { ...DEFAULT_NEW_RULES };
  if (id === "nj-open-v2")
    return {
      ...DEFAULT_NEW_RULES,
      id,
      twoBankrupt: false,
      protectWinner: false,
    };
  throw Error("不支持的南京麻将规则版本");
}
export function nanjingValues(rules: Rules) {
  const garden = rules.id === "nj-garden-v2";
  return {
    name: garden ? "南京麻将·进园子" : "南京麻将·敞开头",
    base: garden ? 10 : 20,
    closed: garden ? 10 : 20,
    mixed: garden ? 20 : 40,
    pure: garden ? 30 : 60,
    triplets: garden ? 20 : 40,
    global: garden ? 30 : 60,
    seven: garden ? [30, 80, 120, 160] : [80, 160, 240, 320],
    absolute: garden ? 20 : 60,
    noFlower: garden ? 20 : 40,
    smallReplacement: garden ? 10 : 20,
    largeReplacement: garden ? 20 : 0,
    largeReplacementMultiplier: garden ? 1 : 2,
    earthly: 30,
    seaBottom: 20,
    openKongFlowers: 6,
    concealedKongFlowers: 3,
    flowerKongFlowers: 6,
    penaltyFlowers: 6,
    fourWindsFlowers: 5,
  };
}
export function flowerFactor(rules: Rules) {
  return rules.flowerDouble === false ? 1 : 2;
}

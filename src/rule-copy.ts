import { DEFAULT_RULES, type Rules, type TableSettings } from "../shared/types";

const BASE_RULE_SECTIONS = [
  [
    "一桌南京味",
    "144 张牌，四人对局。万、筒、条和东南西北组成手牌；中、发、白与春夏秋冬、梅兰竹菊共 20 张硬花，摸到自动补花。可以碰、杠，不可以吃。",
  ],
  [
    "怎么胡牌",
    "四组顺子或刻子，加一对将；支持七对和豪华七对。普通小胡开门后至少需要 4 个硬花，门清与大胡不受此限制。可以自摸、点炮胡，也可以一炮多响。",
  ],
  [
    "花数与牌型",
    "成牌 20；硬花每张 2；门清 20；混一色 40；清一色 60；对对胡 40；全球独钓 60；七对 80，每多一组四张相同牌再加 80；门清无花果 40。七对不另计门清，清一色不叠加混一色。",
  ],
  [
    "软花与补牌",
    "风刻、风对、缺一门各记 1 个软花，每个 2 分。单一听口的独占、边枝、压档加 2；边枝或压档胡到已经被碰的牌，压绝加 40，不再叠加该听口软花。补花胡加 20；暗杠补牌胡加 20；明杠或补杠补牌胡加 40。本版暂不启用比下胡与快照。",
  ],
  [
    "杠与承包",
    "明杠、补杠由供牌者付 12；暗杠其他每家付 6；集齐四张相同中发白、四季或四君子，花杠其他每家付 12。抢杠胡由补杠者付三家，抢杠成功不收杠分；明杠开花由供牌者承包。四组副露中至少三组来自同一家时，该家承包。",
  ],
  [
    "结算与过水",
    "点炮由放炮者付一份，自摸由其他三家各付一份。放弃胡牌或碰牌后，自己下一次出牌前不能再胡、或碰同一种牌。剩余 16 张时流局。庄家胡牌或流局连庄，否则下家坐庄。",
  ],
  [
    "约局与练习",
    "娱乐积分只用于记录牌局。好友桌四人准备后开局，可邀请电脑补位；超时出牌进入托管，可随时取消。断线重连会恢复牌局。练习桌可随时离开并继续，电脑仅依据自己的手牌决策。",
  ],
];

export function ruleSections(
  rules: Rules = DEFAULT_RULES,
  table?: TableSettings,
): string[][] {
  const sections = BASE_RULE_SECTIONS.map((row) => [...row]);
  const factor = rules.flowerDouble === false ? 1 : 2;
  sections[1][1] = sections[1][1].replace(
    "至少需要 4 个硬花",
    `至少需要 ${rules.minimumFlowers} 个硬花`,
  );
  sections[2][1] = sections[2][1].replace("硬花每张 2", `硬花每张 ${factor}`);
  sections[3][1] = sections[3][1]
    .replace("每个 2 分", `每个 ${factor} 分`)
    .replace("独占、边枝、压档加 2", `独占、边枝、压档加 ${factor}`);
  sections[5][1] = sections[5][1].replace(
    "剩余 16 张时流局",
    rules.seaBottom
      ? "开启海底捞月，牌墙摸完才流局"
      : "未开启海底捞月，剩余 16 张时流局",
  );
  if (rules.twoBankrupt) sections[5][1] += " 两家归零时提前结束本桌。";
  if (table) {
    sections[6] = [
      "本桌开局与托管",
      `本桌只允许四位真人入座，${table.readyMode === "auto" ? "满四人自动准备" : "每人手动准备"}，${table.offlineStart ? "允许离线玩家参与开局" : "所有人在线才能开局"}。${table.kickUnready && table.readyMode === "manual" ? `满四人后 ${table.kickAfterSeconds} 秒仍未准备会自动离座。` : ""}${trusteeDescription(rules, table)}断线重连会恢复实际牌局。`,
    ];
  } else {
    sections[6] = [
      "约局与练习",
      "约局大厅由管理员或已获授权的牌友开桌，正式牌桌必须四位真人入座。练习桌使用电脑陪练，离开后可以恢复进度；打开设置或进入后台会暂停练习。准备方式、出牌时间、托管和续桌以每桌设置为准。",
    ];
  }
  return sections;
}
function trusteeDescription(rules: Rules, table: TableSettings): string {
  if (table.trusteeMode === "disabled" || !rules.turnSeconds)
    return "本桌不限时，关闭超时托管。";
  if (table.overtimePerTurn) {
    const effect =
      table.trusteeMode === "dissolve"
        ? "耗尽后结束本桌并结算。"
        : table.trusteeMode === "afterRounds"
          ? `耗尽后托管，可随时取消；连续托管 ${table.trusteeRounds} 把后结束本桌。`
          : "耗尽后托管，可随时取消。";
    const next = table.continuousRounds
      ? "每把结束展示四家牌面与本把输赢，10 秒后自动开下一把，四人都点击继续可提前开。"
      : "";
    return `每次出牌或响应先有 ${rules.turnSeconds} 秒，超出后再倒计时 ${table.overtimeSeconds ?? 90} 秒；${effect}${next}`;
  }
  const clock = `每次出牌或响应先有 ${rules.turnSeconds} 秒，${table.overtimeSeconds ? `超出的时间计入整桌累计超时，累计达到 ${table.overtimeSeconds} 秒后` : "超时后"}`;
  const effect = {
    match: "进入全局托管，持续到主动取消；随时可取消接手。",
    round: "托管至本把结算，下一把需手动继续。",
    dissolve: "结束本桌并结算。",
    afterRounds: `托管累计 ${table.trusteeRounds} 把后结束本桌。`,
    disabled: "",
  };
  return clock + effect[table.trusteeMode];
}

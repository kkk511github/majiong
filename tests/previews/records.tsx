// Development-only preview. It uses the actual records components and in-memory sample data.
// No account, network connection, or saved history is changed. Not an entry in the release build.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Home, LayoutGrid, History, Users } from "lucide-react";
import { RecordsPanel } from "../../src/RecordsPanel";
import { client } from "../../src/game-client";
import { recordDate, recordDayRange } from "../../src/record-dates";
import type {
  Account,
  MatchDetails,
  RoundReplay,
  StoredRound,
} from "../../shared/types";
import {
  createGame,
  newPlayer,
  startRound,
  act,
  botAction,
  seats,
} from "../../shared/engine";
import { seededRandom } from "../../shared/tiles";
import "../../src/styles.css";
import "../../src/classic.css";
import "../../src/polish.css";
import "../../src/dialogs.css";
import "../../src/landscape.css";
import "../../src/accounts.css";
import "../../src/tables.css";
import "../../src/table-redesign.css";

const matches = new Map<string, MatchDetails>(),
  replays = new Map<string, RoundReplay>();
const today = recordDayRange(recordDate(Date.now())).from;
for (let index = 0; index < 6; index++) {
  const date = today - (index < 3 ? 0 : index < 5 ? 86400000 : 172800000);
  let at = date + (14 * 60 + index * 25) * 60000;
  let game = createGame(String(582619 + index), "preview", {
    rounds: 4,
    twoBankrupt: false,
  });
  game.id = `preview-table-${index}`;
  game.players = seats.map((s) =>
    newPlayer(
      `preview-player-${s}`,
      ["秦淮", "月白", "江宁", "金陵牌友"][s],
      true,
    ),
  );
  const random = seededRandom(43 + index);
  for (let round = 1; round <= 4; round++) {
    game = startRound(game, at, random);
    for (
      let step = 0;
      step < 1000 && ["playing", "claiming"].includes(game.phase);
      step++
    ) {
      const seat =
        game.phase === "claiming"
          ? seats.find((s) => botAction(game, s))!
          : game.turn;
      const action = botAction(game, seat);
      if (!action) break;
      game = act(game, seat, action, (at += 3000));
    }
    if (game.replay) replays.set(game.replay.id, game.replay);
  }
  const rounds: StoredRound[] = game.history.map((record) => ({
    game: game.id,
    code: game.code,
    me: 3,
    practice: false,
    record: {
      ...record,
      tableName: "好友桌",
      memberIds: ["100001", "100002", "100003", "100004"],
      teamNames: ["金陵战队", "江南战队", "秦淮战队", "金陵战队"],
    },
  }));
  if (rounds.length) matches.set(game.id, { match: rounds.at(-1)!, rounds });
}
const all = [...matches.values()]
  .map((m) => m.match)
  .sort((a, b) => b.record.at - a.record.at);
client.loadRecords = async (_admin, query) => {
  const q = query ?? new URLSearchParams(),
    code = q.get("code") ?? "";
  const found = all.filter((r) => r.code.startsWith(code));
  const counts = new Map<string, number>();
  for (const item of found) {
    const day = recordDate(item.record.at);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const records = found.filter(
    (r) =>
      (!q.has("from") || r.record.at >= Number(q.get("from"))) &&
      (!q.has("to") || r.record.at < Number(q.get("to"))),
  );
  return {
    records,
    total: records.length,
    page: 1,
    pageSize: 20,
    dateTotal: found.length,
    dates: [...counts].map(([date, count]) => ({ date, count })),
  };
};
client.loadMatch = async (id) => {
  const match = matches.get(id);
  if (!match) throw Error("未找到演示牌桌");
  return match;
};
client.loadReplay = async (id) => {
  const replay = replays.get(id);
  if (!replay) throw Error("请输入这份演示中显示的回放 ID");
  return replay;
};
client.history = () =>
  [...matches.values()]
    .flatMap((m) => m.rounds)
    .map((r) => ({ ...r, practice: true }));
const member: Account = {
  id: "preview",
  username: "preview",
  name: "金陵牌友",
  role: "member",
  mustChangePassword: false,
};
function Preview() {
  const [admin, setAdmin] = useState(false),
    [version, setVersion] = useState(0);
  return (
    <div className="app classic polished" data-page="history">
      <main className="lobby">
        <RecordsPanel
          key={`${admin}-${version}`}
          account={{ ...member, role: admin ? "admin" : "member" }}
          onBack={() => setVersion((n) => n + 1)}
        />
      </main>
      <nav className="bottom-nav" aria-label="演示导航">
        <button onClick={() => (location.href = "/")}>
          <Home />
          牌桌
        </button>
        <button onClick={() => setAdmin((v) => !v)}>
          <Users />
          {admin ? "会员视角" : "管理视角"}
        </button>
        <button className="active" onClick={() => setVersion((n) => n + 1)}>
          <History />
          战绩
        </button>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#d9d7ab",
            fontSize: 12,
          }}
        >
          本地预览 · 演示数据
        </span>
        <button onClick={() => (location.href = "/")}>
          <LayoutGrid />
          返回应用
        </button>
      </nav>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);

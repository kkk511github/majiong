import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Copy,
  Play,
  Layers3,
} from "lucide-react";
import type { MatchDetails, RoundRecord, StoredRound } from "../shared/types";
import { signedScore, settlementRows } from "../shared/settlement";
import { client } from "./game-client";
import { RoundReveal } from "./RoundReveal";
import { ScoreDetails, Settlement } from "./Settlement";
import { recordClock, recordDate } from "./record-dates";

export function RecordPlayers({
  record,
  showTeams = false,
}: {
  record: RoundRecord;
  showTeams?: boolean;
}) {
  const rows = settlementRows(record);
  return (
    <div className="match-players">
      {record.names.map((name, seat) => {
        const score = rows.find((r) => r.seat === seat)!;
        return (
          <div className="match-player" key={seat}>
            <div className="match-player-name">
              <strong title={name}>{name}</strong>
              {showTeams && record.teamNames?.[seat] && (
                <span className="record-team" title={record.teamNames[seat]}>
                  {record.teamNames[seat]}
                </span>
              )}
            </div>
            <small className="record-member-id">
              {record.memberIds?.[seat] ? `ID：${record.memberIds[seat]}` : "—"}
            </small>
            <span
              className={`match-points ${score.recorded > 0 ? "positive" : score.recorded < 0 ? "negative" : ""}`}
            >
              <span className="sr-only">总战绩 </span>
              <b>{signedScore(score.recorded)}</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MatchRecordDetails({
  selected,
  replay,
  showTeams = false,
}: {
  selected: StoredRound;
  replay: (id: string) => void;
  showTeams?: boolean;
}) {
  const [data, setData] = useState<MatchDetails | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [round, setRound] = useState<StoredRound | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    setRound(null);
    const request = selected.practice
      ? Promise.resolve({
          match: selected,
          rounds: client
            .history()
            .filter((r) => r.practice && r.game === selected.game)
            .sort((a, b) => a.record.round - b.record.round),
        })
      : client.loadMatch(selected.game);
    request
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [selected.game, selected.practice, retry]);
  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
    } catch {
      setCopied("复制未成功，请长按 ID 复制");
    }
  }
  if (error)
    return (
      <div className="records-empty" role="alert">
        <p>{error}</p>
        <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
          重试
        </button>
      </div>
    );
  if (!data)
    return (
      <p className="records-empty" role="status">
        正在读取每把明细…
      </p>
    );
  if (round) {
    const visibleRecord = showTeams
      ? round.record
      : { ...round.record, teamNames: undefined };
    return (
      <div
        className="match-round-detail"
        aria-label={`第 ${round.record.round} 把战绩详情`}
      >
        <div className="match-detail-actions">
          <button className="secondary" onClick={() => setRound(null)}>
            <ArrowLeft size={16} /> 返回整桌明细
          </button>
          <button
            className="replay-open"
            onClick={() => replay(round.record.id)}
          >
            <Play size={16} /> 回放第 {round.record.round} 把
          </button>
        </div>
        <div className="match-round-detail-content">
          {round.record.hands ? (
            <RoundReveal
              record={visibleRecord}
              view={{
                phase: "ended",
                code: round.code,
                round: round.record.round,
                rules: {
                  rounds: round.record.totalRounds ?? round.record.round,
                },
                me: round.me,
                players: round.record.names.map((name, i) => ({
                  name,
                  ready: false,
                  ...round.record.hands![i],
                })),
              }}
            />
          ) : (
            <Settlement
              record={{ ...visibleRecord, matchFinished: false }}
              code={round.code}
              me={round.me}
            />
          )}
          <ScoreDetails record={visibleRecord} />
        </div>
      </div>
    );
  }
  return (
    <div className="match-details">
      <div className="match-details-summary">
        <div className="match-summary-meta">
          <b>
            {data.match.record.tableName ?? "好友桌"} · 房间 {data.match.code}
          </b>
          <span>
            <Layers3 size={16} />
            {data.match.record.round} /{" "}
            {data.match.record.totalRounds ?? data.match.record.round} 把 ·{" "}
            {data.match.record.endReason ?? "本桌完成"}
          </span>
          <time>
            <Clock3 size={16} />
            {recordDate(data.match.record.at)}{" "}
            {recordClock(data.match.record.at)}
          </time>
          <span className="match-summary-label">整桌总战绩</span>
        </div>
        <RecordPlayers record={data.match.record} showTeams={showTeams} />
      </div>
      <div className="match-rounds-title">
        <h3>每把明细</h3>
        <span>共 {data.rounds.length} 把 · 以下为每把积分变化</span>
      </div>
      <div className="match-rounds" aria-label="每把战绩列表" tabIndex={0}>
        {data.rounds.map((item) => (
          <article
            className="match-round"
            key={item.record.id}
            aria-label={`第 ${item.record.round} 把明细`}
          >
            <div className="match-round-heading">
              <b>第 {item.record.round} 把</b>
              <time>
                <Clock3 size={15} />
                {recordClock(item.record.at)}
              </time>
              <span className="match-result-label">
                {item.record.result.reason === "dissolved"
                  ? "提前解散"
                  : item.record.result.winners.length
                    ? "胡牌"
                    : "流局"}
              </span>
            </div>
            <div className="round-player-points">
              {item.record.names.map((name, i) => (
                <div key={i}>
                  <div className="round-player-name">
                    <strong>{name}</strong>
                    {showTeams && item.record.teamNames?.[i] && (
                      <small className="record-team">
                        {item.record.teamNames[i]}
                      </small>
                    )}
                  </div>
                  <small>
                    {item.record.memberIds?.[i]
                      ? `ID：${item.record.memberIds[i]}`
                      : "—"}
                  </small>
                  <b
                    className={
                      (item.record.result.deltas[i] ?? 0) > 0
                        ? "positive"
                        : (item.record.result.deltas[i] ?? 0) < 0
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {signedScore(item.record.result.deltas[i] ?? 0)}
                  </b>
                </div>
              ))}
            </div>
            <div className="match-round-footer">
              <div className="round-replay-code">
                <span>回放 ID</span>
                <code>{item.record.id}</code>
                <button
                  aria-label={`复制第 ${item.record.round} 把回放 ID`}
                  onClick={() => copy(item.record.id)}
                >
                  <Copy size={14} />
                  {copied === item.record.id ? "已复制" : "复制"}
                </button>
              </div>
              <button className="secondary" onClick={() => setRound(item)}>
                {item.record.hands ? "查看牌面" : "积分明细"}
                <ChevronRight size={15} />
              </button>
              <button
                className="replay-open"
                onClick={() => replay(item.record.id)}
              >
                <Play size={15} /> 回放
              </button>
            </div>
          </article>
        ))}
      </div>
      {copied.startsWith("复制未成功") && <p role="status">{copied}</p>}
    </div>
  );
}

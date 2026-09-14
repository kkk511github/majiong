import { useState } from "react";
import { ArrowRight, ChevronRight, Copy, Trophy } from "lucide-react";
import type { RoundRecord, Seat } from "../shared/types";
import type { roundReadiness } from "./round-readiness";
import {
  signedScore as scoreText,
  settlementRows,
  settlementTime,
} from "../shared/settlement";
const seatNames = ["东", "南", "西", "北"];

export function Settlement({
  record,
  code,
  me,
  readiness,
}: {
  record: RoundRecord;
  code: string;
  me?: number;
  readiness?: ReturnType<typeof roundReadiness>["seats"];
}) {
  const rows = settlementRows(record);
  const baseline = record.settlementBase ?? record.initialScore ?? 0;
  const initial = record.initialScore ?? 0;
  const tableFee = baseline - initial;
  const [copied, setCopied] = useState("");
  async function copy() {
    const text = [
      record.tableName ?? "南京麻将",
      `房间号：${code} · ${record.round}/${record.totalRounds ?? record.round} 局`,
      settlementTime(record.at),
      ...rows.map(
        (row) =>
          `${row.rank}. ${row.name}  分数 ${scoreText(row.net)}  记分 ${scoreText(row.recorded)}`,
      ),
      `本金 ${baseline} 分 · 桌费 ${tableFee} 分/人 · 入桌 ${initial} 分 · 记分 = (桌上分 - ${baseline}) × ${1 / (record.scoreDivisor ?? 1)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied("战绩已复制");
    } catch {
      setCopied("复制未成功，请使用系统截图保存");
    }
  }
  return (
    <section className="settlement" aria-label="牌桌结算">
      <div className="settlement-heading">
        <div>
          <span className="settlement-kicker">
            金陵麻将 · {record.matchFinished ? "本桌最终战绩" : "本桌累计战绩"}
          </span>
          <h3>
            <Trophy size={25} />{" "}
            {record.matchFinished ? "一桌好牌，尽兴而归" : "好牌相聚，局局有味"}
          </h3>
        </div>
        <span className="settlement-game-name">
          {record.tableName ?? "南京麻将"}
        </span>
      </div>
      <div className="settlement-meta">
        <b>房间号 {code}</b>
        <span>
          把数 {record.round} / {record.totalRounds ?? record.round}
        </span>
        <time dateTime={new Date(record.at).toISOString()}>
          {settlementTime(record.at)}
        </time>
        {record.endReason && <span>{record.endReason}</span>}
      </div>
      <table className="settlement-table">
        <thead>
          <tr>
            <th>名次</th>
            <th>牌友</th>
            <th>桌上分</th>
            <th>分数</th>
            <th>记分</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.seat}
              className={`${row.rank === 1 && row.net > 0 ? "settlement-winner" : ""} ${row.seat === me ? "settlement-me" : ""}`}
            >
              <td>
                <span className="settlement-rank">
                  第 <b>{row.rank}</b> 名
                </span>
              </td>
              <td>
                <div className="settlement-player">
                  <span className={`avatar avatar-${row.seat}`}>
                    <span className="portrait-art" aria-hidden="true" />
                  </span>
                  <span>
                    <strong>
                      {row.name}
                      {record.teamNames?.[row.seat] && (
                        <small className="record-team">
                          {record.teamNames[row.seat]}
                        </small>
                      )}
                      {row.seat === me && <small>我</small>}
                    </strong>
                    <small
                      title={row.id}
                      className={readiness ? "settlement-readiness" : undefined}
                      data-state={readiness?.[row.seat].state}
                      aria-label={
                        readiness
                          ? `${row.name}：${readiness[row.seat].label}`
                          : undefined
                      }
                    >
                      {readiness ? (
                        <>
                          <i aria-hidden="true" />
                          {readiness[row.seat].label}
                        </>
                      ) : record.memberIds?.[row.seat] ? (
                        `ID: ${record.memberIds[row.seat]}`
                      ) : (
                        `${seatNames[row.seat]}位`
                      )}
                    </small>
                  </span>
                </div>
              </td>
              <td className="settlement-balance">{row.score}</td>
              <td
                className={
                  row.net > 0
                    ? "settlement-positive"
                    : row.net < 0
                      ? "settlement-negative"
                      : ""
                }
              >
                {scoreText(row.net)}
              </td>
              <td
                className={`settlement-recorded ${row.net > 0 ? "settlement-positive" : row.net < 0 ? "settlement-negative" : ""}`}
              >
                {scoreText(row.recorded)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="settlement-caption">
        <p>
          本金 <b>{baseline}</b> · 入桌 {initial}
          {tableFee > 0 ? ` · 桌费 ${tableFee}/人` : ""} · 记分 =（桌上分 −{" "}
          {baseline}）× <b>{1 / (record.scoreDivisor ?? 1)}</b>
        </p>
        <button type="button" onClick={copy}>
          <Copy size={14} />
          复制战绩
        </button>
      </div>
      {copied && (
        <p className="settlement-copy-status" role="status">
          {copied}
        </p>
      )}
      {!record.matchFinished && (
        <details className="settlement-detail-toggle">
          <summary>
            查看本局收支明细 <ChevronRight size={14} />
          </summary>
          <ScoreDetails
            record={record}
            me={me === undefined || me < 0 ? undefined : (me as Seat)}
          />
        </details>
      )}
    </section>
  );
}

export function ScoreDetails({
  record,
  me,
}: {
  record: RoundRecord;
  me?: Seat;
}) {
  return (
    <div className="score-details">
      <div className="score-players">
        <table>
          <thead>
            <tr>
              <th>牌友</th>
              <th>本局</th>
              <th>桌上分</th>
            </tr>
          </thead>
          <tbody>
            {record.names.map((name, i) => (
              <tr key={i} className={i === me ? "score-current-player" : ""}>
                <td>
                  <span className="score-player-name">
                    <i>{seatNames[i]}</i>
                    <span>{name}</span>
                    {i === me && <small>我</small>}
                    {record.result.winners.includes(i as Seat) && (
                      <span className="win-label">胡</span>
                    )}
                  </span>
                </td>
                <td className={record.result.deltas[i] > 0 ? "positive" : ""}>
                  {scoreText(record.result.deltas[i])}
                </td>
                <td>{scoreText(record.scores[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="score-note">本局积分 = 胡牌收支 + 杠分收支 + 保米调整</p>
      </div>
      <div className="score-explanation">
        {Object.entries(record.result.details).map(([seat, score]) => (
          <details className="score-breakdown" key={seat} open>
            <summary>
              <span>{record.names[Number(seat)]} · 胡牌明细</span>
              <strong>
                {score.total} <small>分 / 份</small>
              </strong>
            </summary>
            {score.items.map((item, i) => (
              <div key={i}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </details>
        ))}
        {record.result.transfers !== undefined ? (
          <details
            className="score-ledger"
            open={record.result.winners.length === 0}
          >
            <summary>
              <span>本局收支明细</span>
              <small>
                {record.result.transfers.length} 笔 <ChevronRight size={15} />
              </small>
            </summary>
            {record.result.transfers.length ? (
              <ol>
                {record.result.transfers.map((entry, i) => (
                  <li key={i}>
                    <div>
                      <span>{record.names[entry.from]}</span>
                      <ArrowRight size={13} />
                      <span>{record.names[entry.to]}</span>
                    </div>
                    <small>{entry.reason}</small>
                    <strong>
                      {entry.amount} <small>分</small>
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="score-note">本局没有积分收支。</p>
            )}
          </details>
        ) : (
          <p className="score-note">这局为旧版记录，未保存逐笔收支。</p>
        )}
        <p className="form-note">
          自摸收三份，点炮收一份；承包情况见收支明细。积分仅记录牌局。
        </p>
      </div>
    </div>
  );
}

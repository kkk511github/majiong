import { copyText } from "./clipboard";
import { useState } from "react";
import { ArrowRight, ChevronRight, Copy, Trophy } from "lucide-react";
import type { RoundRecord, Seat } from "../shared/types";
import { isGarden } from "../shared/nanjing-rules";
import { scoreItemCopy } from "./score-item-copy";
import { winDisplayLabel } from "./win-label";
import { tileName } from "../shared/tiles";
import type { roundReadiness } from "./round-readiness";
import {
  signedScore as scoreText,
  settlementRows,
  settlementTime,
  roundNet,
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
  const hasExternal = rows.some((row) => row.external !== 0);
  const [copied, setCopied] = useState("");
  async function copy() {
    const text = [
      record.tableName ?? "南京麻将",
      `房间号：${code} · ${record.round}/${record.totalRounds ?? record.round} 局`,
      settlementTime(record.at),
      ...rows.map(
        (row) =>
          `${row.rank}. ${row.name}  桌上分 ${row.score}${hasExternal ? `  桌外 ${scoreText(row.external)}` : ""}  分数 ${scoreText(row.net)}  记分 ${scoreText(row.recorded)}`,
      ),
      `本金 ${baseline} 分 · 桌费 ${tableFee} 分/人 · 入桌 ${initial} 分 · 记分 = (桌上分 - ${baseline}${hasExternal ? " + 桌外记分" : ""}) × ${1 / (record.scoreDivisor ?? 1)}`,
    ].join("\n");
    try {
      await copyText(text);
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
            {hasExternal && <th>桌外</th>}
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
              {hasExternal && <td>{scoreText(row.external)}</td>}
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
          {baseline}
          {hasExternal ? " + 桌外记分" : ""}）×{" "}
          <b>{1 / (record.scoreDivisor ?? 1)}</b>
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
  ledgerFirst = false,
}: {
  record: RoundRecord;
  me?: Seat;
  ledgerFirst?: boolean;
}) {
  const hasExternal =
    record.result.transfers?.some((t) => t.scope === "external") ||
    record.result.externalDeltas?.some((n) => n !== 0);
  return (
    <div className={`score-details${ledgerFirst ? " record-score-ledger" : ""}`}>
      {ledgerFirst && <>
        <section className="record-transfer-section" aria-label="本把逐笔收支">
          <h4>本把逐笔收支 <small>{record.result.transfers?.length ?? 0} 笔</small></h4>
          {record.result.transfers?.length ? <table className="record-transfer-table">
            <thead><tr><th>事项</th><th>付分方</th><th>收分方</th><th>分数</th></tr></thead>
            <tbody>{record.result.transfers.map((entry, index) => <tr key={index}>
              <td>{entry.reason}{entry.scope === "external" && <small className="record-external-tag">桌外</small>}</td>
              <td>{record.names[entry.from]}</td><td>{record.names[entry.to]}</td><td>{entry.amount}<small> 分</small></td>
            </tr>)}</tbody>
          </table> : <p className="score-note">{record.result.transfers === undefined ? "这局为旧版记录，未保存逐笔收支。" : "本把没有积分收支。"}</p>}
        </section>
        <section className="record-net-strip" aria-label="本把积分变化">
          <h4>本把积分变化</h4>
          {record.names.map((name, i) => <div key={i}><span>{name}</span><b className={roundNet(record.result, i) > 0 ? "positive" : roundNet(record.result, i) < 0 ? "negative" : "neutral"}>{scoreText(roundNet(record.result, i))}</b></div>)}
        </section>
      </>}
      <div className="score-players">
        <table>
          <thead>
            <tr>
              <th>牌友</th>
              <th>本把开始</th>
              <th>{hasExternal ? "桌内" : "本局"}</th>
              {hasExternal && (
                <>
                  <th>桌外</th>
                  <th>本局合计</th>
                </>
              )}
              <th>本把结束</th>
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
                <td>{record.scores[i] - record.result.deltas[i]}</td>
                <td className={record.result.deltas[i] > 0 ? "positive" : ""}>
                  {scoreText(record.result.deltas[i])}
                </td>
                {hasExternal && (
                  <>
                    <td>{scoreText(record.result.externalDeltas?.[i] ?? 0)}</td>
                    <td>{scoreText(roundNet(record.result, i))}</td>
                  </>
                )}
                <td>{scoreText(record.scores[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="score-note">
          本局积分 = 胡牌收支 + 杠罚分 + 保米调整
          {hasExternal || (record.rules && isGarden(record.rules))
            ? " + 桌外记分。进园子外包普通 50 分，比下胡 100 分，不扣桌上分。"
            : "。"}
        </p>
      </div>
      <div className="score-explanation">
        {Object.entries(record.result.details).map(([seat, score]) => (
          <details className="score-breakdown" key={seat} open>
            <summary>
              <span>
                {record.names[Number(seat)]} · {winDisplayLabel(record.result, Number(seat) as Seat)}
                {record.result.transfers?.some(
                  (t) => t.to === Number(seat) && t.scope === "external",
                )
                  ? "（外包按固定额结算）"
                  : ""}
              </span>
              <strong>
                {score.total} <small>分 / 份</small>
              </strong>
            </summary>
            <table className="score-items-table" aria-label={`${record.names[Number(seat)]}的胡牌计分`}>
              <thead><tr><th>计分项目</th><th>计算说明</th><th>得分</th></tr></thead>
              <tbody>{score.items.map((item, i) => {
                const copy = scoreItemCopy(item);
                return <tr key={i}><td>{copy.label}</td><td>{copy.calculation}</td><td>{scoreText(item.value)}分</td></tr>;
              })}</tbody>
              <tfoot><tr><th colSpan={2}>本次胡牌分（每份）</th><td>{score.total}分</td></tr></tfoot>
            </table>
            {record.hands?.[Number(seat)] && <p className="score-hand-note">
              {record.hands[Number(seat)].melds.map((meld) =>
                `${meld.type === "pung" ? "碰" : meld.concealed ? "暗杠" : meld.added ? "补杠" : "直杠"}${tileName(meld.tiles[0])}${meld.concealed ? "（自己集齐）" : `（${record.names[meld.from]}供牌）`}`
              ).join("；")}
            </p>}
          </details>
        ))}
        {!ledgerFirst && (record.result.transfers !== undefined ? (
          <details
            className="score-ledger"
            open
          >
            <summary>
              <span>本把实际收付款</span>
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
                    <small>
                      {entry.reason}
                      {entry.scope === "external" ? " · 桌外" : ""}
                    </small>
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
        ))}
        <p className="form-note">
          上表为每份胡牌分；实际收付款以逐笔明细为准，包含余额不足、承包和保米调整。积分仅记录牌局。
        </p>
      </div>
    </div>
  );
}

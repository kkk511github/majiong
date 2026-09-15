import { useState, type CSSProperties } from "react";
import { Copy, Trophy } from "lucide-react";
import type { RoundRecord, Seat, View, PublicPlayer } from "../shared/types";
import {
  settlementRows,
  settlementTime,
  signedScore,
  roundNet,
} from "../shared/settlement";
import { Tile } from "./Tile";
import "./round-reveal.css";
import type { roundReadiness } from "./round-readiness";
import { winPhrases } from "./voice-events";

export function RoundReveal({
  view,
  record,
  readiness,
}: {
  view: Pick<View, "phase" | "code" | "round"> & {
    me: number;
    rules: Pick<View["rules"], "rounds">;
    players: (Pick<
      PublicPlayer,
      "name" | "ready" | "hand" | "melds" | "flowers"
    > | null)[];
  };
  record: RoundRecord;
  readiness?: ReturnType<typeof roundReadiness>["seats"];
}) {
  const final = view.phase === "finished";
  const [copied, setCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const rows = settlementRows(record);
  const order = final
    ? rows.map((r) => r.seat)
    : [0, 1, 2, 3].sort(
        (a, b) =>
          Number(record.result.winners.includes(b as Seat)) -
            Number(record.result.winners.includes(a as Seat)) || a - b,
      );
  return (
    <section
      className={`round-reveal ${final ? "reveal-final" : ""}`}
      aria-label={final ? "本桌最终战绩" : "本局四家牌面"}
    >
      <div className="reveal-meta">
        <strong>房间号 {view.code}</strong>
        <span>
          第 {view.round} / {view.rules.rounds} 把
        </span>
        <time dateTime={new Date(record.at).toISOString()}>
          {settlementTime(record.at)}
        </time>
        <button
          className="reveal-replay-id"
          title={`牌局 ID ${record.id}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(record.id);
              setIdCopied(true);
            } catch {
              setIdCopied(false);
            }
          }}
        >
          {idCopied ? "牌局 ID 已复制" : `牌局 ID：${record.id}`}
        </button>
      </div>
      <div className="reveal-players">
        {order.map((seat) => {
          const p = view.players[seat];
          if (!p) return null;
          const row = rows.find((r) => r.seat === seat)!;
          const winner = record.result.winners.includes(seat as Seat);
          const lead = final ? row.rank === 1 && row.net > 0 : winner;
          const saved = record.hands?.[seat] ?? p;
          const winTile =
            winner && record.result.from !== undefined
              ? record.result.winningTile
              : undefined;
          const cards = [
            ...saved.melds.flatMap((m) => m.tiles),
            ...saved.hand,
            ...(winTile !== undefined && !saved.hand.includes(winTile)
              ? [winTile]
              : []),
          ];
          return (
            <article
              key={seat}
              className={`reveal-player ${lead ? "reveal-winner" : ""}`}
              aria-label={`${p.name}的本局牌面`}
            >
              <div className="reveal-identity">
                <span className={`avatar avatar-${seat}`}>
                  <span className="portrait-art" aria-hidden="true" />
                </span>
                <strong>
                  {p.name}
                  {seat === view.me ? " · 我" : ""}
                </strong>
                <small
                  className={readiness ? "settlement-readiness" : undefined}
                  data-state={readiness?.[seat].state}
                  aria-label={
                    readiness
                      ? `${p.name}：${readiness[seat].label}`
                      : undefined
                  }
                >
                  {readiness
                    ? readiness[seat].label
                    : final
                      ? `第 ${row.rank} 名`
                      : winner
                        ? winPhrases(record.result, seat as Seat)[0]
                        : record.result.from === seat
                          ? "点炮"
                          : p.ready
                            ? "已确认继续"
                            : "查看牌面"}
                </small>
              </div>
              <div className="reveal-hand">
                {lead && (
                  <div className="reveal-score-items">
                    {final ? (
                      <span>
                        <Trophy size={12} /> 大赢家 · 本桌累计
                      </span>
                    ) : (
                      record.result.details[seat as Seat]?.items.map(
                        (item, i) => (
                          <span key={i}>
                            {item.label} +{item.value}
                          </span>
                        ),
                      )
                    )}
                  </div>
                )}
                <div
                  className="reveal-tiles"
                  role="group"
                  aria-label={`${p.name}的手牌与碰杠牌`}
                  style={
                    {
                      "--reveal-count": Math.max(1, cards.length),
                    } as CSSProperties
                  }
                >
                  {cards.map((tile, i) => (
                    <span
                      className={`${i === saved.melds.reduce((n, m) => n + m.tiles.length, 0) && i > 0 ? "reveal-hand-start" : ""} ${winTile === tile && i === cards.length - 1 ? "reveal-winning-tile" : ""}`}
                      key={i}
                    >
                      <Tile tile={tile} />
                    </span>
                  ))}
                </div>
                <small className="reveal-flowers">
                  {saved.flowers.length} 花
                  {saved.melds.length ? ` · ${saved.melds.length} 组碰杠` : ""}
                </small>
              </div>
              <div className="reveal-scores">
                {final && (
                  <span>
                    本把
                    <b
                      className={
                        roundNet(record.result, seat) > 0
                          ? "score-plus"
                          : "score-minus"
                      }
                    >
                      {signedScore(roundNet(record.result, seat))}
                    </b>
                  </span>
                )}
                <span>
                  {final ? "累计" : "本把"}
                  <b
                    className={
                      (final ? row.net : roundNet(record.result, seat)) > 0
                        ? "score-plus"
                        : "score-minus"
                    }
                  >
                    {signedScore(
                      final ? row.net : roundNet(record.result, seat),
                    )}
                  </b>
                </span>
                <span>
                  {final ? "记分" : "桌上分"}
                  <b className={final && row.recorded > 0 ? "score-plus" : ""}>
                    {final ? signedScore(row.recorded) : row.score}
                  </b>
                </span>
                {!!(final
                  ? row.external
                  : record.result.externalDeltas?.[seat]) && (
                  <small>
                    含桌外{" "}
                    {signedScore(
                      final
                        ? row.external
                        : record.result.externalDeltas![seat],
                    )}
                  </small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {final && (
        <div className="reveal-final-note">
          <span>
            本金 {record.settlementBase ?? record.initialScore ?? 0} · 入桌{" "}
            {record.initialScore ?? 0} · 记分＝累计输赢 ×{" "}
            {1 / (record.scoreDivisor ?? 1)}
          </span>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  [
                    `金陵麻将 房间号 ${view.code}`,
                    settlementTime(record.at),
                    ...rows.map(
                      (r) =>
                        `${r.name} 分数 ${signedScore(r.net)} 记分 ${signedScore(r.recorded)}`,
                    ),
                  ].join("\n"),
                );
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy size={12} />
            {copied ? "已复制" : "复制战绩"}
          </button>
        </div>
      )}
    </section>
  );
}

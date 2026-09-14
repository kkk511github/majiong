import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { client } from "./game-client";
import { Dialog } from "./Dialog";
import { MatchRecordDetails, RecordPlayers } from "./MatchRecordDetails";
import "./records-match.css";
import { ReplayPanel } from "./ReplayPanel";
import { settlementTime } from "../shared/settlement";
import type { Account, RecordsPage, StoredRound } from "../shared/types";

export function RecordsPanel({ account }: { account: Account | null }) {
  const [tab, setTab] = useState<"admin" | "online" | "practice">(
    account?.role === "admin" ? "admin" : "online",
  );
  const [code, setCode] = useState(""),
    [date, setDate] = useState("");
  const [filter, setFilter] = useState({ code: "", date: "" });
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<RecordsPage>({
    records: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<StoredRound | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setSelected(null);
    if (tab === "practice") {
      const groups = new Map<string, StoredRound>();
      for (const item of client.history().filter((r) => r.practice)) {
        if (!groups.has(item.game)) groups.set(item.game, item);
      }
      const all = [...groups.values()]
        .filter(
          (r) =>
            r.record.matchFinished ||
            r.record.round >= (r.record.totalRounds ?? Infinity),
        )
        .map((r) => ({ ...r, record: { ...r.record, matchFinished: true } }));
      setData({
        records: all.slice((page - 1) * 20, page * 20),
        total: all.length,
        page,
        pageSize: 20,
      });
      setBusy(false);
      return;
    }
    const query = new URLSearchParams({ page: String(page) });
    if (filter.code) query.set("code", filter.code);
    if (filter.date) {
      const from = new Date(filter.date + "T00:00:00+08:00");
      const to = new Date(from.getTime() + 86400000);
      query.set("from", String(from.getTime()));
      query.set("to", String(to.getTime()));
    }
    client
      .loadRecords(tab === "admin", query)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, page, refresh, filter.code, filter.date, account?.id]);
  const tabs = [
    ...(account?.role === "admin" ? [{ id: "admin", name: "牌桌总战绩" }] : []),
    { id: "online", name: "我的对局" },
    { id: "practice", name: "单人练习" },
  ] as const;
  return (
    <section className="records-panel" aria-label="战绩中心">
      <div className="records-heading">
        <div>
          <span className="eyebrow">每一桌，都有回味</span>
          <h1>{tab === "admin" ? "牌桌总战绩" : "我的战绩"}</h1>
        </div>
        <div className="records-heading-actions">
          <button className="replay-open" onClick={() => setReplayId("")}>
            <History size={16} />
            牌局回放
          </button>
          {tab === "admin" && (
            <span className="records-admin">
              <ShieldCheck size={16} />
              管理员
            </span>
          )}
        </div>
      </div>
      <div className="records-toolbar">
        <nav aria-label="战绩范围">
          {tabs.map((item) => (
            <button
              key={item.id}
              aria-pressed={tab === item.id}
              onClick={() => {
                setTab(item.id as typeof tab);
                setPage(1);
              }}
            >
              {item.name}
            </button>
          ))}
        </nav>
        {tab !== "practice" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFilter({ code, date });
              setPage(1);
              setRefresh((n) => n + 1);
            }}
          >
            <label>
              <span className="sr-only">战绩房间号</span>
              <input
                inputMode="numeric"
                placeholder="房间号"
                value={code}
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label>
              <span className="sr-only">结束日期</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <button type="submit" className="secondary" aria-label="查询战绩">
              <Search size={16} />
            </button>
            {(filter.code || filter.date) && (
              <button
                type="button"
                className="records-clear"
                onClick={() => {
                  setCode("");
                  setDate("");
                  setFilter({ code: "", date: "" });
                  setPage(1);
                }}
              >
                清除
              </button>
            )}
          </form>
        )}
        <button
          aria-label="刷新战绩"
          className="icon-button"
          disabled={busy}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <p className="records-description">
        {tab === "admin"
          ? "每桌结束后显示一条最终战绩，续桌会另存一条。"
          : tab === "online"
            ? "每桌显示四位牌友的最终记分，点详情可查看每把积分、牌面与回放。"
            : "此设备已完成练习桌的最终战绩与每把明细。"}
      </p>
      <div className="records-list" aria-busy={busy}>
        {error ? (
          <div className="records-empty" role="alert">
            <History size={32} />
            <p>{error}</p>
            <button
              className="secondary"
              onClick={() => setRefresh((n) => n + 1)}
            >
              重试
            </button>
          </div>
        ) : busy ? (
          <div className="records-empty" role="status">
            正在读取战绩…
          </div>
        ) : !data.records.length ? (
          <div className="records-empty">
            <History size={36} />
            <h3>{tab === "admin" ? "还没有结束的牌桌" : "暂时没有战绩"}</h3>
            <p>
              {tab === "admin"
                ? "牌桌打完或提前解散后，四位牌友的最终战绩会保存在这里。"
                : "完成对局后即可查看。"}
            </p>
          </div>
        ) : (
          data.records.map((item) => (
            <button
              className="record-card match-card"
              key={item.game}
              onClick={() => setSelected(item)}
              aria-label={`查看房间 ${item.code} 最终战绩`}
            >
              <span className="match-card-header">
                <b>{item.record.tableName ?? "南京麻将"}</b>
                <span>
                  房间 {item.code} · {item.record.round}/
                  {item.record.totalRounds ?? item.record.round} 把
                </span>
                <time>{settlementTime(item.record.at)}</time>
                <span className="match-detail-link">
                  详情 <ChevronRight size={16} />
                </span>
              </span>
              <RecordPlayers record={item.record} />
            </button>
          ))
        )}
      </div>
      <div className="records-pagination">
        <span>{busy || error ? "" : `共 ${data.total} 桌`}</span>
        <button
          disabled={busy || page <= 1}
          onClick={() => setPage((p) => p - 1)}
          aria-label="上一页战绩"
        >
          <ArrowLeft size={16} />
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
        </span>
        <button
          disabled={busy || page >= Math.ceil(data.total / data.pageSize)}
          onClick={() => setPage((p) => p + 1)}
          aria-label="下一页战绩"
        >
          <ArrowRight size={16} />
        </button>
      </div>
      {selected && (
        <Dialog
          title="牌桌最终战绩"
          variant="match-record-dialog"
          close={() => setSelected(null)}
        >
          <MatchRecordDetails selected={selected} replay={setReplayId} />
        </Dialog>
      )}
      {replayId !== null && (
        <ReplayPanel initialId={replayId} close={() => setReplayId(null)} />
      )}
    </section>
  );
}

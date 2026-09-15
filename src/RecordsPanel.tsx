import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Layers3,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { client } from "./game-client";
import { Dialog } from "./Dialog";
import { MatchRecordDetails, RecordPlayers } from "./MatchRecordDetails";
import "./records-match.css";
import "./records-workspace.css";
import { ReplayPanel } from "./ReplayPanel";
import {
  recordClock,
  recordDate,
  recordDateLabel,
  recordDayRange,
} from "./record-dates";
import type { Account, RecordsPage, StoredRound } from "../shared/types";

export function RecordsPanel({
  account,
  onBack,
}: {
  account: Account | null;
  onBack: () => void;
}) {
  const showTeams = account?.role === "admin";
  const [tab, setTab] = useState<"admin" | "online" | "practice">(
    account?.role === "admin" ? "admin" : "online",
  );
  const [code, setCode] = useState("");
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
  const list = useRef<HTMLDivElement>(null);
  const today = recordDate(Date.now());
  const yesterday = recordDate(recordDayRange(today).from - 86400000);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setSelected(null);
    list.current?.scrollTo({ top: 0 });
    if (tab === "practice") {
      const groups = new Map<string, StoredRound>();
      for (const item of client.history().filter((r) => r.practice)) {
        const previous = groups.get(item.game);
        if (!previous || item.record.round > previous.record.round)
          groups.set(item.game, item);
      }
      const all = [...groups.values()]
        .filter(
          (r) =>
            (r.record.matchFinished ||
              r.record.round >= (r.record.totalRounds ?? Infinity)) &&
            (!filter.code || r.code.startsWith(filter.code)),
        )
        .map((r) => ({ ...r, record: { ...r.record, matchFinished: true } }))
        .sort((a, b) => b.record.at - a.record.at);
      const dates = new Map<string, number>();
      all.forEach((r) => {
        const day = recordDate(r.record.at);
        dates.set(day, (dates.get(day) ?? 0) + 1);
      });
      const filtered = all.filter(
        (r) => !filter.date || recordDate(r.record.at) === filter.date,
      );
      setData({
        records: filtered.slice((page - 1) * 20, page * 20),
        total: filtered.length,
        page,
        pageSize: 20,
        dateTotal: all.length,
        dates: [...dates]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      });
      setBusy(false);
      return;
    }
    const query = new URLSearchParams({ page: String(page) });
    if (filter.code) query.set("code", filter.code);
    if (filter.date) {
      const { from, to } = recordDayRange(filter.date);
      query.set("from", String(from));
      query.set("to", String(to));
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
  const days = useMemo(
    () =>
      [
        ...new Set([
          today,
          yesterday,
          ...(data.dates ?? []).map((d) => d.date),
          ...(filter.date ? [filter.date] : []),
        ]),
      ].sort((a, b) => b.localeCompare(a)),
    [today, yesterday, data.dates, filter.date],
  );
  const counts = new Map(data.dates?.map((d) => [d.date, d.count]));
  const chooseDate = (date: string) => {
    setFilter((f) => ({ ...f, date }));
    setPage(1);
  };
  const tabs = [
    ...(account?.role === "admin" ? [{ id: "admin", name: "牌桌总战绩" }] : []),
    { id: "online", name: "我的对局" },
    { id: "practice", name: "单人练习" },
  ] as const;
  return (
    <section className="records-panel records-workspace" aria-label="战绩中心">
      <div className="records-heading">
        <button className="records-back" onClick={onBack} aria-label="返回大厅">
          <ArrowLeft size={23} />
          <span>返回</span>
        </button>
        <h1>{tab === "admin" ? "牌桌总战绩" : "我的战绩"}</h1>
        <nav aria-label="战绩范围">
          {tabs.map((item) => (
            <button
              key={item.id}
              aria-pressed={tab === item.id}
              onClick={() => {
                setTab(item.id as typeof tab);
                setPage(1);
                setData({ records: [], total: 0, page: 1, pageSize: 20 });
              }}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <form
          className="record-search"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter((f) => ({ ...f, code }));
            setPage(1);
            setRefresh((n) => n + 1);
          }}
        >
          <label>
            <span className="sr-only">战绩房间号</span>
            <input
              inputMode="numeric"
              placeholder="输入房间号"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button type="submit" aria-label="查询战绩">
            <Search size={18} />
          </button>
        </form>
        <button className="replay-open" onClick={() => setReplayId("")}>
          <History size={17} />
          牌局回放
        </button>
      </div>
      <div className="records-workspace-body">
        <aside className="record-dates" aria-label="按日期查看战绩">
          <div className="record-date-list">
            <button
              className="record-date"
              aria-pressed={!filter.date}
              onClick={() => chooseDate("")}
            >
              <b>全部</b>
              <small>
                {data.dateTotal === undefined
                  ? "所有日期"
                  : `共 ${data.dateTotal} 桌`}
              </small>
            </button>
            {days.map((day) => (
              <button
                className="record-date"
                key={day}
                aria-pressed={filter.date === day}
                onClick={() => chooseDate(day)}
              >
                <b>{recordDateLabel(day, today)}</b>
                <small>
                  {counts.has(day)
                    ? `${counts.get(day)} 桌`
                    : data.dates
                      ? "0 桌"
                      : "查看对局"}
                </small>
              </button>
            ))}
          </div>
          <label className="record-date-picker">
            <CalendarDays size={18} />
            <span>选择日期</span>
            <input
              type="date"
              aria-label="选择战绩日期"
              value={filter.date}
              max={today}
              onChange={(e) => chooseDate(e.target.value)}
            />
          </label>
        </aside>
        <div className="records-results">
          <div className="records-results-heading">
            <span>
              <b>{recordDateLabel(filter.date, today)}</b>
              {!busy && !error && ` · 共 ${data.total} 桌`}
              {filter.code && ` · 房间 ${filter.code}`}
            </span>
            <div>
              {tab === "admin" && (
                <span className="records-admin">
                  <ShieldCheck size={14} />
                  战队仅管理员可见
                </span>
              )}
              {filter.code && (
                <button
                  className="records-clear"
                  onClick={() => {
                    setCode("");
                    setFilter((f) => ({ ...f, code: "" }));
                    setPage(1);
                  }}
                >
                  清除房间
                </button>
              )}
              <div className="records-pagination">
                <button
                  disabled={busy || page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="上一页战绩"
                >
                  <ArrowLeft size={18} />
                </button>
                <span>
                  {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))}
                </span>
                <button
                  disabled={
                    busy || page >= Math.ceil(data.total / data.pageSize)
                  }
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="下一页战绩"
                >
                  <ArrowRight size={18} />
                </button>
              </div>
              <button
                aria-label="刷新战绩"
                className="icon-button"
                disabled={busy}
                onClick={() => setRefresh((n) => n + 1)}
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          <div className="records-list" aria-busy={busy} ref={list}>
            {error ? (
              <div className="records-empty" role="alert">
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
                <History size={32} />
                <h3>
                  {filter.code
                    ? "没有找到这桌战绩"
                    : filter.date
                      ? "这一天还没有战绩"
                      : "还没有已完成的牌桌"}
                </h3>
                <p>
                  {filter.code
                    ? "请核对房间号，或清除房间筛选。"
                    : "整桌结束后会显示总战绩，可按日期查看。"}
                </p>
                {filter.date && (
                  <button className="secondary" onClick={() => chooseDate("")}>
                    查看全部
                  </button>
                )}
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
                    <span className="record-tile-mark" aria-hidden="true">
                      發
                    </span>
                    <b>
                      {item.record.tableName ?? "好友桌"}
                      <span> · 房间 {item.code}</span>
                    </b>
                    <time dateTime={new Date(item.record.at).toISOString()}>
                      <Clock3 size={16} />
                      {recordClock(item.record.at, !filter.date)}
                    </time>
                    <span className="record-round-count">
                      <Layers3 size={16} />
                      {item.record.round}/
                      {item.record.totalRounds ?? item.record.round} 把
                    </span>
                  </span>
                  <RecordPlayers record={item.record} showTeams={showTeams} />
                  <span className="match-detail-link">
                    详情
                    <ChevronRight size={18} />
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
      {selected && (
        <Dialog
          title="牌桌战绩详情"
          variant="match-record-dialog"
          close={() => setSelected(null)}
        >
          <MatchRecordDetails
            selected={selected}
            replay={setReplayId}
            showTeams={showTeams}
          />
        </Dialog>
      )}
      {replayId !== null && (
        <ReplayPanel initialId={replayId} close={() => setReplayId(null)} />
      )}
    </section>
  );
}

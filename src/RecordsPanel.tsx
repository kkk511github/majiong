import { lazy, useCallback, useEffect, useRef, useState } from "react";
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
import "./records-redesign.css";
import { DeferredFeature } from "./DeferredFeature";
const ReplayPanel = lazy(() => import("./ReplayPanel").then(m => ({ default: m.ReplayPanel })));
import {
  recordClock,
  recordDate,
  recordDateLabel,
  recordDayRange,
  recordFilterRange,
  recordCalendarLabel,
} from "./record-dates";
import type { Account, RecordsPage, StoredRound } from "../shared/types";

type WorkspaceMemory = {
  tab: "admin" | "online" | "practice";
  code: string;
  searchMode: string;
  filter: { code: string; date: string; member: string };
  readFilter: string;
  page: number;
  scroll: number;
};
const workspaceMemory = new Map<string, WorkspaceMemory>();

export function RecordsPanel({
  account,
  onBack,
}: {
  account: Account | null;
  onBack: () => void;
}) {
  const memoryKey = account?.id ?? "practice";
  const saved = useRef(workspaceMemory.get(memoryKey)).current;
  const showTeams = account?.role === "admin";
  const [tab, setTab] = useState<"admin" | "online" | "practice">(
    saved?.tab === "admin" && !showTeams
      ? "online"
      : (saved?.tab ?? (showTeams ? "admin" : "online")),
  );
  const [code, setCode] = useState(saved?.code ?? "");
  const [searchMode, setSearchMode] = useState(saved?.searchMode ?? "code");
  const [filter, setFilter] = useState(
    saved?.filter ?? { code: "", date: "", member: "" },
  );
  const [readFilter, setReadFilter] = useState(saved?.readFilter ?? "all");
  const readChanged = useRef(false);
  const [page, setPage] = useState(saved?.page ?? 1),
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
  const initialScroll = useRef(saved?.scroll ?? 0);
  const latestMemory = useRef<WorkspaceMemory>({
    tab,
    code,
    searchMode,
    filter,
    readFilter,
    page,
    scroll: initialScroll.current,
  });
  latestMemory.current = {
    ...latestMemory.current,
    tab,
    code,
    searchMode,
    filter,
    readFilter,
    page,
  };
  useEffect(
    () => () => {
      workspaceMemory.set(memoryKey, latestMemory.current);
    },
    [memoryKey],
  );
  useEffect(() => {
    if (!busy && list.current && initialScroll.current) {
      list.current.scrollTop = initialScroll.current;
      initialScroll.current = 0;
    }
  }, [busy]);
  const onRead = useCallback((game: string, readAt: number) => {
    readChanged.current = true;
    setData((previous) => ({
      ...previous,
      records: previous.records.map((item) =>
        item.game === game ? { ...item, adminReadAt: readAt } : item,
      ),
    }));
  }, []);
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
      const range = recordFilterRange(filter.date, today);
      const filtered = all.filter(
        (r) => !range || (r.record.at >= range.from && r.record.at < range.to),
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
    if (tab === "admin") query.set("read", readFilter);
    if (filter.code) query.set("code", filter.code);
    if (tab === "admin" && filter.member) query.set("member", filter.member);
    if (filter.date) {
      const { from, to } = recordFilterRange(filter.date, today)!;
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
  }, [
    tab,
    page,
    refresh,
    filter.code,
    filter.date,
    filter.member,
    readFilter,
    account?.id,
    today,
  ]);
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
        <h1>战绩</h1>
        <nav aria-label="战绩范围">
          {tabs.map((item) => (
            <button
              key={item.id}
              aria-pressed={tab === item.id}
              onClick={() => {
                if (tab === item.id) return;
                setTab(item.id as typeof tab);
                if (item.id !== "admin") {
                  setSearchMode("code");
                  setCode(filter.code);
                }
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
            setFilter((f) => ({
              ...f,
              code: searchMode === "code" ? code : "",
              member: tab === "admin" && searchMode === "member" ? code : "",
            }));
            setPage(1);
            setRefresh((n) => n + 1);
          }}
        >
          <label>
            <span className="sr-only">
              {tab === "admin" && searchMode === "member"
                ? "战绩会员ID"
                : "战绩房间号"}
            </span>
            <input
              inputMode="numeric"
              placeholder={
                tab === "admin" && searchMode === "member"
                  ? "输入会员ID"
                  : "输入房间号"
              }
              value={code}
              maxLength={tab === "admin" && searchMode === "member" ? 12 : 6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button type="submit" aria-label="查询战绩">
            <Search size={18} />
          </button>
        </form>
        <button className="replay-open" aria-label="牌局回放" onClick={() => setReplayId("")}>
          <History size={17} />
          <span>牌局回放</span>
        </button>
      </div>
      <div className="records-workspace-body">
        <div className="record-dates" aria-label="按日期查看战绩">
          <div className="record-date-list">
            {[
              { date: "", label: "全部" },
              { date: today, label: "今天" },
              { date: yesterday, label: "昨天" },
              { date: "recent", label: "近7天" },
            ].map(({ date, label }) => (
              <button className="record-date" key={date} aria-pressed={filter.date === date} onClick={() => chooseDate(date)}>{label}</button>
            ))}
          </div>
          <div className="record-calendar">
            <button aria-label="前一天战绩" onClick={() => chooseDate(recordDate(recordDayRange(filter.date && filter.date !== "recent" ? filter.date : today).from - 86400000))}><ArrowLeft size={16} /></button>
            <label className="record-date-picker">
              <CalendarDays size={17} />
              <span>{filter.date && filter.date !== "recent" ? recordCalendarLabel(filter.date, today) : "选择日期"}</span>
              <input type="date" aria-label="选择战绩日期" value={filter.date === "recent" ? "" : filter.date} max={today} onChange={(e) => chooseDate(e.target.value)} />
            </label>
            <button aria-label="后一天战绩" disabled={!filter.date || filter.date === "recent" || filter.date >= today} onClick={() => chooseDate(recordDate(recordDayRange(filter.date).from + 86400000))}><ArrowRight size={16} /></button>
          </div>
          <div className="record-admin-filters">
          {tab === "admin" && (
            <label className="record-read-filter">
              <span className="sr-only">战绩阅读状态</span>
              <select
                aria-label="战绩阅读状态"
                value={readFilter}
                onChange={(e) => {
                  setReadFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">全部战绩</option>
                <option value="unread">只看未读</option>
                <option value="read">只看已读</option>
              </select>
            </label>
          )}
          {tab === "admin" && (
            <select
              className="record-query-mode"
              aria-label="战绩查询方式"
              value={searchMode}
              onChange={(e) => {
                setSearchMode(e.target.value);
                setCode("");
              }}
            >
              <option value="code">房号</option>
              <option value="member">会员ID</option>
            </select>
          )}
          </div>
        </div>
        <div className="records-results">
          <div className="records-results-heading">
            <span>
              <b>{recordDateLabel(filter.date, today)}</b>
              {!busy && !error && ` · 共 ${data.total} 桌`}
              {filter.code && ` · 房间 ${filter.code}`}
              {tab === "admin" && filter.member && ` · 会员 ${filter.member}`}
            </span>
            <div>
              {tab === "admin" && (
                <span className="records-admin">
                  <ShieldCheck size={14} />
                  战队仅管理员可见
                </span>
              )}
              {(filter.code || (tab === "admin" && filter.member)) && (
                <button
                  className="records-clear"
                  onClick={() => {
                    setCode("");
                    setFilter((f) => ({ ...f, code: "", member: "" }));
                    setPage(1);
                  }}
                >
                  清除查询
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
          <div
            className="records-list"
            aria-busy={busy}
            ref={list}
            onScroll={(e) => {
              latestMemory.current.scroll = e.currentTarget.scrollTop;
            }}
          >
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
                  {tab === "admin" && readFilter !== "all"
                    ? readFilter === "unread"
                      ? "当前筛选下没有未读战绩"
                      : "当前筛选下没有已读战绩"
                    : tab === "admin" && filter.member
                      ? "没有找到该会员的战绩"
                      : filter.code
                        ? "没有找到这桌战绩"
                        : filter.date
                          ? "这一天还没有战绩"
                          : "还没有已完成的牌桌"}
                </h3>
                <p>
                  {tab === "admin" && filter.member
                    ? "请核对会员 ID，或清除查询条件。"
                    : filter.code
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
                    <b>
                      房间 {item.code}
                      <span> · {item.record.tableName ?? "好友桌"}</span>
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
                    {showTeams && !item.practice && (
                      <span
                        className={
                          item.adminReadAt ? "record-read" : "record-unread"
                        }
                      >
                        {item.adminReadAt ? (
                          <>
                            ✅ 已读
                            <time
                              className="record-read-time"
                              dateTime={new Date(
                                item.adminReadAt,
                              ).toISOString()}
                            >
                              {recordClock(item.adminReadAt, true)}
                            </time>
                          </>
                        ) : (
                          "未读"
                        )}
                      </span>
                    )}
                    <span className="record-detail-caption">
                      查看详情
                      <ChevronRight size={18} />
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
      {selected && (
        <Dialog
          title={`房间 ${selected.code} · 战绩详情`}
          variant="match-record-dialog"
          headerAside={<div className="record-detail-total" aria-label="整桌总战绩"><RecordPlayers record={selected.record} showTeams={showTeams} /></div>}
          close={() => {
            setSelected(null);
            if (
              readChanged.current &&
              tab === "admin" &&
              readFilter !== "all"
            ) {
              setPage(1);
              setRefresh((n) => n + 1);
            }
            readChanged.current = false;
          }}
        >
          <MatchRecordDetails
            selected={selected}
            onRead={onRead}
            replay={setReplayId}
            showTeams={showTeams}
          />
        </Dialog>
      )}
      {replayId !== null && (
        <DeferredFeature label="回放" modal close={() => setReplayId(null)}><ReplayPanel initialId={replayId} close={() => setReplayId(null)} /></DeferredFeature>
      )}
    </section>
  );
}

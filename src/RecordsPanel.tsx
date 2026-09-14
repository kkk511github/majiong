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
import { Settlement } from "./Settlement";
import { ReplayPanel } from "./ReplayPanel";
import {
  settlementRows,
  settlementTime,
  signedScore,
} from "../shared/settlement";
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
      const all = client.history().filter((r) => r.practice);
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
      const from = new Date(filter.date + "T00:00:00");
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
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
            ? "账号下已完成的对局，可查看每局收支和当时的累计记分。"
            : "此设备保存的练习记录。"}
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
          data.records.map((item) => {
            const rows = settlementRows(item.record),
              own = rows.find((row) => row.seat === item.me),
              top = rows[0];
            return (
              <button
                className="record-card"
                key={item.record.id}
                onClick={() => setSelected(item)}
                aria-label={`查看房间 ${item.code} ${item.record.matchFinished ? "最终战绩" : `第 ${item.record.round} 局战绩`}`}
              >
                <span className="record-room">
                  <b>{item.practice ? "练习桌" : item.code}</b>
                  <small>{item.record.tableName ?? "南京麻将"}</small>
                </span>
                <span className="record-info">
                  <strong>
                    {item.record.matchFinished
                      ? "本桌已结束"
                      : `第 ${item.record.round} 局`}
                    <small>
                      {item.record.round} /{" "}
                      {item.record.totalRounds ?? item.record.round} 局
                    </small>
                  </strong>
                  <time>{settlementTime(item.record.at)}</time>
                </span>
                <span className="record-players">
                  {item.record.names.join(" · ")}
                </span>
                <span className="record-score">
                  <small>
                    {tab === "admin"
                      ? `${top.name} · 最高记分`
                      : "我的累计记分"}
                  </small>
                  <b
                    className={
                      (tab === "admin" ? top.recorded : (own?.recorded ?? 0)) >
                      0
                        ? "positive"
                        : ""
                    }
                  >
                    {signedScore(
                      tab === "admin" ? top.recorded : (own?.recorded ?? 0),
                    )}
                  </b>
                </span>
                <ChevronRight size={18} />
              </button>
            );
          })
        )}
      </div>
      <div className="records-pagination">
        <span>
          {busy || error
            ? ""
            : `共 ${data.total} ${tab === "admin" ? "桌" : "局"}`}
        </span>
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
          title={selected.record.matchFinished ? "牌桌最终战绩" : "牌局战绩"}
          variant="settlement-dialog"
          close={() => setSelected(null)}
        >
          <Settlement
            record={selected.record}
            code={selected.code}
            me={selected.me}
          />
          <button
            className="replay-open"
            onClick={() =>
              setReplayId(
                selected.record.matchFinished
                  ? `${selected.game}-${selected.record.round}`
                  : selected.record.id,
              )
            }
          >
            <History size={16} />
            回放本局
          </button>
        </Dialog>
      )}
      {replayId !== null && (
        <ReplayPanel initialId={replayId} close={() => setReplayId(null)} />
      )}
    </section>
  );
}

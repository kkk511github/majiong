import { useEffect, useState } from "react";
import { ControlApi, errorMessage } from "./api";
import { ErrorNotice, Loading, Modal } from "./ui";
import { recordDate, recordClock } from "../record-dates";
import { roundNet, settlementRows, signedScore } from "../../shared/settlement";
import type {
  MemberGamePage,
  MemberGameDetail,
} from "../../shared/member-game-query";
const time = (at: number) => `${recordDate(at)} ${recordClock(at)}`;
type Query = { memberId: string; from: string; to: string; page: number };
export function MemberGames({ api }: { api: ControlApi }) {
  const today = recordDate(Date.now());
  const [memberId, setMemberId] = useState(""),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(today);
  const [query, setQuery] = useState<Query | null>(null),
    [data, setData] = useState<MemberGamePage | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!query) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ ...query, page: String(query.page) });
    api
      .get<MemberGamePage>(`/member-games?${params}`, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError(errorMessage(e));
          setData(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [api, query, reload]);
  function search(next: Query) {
    setSelected(null);
    setData(null);
    setQuery(next);
  }
  return (
    <div className="control-page control-member-games">
      <section className="control-panel">
        <form
          className="control-member-games-form"
          onSubmit={(e) => {
            e.preventDefault();
            search({ memberId: memberId.trim(), from, to, page: 1 });
          }}
        >
          <label>
            会员ID
            <input
              aria-label="查询会员ID"
              inputMode="numeric"
              pattern="[0-9]{1,12}"
              maxLength={12}
              required
              placeholder="例如 100022"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            />
          </label>
          <label>
            开始日期
            <input
              aria-label="开始日期"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            结束日期
            <input
              aria-label="结束日期"
              type="date"
              required
              min={from}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="control-button control-primary"
            disabled={loading}
            type="submit"
          >
            {loading ? "查询中…" : "查询对局"}
          </button>
        </form>
        <div className="control-member-games-shortcuts">
          <button className="control-link" onClick={() => setTo(from)}>
            设为同一天
          </button>
          <button
            className="control-link"
            onClick={() => {
              setFrom(today);
              setTo(today);
            }}
          >
            今天
          </button>
          <button
            className="control-link"
            onClick={() => {
              setFrom(recordDate(Date.now() - 6 * 86400000));
              setTo(today);
            }}
          >
            近7天
          </button>
        </div>
        <p className="control-caption">
          北京时间，包含开始和结束日期，单次最多366天。按整桌结束日统计该会员参与的已结束牌桌，同桌多把只计一桌；含提前结束和体验桌，不按战队过滤，进行中不计入。
        </p>
        <ErrorNotice retry={() => setReload((n) => n + 1)}>{error}</ErrorNotice>
        {!query && (
          <p className="control-empty">
            输入会员ID并选择日期。查一天时，将开始和结束日期设为同一天。
          </p>
        )}
        {loading && !data && <Loading />}
      </section>
      {data && (
        <>
          <section
            className="control-panel control-member-game-summary"
            aria-label="会员对局汇总"
          >
            <div>
              <h2>
                {data.member.name} · ID {data.member.memberId}
              </h2>
              <p>
                {data.from} 至 {data.to}（北京时间，含首尾两天）
                {data.member.deleted ? " · 已删除账号的历史战绩" : ""}
              </p>
            </div>
            <div className="control-member-game-total">
              <strong>{data.totalTables}</strong>
              <span>总桌数</span>
            </div>
          </section>
          <section className="control-panel">
            <details open={data.daily.length <= 14}>
              <summary>
                按天统计（{data.daily.length}天，点击日期查看当天）
              </summary>
              <div className="control-member-game-days">
                {data.daily.map((day) => (
                  <button
                    key={day.date}
                    className="control-button"
                    onClick={() => {
                      setMemberId(data.member.memberId);
                      setFrom(day.date);
                      setTo(day.date);
                      search({
                        memberId: data.member.memberId,
                        from: day.date,
                        to: day.date,
                        page: 1,
                      });
                    }}
                  >
                    <span>{day.date}</span>
                    <strong>{day.tables} 桌</strong>
                  </button>
                ))}
              </div>
            </details>
            <div className="control-table-meta">
              <span>按结束时间倒序 · 每页{data.pageSize}桌</span>
              <span>共{data.totalTables}桌</span>
            </div>
            {!data.items.length ? (
              <p className="control-empty">该会员所选日期内没有已结束牌桌。</p>
            ) : (
              <div className="control-table-scroll" aria-busy={loading}>
                <table className="control-table control-member-games-table">
                  <thead>
                    <tr>
                      <th>房号</th>
                      <th>结束时间（北京）</th>
                      <th>牌桌</th>
                      <th>已打把数</th>
                      <th>结束原因</th>
                      <th>会员本桌记分</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.gameId}>
                        <td>{item.code}</td>
                        <td>{time(item.finishedAt)}</td>
                        <td>
                          {item.tableName}
                          {item.experience && (
                            <small className="control-table-sub">体验桌</small>
                          )}
                        </td>
                        <td>{item.rounds} 把</td>
                        <td>{item.reason}</td>
                        <td>
                          {item.memberRecorded === null
                            ? "—"
                            : signedScore(item.memberRecorded)}
                        </td>
                        <td>
                          <button
                            className="control-link"
                            onClick={() => setSelected(item.gameId)}
                            aria-label={`查看房间${item.code}详情`}
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="control-pagination">
              <button
                className="control-button"
                disabled={loading || data.page <= 1}
                onClick={() =>
                  setQuery((q) => (q ? { ...q, page: q.page - 1 } : q))
                }
              >
                上一页
              </button>
              <span>
                第 {data.page} /{" "}
                {Math.max(1, Math.ceil(data.totalTables / data.pageSize))} 页
              </span>
              <button
                className="control-button"
                disabled={
                  loading || data.page * data.pageSize >= data.totalTables
                }
                onClick={() =>
                  setQuery((q) => (q ? { ...q, page: q.page + 1 } : q))
                }
              >
                下一页
              </button>
            </div>
          </section>
        </>
      )}
      {selected && data && (
        <MemberGameDetails
          api={api}
          gameId={selected}
          memberId={data.member.memberId}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function MemberGameDetails({
  api,
  gameId,
  memberId,
  onClose,
}: {
  api: ControlApi;
  gameId: string;
  memberId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MemberGameDetail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api
      .get<MemberGameDetail>(
        `/member-games/${encodeURIComponent(gameId)}?memberId=${encodeURIComponent(memberId)}`,
        abort.signal,
      )
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [api, gameId, memberId]);
  return (
    <Modal title="会员对局详情" onClose={onClose} wide>
      <ErrorNotice>{error}</ErrorNotice>
      {!data && !error && <Loading />}
      {data && (
        <div className="control-member-games">
          <h3>
            {data.member.name} · ID {data.member.memberId}
          </h3>
          <p>
            房间 {data.details.match.code} ·{" "}
            {time(data.details.match.record.at)} ·{" "}
            {data.details.match.record.endReason ?? "本桌结束"}
          </p>
          <p className="control-caption">牌局ID：{gameId}</p>
          <h3>整桌结果</h3>
          <div className="control-table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>玩家</th>
                  <th>桌上分</th>
                  <th>累计输赢</th>
                  <th>记分</th>
                </tr>
              </thead>
              <tbody>
                {settlementRows(data.details.match.record).map((row) => (
                  <tr key={row.seat}>
                    <td>
                      {row.name}
                      {row.id === data.member.id ? "（查询会员）" : ""}
                    </td>
                    <td>{row.score}</td>
                    <td>{signedScore(row.net)}</td>
                    <td>{signedScore(row.recorded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>每把详情</h3>
          <p className="control-caption">
            本把变化为原始分；整桌记分沿用原结算中的桌费和除数，不直接相加混算。
          </p>
          <div className="control-table-scroll">
            <table className="control-table control-member-game-rounds">
              <thead>
                <tr>
                  <th>把数</th>
                  <th>结束时间（北京）</th>
                  <th>结果</th>
                  <th>胡牌玩家</th>
                  <th>查询会员本把变化</th>
                </tr>
              </thead>
              <tbody>
                {data.details.rounds.map((item) => {
                  const r = item.record,
                    seat = r.playerIds?.indexOf(data.member.id) ?? -1;
                  return (
                    <tr key={r.id}>
                      <td>第{r.round}把</td>
                      <td>{time(r.at)}</td>
                      <td>
                        {
                          {
                            hu: "胡牌",
                            draw: "荒庄",
                            dissolved: "解散",
                            bankrupt: "破产结束",
                          }[r.result.reason]
                        }
                      </td>
                      <td>
                        {r.result.winners.map((i) => r.names[i]).join("、") ||
                          "—"}
                      </td>
                      <td>
                        {seat < 0 ? "—" : signedScore(roundNet(r.result, seat))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  LayoutGrid,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { mayCreateTables } from "../shared/permissions";
import { Dialog } from "./Dialog";
import { client, storage, type ClientState } from "./game-client";
import { DEFAULT_TABLE_SETTINGS } from "../shared/table-settings";
import { DEFAULT_NEW_RULES, newGameRules, ruleDisplayName } from "../shared/nanjing-rules";
import type {
  Rules,
  Seat,
  TableConfig,
  TableSettings,
  TableSummary,
} from "../shared/types";

const winds = ["东", "南", "西", "北"];
const trusteeNames = {
  match: "托管（可取消）",
  round: "单局结束暂停",
  dissolve: "超时结束本桌",
  afterRounds: "连续托管后结束",
  disabled: "关闭托管",
};
function Choices<T extends string | number>({
  label,
  value,
  choices,
  change,
}: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  change: (value: T) => void;
}) {
  return (
    <div className="table-choices" role="group" aria-label={label}>
      {choices.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => change(option.value)}
        >
          {value === option.value && <Check size={13} />} {option.label}
        </button>
      ))}
    </div>
  );
}
function Setting({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="table-setting-row">
      <div className="table-setting-label">
        {label}
        {help && <small>{help}</small>}
      </div>
      <div className="table-setting-value">{children}</div>
    </div>
  );
}
function Toggle({
  label,
  checked,
  change,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  change: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="table-toggle"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => change(!checked)}
    >
      <span aria-hidden="true">{checked && <Check size={15} />}</span>
      {label}
    </button>
  );
}

export function TableSetup({
  name,
  busy,
  error,
  close,
  submit,
}: {
  name: string;
  busy: boolean;
  error: string;
  close: () => void;
  submit: (
    settings: TableSettings,
    rules: Partial<Rules>,
    count: number,
  ) => void;
}) {
  const hasSaved = storage.get("tableDraft-v3", null) !== null;
  const saved = storage.get<{
    settings: TableSettings;
    rounds: number;
    seconds: number;
    flowerDouble?: boolean;
    seaBottom?: boolean;
    protectWinner?: boolean;
    count: number;
    ruleId?: Rules["id"];
    successorDouble?: boolean;
    fourWinds?: boolean;
  }>("tableDraft-v3", {
    settings: DEFAULT_TABLE_SETTINGS,
    rounds: 8,
    seconds: 10,
    count: 1,
  });
  const [step, setStep] = useState(0),
    [settings, setSettings] = useState<TableSettings>({
      ...DEFAULT_TABLE_SETTINGS,
      ...saved.settings,
      overtimePerTurn: true,
      continuousRounds: true,
      resultSeconds: 10,
    });
  const flowerDouble = true;
  const [seaBottom, setSeaBottom] = useState(saved.seaBottom ?? true),
    [protectWinner, setProtectWinner] = useState(saved.protectWinner ?? true);
  const ruleId = DEFAULT_NEW_RULES.id;
  const [successorDouble,setSuccessorDouble]=useState(saved.successorDouble??true),
    [fourWinds,setFourWinds]=useState(saved.fourWinds??true);
  const [rounds, setRounds] = useState(saved.rounds),
    [seconds, setSeconds] = useState(String(saved.seconds)),
    [count, setCount] = useState(saved.count),
    [kick, setKick] = useState(String(saved.settings.kickAfterSeconds)),
    [localError, setError] = useState("");
  const update = (patch: Partial<TableSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setError("");
  };
  const valid = () => {
    if (!settings.name.trim() || settings.name.trim().length > 16) {
      setError("玩法名称需要 1–16 个字");
      setStep(0);
      return false;
    }
    if (
      !Number.isInteger(Number(seconds)) ||
      Number(seconds) < 10 ||
      Number(seconds) > 300
    ) {
      setError("每步时间需要 10–300 秒");
      setStep(1);
      return false;
    }
    if (
      !Number.isInteger(Number(kick)) ||
      Number(kick) < 10 ||
      Number(kick) > 60
    ) {
      setError("自动离座时间需要 10–60 秒");
      setStep(1);
      return false;
    }
    if (
      !Number.isInteger(settings.overtimeSeconds) ||
      settings.overtimeSeconds! < 0 ||
      settings.overtimeSeconds! > 300
    ) {
      setError("超时倒计时时间需要 0–300 秒");
      setStep(1);
      return false;
    }
    return true;
  };
  const next = () => {
    if (valid()) {
      setStep((s) => s + 1);
    }
  };
  const create = () => {
    if (!valid()) return;
    const finalSettings = {
      ...settings,
      name: settings.name.trim(),
      kickAfterSeconds: Number(kick),
    };
    storage.set("tableDraft-v3", {
      ruleId,
      successorDouble,
      fourWinds,
      settings: finalSettings,
      rounds,
      seconds: Number(seconds),
      flowerDouble,
      seaBottom,
      protectWinner,
      count,
    });
    submit(
      finalSettings,
      {
        ...newGameRules({id:ruleId}),
        successorDouble,
        fourWinds,
        rounds,
        flowerDouble,
        seaBottom,
        protectWinner,
        twoBankrupt: true,
        turnSeconds: settings.trusteeMode === "disabled" ? 0 : Number(seconds),
      },
      count,
    );
  };
  return (
    <Dialog
      title="开桌设置"
      variant="table-setup-dialog"
      close={close}
      footer={
        <div className="setup-footer">
          <span>
            {settings.readyMode === "auto"
              ? "四人入座，自动开局"
              : "四人入座并准备后开局"}
          </span>
          <div>
            {step > 0 && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setStep(step - 1);
                }}
              >
                <ArrowLeft size={16} />
                上一步
              </button>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={step === 2 ? create : next}
            >
              {busy ? "正在开桌…" : step === 2 ? `创建 ${count} 桌` : "下一步"}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      }
    >
      <div className="setup-profile" aria-label="本桌固定规则">
        <div><strong>南京麻将</strong><span>进园子 · B档</span></div>
        <dl><div><dt>底分</dt><dd>10</dd></div><div><dt>门清</dt><dd>10</dd></div><div><dt>花砸</dt><dd>×2</dd></div></dl>
      </div>
      <ol className="setup-steps">
        {["玩法设置", "桌子设置", "确认开桌"].map((label, i) => (
          <li
            className={step === i ? "current" : step > i ? "done" : ""}
            aria-current={step === i ? "step" : undefined}
            key={label}
          >
            <b>{step > i ? <Check size={13} /> : i + 1}</b>
            {label}
          </li>
        ))}
      </ol>
      <div className="setup-content" key={step}>
        {(localError || error) && (
          <p className="room-form-error" role="alert">
            {localError || error}
          </p>
        )}
        {step === 0 && (
          <>
            <Setting label="玩法名称">
              <input
                aria-label="玩法名称"
                value={settings.name}
                maxLength={16}
                onChange={(e) => update({ name: e.target.value })}
              />
            </Setting>
            <Setting
              label="初始分"
            >
              <span className="setup-badge">90 分 / 人</span>
              <span className="setting-unit">本金 100 · 桌费 10</span>
            </Setting>
            <Setting label="主流模式">
              <Toggle
                label="花砸 2"
                checked={flowerDouble}
                change={() => {}}
                disabled
              />
              <Toggle
                label="海底捞月"
                checked={seaBottom}
                change={setSeaBottom}
              />
              <Toggle label="接庄比" checked={successorDouble} change={setSuccessorDouble}/>
              <Toggle label="东南西北罚分" checked={fourWinds} change={setFourWinds}/>
            </Setting>
            <Setting
              label="保米"
              help="两家归零结束时，从大赢家补最后胡牌者至固定 100 分"
            >
              <Toggle
                label="保米"
                checked={protectWinner}
                change={setProtectWinner}
              />
            </Setting>
            <Setting label="把数选择">
              <Choices
                label="把数选择"
                value={rounds}
                choices={[4, 8, 12, 16].map((n) => ({
                  value: n,
                  label: `${n} 把`,
                }))}
                change={setRounds}
              />
            </Setting>
            <Setting label="牌面展示">
              <Choices
                label="牌面展示"
                value={settings.resultSeconds}
                choices={[{ value: 10, label: "10 秒" }]}
                change={(resultSeconds) => update({ resultSeconds })}
              />
            </Setting>
            <div className="setup-rule-note">
              <strong>两家桌内归零，本桌结束</strong>
              <span>入桌 90 分，结算按本金 100 分；外包仅记桌外，不参与入园。</span>
            </div>
            {hasSaved && <p className="setup-note" role="status">已沿用上次开桌配置，请核对后创建。</p>}
          </>
        )}
        {step === 1 && (
          <>
            <Setting label="创建桌数" help="每人最多同时管理 5 桌">
              <Choices
                label="创建桌数"
                value={count}
                choices={[1, 2, 3, 4, 5].map((n) => ({
                  value: n,
                  label: `${n} 桌`,
                }))}
                change={setCount}
              />
            </Setting>
            <Setting
              label="记分倍率"
              help="最终记分 =（桌上分 + 桌外累计 − 本金 100 分）× 倍率"
            >
              <Choices
                label="记分倍率"
                value={settings.scoreMultiplier ?? 0.5}
                choices={[
                  { value: 0.2, label: "打 20 · 0.2 / 1" },
                  { value: 0.5, label: "打 50 · 0.5 / 1" },
                  { value: 1, label: "打 100 · 1 / 1" },
                ]}
                change={(scoreMultiplier) =>
                  update({ scoreMultiplier: scoreMultiplier as 0.2 | 0.5 | 1 })
                }
              />
            </Setting>
            <Setting label="加入方式">
              <Choices
                label="加入方式"
                value={settings.visibility}
                choices={[
                  { value: "public", label: "大厅公开" },
                  { value: "code", label: "仅凭房号" },
                ]}
                change={(visibility) => update({ visibility })}
              />
            </Setting>
            <Setting label="准备方式">
              <Choices
                label="准备方式"
                value={settings.readyMode}
                choices={[
                  { value: "auto", label: "自动准备" },
                  { value: "manual", label: "手动准备" },
                ]}
                change={(readyMode) => update({ readyMode })}
              />
            </Setting>
            <Setting label="自动续桌" help="本桌结束后按原设置续开空桌">
              <Toggle
                label="自动续桌"
                checked={settings.autoRenew}
                change={(autoRenew) => update({ autoRenew })}
              />
            </Setting>
            <Setting label="离线开局" help="允许时由托管代替离线牌友操作">
              <Toggle
                label="允许离线开局"
                checked={settings.offlineStart}
                disabled={settings.trusteeMode === "disabled"}
                change={(offlineStart) => update({ offlineStart })}
              />
            </Setting>
            <Setting
              label="开局前离座"
              help="未准备计时从四人坐满开始；第一局发牌前执行"
            >
              <Toggle
                label="离线超时自动离座"
                checked={settings.kickOffline}
                change={(kickOffline) => update({ kickOffline })}
              />
              <Toggle
                label="未准备超时自动离座"
                disabled={settings.readyMode === "auto"}
                checked={
                  settings.readyMode === "manual" && settings.kickUnready
                }
                change={(kickUnready) => update({ kickUnready })}
              />
            </Setting>
            <Setting label="自动离座时间">
              <input
                className="number-setting"
                aria-label="自动离座秒数"
                type="number"
                inputMode="numeric"
                min={10}
                max={60}
                value={kick}
                onChange={(e) => {
                  setKick(e.target.value);
                  setError("");
                }}
              />
              <span className="setting-unit">秒 · 10–60</span>
            </Setting>
            <Setting
              label="每步思考"
              help={settings.trusteeMode === "disabled" ? "关闭托管时不限出牌时间" : `超过正常时间后，再开始 ${settings.overtimeSeconds ?? 90} 秒超时倒计时`}
            >
              <input
                className="number-setting"
                aria-label="每步思考秒数"
                type="number"
                inputMode="numeric"
                min={10}
                max={300}
                value={seconds}
                onChange={(e) => {
                  setSeconds(e.target.value);
                  setError("");
                }}
              />
              <span className="setting-unit">秒 · 10–300</span>
            </Setting>
            <Setting
              label="超时倒计时"
              help="每次出牌重新计时；重连保持本次剩余时间"
            >
              <input
                className="number-setting"
                aria-label="超时倒计时秒数"
                type="number"
                min={0}
                max={300}
                value={settings.overtimeSeconds ?? 90}
                onChange={(e) =>
                  update({ overtimeSeconds: Number(e.target.value) })
                }
              />
              <span className="setting-unit">秒 · 用完进入托管</span>
            </Setting>
            <Setting label="超时托管" help="关闭托管时，不限制每步时间">
              <Choices
                label="超时托管"
                value={settings.trusteeMode}
                choices={Object.entries(trusteeNames).map(([value, label]) => ({
                  value: value as TableSettings["trusteeMode"],
                  label,
                }))}
                change={(trusteeMode) =>
                  update({
                    trusteeMode,
                    ...(trusteeMode === "disabled"
                      ? { offlineStart: false }
                      : {}),
                  })
                }
              />
            </Setting>
            {settings.trusteeMode === "afterRounds" && (
              <Setting label="连续托管局数">
                <Choices
                  label="连续托管局数"
                  value={settings.trusteeRounds}
                  choices={[1, 2, 3, 4].map((n) => ({
                    value: n,
                    label: `${n} 局`,
                  }))}
                  change={(trusteeRounds) => update({ trusteeRounds })}
                />
              </Setting>
            )}
            <Setting label="协商解散">
              <Toggle
                label="允许全桌同意后解散"
                checked={settings.allowDissolve}
                change={(allowDissolve) => update({ allowDissolve })}
              />
            </Setting>
            <Setting label="牌友信息">
              <Choices
                label="牌友信息"
                value={settings.privacy}
                choices={[
                  { value: "open", label: "显示昵称" },
                  { value: "lobby", label: "大厅隐藏昵称" },
                  { value: "all", label: "全程隐藏他人昵称" },
                ]}
                change={(privacy) => update({ privacy })}
              />
            </Setting>
          </>
        )}
        {step === 2 && (
          <div className="setup-review">
            <div className="setup-review-title">
              <LayoutGrid size={30} />
              <div>
                <h3>{settings.name}</h3>
                <p>
                  {count} 张空桌 · 每桌 4 人 · {rounds} 把
                </p>
              </div>
            </div>
            <dl>
              <div>
                <dt>计分规则</dt>
                <dd>南京麻将 · {ruleDisplayName({ id: ruleId })} · 底分 10 · 门清 10</dd>
              </div>
              <div>
                <dt>可选规则</dt>
                <dd>{[["花砸2",flowerDouble],["海底捞月",seaBottom],["接庄比",successorDouble],["四连风",fourWinds],["保米",protectWinner]].map(([label,on])=>`${label}：${on?"开启":"关闭"}`).join(" · ")}</dd>
              </div>
              <div>
                <dt>开桌人</dt>
                <dd>{name}</dd>
              </div>
              <div>
                <dt>加入方式</dt>
                <dd>
                  {settings.visibility === "public"
                    ? "大厅可见，点空位入座"
                    : "分享六位房间号加入"}
                </dd>
              </div>
              <div>
                <dt>开局条件</dt>
                <dd>
                  {settings.readyMode === "auto"
                    ? "满四人自动开局"
                    : "四人都准备后开局"}
                  {!settings.offlineStart ? " · 须在线" : ""}
                </dd>
              </div>
              <div>
                <dt>等待与托管</dt>
                <dd>
                  {settings.trusteeMode === "disabled" ? "不限时 · 关闭托管" : `${seconds} 秒 / 步 · 超时倒计时 ${settings.overtimeSeconds ?? 90} 秒 · ${trusteeNames[settings.trusteeMode]}`}
                </dd>
              </div>
              <div>
                <dt>桌子结束后</dt>
                <dd>
                  {settings.autoRenew ? "按原设置续开空桌" : "不自动续桌"}
                </dd>
              </div>
            </dl>
            <p className="setup-note">
              每人本金 100 分，扣 10 分桌费后入桌 90
              分，两家桌内归零结束；最终记分为（桌上分 + 桌外累计 − 100）×{" "}
              {settings.scoreMultiplier ?? 0.5}
              。创建后会进入牌桌大厅。你可以选择座位，也可以复制房号邀请朋友；未满四人时不会发牌。
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function TableLobby({
  name,
  state,
  joinByCode,
}: {
  name: string;
  state: ClientState;
  joinByCode: () => void;
}) {
  const admin = state.account?.role === "admin";
  const canOpen = mayCreateTables(state.account);
  const [setup, setSetup] = useState(false),
    [filter, setFilter] = useState<"all" | "waiting" | "mine">("all"),
    [query, setQuery] = useState(""),
    [closing, setClosing] = useState<TableSummary | null>(null),
    [notice, setNotice] = useState("");
  const initialCreated = useRef(state.createdTables);
  useEffect(() => {
    if (!canOpen) {
      setSetup(false);
      setClosing(null);
    }
  }, [canOpen]);
  useEffect(() => {
    client.browseTables(name);
  }, []);
  useEffect(() => {
    if (state.lobbyNotice) {
      setNotice(state.lobbyNotice);
      client.clearLobbyNotice();
    }
  }, [state.lobbyNotice]);
  useEffect(() => {
    if (
      state.createdTables !== initialCreated.current &&
      state.createdTables.length
    ) {
      setSetup(false);
      setFilter("mine");
      setQuery("");
      setNotice(`已创建 ${state.createdTables.length} 桌，点空位即可入座`);
      initialCreated.current = state.createdTables;
    }
  }, [state.createdTables]);
  useEffect(() => {
    if (closing && !state.tables.some((t) => t.code === closing.code))
      setClosing(null);
  }, [state.tables, closing]);
  const tables = state.tables.filter(
    (t) =>
      (filter !== "waiting" || t.phase === "waiting") &&
      (filter !== "mine" || t.managed) &&
      (!query || t.code.includes(query) || t.name.includes(query)),
  );
  const busy =
    !state.connected ||
    state.connecting ||
    state.tablesLoading ||
    !!state.submitting;
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`已复制房号 ${code}`);
    } catch {
      setNotice(`房间号 ${code}，可告知朋友输入加入`);
    }
  }
  return (
    <section className="table-lobby" aria-label="牌桌大厅">
      <div className="table-lobby-header">
        <div>
          <span className="eyebrow">相聚一桌 · 满员即开</span>
          <h1>
            牌桌大厅{" "}
            <small>
              {state.tables.filter((t) => t.phase === "waiting").length}{" "}
              桌等牌友
            </small>
          </h1>
        </div>
        <div>
          <button className="secondary" onClick={joinByCode}>
            房号加入
          </button>
          {canOpen && (
            <button
              className="primary"
              onClick={() => {
                client.clearError();
                setSetup(true);
              }}
              disabled={busy}
            >
              <Plus size={18} />
              开桌设置
            </button>
          )}
        </div>
      </div>
      <div className="table-lobby-tools">
        <div role="group" aria-label="筛选牌桌">
          {[
            { id: "all", text: "全部牌桌" },
            { id: "waiting", text: "等待开局" },
            { id: "mine", text: "我开的桌" },
          ]
            .filter(
              (f) =>
                canOpen ||
                state.tables.some((t) => t.managed) ||
                f.id !== "mine",
            )
            .map((f) => (
              <button
                key={f.id}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id as typeof filter)}
              >
                {f.text}
              </button>
            ))}
        </div>
        <label>
          <span className="sr-only">查找牌桌</span>
          <input
            value={query}
            maxLength={16}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="房号 / 玩法名称"
          />
        </label>
        <button
          className="icon-button"
          aria-label="刷新牌桌"
          disabled={busy}
          onClick={() => client.browseTables(name)}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {state.account && !state.account.canPlay && <p className="admission-notice" role="status">{state.account.playBlocked ? "参赛权限已暂停，请联系管理员" : "请联系管理员分配战队后入桌"}</p>}
      {notice && (
        <p className="table-lobby-notice" role="status">
          <Check size={14} />
          {notice}
          <button aria-label="关闭大厅提示" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </p>
      )}
      <div className="table-list" aria-busy={state.tablesLoading}>
        {tables.map((t) => (
          <article
            className={`table-card ${t.phase !== "waiting" ? "table-in-play" : ""}`}
            key={t.code}
            aria-label={`${t.name} 第${t.number}桌 ${t.code}`}
          >
            <div className="table-card-info">
              <h2>{t.name}</h2>
              <span>
                第 {t.number} 桌 · {t.rules.rounds} 局
              </span>
              <button
                className="table-room-code"
                onClick={() => copy(t.code)}
                aria-label={`复制房号 ${t.code}`}
              >
                {t.code}
                <Copy size={12} />
              </button>
              <small>
                {t.settings.readyMode === "auto"
                  ? "满四人自动开局"
                  : "全员准备后开局"}
              </small>
            </div>
            <div className="table-card-seats">
              {t.seats.map((p, i) =>
                p ? (
                  <div className={`lobby-seat occupied avatar-${i}`} key={i}>
                    <span className={`avatar avatar-${i}`}>
                      <span className="portrait-art" aria-hidden="true" />
                    </span>
                    <strong>{p.isMe ? "我" : p.name}</strong>
                    <small>
                      {!p.online
                        ? "暂时离线"
                        : t.phase === "waiting"
                          ? p.ready
                            ? "已准备"
                            : "待准备"
                          : winds[i]}
                    </small>
                  </div>
                ) : (
                  <button
                    key={i}
                    className="lobby-seat empty-seat"
                    disabled={busy || t.phase !== "waiting" || !state.account?.canPlay}
                    aria-label={`${t.code} ${winds[i]}位入座`}
                    onClick={() => client.joinTable(name, t.code, i as Seat)}
                  >
                    <span>
                      <Plus size={22} />
                    </span>
                    <strong>空位</strong>
                    <small>{winds[i]}位 · 点击入座</small>
                  </button>
                ),
              )}
            </div>
            <div className="table-card-actions">
              {t.phase === "waiting" ? (
                <>
                  <span className="table-occupancy">
                    <Users size={14} />
                    {t.seats.filter(Boolean).length} / 4
                  </span>
                  <button className="table-invite" onClick={() => copy(t.code)}>
                    邀请
                    <ChevronRight size={14} />
                  </button>
                </>
              ) : (
                <span className="table-playing-label">
                  {t.phase === "finished" ? "本桌结束" : "对局中"}
                  <small>
                    第 {t.round} / {t.rules.rounds} 局
                  </small>
                </span>
              )}
              {(admin || (canOpen && t.managed)) &&
                ["waiting", "finished"].includes(t.phase) && (
                  <button
                    className="table-close"
                    disabled={busy}
                    onClick={() => setClosing(t)}
                  >
                    收桌
                  </button>
                )}
            </div>
          </article>
        ))}
        {!tables.length && (
          <div className="table-lobby-empty">
            <LayoutGrid size={38} />
            <h2>
              {state.tablesLoading
                ? "正在载入牌桌…"
                : query
                  ? "没有找到这张桌"
                  : filter === "mine"
                    ? "你还没有开桌"
                    : "还没有等待中的牌桌"}
            </h2>
            <p>
              {state.tablesLoading
                ? "连接后即可看到实时空位"
                : canOpen
                  ? "开好桌子，邀请朋友来坐坐。"
                  : "等待管理员开桌，也可以输入房间号加入。"}
            </p>
            {!state.tablesLoading && canOpen && (
              <button className="primary" onClick={() => setSetup(true)}>
                去开一桌
                <Plus size={16} />
              </button>
            )}
          </div>
        )}
      </div>
      {setup && canOpen && (
        <TableSetup
          name={name}
          busy={busy}
          error={state.error}
          close={() => setSetup(false)}
          submit={(settings, rules, count) =>
            client.createTables(name, settings, rules, count)
          }
        />
      )}
      {closing && (
        <Dialog
          title="收起这张桌子？"
          close={() => setClosing(null)}
          footer={
            <div className="dialog-actions">
              <button className="secondary" onClick={() => setClosing(null)}>
                保留桌子
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  client.send({ type: "closeTable", code: closing.code })
                }
              >
                {busy ? "正在收桌…" : "确认收桌"}
              </button>
            </div>
          }
        >
          <p>
            {closing.name} · 房号 {closing.code}
          </p>
          <p className="muted">
            {closing.seats.some(Boolean)
              ? "桌上的牌友会返回大厅。"
              : "这张桌子还没有人入座。"}
            收桌后不会继续自动续桌。
          </p>
          {state.error && <p role="alert">{state.error}</p>}
        </Dialog>
      )}
    </section>
  );
}

export function TableSettingsSummary({
  table,
  rules,
}: {
  table: TableConfig;
  rules: Rules;
}) {
  const s = table.settings;
  return (
    <div className="setup-review">
      <div className="setup-review-title">
        <LayoutGrid size={26} />
        <div>
          <h3>{s.name}</h3>
          <p>固定四人 · {rules.rounds} 局</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>开局条件</dt>
          <dd>
            {s.readyMode === "auto" ? "满四人自动准备" : "全员手动准备"} ·{" "}
            {s.offlineStart ? "允许离线开局" : "须全部在线"}
          </dd>
        </div>
        <div>
          <dt>等待与托管</dt>
          <dd>
            {rules.turnSeconds ? `${rules.turnSeconds} 秒 / 步` : "不限时"} ·{" "}
            {rules.turnSeconds > 0 && (
              <>
                {" "}
                {s.overtimePerTurn ? "超时倒计时" : "累计超时"}{" "}
                {s.overtimeSeconds ?? 0} 秒 ·{" "}
              </>
            )}
            {trusteeNames[s.trusteeMode]}
            {s.trusteeMode === "afterRounds" ? `（${s.trusteeRounds} 局）` : ""}
          </dd>
        </div>
        <div>
          <dt>记分与续桌</dt>
          <dd>
            输赢 × {s.scoreMultiplier ?? 0.5} · 展示 {s.resultSeconds} 秒 ·{" "}
            {s.autoRenew ? "结束后续开空桌" : "不续桌"}
          </dd>
        </div>
        <div>
          <dt>开局前自动离座</dt>
          <dd>
            {s.kickOffline ? "离线 " : ""}
            {s.kickUnready && s.readyMode === "manual" ? "未准备 " : ""}
            {s.kickOffline || (s.kickUnready && s.readyMode === "manual")
              ? `超过 ${s.kickAfterSeconds} 秒`
              : "关闭"}
          </dd>
        </div>
        <div>
          <dt>协商解散</dt>
          <dd>{s.allowDissolve ? "四人同意后解散" : "关闭"}</dd>
        </div>
        <div>
          <dt>加入方式</dt>
          <dd>{s.visibility === "public" ? "大厅公开" : "仅凭房号"}</dd>
        </div>
      </dl>
    </div>
  );
}

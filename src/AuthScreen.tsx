import { useId, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { client, type ClientState } from "./game-client";

export function AuthScreen({
  state,
  practice,
}: {
  state: ClientState;
  practice: () => void;
}) {
  const forced = !!state.account?.mustChangePassword;
  const formId = useId();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register" && !forced;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (
      (registering || forced) &&
      confirm !== (forced ? nextPassword : password)
    ) {
      setError("两次输入的密码不一致");
      return;
    }
    if (forced) await client.changePassword(password, nextPassword);
    else await client.authenticate(mode, username, password, name);
  }
  return (
    <div className="app classic polished account-shell">
      <div className="orientation-guide" role="status">
        <RotateCw size={42} />
        <h2>横屏，开始这一局</h2>
        <p>请将手机横过来，完整牌桌就在眼前。</p>
      </div>
      <main className="account-screen">
        <section className="account-welcome">
          <div className="account-brand">
            <img src="/brand-icon.png" alt="金陵麻将" />
            <span>
              金陵麻将<small>JINLING MAHJONG</small>
            </span>
          </div>
          <div className="account-invitation">
            <span>金陵有好牌</span>
            <h1>
              相聚一桌
              <br />
              就是好时光
            </h1>
            <p>
              一城烟火，四方牌友。
              <br />
              登录账号，赴一场熟悉的牌局。
            </p>
          </div>

        </section>
        <section
          className="account-card"
          aria-label={forced ? "设置新密码" : "账号登录注册"}
        >
          {!state.authChecked ? (
            <div className="account-loading" role="status">
              <RotateCw size={25} />
              <h2>正在恢复账号…</h2>
            </div>
          ) : (
            <>
              <div className="account-card-heading">
                <span>
                  <ShieldCheck size={17} />{" "}
                  {forced ? "首次使用管理员账号" : "欢迎来到金陵"}
                </span>
                <h2>
                  {forced
                    ? "设置你的新密码"
                    : registering
                      ? "认识一下，新牌友"
                      : "牌友，好久不见"}
                </h2>
              </div>
              {!forced && (
                <div
                  className="account-tabs"
                  role="tablist"
                  aria-label="登录方式"
                >
                  {(["login", "register"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={mode === tab}
                      onClick={() => {
                        setMode(tab);
                        setError("");
                        client.clearAuthError();
                        setConfirm("");
                      }}
                    >
                      {tab === "login" ? "账号登录" : "注册账号"}
                    </button>
                  ))}
                </div>
              )}
              <form
                id={formId}
                onSubmit={submit}
                className={`account-form ${registering || forced ? "account-form-pairs" : ""}`}
              >
                {!forced && (
                  <label>
                    账号
                    <input
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      minLength={3}
                      maxLength={48}
                      placeholder="请输入账号"
                    />
                  </label>
                )}
                {registering && (
                  <label>
                    牌桌昵称
                    <input
                      autoComplete="nickname"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={12}
                      placeholder="朋友怎么称呼你"
                    />
                  </label>
                )}
                <label>
                  {forced ? "初始密码" : "密码"}
                  <span className="password-field">
                    <input
                      autoComplete={
                        registering ? "new-password" : "current-password"
                      }
                      type={visible ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={10}
                      maxLength={128}
                      required
                      placeholder={
                        forced
                          ? "输入管理员初始密码"
                          : registering
                            ? "至少 10 位字符"
                            : "请输入密码"
                      }
                    />
                    <button
                      type="button"
                      aria-label={visible ? "隐藏密码" : "显示密码"}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {forced && (
                  <label>
                    新密码
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={nextPassword}
                      onChange={(e) => setNextPassword(e.target.value)}
                      required
                      minLength={10}
                      maxLength={128}
                      placeholder="至少 10 位字符"
                    />
                  </label>
                )}
                {(registering || forced) && (
                  <label>
                    确认密码
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      minLength={10}
                      maxLength={128}
                      required
                      placeholder="再次输入新密码"
                    />
                  </label>
                )}
                {(error || state.authError) && (
                  <p className="account-error" role="alert">
                    {error || state.authError}
                  </p>
                )}
              </form>
              <button
                className="primary account-submit"
                disabled={state.authBusy}
                type="submit"
                form={formId}
              >
                {state.authBusy
                  ? "正在处理…"
                  : forced
                    ? "保存密码，进入大厅"
                    : registering
                      ? "注册并进入大厅"
                      : "登录，开始相聚"}
                <ArrowRight size={19} />
              </button>
              <div className="account-footnote">
                <span>
                  <LockKeyhole size={13} />{" "}
                  {forced
                    ? "初始密码仅用于首次登录"
                    : "账号跨设备使用，战绩随账号保存"}
                </span>
                {!forced ? (
                  <button
                    type="button"
                    onClick={practice}
                    disabled={state.authBusy}
                  >
                    先去单人练习 →
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={state.authBusy}
                    onClick={() => client.logout()}
                  >
                    退出账号
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

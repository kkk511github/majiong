import { useState, type ReactNode } from "react";
import { LEGAL_STORAGE_KEY, LEGAL_VERSION, legalDocuments } from "./legal-copy";
import "./legal.css";

export function LegalContent() {
  const [tab, setTab] = useState<keyof typeof legalDocuments>("agreement");
  const document = legalDocuments[tab];
  return <>
    <nav className="legal-tabs" aria-label="协议文档">
      {Object.entries(legalDocuments).map(([key, doc]) => <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key as typeof tab)}>{doc.title}</button>)}
    </nav>
    <article className="legal-document" tabIndex={0} aria-label={document.title} key={tab}>
      <h2>{document.title}</h2><p className="legal-version">版本 {LEGAL_VERSION} · 更新日期：2026 年 9 月 26 日</p>
      {document.sections.map(([heading, body]) => <section key={heading}><h3>{heading}</h3><p>{body}</p></section>)}
    </article>
  </>;
}

export function LegalGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LEGAL_STORAGE_KEY) ?? "null")?.version === LEGAL_VERSION; } catch { return false; }
  });
  const [checked, setChecked] = useState(false);
  const [declined, setDeclined] = useState(false);
  if (accepted) return children;
  if (declined) return <main className="legal-gate game-ui"><section className="legal-declined"><h1>已暂停进入游戏</h1><p>你可以关闭应用，也可以重新阅读协议。尚未恢复账号或连接牌局。</p><button onClick={() => setDeclined(false)}>重新阅读</button></section></main>;
  return <main className="legal-gate game-ui"><section className="legal-card" aria-label="首次使用协议">
    <header><span>金陵麻将</span><h1>开始前，请先了解</h1><p>仅供娱乐 · 禁止赌博 · 已结束牌局向会员开放回放</p></header>
    <LegalContent />
    <footer>
      <label className="legal-consent"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />我已阅读并同意《软件用户协议》和《隐私说明》</label>
      <div className="legal-actions"><button onClick={() => setDeclined(true)}>不同意，暂不使用</button><button className="legal-accept" disabled={!checked} onClick={() => {
        try { localStorage.setItem(LEGAL_STORAGE_KEY, JSON.stringify({ version: LEGAL_VERSION, acceptedAt: new Date().toISOString() })); } catch { /* Ask again on next launch if persistence is unavailable. */ }
        setAccepted(true);
      }}>同意并进入</button></div>
    </footer>
  </section></main>;
}

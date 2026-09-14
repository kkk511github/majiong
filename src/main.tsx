import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LegalGate } from "./Legal";
import "./styles.css";
import "./classic.css";
import "./polish.css";
import "./dialogs.css";
import "./landscape.css";
import "./table-finish.css";
import "./tables.css";
import "./accounts.css";
import "./online-home.css";
import "./keyboard.css";
import "./table-room.css";
import "./table-layout.css";
import { androidTable } from "./table-platform";

document.documentElement.dataset.tablePlatform = androidTable
  ? "android"
  : "standard";
import { installKeyboardViewport } from "./keyboard-viewport";

const disposeKeyboardViewport = installKeyboardViewport();
if (import.meta.hot) import.meta.hot.dispose(disposeKeyboardViewport);

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="recovery">
        <h1>牌桌暂时出了点小状况</h1>
        <p>重新打开即可尝试恢复已保存的牌局。</p>
        <button className="primary" onClick={() => location.reload()}>
          重新打开
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LegalGate>
        <App />
      </LegalGate>
    </ErrorBoundary>
  </React.StrictMode>,
);

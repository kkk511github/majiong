import { Component, Suspense, type ReactNode } from "react";
import { Dialog } from "./Dialog";
import "./deferred-feature.css";

type Props = { children: ReactNode; label: string; close: () => void; modal?: boolean };
function Notice({ label, close, modal, failed = false }: Omit<Props, "children"> & { failed?: boolean }) {
  const content = <section className="feature-loading" role={failed ? "alert" : "status"}>
    <strong>{failed ? `${label}未能打开` : `正在加载${label}…`}</strong>
    {failed && <p>页面加载失败，请重新加载后重试。</p>}
    <div>
      <button onClick={close}>返回</button>
      {failed && <button onClick={() => location.reload()}>刷新页面</button>}
    </div>
  </section>;
  return modal ? <Dialog title={label} close={close}>{content}</Dialog> : content;
}
class FeatureBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Notice {...this.props} failed /> : this.props.children;
  }
}
export function DeferredFeature(props: Props) {
  return <FeatureBoundary {...props}>
    <Suspense fallback={<Notice {...props} />}>{props.children}</Suspense>
  </FeatureBoundary>;
}

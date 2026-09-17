import { version } from "../package.json";
import { useEffect, useState } from "react";
import { networkLabel, type NetworkHealth } from "./network-health";
import "./network-diagnostics.css";

export function NetworkDiagnostics({
  health,
  online,
  retry,
}: {
  health: NetworkHealth;
  online: boolean;
  retry: () => void;
}) {
  const [copied, setCopied] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const label = online ? networkLabel(health, now) : "当前未进入联机牌桌";
  return (
    <details className="network-diagnostics">
      <summary>
        网络连接 <span>{label}</span>
      </summary>
      <dl>
        <dt>客户端版本</dt>
        <dd>{version}</dd>
        <dt>服务端版本</dt>
        <dd>{health.serverVersion ?? "服务端未提供"}</dd>
        <dt>往返延迟</dt>
        <dd>{health.rttMs === null ? "尚未测量" : `${health.rttMs} 毫秒`}</dd>
        <dt>平滑延迟</dt>
        <dd>
          {health.smoothedRttMs === null
            ? "尚未测量"
            : `${health.smoothedRttMs} 毫秒`}
        </dd>
        <dt>最近通信</dt>
        <dd>
          {health.lastResponseAt === null
            ? "尚未收到"
            : `${Math.max(0, Math.floor((now - health.lastResponseAt) / 1000))} 秒前`}
        </dd>
        <dt>恢复前连续超时</dt>
        <dd>{health.consecutiveTimeouts} 次</dd>
        <dt>重新连接</dt>
        <dd>{health.reconnects} 次</dd>
        <dt>最近恢复耗时</dt>
        <dd>
          {health.lastRecoveryMs === null
            ? "—"
            : `${(health.lastRecoveryMs / 1000).toFixed(1)} 秒`}
        </dd>
        <dt>等待响应超时</dt>
        <dd>{health.timeouts} 次</dd>
        <dt>操作确认超时</dt>
        <dd>{health.commandTimeouts} 次</dd>
      </dl>
      <p>
        延迟来自实际连接测量，不代表手机信号强度。同步完成前会保留牌桌并暂停操作。超时恢复后需连续三次心跳成功才解除观察；平滑延迟用于减少单次波动。
      </p>
      <div className="network-diagnostic-actions">
        <button
          type="button"
          disabled={
            !online ||
            ["connecting", "authenticating", "syncing"].includes(health.phase)
          }
          onClick={retry}
        >
          重新连接
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                JSON.stringify(
                  {
                    appVersion: version,
                    at: new Date().toISOString(),
                    ...health,
                  },
                  null,
                  2,
                ),
              );
              setCopied("诊断已复制");
            } catch {
              setCopied("无法复制，可截图此面板");
            }
          }}
        >
          复制诊断
        </button>
      </div>
      <span role="status">{copied}</span>
    </details>
  );
}

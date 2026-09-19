import { copyText } from "./clipboard";
import { useState, useSyncExternalStore } from "react";
import { gameAudio } from "./audio";
import "./audio-recovery.css";

export function AudioRecovery({
  diagnostics = false,
}: {
  diagnostics?: boolean;
}) {
  const health = useSyncExternalStore(
    gameAudio.subscribeHealth,
    gameAudio.getHealth,
  );
  const [copied, setCopied] = useState("");
  const blocked = health.enabled && health.phase === "blocked";
  if (!diagnostics)
    return blocked ? (
      <aside className="audio-recovery-prompt" role="status">
        <span>声音未恢复</span>
        <button onClick={gameAudio.unlock}>点此恢复声音</button>
      </aside>
    ) : null;
  const labels = {
    idle: "等待首次操作",
    checking: "正在恢复",
    ready: "音频时钟正常",
    blocked: "需要点击恢复",
    hidden: "后台已暂停",
  };
  return (
    <details className="audio-diagnostics">
      <summary>
        声音恢复状态 · {health.enabled ? labels[health.phase] : "声音已关闭"}
      </summary>
      <p>
        最近恢复{" "}
        {health.lastRecoveryMs === null
          ? "尚未测量"
          : `${health.lastRecoveryMs} 毫秒`}{" "}
        · 重建 {health.rebuilds} 次 · 自动恢复失败 {health.failures} 次
      </p>
      <p>
        {health.lastIssue && `最近异常：${health.lastIssue}。`}
        音频时钟正常不代表扬声器已实际发声，可通过试听确认。
      </p>
      <button onClick={gameAudio.unlock} disabled={!health.enabled}>
        恢复声音
      </button>
      <button
        onClick={async () => {
          try {
            await copyText(
              JSON.stringify(
                {
                  audio: health,
                  platform: navigator.userAgent,
                  at: new Date().toISOString(),
                },
                null,
                2,
              ),
            );
            setCopied("声音诊断已复制");
          } catch {
            setCopied("无法复制，可截图此面板");
          }
        }}
      >
        复制声音诊断
      </button>
      <span role="status">{copied}</span>
    </details>
  );
}

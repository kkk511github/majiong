import { copyText } from "./clipboard";
import { useRef, useState } from "react";
import type { MatchDetails } from "../shared/types";
import { Dialog } from "./Dialog";
import { matchSummary, ruleFeedback } from "./record-export";
import "./record-export.css";
export function RecordExport({ data }: { data: MatchDetails }) {
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("summary");
  const [round, setRound] = useState(""),
    [problem, setProblem] = useState(""),
    [status, setStatus] = useState("");
  const preview = useRef<HTMLTextAreaElement>(null);
  const content =
    mode === "summary"
      ? matchSummary(data)
      : ruleFeedback(
          data,
          data.rounds.find((r) => r.record.id === round),
          problem,
        );
  return (
    <>
      <button
        className="record-export-open secondary"
        onClick={() => {
          setOpen(true);
          setStatus("");
        }}
      >
        摘要 / 反馈
      </button>
      {open && (
        <Dialog
          title="战绩摘要与反馈"
          variant="record-export-dialog"
          close={() => setOpen(false)}
        >
          <div className="record-export-form">
            <label>
              内容类型
              <select
                aria-label="导出内容类型"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setStatus("");
                }}
              >
                <option value="summary">整桌战绩摘要</option>
                <option value="feedback">规则问题反馈</option>
              </select>
            </label>
            {mode === "feedback" && (
              <>
                <label>
                  相关牌局
                  <select
                    aria-label="反馈相关牌局"
                    value={round}
                    onChange={(e) => {
                      setRound(e.target.value);
                      setStatus("");
                    }}
                  >
                    <option value="">整桌结果</option>
                    {data.rounds.map((r) => (
                      <option key={r.record.id} value={r.record.id}>
                        第 {r.record.round} 把
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  问题描述
                  <textarea
                    aria-label="规则问题描述"
                    maxLength={2000}
                    value={problem}
                    onChange={(e) => {
                      setProblem(e.target.value);
                      setStatus("");
                    }}
                    placeholder="例如：第几次碰杠后出现了什么结果，你预期应如何计算。"
                  />
                </label>
              </>
            )}
            <label>
              内容预览
              <textarea
                ref={preview}
                aria-label="导出内容预览"
                readOnly
                value={content}
              />
            </label>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await copyText(content);
                  setStatus("已复制，可自行粘贴发送");
                } catch {
                  preview.current?.focus();
                  preview.current?.select();
                  setStatus("自动复制未成功，已选中文本，可长按复制");
                }
              }}
            >
              复制内容
            </button>
            <p role="status">{status || "内容只在你点击复制时写入剪贴板。"}</p>
          </div>
        </Dialog>
      )}
    </>
  );
}

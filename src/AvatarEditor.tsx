import { useEffect, useRef, useState } from "react";
import { avatarURL, client } from "./game-client";
import "./avatar.css";

async function photoPreview(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024)
    throw Error("请选择 15 MB 以内的照片");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx || !img.naturalWidth || !img.naturalHeight) throw Error();
    const edge = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.fillStyle = "#e9e4d4";
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(
      img,
      (img.naturalWidth - edge) / 2,
      (img.naturalHeight - edge) / 2,
      edge,
      edge,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    throw Error("这张照片无法读取，请换一张 JPG、PNG 或 WebP 图片");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarEditor({ avatar }: { avatar?: string }) {
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  async function select(file?: File) {
    if (!file) return;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const photo = await photoPreview(file);
      if (request === sequence.current) setPreview(photo);
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  async function save(image: string | null) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await client.updateAvatar(image);
      setPreview(undefined);
      setStatus(image ? "头像已保存，牌桌同步更新。" : "已恢复默认头像。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="avatar-editor">
      <div className="avatar-editor-heading">
        <strong>我的头像</strong>
        <span>选择照片后预览，保存后同桌可见</span>
      </div>
      <div className="avatar-editor-controls">
        {(preview || avatar) && (
          <img
            className="avatar-preview"
            alt={preview ? "新头像预览" : "当前头像"}
            src={preview ?? avatarURL(avatar)}
          />
        )}
        <label className={`avatar-choose ${busy ? "busy" : ""}`}>
          {busy ? "处理中…" : "选择照片"}
          <input
            type="file"
            accept="image/*"
            aria-label="选择头像照片"
            disabled={busy}
            onChange={(e) => {
              void select(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {preview ? (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save(preview)}
            >
              保存头像
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setPreview(undefined);
                setError("");
              }}
            >
              取消
            </button>
          </>
        ) : (
          avatar && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void save(null)}
            >
              恢复默认
            </button>
          )
        )}
      </div>
      {(error || status) && (
        <p role={error ? "alert" : "status"}>{error || status}</p>
      )}
    </div>
  );
}

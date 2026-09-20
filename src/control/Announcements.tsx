import { useEffect, useRef, useState } from "react";
import { Eye, Plus, RefreshCw, Save, Send } from "lucide-react";
import { ControlApi, ControlApiError, errorMessage } from "./api";
import {
  announcementCanPublish,
  announcementIsDirty,
  announcementLiveContent,
  displayTime,
} from "./model";
import { AppPreview, type PreviewContent } from "./Preview";
import type { ControlAnnouncement } from "./types";
import { Empty, ErrorNotice, Loading, Modal, Notice, StatusBadge } from "./ui";

const statusLabel = {
  draft: "草稿",
  published: "已发布",
  withdrawn: "已撤回",
} as const;

export function Announcements({ api }: { api: ControlApi }) {
  const [items, setItems] = useState<ControlAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<ControlAnnouncement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<
    "save" | "prepare" | "publish" | "withdraw" | null
  >(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<PreviewContent | null>(null);
  const [publishTarget, setPublishTarget] =
    useState<ControlAnnouncement | null>(null);
  const [publishError, setPublishError] = useState("");
  const [withdraw, setWithdraw] = useState<ControlAnnouncement | null>(null);
  const [withdrawError, setWithdrawError] = useState("");
  const [nextSelection, setNextSelection] = useState<{
    item: ControlAnnouncement | null;
  } | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const editorRef = useRef<HTMLElement>(null);
  const dirty = announcementIsDirty(selected, title, body);
  const canPublish = announcementCanPublish(title, body);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    api
      .get<{ announcements: ControlAnnouncement[] }>(
        "/announcements",
        controller.signal,
      )
      .then((data) => setItems(data.announcements))
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, reload]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function accept(item: ControlAnnouncement) {
    setItems((previous) =>
      [item, ...previous.filter((value) => value.id !== item.id)].sort(
        (a, b) =>
          (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt),
      ),
    );
    setReload((value) => value + 1);
  }
  function select(item: ControlAnnouncement | null) {
    setSelected(item);
    setTitle(item?.draftTitle ?? "");
    setBody(item?.draftBody ?? "");
    setError("");
    setConflict(false);
    setSuccess("");
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function requestSelect(item: ControlAnnouncement | null) {
    if (busy) return;
    if (dirty) setNextSelection({ item });
    else select(item);
  }
  function requestId(key: string): string {
    const existing = requestIds.current.get(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    requestIds.current.set(key, id);
    return id;
  }
  function showFailure(cause: unknown) {
    setError(errorMessage(cause));
    setConflict(cause instanceof ControlApiError && cause.status === 409);
  }
  async function saveDraft(): Promise<ControlAnnouncement> {
    const result = await api.post<{ announcement: ControlAnnouncement }>(
      selected
        ? `/announcements/${encodeURIComponent(selected.id)}`
        : "/announcements",
      {
        title,
        body,
        ...(selected ? { expectedDraftVersion: selected.draftVersion } : {}),
        requestId: requestId(
          JSON.stringify([
            "save",
            selected?.id ?? "new",
            selected?.draftVersion ?? 0,
            title,
            body,
          ]),
        ),
      },
    );
    accept(result.announcement);
    setSelected(result.announcement);
    setTitle(result.announcement.draftTitle);
    setBody(result.announcement.draftBody);
    return result.announcement;
  }
  async function handleSave() {
    if (busy || conflict) return;
    setBusy("save");
    setError("");
    setConflict(false);
    setSuccess("");
    try {
      await saveDraft();
      setSuccess("草稿已保存，线上内容保持原样。确认发布后才会对成员生效。");
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(null);
    }
  }
  async function preparePublish() {
    if (busy || conflict || !canPublish) return;
    setBusy("prepare");
    setError("");
    setConflict(false);
    setSuccess("");
    setPublishError("");
    try {
      const draft = !selected || dirty ? await saveDraft() : selected;
      setPublishTarget(draft);
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(null);
    }
  }
  async function confirmPublish() {
    if (busy || !publishTarget) return;
    setBusy("publish");
    setPublishError("");
    try {
      const result = await api.post<{ announcement: ControlAnnouncement }>(
        `/announcements/${encodeURIComponent(publishTarget.id)}/publish`,
        {
          expectedRevision: publishTarget.revision,
          expectedDraftVersion: publishTarget.draftVersion,
          requestId: requestId(
            `publish:${publishTarget.id}:${publishTarget.revision}:${publishTarget.draftVersion}`,
          ),
        },
      );
      accept(result.announcement);
      setSelected(result.announcement);
      setTitle(result.announcement.draftTitle);
      setBody(result.announcement.draftBody);
      setPublishTarget(null);
      setSuccess("公告已发布，成员回到牌桌大厅后可查看。");
    } catch (cause) {
      setPublishError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }
  async function handleWithdraw() {
    if (!withdraw || busy) return;
    setBusy("withdraw");
    setWithdrawError("");
    try {
      const result = await api.post<{ announcement: ControlAnnouncement }>(
        `/announcements/${encodeURIComponent(withdraw.id)}/withdraw`,
        {
          expectedRevision: withdraw.revision,
          requestId: requestId(`withdraw:${withdraw.id}:${withdraw.revision}`),
        },
      );
      accept(result.announcement);
      if (selected?.id === withdraw.id) {
        setSelected(result.announcement);
        if (dirty) {
          setConflict(true);
          setError(
            "撤回已生效，未保存的输入仍在。继续编辑前，请先复制保留输入，再从列表重新载入最新草稿。",
          );
        } else {
          setTitle(result.announcement.draftTitle);
          setBody(result.announcement.draftBody);
        }
      }
      setWithdraw(null);
      setSuccess("公告已撤回，成员端不再展示，后台记录和草稿已保留。");
    } catch (cause) {
      setWithdrawError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const editorPreview: PreviewContent = {
    kind: "announcement",
    title,
    body,
    publishedAt: null,
  };
  return (
    <div className="control-page">
      <div className="control-page-toolbar">
        <p>发布后，成员回到牌桌大厅即可查看。</p>
        <button
          className="control-button control-primary"
          type="button"
          disabled={!!busy}
          onClick={() => requestSelect(null)}
        >
          <Plus size={18} />
          新建公告
        </button>
      </div>
      {success && <Notice success>{success}</Notice>}
      <div className="control-editor-grid">
        <section
          className="control-panel control-announcement-editor"
          ref={editorRef}
        >
          <div className="control-section-title">
            <h2>{selected ? "编辑公告" : "新建公告"}</h2>
            <StatusBadge
              tone={selected?.status === "published" ? "good" : "gold"}
            >
              {selected ? statusLabel[selected.status] : "未保存"}
            </StatusBadge>
          </div>
          {selected?.status === "published" && (
            <p className="control-muted">
              编辑和保存草稿会保留线上原版，确认发布新版后才会替换。
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <label className="control-field">
              <span>
                公告标题 <small>{title.length}/80</small>
              </span>
              <input
                value={title}
                maxLength={80}
                disabled={!!busy}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setSuccess("");
                }}
                placeholder="用一句话说明公告内容"
              />
            </label>
            <label className="control-field">
              <span>
                公告正文 <small>{body.length}/8000</small>
              </span>
              <textarea
                value={body}
                maxLength={8000}
                rows={9}
                disabled={!!busy}
                onChange={(event) => {
                  setBody(event.target.value);
                  setSuccess("");
                }}
                placeholder="写清具体事情和时间，支持分段"
              />
            </label>
            <Notice>
              保存草稿不会推送。发布时会先保存当前内容，请你确认后再上线。
            </Notice>
            <ErrorNotice>{error}</ErrorNotice>
            {conflict && (
              <p className="control-muted">
                你的输入仍在。可先复制保存，再
                <button
                  className="control-link"
                  type="button"
                  onClick={() => setReload((value) => value + 1)}
                >
                  刷新列表
                </button>
                ，选择相应公告重新编辑。
              </p>
            )}
            <div className="control-actions control-editor-actions">
              <button
                className="control-button"
                type="submit"
                disabled={!!busy || conflict || (!!selected && !dirty)}
              >
                <Save size={17} />
                {busy === "save" ? "保存中…" : "保存草稿"}
              </button>
              <button
                className="control-button control-quiet"
                type="button"
                onClick={() => setPreview(editorPreview)}
              >
                <Eye size={17} />
                预览
              </button>
              <button
                className="control-button control-primary"
                type="button"
                disabled={!!busy || conflict || !canPublish}
                onClick={() => void preparePublish()}
              >
                <Send size={17} />
                {busy === "prepare" || busy === "publish"
                  ? "处理中…"
                  : selected?.status === "published"
                    ? "发布新版"
                    : "发布公告"}
              </button>
            </div>
            {!canPublish && (
              <p className="control-field-hint">填写标题和正文后可发布。</p>
            )}
          </form>
        </section>
        <div className="control-panel control-preview-panel">
          <AppPreview content={editorPreview} />
        </div>
      </div>
      <section className="control-panel">
        <div className="control-section-title">
          <h2>全部公告</h2>
          <button
            className="control-icon-button"
            type="button"
            onClick={() => setReload((value) => value + 1)}
            aria-label="刷新公告列表"
            disabled={loading}
          >
            <RefreshCw size={18} />
          </button>
        </div>
        <ErrorNotice retry={() => setReload((value) => value + 1)}>
          {loadError}
        </ErrorNotice>
        {loading && items.length === 0 ? (
          <Loading />
        ) : items.length === 0 && !loadError ? (
          <Empty>还没有公告。填写上方内容，可保存草稿或发布。</Empty>
        ) : (
          <div className="control-table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>状态</th>
                  <th>发布时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={
                      selected?.id === item.id ? "control-row-selected" : ""
                    }
                  >
                    <td>
                      <strong>
                        {item.status === "published"
                          ? item.publishedTitle || "未填写标题"
                          : item.draftTitle || "未填写标题"}
                      </strong>
                      {item.status === "published" &&
                        (item.draftTitle !== item.publishedTitle ||
                          item.draftBody !== item.publishedBody) && (
                          <small className="control-table-sub">
                            有未发布的草稿修改
                          </small>
                        )}
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          item.status === "published"
                            ? "good"
                            : item.status === "draft"
                              ? "gold"
                              : "muted"
                        }
                      >
                        {statusLabel[item.status]}
                      </StatusBadge>
                    </td>
                    <td className="control-table-date">
                      {displayTime(item.publishedAt)}
                    </td>
                    <td>
                      <div className="control-row-actions">
                        <button
                          className="control-link"
                          type="button"
                          disabled={!!busy}
                          onClick={() => requestSelect(item)}
                        >
                          编辑
                        </button>
                        <button
                          className="control-link"
                          type="button"
                          onClick={() =>
                            setPreview({
                              kind: "announcement",
                              ...announcementLiveContent(item),
                            })
                          }
                        >
                          预览
                        </button>
                        {item.status === "published" && (
                          <button
                            className="control-link control-danger-text"
                            type="button"
                            disabled={!!busy}
                            onClick={() => {
                              setWithdrawError("");
                              setWithdraw(item);
                            }}
                          >
                            撤回
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {preview && (
        <Modal title="公告预览" wide onClose={() => setPreview(null)}>
          <AppPreview content={preview} />
        </Modal>
      )}
      {publishTarget && (
        <Modal
          title="确认发布公告"
          onClose={() => setPublishTarget(null)}
          busy={busy === "publish"}
        >
          <div className="control-confirm-copy">
            <p>
              确认发布「{publishTarget.draftTitle}」？
              {publishTarget.status === "published"
                ? "当前线上内容将被替换，成员会收到新版提示。"
                : "发布后，成员回到牌桌大厅即可查看。"}
            </p>
            <div className="control-announcement-confirm-body">
              {publishTarget.draftBody}
            </div>
          </div>
          <ErrorNotice>{publishError}</ErrorNotice>
          <div className="control-actions">
            <button
              className="control-button"
              type="button"
              onClick={() => setPublishTarget(null)}
              disabled={!!busy}
            >
              取消
            </button>
            <button
              className="control-button control-primary"
              type="button"
              onClick={() => void confirmPublish()}
              disabled={!!busy}
            >
              {busy === "publish" ? "发布中…" : "确认发布"}
            </button>
          </div>
        </Modal>
      )}
      {withdraw && (
        <Modal
          title="撤回公告"
          onClose={() => setWithdraw(null)}
          busy={busy === "withdraw"}
        >
          <div className="control-confirm-copy">
            <p>
              确认撤回「{withdraw.publishedTitle || withdraw.draftTitle}」？
            </p>
            <p>撤回后，成员端不再弹出或展示这条公告，后台记录和草稿会保留。</p>
          </div>
          <ErrorNotice>{withdrawError}</ErrorNotice>
          <div className="control-actions">
            <button
              className="control-button"
              onClick={() => setWithdraw(null)}
              disabled={!!busy}
            >
              取消
            </button>
            <button
              className="control-button control-danger"
              onClick={() => void handleWithdraw()}
              disabled={!!busy}
            >
              {busy === "withdraw" ? "撤回中…" : "确认撤回"}
            </button>
          </div>
        </Modal>
      )}
      {nextSelection && (
        <Modal title="离开当前编辑" onClose={() => setNextSelection(null)}>
          <p className="control-confirm-copy">
            当前还有未保存的修改。继续后将放弃这些输入。
          </p>
          <div className="control-actions">
            <button
              className="control-button"
              onClick={() => setNextSelection(null)}
            >
              继续编辑
            </button>
            <button
              className="control-button control-primary"
              onClick={() => {
                select(nextSelection.item);
                setNextSelection(null);
              }}
            >
              放弃修改并继续
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

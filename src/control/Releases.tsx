import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Check,
  CloudUpload,
  Eye,
  FileArchive,
  PackageCheck,
  RefreshCw,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { ControlApi, ControlApiError, errorMessage } from "./api";
import { displaySize, displayTime } from "./model";
import { AppPreview, type PreviewContent } from "./Preview";
import type {
  ControlRelease,
  ReleaseEvent,
  ReleaseList,
  ReleasePlatform,
} from "./types";
import { Empty, ErrorNotice, Loading, Modal, Notice, StatusBadge } from "./ui";

const platformName = (platform: ReleasePlatform) =>
  platform === "android" ? "Android" : "iOS";
const eventName: Record<ReleaseEvent["stage"], string> = {
  staged: "已上传",
  validated: "校验通过",
  published: "已发布",
  discarded: "已放弃",
  publish_rejected: "发布未通过",
  superseded: "已替换",
};
type ReleaseUpload =
  | { draft: ControlRelease; alreadyStaged?: boolean }
  | { release: ControlRelease; alreadyPublished: true };

export function Releases({ api }: { api: ControlApi }) {
  const [data, setData] = useState<ReleaseList>({
    current: [],
    drafts: [],
    history: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const [historyPlatform, setHistoryPlatform] =
    useState<ReleasePlatform>("android");
  const [preview, setPreview] = useState<PreviewContent | null>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: "publish" | "discard";
    draft: ControlRelease;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api
      .get<ReleaseList>("/releases", controller.signal)
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, reload]);

  function uploaded(result: ReleaseUpload) {
    if ("draft" in result) {
      const draft = result.draft;
      setData((previous) => ({
        ...previous,
        drafts: [
          draft,
          ...previous.drafts.filter((item) => item.id !== draft.id),
        ],
      }));
      setSuccess(
        result.alreadyStaged
          ? "该安装包已在待发布区，沿用该记录的更新说明。当前线上版本保持原样。"
          : "安装包已进入待发布区。确认发布后才会上线，当前线上版本保持原样。",
      );
    } else {
      const release = result.release;
      setData((previous) => ({
        ...previous,
        current: [
          release,
          ...previous.current.filter(
            (item) => item.platform !== release.platform,
          ),
        ],
      }));
      setSuccess(
        `该安装包已是 ${platformName(release.platform)} 当前线上版本，无需重复上传。`,
      );
    }
    setReload((value) => value + 1);
  }
  function finished(
    kind: "publish" | "discard",
    draft: ControlRelease,
    published?: ControlRelease,
  ) {
    setData((previous) => ({
      ...previous,
      drafts: previous.drafts.filter((item) => item.id !== draft.id),
      current: published
        ? [
            published,
            ...previous.current.filter(
              (item) => item.platform !== published.platform,
            ),
          ]
        : previous.current,
    }));
    setConfirmation(null);
    setReload((value) => value + 1);
    setSuccess(
      kind === "publish"
        ? `${platformName(draft.platform)} Build ${draft.build} 已发布，符合条件的成员将在下次检查时收到提示。`
        : "待发布安装包已放弃，当前线上版本保持原样。",
    );
  }

  const history = data.history.filter(
    (item) => item.platform === historyPlatform,
  );
  return (
    <div className="control-page">
      <div className="control-page-toolbar">
        <p>先校验安装包，再发布给成员。两平台分别发布。</p>
        <button
          className="control-button control-quiet"
          type="button"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw size={17} />
          刷新版本
        </button>
      </div>
      <ErrorNotice retry={() => setReload((value) => value + 1)}>
        {error}
      </ErrorNotice>
      {success && <Notice success>{success}</Notice>}
      <div className="control-release-grid">
        {(["android", "ios"] as const).map((platform) => (
          <PlatformCard
            key={platform}
            api={api}
            platform={platform}
            current={data.current.find((item) => item.platform === platform)}
            drafts={data.drafts.filter((item) => item.platform === platform)}
            loading={loading}
            unavailable={!!error}
            onUploaded={uploaded}
            onPreview={(release) =>
              setPreview({
                kind: "release",
                title: "发现新版本",
                body: release.notes,
                build: release.build,
                platform: release.platform,
              })
            }
            onPublish={(draft) => setConfirmation({ kind: "publish", draft })}
            onDiscard={(draft) => setConfirmation({ kind: "discard", draft })}
          />
        ))}
      </div>
      <Notice>
        上传、校验和预览均不会替换线上版本。待发布安装包核对无误后，点击「发布更新」并确认才会对成员生效。
      </Notice>
      <section className="control-panel">
        <div className="control-section-title">
          <h2>版本记录</h2>
          <div className="control-tabs" role="group" aria-label="版本记录平台">
            <button
              type="button"
              aria-pressed={historyPlatform === "android"}
              onClick={() => setHistoryPlatform("android")}
            >
              Android
            </button>
            <button
              type="button"
              aria-pressed={historyPlatform === "ios"}
              onClick={() => setHistoryPlatform("ios")}
            >
              iOS
            </button>
          </div>
        </div>
        {loading && history.length === 0 ? (
          <Loading />
        ) : history.length === 0 && !error ? (
          <Empty>暂无 {platformName(historyPlatform)} 版本记录。</Empty>
        ) : (
          <div className="control-table-scroll">
            <table className="control-table">
              <thead>
                <tr>
                  <th>版本 / Build</th>
                  <th>安装包</th>
                  <th>状态</th>
                  <th>操作时间</th>
                  <th>操作人 / 说明</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.version ? `v${item.version}` : "—"}</strong>
                      <small className="control-table-sub">
                        Build {item.build}
                      </small>
                    </td>
                    <td>
                      {displaySize(item.size)}
                      <small
                        className="control-table-sub control-monospace"
                        title={item.sha256}
                      >
                        SHA-256 {item.sha256.slice(0, 12)}…
                      </small>
                    </td>
                    <td>
                      <StatusBadge
                        tone={
                          item.stage === "published"
                            ? "good"
                            : item.stage === "publish_rejected"
                              ? "bad"
                              : item.stage === "staged"
                                ? "gold"
                                : "muted"
                        }
                      >
                        {eventName[item.stage]}
                      </StatusBadge>
                    </td>
                    <td className="control-table-date">
                      {displayTime(item.at)}
                    </td>
                    <td>
                      {item.actor || "—"}
                      {item.message && (
                        <small className="control-table-sub">
                          {item.message}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {preview && (
        <Modal title="更新弹窗预览" wide onClose={() => setPreview(null)}>
          <AppPreview content={preview} />
        </Modal>
      )}
      {confirmation && (
        <ReleaseConfirmation
          key={`${confirmation.kind}:${confirmation.draft.id}`}
          api={api}
          kind={confirmation.kind}
          draft={confirmation.draft}
          onClose={() => setConfirmation(null)}
          onFinished={(release) =>
            finished(confirmation.kind, confirmation.draft, release)
          }
        />
      )}
    </div>
  );
}

function PlatformCard({
  api,
  platform,
  current,
  drafts,
  loading,
  unavailable,
  onUploaded,
  onPreview,
  onPublish,
  onDiscard,
}: {
  api: ControlApi;
  platform: ReleasePlatform;
  current?: ControlRelease;
  drafts: ControlRelease[];
  loading: boolean;
  unavailable: boolean;
  onUploaded: (result: ReleaseUpload) => void;
  onPreview: (release: ControlRelease) => void;
  onPublish: (draft: ControlRelease) => void;
  onDiscard: (draft: ControlRelease) => void;
}) {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [formPreview, setFormPreview] = useState(false);
  const extension = platform === "android" ? ".apk" : ".ipa";

  useEffect(() => () => uploadController.current?.abort(), []);
  useEffect(() => {
    if (!uploading) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [uploading]);

  function chooseFile(next?: File) {
    if (uploading || !next) return;
    if (!next.name.toLowerCase().endsWith(extension)) {
      setFile(null);
      setError(
        `请选择 ${platformName(platform)} ${extension.toUpperCase().slice(1)} 安装包。`,
      );
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (next.size === 0) {
      setFile(null);
      setError("安装包为空，请重新选择。");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(next);
    setError("");
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || uploading || !notes.trim()) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      const result = await api.upload<ReleaseUpload>(
        `/releases/upload?platform=${platform}`,
        file,
        notes.trim(),
        setProgress,
        controller.signal,
      );
      onUploaded(result);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError")
        setError(
          "已取消上传。请刷新待发布列表确认结果，当前线上版本不会改变。",
        );
      else setError(errorMessage(cause));
    } finally {
      uploadController.current = null;
      setUploading(false);
    }
  }

  return (
    <section className="control-panel control-platform-card">
      <div className="control-platform-heading">
        <div className="control-platform-icon">
          <Smartphone size={34} />
          {platform === "android" ? <span>A</span> : <span>i</span>}
        </div>
        <div>
          <h2>
            {platformName(platform)}
            {current && <StatusBadge tone="good">当前线上</StatusBadge>}
          </h2>
          <p>
            {current
              ? `v${current.version} · Build ${current.build}`
              : loading
                ? "正在读取线上版本…"
                : unavailable
                  ? "线上版本暂不可读取"
                  : "尚无已发布版本"}
          </p>
        </div>
      </div>
      {current && (
        <div className="control-current-release">
          <span>{current.packageId}</span>
          <span>发布于 {displayTime(current.publishedAt)}</span>
          <button
            type="button"
            className="control-link"
            onClick={() => onPreview(current)}
          >
            <Eye size={14} />
            预览线上提示
          </button>
        </div>
      )}
      <form onSubmit={(event) => void upload(event)}>
        <label
          htmlFor={inputId}
          className={`control-upload-zone${dragging ? " control-upload-dragging" : ""}${uploading ? " control-upload-disabled" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploading) chooseFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            id={inputId}
            ref={fileRef}
            type="file"
            accept={extension}
            disabled={uploading}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              chooseFile(event.target.files?.[0])
            }
          />
          <CloudUpload size={43} />
          <strong>
            {file
              ? file.name
              : platform === "android"
                ? "上传 APK"
                : "上传已签名 IPA"}
          </strong>
          <span>
            {file
              ? `${displaySize(file.size)} · 点击重新选择`
              : "选择或拖入安装包"}
          </span>
        </label>
        <p className="control-upload-note">
          {platform === "ios"
            ? "请上传你已完成签名的 IPA，后台不代替签名。"
            : "版本号、Build 与应用标识将从安装包中读取。"}
        </p>
        <label className="control-field">
          <span>
            更新说明<small>{notes.length}/500</small>
          </span>
          <textarea
            aria-label={`${platformName(platform)} 更新说明`}
            value={notes}
            maxLength={500}
            required
            rows={3}
            disabled={uploading}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="写清本次更新的变化，成员将在更新弹窗中看到"
          />
        </label>
        {uploading && (
          <div className="control-upload-progress" role="status">
            <div>
              <span>
                {progress === 100 ? "上传完成，正在校验安装包…" : "正在上传…"}
              </span>
              <strong>{progress}%</strong>
            </div>
            <progress value={progress} max={100} />
            <button
              className="control-link control-danger-text"
              type="button"
              onClick={() => uploadController.current?.abort()}
            >
              <X size={15} />
              取消上传
            </button>
          </div>
        )}
        <ErrorNotice>{error}</ErrorNotice>
        <div className="control-actions">
          <button
            className="control-button"
            type="submit"
            disabled={!file || !notes.trim() || uploading}
          >
            <Upload size={17} />
            {uploading ? "处理中…" : "上传并校验"}
          </button>
          <button
            className="control-button control-quiet"
            type="button"
            onClick={() => setFormPreview(true)}
          >
            <Eye size={17} />
            预览说明
          </button>
        </div>
      </form>
      <section
        className="control-draft-list"
        aria-label={`${platformName(platform)} 待发布版本`}
      >
        <h3>
          待发布版本 <span>{drafts.length}</span>
        </h3>
        {drafts.length === 0 ? (
          <p className="control-muted">
            {loading
              ? "正在读取待发布版本…"
              : unavailable
                ? "请刷新后查看待发布版本。"
                : "暂无待发布安装包。"}
          </p>
        ) : (
          drafts.map((draft) => (
            <article className="control-release-draft" key={draft.id}>
              <div className="control-draft-title">
                <PackageCheck size={21} />
                <strong>
                  v{draft.version} · Build {draft.build}
                </strong>
                <StatusBadge
                  tone={draft.validation.canPublish ? "gold" : "bad"}
                >
                  {draft.validation.canPublish ? "待发布" : "校验未通过"}
                </StatusBadge>
              </div>
              <p className="control-release-notes">
                {draft.notes || "未填写更新说明"}
              </p>
              <ReleaseValidation release={draft} />
              <div className="control-draft-meta">
                上传于 {displayTime(draft.createdAt)}
                {draft.createdBy ? ` · ${draft.createdBy}` : ""}
              </div>
              <div className="control-actions">
                <button
                  className="control-button control-primary"
                  type="button"
                  disabled={!draft.validation.canPublish || uploading}
                  onClick={() => onPublish(draft)}
                >
                  发布更新
                </button>
                <button
                  className="control-button control-quiet"
                  type="button"
                  onClick={() => onPreview(draft)}
                >
                  <Eye size={16} />
                  预览
                </button>
                <button
                  className="control-link control-danger-text"
                  type="button"
                  disabled={uploading}
                  onClick={() => onDiscard(draft)}
                >
                  放弃
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      {current && (
        <section className="control-online-validation">
          <h3>当前线上版本信息</h3>
          <p className="control-release-notes">{current.notes}</p>
          <ReleaseValidation release={current} />
        </section>
      )}
      {formPreview && (
        <Modal
          title={`${platformName(platform)} 更新说明预览`}
          wide
          onClose={() => setFormPreview(false)}
        >
          <AppPreview
            content={{
              kind: "release",
              title: "发现新版本",
              body: notes,
              platform,
            }}
          />
          <p className="control-muted">
            Build 在上传后从安装包读取；发布时使用待发布记录中保存的更新说明。
          </p>
        </Modal>
      )}
    </section>
  );
}

function ReleaseValidation({ release }: { release: ControlRelease }) {
  return (
    <>
      {release.validation.errors.map((message, index) => (
        <ErrorNotice key={`error-${index}`}>{message}</ErrorNotice>
      ))}
      {release.validation.warnings.map((message, index) => (
        <Notice key={`warning-${index}`}>{message}</Notice>
      ))}
      <details className="control-validation">
        <summary>
          <FileArchive size={16} />
          查看包信息与校验结果
        </summary>
        <dl>
          <div>
            <dt>应用标识</dt>
            <dd>{release.packageId}</dd>
          </div>
          <div>
            <dt>内置 Build</dt>
            <dd>{release.build}</dd>
          </div>
          <div>
            <dt>安装包大小</dt>
            <dd>{displaySize(release.size)}</dd>
          </div>
          <div>
            <dt>
              {release.platform === "android"
                ? "最低 Android API"
                : "最低 iOS 版本"}
            </dt>
            <dd>{release.minimumOsVersion || "未提供"}</dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd className="control-monospace control-hash">{release.sha256}</dd>
          </div>
          {release.platform === "ios" && (
            <>
              <div>
                <dt>签名信息</dt>
                <dd>
                  {release.signingMetadataPresent
                    ? "检测到签名元数据"
                    : "未检测到签名元数据"}
                </dd>
              </div>
              <div>
                <dt>分发类型</dt>
                <dd>{release.distribution || "未识别"}</dd>
              </div>
              <div>
                <dt>描述文件有效期</dt>
                <dd>{release.provisioningExpiresAt || "未提供"}</dd>
              </div>
            </>
          )}
        </dl>
        {release.validation.canPublish && (
          <p className="control-validation-good">
            <Check size={16} />
            安装包校验已通过。
          </p>
        )}
        {release.installationNote && (
          <p className="control-muted">{release.installationNote}</p>
        )}
      </details>
      {release.platform === "ios" && (
        <p className="control-muted">签名与设备适用条件最终由 iOS 校验。</p>
      )}
    </>
  );
}

function ReleaseConfirmation({
  api,
  kind,
  draft,
  onClose,
  onFinished,
}: {
  api: ControlApi;
  kind: "publish" | "discard";
  draft: ControlRelease;
  onClose: () => void;
  onFinished: (release?: ControlRelease) => void;
}) {
  const [sameBuild, setSameBuild] = useState(false);
  const [sameBuildRequired, setSameBuildRequired] = useState(
    draft.validation.requiresSameBuildConfirmation ||
      draft.validation.sameBuild,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canPublish =
    draft.validation.canPublish && (!sameBuildRequired || sameBuild);
  async function confirm() {
    if (busy || (kind === "publish" && !canPublish)) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "discard") {
        await api.post(`/releases/${encodeURIComponent(draft.id)}/discard`);
        onFinished();
      } else {
        const result = await api.post<{ release: ControlRelease }>(
          `/releases/${encodeURIComponent(draft.id)}/publish`,
          {
            sha256: draft.sha256,
            build: draft.build,
            ...(sameBuild ? { confirmSameBuild: true } : {}),
          },
        );
        onFinished(result.release);
      }
    } catch (cause) {
      setError(errorMessage(cause));
      if (
        cause instanceof ControlApiError &&
        cause.details &&
        typeof cause.details === "object" &&
        "code" in cause.details &&
        cause.details.code === "SAME_BUILD_CONFIRMATION_REQUIRED"
      )
        setSameBuildRequired(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={kind === "publish" ? "确认发布更新" : "放弃待发布版本"}
      onClose={onClose}
      busy={busy}
    >
      <div className="control-release-confirm-summary">
        <span className="control-eyebrow">{platformName(draft.platform)}</span>
        <h3>
          v{draft.version} · Build {draft.build}
        </h3>
        <p>
          {draft.name} · {draft.packageId}
        </p>
        <span>{displaySize(draft.size)}</span>
      </div>
      {kind === "publish" ? (
        <>
          <p className="control-confirm-copy">
            确认后将替换 {platformName(draft.platform)}{" "}
            当前线上版本。请核对平台、应用标识、Build 与安装包信息。
          </p>
          <p className="control-hash control-confirm-hash">
            <strong>SHA-256</strong>
            {draft.sha256}
          </p>
          <p className="control-release-notes">{draft.notes}</p>
          {draft.installationNote && <Notice>{draft.installationNote}</Notice>}
          {sameBuildRequired && (
            <label className="control-checkbox control-checkbox-warning">
              <input
                type="checkbox"
                checked={sameBuild}
                disabled={busy}
                onChange={(event) => setSameBuild(event.target.checked)}
              />
              <span>
                此版本与线上 Build 相同。我确认替换该包，并了解相同 Build
                不会触发自动更新提示。
              </span>
            </label>
          )}
          {draft.platform === "ios" && (
            <p className="control-muted">
              已读取的签名元数据不保证所有设备可安装，最终仍由 iOS
              校验签名与设备适用条件。
            </p>
          )}
        </>
      ) : (
        <p className="control-confirm-copy">
          确认放弃此待发布安装包？这不会改变当前线上版本。需要再次发布时，须重新上传。
        </p>
      )}
      <ErrorNotice>{error}</ErrorNotice>
      <div className="control-actions">
        <button
          className="control-button"
          type="button"
          disabled={busy}
          onClick={onClose}
        >
          取消
        </button>
        <button
          className={`control-button ${kind === "publish" ? "control-primary" : "control-danger"}`}
          type="button"
          disabled={busy || (kind === "publish" && !canPublish)}
          onClick={() => void confirm()}
        >
          {busy ? "处理中…" : kind === "publish" ? "确认发布" : "确认放弃"}
        </button>
      </div>
    </Modal>
  );
}

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, LoaderCircle, X } from "lucide-react";

export function ErrorNotice({
  children,
  retry,
}: {
  children?: ReactNode;
  retry?: () => void;
}) {
  if (!children) return null;
  return (
    <div className="control-notice control-notice-error" role="alert">
      <AlertCircle size={18} />
      <span>{children}</span>
      {retry && (
        <button type="button" className="control-link" onClick={retry}>
          重试
        </button>
      )}
    </div>
  );
}

export function Notice({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={`control-notice${success ? " control-notice-success" : ""}`}
      role={success ? "status" : undefined}
    >
      {success ? <CheckCircle2 size={18} /> : <Info size={18} />}
      <span>{children}</span>
    </div>
  );
}

export function Loading({ children = "正在加载…" }: { children?: ReactNode }) {
  return (
    <div className="control-loading" role="status">
      <LoaderCircle size={20} className="control-spin" />
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="control-empty">{children}</div>;
}

export function Modal({
  title,
  children,
  onClose,
  busy = false,
  drawer = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  drawer?: boolean;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = ref.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) ?? [],
      ).filter((node) => node.getClientRects().length > 0);
    (focusable()[0] ?? panel)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (!first) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      if (!panel?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className={`control-overlay${drawer ? " control-drawer-overlay" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className={`control-modal${drawer ? " control-drawer" : ""}${wide ? " control-modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="control-modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            className="control-icon-button"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function StatusBadge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "good" | "gold" | "bad" | "muted";
}) {
  return (
    <span className={`control-badge control-badge-${tone}`}>{children}</span>
  );
}

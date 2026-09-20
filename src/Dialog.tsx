import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({
  title,
  children,
  close,
  variant = "",
  footer,
  headerAside,
  dismissOnBackdrop = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  variant?: string;
  footer?: ReactNode;
  headerAside?: ReactNode;
  dismissOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${variant}`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(e) => {
        if (!dismissOnBackdrop) return;
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          close();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        {headerAside}
        <button aria-label="关闭" className="icon-button" onClick={close}>
          <X size={22} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </dialog>
  );
}

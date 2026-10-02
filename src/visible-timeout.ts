/** Count foreground time only: mobile WebViews suspend timers while hidden. */
export function visibleTimeout(callback: () => void, milliseconds: number, doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> = document) {
  let remaining = milliseconds, started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  const update = () => {
    if (finished) return;
    if (timer !== undefined) {
      remaining -= Math.max(0, Date.now() - started);
      clearTimeout(timer); timer = undefined;
    }
    if (!doc.hidden) {
      started = Date.now();
      timer = setTimeout(() => {
        timer = undefined;
        // Recheck visibility even if the OS delayed visibilitychange delivery.
        if (doc.hidden) return;
        finished = true;
        doc.removeEventListener('visibilitychange', update);
        callback();
      }, Math.max(0, remaining));
    }
  };
  doc.addEventListener('visibilitychange', update);
  update();
  return () => { finished = true; clearTimeout(timer); doc.removeEventListener('visibilitychange', update); };
}

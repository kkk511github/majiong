/** WKWebView can show a keyboard without shrinking the layout viewport. */
export function installKeyboardViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let fullHeight = window.innerHeight;
  let width = window.innerWidth;
  let open = false;
  let frame = 0;
  let revealFrame = 0;
  const revealInput = () => {
    revealFrame = 0;
    const input = document.activeElement;
    if (!open || !(input instanceof HTMLElement)) return;
    const form = input.closest<HTMLElement>(".account-form");
    if (!form) return;
    const rect = input.getBoundingClientRect();
    const bounds = form.getBoundingClientRect();
    const top = Math.max(bounds.top, viewport.offsetTop) + 2;
    const bottom =
      Math.min(bounds.bottom, viewport.offsetTop + viewport.height) - 2;
    // Scroll only the input area, never pan the whole WKWebView under the keyboard.
    if (rect.bottom > bottom) form.scrollTop += rect.bottom - bottom;
    else if (rect.top < top) form.scrollTop -= top - rect.top;
  };
  const update = () => {
    frame = 0;
    const editing = document.activeElement?.matches(
      'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]',
    );
    if (Math.abs(width - window.innerWidth) > 80) {
      width = window.innerWidth;
      fullHeight = window.innerHeight;
      open = false;
    }
    // Android adjustResize can shrink innerHeight before focusin is delivered.
    // Keep the unoccluded height until an orientation-width change resets it.
    fullHeight = Math.max(fullHeight, window.innerHeight, viewport.height);
    open =
      !!(editing || open) &&
      Math.abs(viewport.scale - 1) < 0.02 &&
      fullHeight - viewport.height > 80;
    root.toggleAttribute("data-keyboard-open", open);
    if (open) {
      root.style.setProperty("--input-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--input-viewport-top", `${viewport.offsetTop}px`);
      cancelAnimationFrame(revealFrame);
      revealFrame = requestAnimationFrame(revealInput);
    } else {
      root.style.removeProperty("--input-viewport-height");
      root.style.removeProperty("--input-viewport-top");
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(revealFrame);
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", schedule);
    root.removeAttribute("data-keyboard-open");
    root.style.removeProperty("--input-viewport-height");
    root.style.removeProperty("--input-viewport-top");
  };
}

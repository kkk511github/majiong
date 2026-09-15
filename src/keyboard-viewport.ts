/** WKWebView can show a keyboard without shrinking the layout viewport. */
export function installKeyboardViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let fullHeight = window.innerHeight;
  let width = window.innerWidth;
  let open = false;
  let frame = 0;
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
    if (!editing && !open) fullHeight = window.innerHeight;
    open =
      !!(editing || open) &&
      Math.abs(viewport.scale - 1) < 0.02 &&
      fullHeight - viewport.height > 80;
    root.toggleAttribute("data-keyboard-open", open);
    if (open) {
      root.style.setProperty("--input-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--input-viewport-top", `${viewport.offsetTop}px`);
    } else {
      root.style.removeProperty("--input-viewport-height");
      root.style.removeProperty("--input-viewport-top");
      fullHeight = window.innerHeight;
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

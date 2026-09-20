export const ACCOUNT_VIEW_CHANGE_EVENT = "mahjong-account-view-change";

/** Keep account inputs visible even when a fullscreen keyboard overlays the WebView. */
export function installKeyboardViewport() {
  const viewport = window.visualViewport;
  const root = document.documentElement;
  const touchInput = matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const editable = 'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]';
  let fullHeight = window.innerHeight;
  let width = window.innerWidth;
  let open = false;
  let accountEditing = false;
  let focusIntent = touchInput;
  let frame = 0;
  let revealFrame = 0;
  const visibleHeight = () => Math.min(window.innerHeight, viewport?.height ?? window.innerHeight);
  const visibleTop = () => viewport?.offsetTop ?? 0;
  const revealInput = () => {
    revealFrame = 0;
    const input = document.activeElement;
    if (!(open || accountEditing) || !(input instanceof HTMLElement)) return;
    const form = input.closest<HTMLElement>(".account-form");
    if (!form) return;
    // The login form scrolls itself; change-password dialogs scroll their body.
    // Never scroll the whole WebView, which can pan the password below the IME.
    const scrollers = [form, form.closest<HTMLElement>(".modal-body")];
    for (const scroller of scrollers) {
      if (!scroller || scroller.scrollHeight <= scroller.clientHeight) continue;
      const rect = input.getBoundingClientRect();
      const bounds = scroller.getBoundingClientRect();
      const top = Math.max(bounds.top, visibleTop()) + 2;
      const bottom = Math.min(bounds.bottom, visibleTop() + visibleHeight()) - 2;
      if (rect.bottom > bottom) scroller.scrollTop += rect.bottom - bottom;
      else if (rect.top < top) scroller.scrollTop -= top - rect.top;
    }
  };
  const update = () => {
    frame = 0;
    const active = document.activeElement;
    const editing = active?.matches(editable);
    if (Math.abs(width - window.innerWidth) > 80) {
      width = window.innerWidth;
      fullHeight = window.innerHeight;
      open = false;
    }
    // Preserve the height before Android's adjustResize, even when resize arrives
    // before focusin. Some WebViews update innerHeight before visualViewport.
    fullHeight = Math.max(fullHeight, window.innerHeight, viewport?.height ?? 0);
    const wasOpen = open;
    const unzoomed = Math.abs((viewport?.scale ?? 1) - 1) < 0.02;
    open = !!(editing || open) && unzoomed && fullHeight - visibleHeight() > 80;
    if (wasOpen && !open) focusIntent = false;
    accountEditing = !!(touchInput && focusIntent && editing && unzoomed && active?.closest(".account-form"));
    root.toggleAttribute("data-keyboard-open", open);
    root.toggleAttribute("data-account-editing", accountEditing);
    if (open || accountEditing) {
      root.style.setProperty("--input-viewport-height", `${visibleHeight()}px`);
      root.style.setProperty("--input-viewport-top", `${visibleTop()}px`);
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
  const focus = (event: Event) => {
    // A submit button becomes disabled while the request is pending. Letting it
    // take focus then leaves BODY focused while Android's overlay IME is still
    // open, which would restore the tall form underneath the keyboard.
    if (event.type === "pointerdown" && event.target instanceof Element) {
      const button = event.target.closest("button");
      const active = document.activeElement;
      if ((event as PointerEvent).button === 0 && button instanceof HTMLButtonElement &&
          button.type === "submit" && button.form?.matches(".account-form") &&
          active?.matches(editable) && button.form.contains(active))
        event.preventDefault();
    }
    if (event.target instanceof Element && event.target.matches(editable)) focusIntent = true;
    schedule();
  };
  const accountViewChanged = () => { focusIntent = touchInput; schedule(); };
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", schedule);
  document.addEventListener("pointerdown", focus);
  window.addEventListener(ACCOUNT_VIEW_CHANGE_EVENT, accountViewChanged);
  update();
  return () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(revealFrame);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", focus);
    document.removeEventListener("focusout", schedule);
    document.removeEventListener("pointerdown", focus);
    window.removeEventListener(ACCOUNT_VIEW_CHANGE_EVENT, accountViewChanged);
    root.removeAttribute("data-keyboard-open");
    root.removeAttribute("data-account-editing");
    root.style.removeProperty("--input-viewport-height");
    root.style.removeProperty("--input-viewport-top");
  };
}

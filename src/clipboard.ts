/** Copy only after an explicit click, including browsers without Clipboard API. */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Embedded browsers can expose the API but reject it. Try the user-gesture
    // copy command before letting the caller show its manual-copy fallback.
  }
  const active = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange())
    : [];
  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.setAttribute("aria-label", "待复制内容");
  input.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px;";
  // A modal makes the rest of the document inert; the temporary selection must
  // live inside the topmost dialog for copying a replay ID or export to work.
  const dialogs = document.querySelectorAll("dialog[open]");
  (dialogs[dialogs.length - 1] ?? document.body).append(input);
  try {
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw Error("请长按内容手动复制");
  } finally {
    input.remove();
    if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
}

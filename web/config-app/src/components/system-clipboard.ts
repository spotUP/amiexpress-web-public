/**
 * The system clipboard, so art leaves the canvas into the sysop's own
 * text editor and text comes back. Thin wrappers over
 * `navigator.clipboard` that never throw: denied permission or an
 * insecure context is a null, not a crash, and the caller falls back to
 * the editor-internal clipboard. Same shape as SessionLogsPage's copy
 * buttons (writeText + toast), extracted so it can be tested.
 */

export async function writeSystemText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Null when the clipboard cannot be read OR holds no text. */
export async function readSystemText(): Promise<string | null> {
  try {
    const text = await navigator.clipboard.readText();
    return text ? text : null;
  } catch {
    return null;
  }
}

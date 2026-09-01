/**
 * Alt+Enter's other half: the browser window.
 *
 * A door that asks for the whole terminal is asking for room it cannot get
 * while the page is one tab among the browser's chrome, so the same keystroke
 * that widens the door fullscreens the page. It has to happen on the KEY -
 * requestFullscreen is only granted inside a user gesture, so following the
 * door's `terminal-mode` socket event instead would be rejected.
 *
 * Kept apart from the component (canvas, socket, real xterm - none of it
 * mountable in a test) and written against the smallest possible slice of the
 * DOM, so a test can hand it a fake document.
 */

/** The parts of `document` this needs, plus the WebKit-prefixed spellings. */
export interface FullscreenDocument {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
  documentElement?: FullscreenTarget;
}

export interface FullscreenTarget {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** True when this document is showing something fullscreen right now. */
export function isFullscreen(doc: FullscreenDocument): boolean {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/**
 * Enter fullscreen, or leave it if we are already there.
 *
 * Returns whether anything was asked for: a browser with neither spelling
 * (older Safari on iOS refuses both on non-video elements) leaves the door's
 * own size toggle to do what it can, and says so rather than throwing.
 *
 * A rejected request is swallowed on purpose. The promise rejects whenever
 * the gesture is not accepted - a permissions policy, a keystroke the browser
 * did not count - and an unhandled rejection in a keydown handler is noise,
 * not information.
 */
export function toggleFullscreen(
  doc: FullscreenDocument,
  target: FullscreenTarget | undefined = doc.documentElement
): boolean {
  const swallow = (result: Promise<void> | void) => {
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => undefined);
    }
  };

  if (isFullscreen(doc)) {
    if (doc.exitFullscreen) {
      swallow(doc.exitFullscreen.call(doc));
      return true;
    }
    if (doc.webkitExitFullscreen) {
      swallow(doc.webkitExitFullscreen.call(doc));
      return true;
    }
    return false;
  }

  if (!target) return false;
  if (target.requestFullscreen) {
    swallow(target.requestFullscreen.call(target));
    return true;
  }
  if (target.webkitRequestFullscreen) {
    swallow(target.webkitRequestFullscreen.call(target));
    return true;
  }
  return false;
}

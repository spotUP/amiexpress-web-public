/**
 * XIM ANSI/text conversion utilities
 *
 * Extracted from XIMIOHandler.emitText() to keep io.ts under the 2000-line limit.
 * All functions are pure (no side effects on class state).
 */

export interface ProcessRawTextResult {
  /** Converted, ready-to-emit text. Empty string means nothing to emit. */
  text: string;
  /** Updated ANSI buffer — caller must store this back into class state. */
  ansiBuffer: string;
  /** Whether @READUSERKEYS was found — caller sets readUserKeysPending when true. */
  readUserKeysPending: boolean;
  /** True when the incomplete-ANSI buffer consumed the whole output — caller returns 0. */
  empty: boolean;
}

/**
 * Convert raw Amiga door output text to web-terminal-safe ANSI.
 *
 * Performs (in order):
 *  1. Prepend buffered incomplete-ANSI from previous call
 *  2. Amiga CSI (0x9B) → ESC+[ (0x1B 0x5B)
 *  3. Form Feed (0x0C) → scroll-to-scrollback + cursor-home
 *  4. Amiga-specific cursor-off/on codes stripped (ESC[N p)
 *  5. @READUSERKEYS directive stripped; flag returned to caller
 *  6. Bare ANSI sequences without ESC prefix completed
 *  7. Trailing incomplete-ANSI sequence buffered for next call
 */
export function processRawText(
  text: string,
  ansiBuffer: string,
  nonStopText: boolean,
  hasPendingMsg: boolean
): ProcessRawTextResult {
  // 1. Prepend buffered incomplete ANSI from the previous call.
  //    RTW and other doors may split ESC[34m across multiple JH_SM calls.
  let converted = ansiBuffer + text;
  let newAnsiBuffer = '';

  // 2. Amiga CSI (0x9B) → standard ANSI ESC+[ (0x1B 0x5B).
  //    Without this, colours appear as "[36m" instead of coloured text.
  converted = converted.replace(/\x9b/g, '\x1b[');

  // 3. Form Feed (0x0C) → ESC[2J ESC[H — true clear-screen + home.
  //    Amiga console.device: 0x0C = "Clear screen and home cursor". Real
  //    AmiExpress sends this to the modem terminal which actually erases
  //    the viewport — what came before is gone.
  //
  //    Earlier versions translated \f to "30 \r\n + ESC[H" so xterm.js
  //    kept the prior content in scrollback (nice UX). But it broke 1:1
  //    fidelity: e.g. Conftop emits its intro banner via JH_SM, then \f to
  //    erase, then re-emits a slightly-different report banner. With the
  //    scroll variant, the intro banner stays visible above the report so
  //    the user sees the banner twice. With true clear, only the report
  //    banner is visible — matching real reference-board BBS.
  converted = converted.replace(/\f/g, '\x1b[2J\x1b[H');

  // 4. Strip Amiga-specific cursor-off/on codes: ESC[N p (space before 'p').
  //    Standard ANSI cursor codes use [?25h/[?25l — no space.
  //    The regex MUST include the leading ESC byte; stripping only "[N p" leaves
  //    an orphaned ESC that gets buffered and corrupts the next sequence.
  const amigaCursorMatches = converted.match(/\x1b\[(\d*)\s+p/gi);
  if (amigaCursorMatches) {
    console.log(`[XIM-DEBUG] Filtering Amiga cursor codes: ${JSON.stringify(amigaCursorMatches)}`);
  }
  converted = converted.replace(/\x1b\[(\d*)\s+p/gi, '');

  // 5. @READUSERKEYS directive — MultiTop and similar doors embed this to
  //    trigger a pause. Strip it from output; signal caller to set the flag.
  let readUserKeysPending = false;
  const hasReadUserKeys = /@READUSERKEYS\s*/gi.test(converted);
  if (hasReadUserKeys) {
    converted = converted.replace(/@READUSERKEYS\s*/gi, '');
    if (hasPendingMsg && !nonStopText) {
      readUserKeysPending = true;
    }
  }

  // 6. Bare ANSI sequences (no ESC prefix) → add ESC.
  //    Some Amiga doors output "[32m" relying on console.device accepting it.
  //    Require at least one digit to avoid matching text like "[zOOROPA".
  converted = converted.replace(/(?<!\x1b)\[([?]?\d+(?:;\d*)*[A-Za-z])/g, '\x1b[$1');

  // 7. Trailing incomplete ANSI sequence → buffer for next call.
  //    CSI format: ESC [ (params) (letter) — letter terminates the sequence.
  const incompleteAnsiMatch = converted.match(/\x1b(\[[\d;?]*)?$/);
  if (incompleteAnsiMatch) {
    newAnsiBuffer = incompleteAnsiMatch[0];
    converted = converted.slice(0, -newAnsiBuffer.length);
    if (converted.length === 0) {
      return { text: '', ansiBuffer: newAnsiBuffer, readUserKeysPending, empty: true };
    }
  }

  return { text: converted, ansiBuffer: newAnsiBuffer, readUserKeysPending, empty: false };
}

/**
 * Newline-mode helper extracted from xim/io.ts.
 *
 * Amiga console.device treats \n as LF-only (advance row, column
 * unchanged). Our default emitText collapses CRLF to LF then re-emits
 * every line with a \r\n suffix, injecting implicit column resets that
 * break doors whose cursor arithmetic assumes Amiga semantics (notably
 * WarOLM's line editor ESC[11A).
 *
 * DOOR_NEWLINE_STRICT=1 opts into strict semantics: no CRLF collapse,
 * no auto-appended newline on msg.data=1, per-segment suffix is \n
 * rather than \r\n. xterm.js `convertEol:false` already lets bare \n
 * behave as LF-only on the client.
 */

export interface NewlineMode {
  /** True when DOOR_NEWLINE_STRICT=1 is set. */
  strict: boolean;
  /** LF vs CRLF suffix emitted per line segment. */
  lineSuffix: '\n' | '\r\n';
}

/** Read the current mode from the environment. Cheap; safe to call per-emit. */
export function getNewlineMode(): NewlineMode {
  const strict = process.env.DOOR_NEWLINE_STRICT === '1';
  return { strict, lineSuffix: strict ? '\n' : '\r\n' };
}

/** Collapse CRLF to LF unless we're preserving door bytes verbatim. */
export function normalizeNewlines(text: string, mode: NewlineMode): string {
  return mode.strict ? text : text.replace(/\r\n/g, '\n');
}

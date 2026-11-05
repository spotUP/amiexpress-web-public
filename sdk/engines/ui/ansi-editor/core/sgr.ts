/**
 * One SGR (Select Graphic Rendition) step for every ANSI reader in the editor.
 *
 * The canvas parser, the file importer and the editor-state loader each kept
 * their own copy of this switch, and none knew 39 (default foreground) or 49
 * (default background). Board art writes `ESC[44m ... ESC[49m`, so after the
 * 49 the blue stayed on every following cell. Keep the rules here only.
 */

export interface SgrState {
  fg: number;
  bg: number;
  blink: boolean;
  /** Bold is an attribute that outlives the colour code beside it. */
  bold: boolean;
  /** The colour the file asked for, before bold is applied to it. */
  baseFg: number;
}

export interface SgrOptions {
  /** Honour SGR 7 by swapping fg and bg. */
  inverse?: boolean;
  /** Apply 100-107 backgrounds only when iCE colours are on (default: always). */
  iceColors?: boolean;
}

export function createSgrState(): SgrState {
  return { fg: 7, bg: 0, blink: false, bold: false, baseFg: 7 };
}

function applyFg(s: SgrState): void {
  s.fg = s.bold && s.baseFg < 8 ? s.baseFg + 8 : s.baseFg;
}

/** Apply a list of SGR parameters to the state, in order. */
export function applySgrParams(s: SgrState, params: number[], opts: SgrOptions = {}): void {
  for (const p of params) {
    if (p === 0) {
      s.baseFg = 7;
      s.bold = false;
      applyFg(s);
      s.bg = 0;
      s.blink = false;
    } else if (p === 1) {
      s.bold = true;
      applyFg(s);
    } else if (p === 22) {
      s.bold = false;
      applyFg(s);
    } else if (p === 5) {
      s.blink = true;
    } else if (p === 25) {
      s.blink = false;
    } else if (p === 7 && opts.inverse) {
      [s.fg, s.bg] = [s.bg, s.fg];
      s.baseFg = s.fg;
    } else if (p >= 30 && p <= 37) {
      s.baseFg = p - 30;
      applyFg(s);
    } else if (p === 39) {
      // Default foreground: the editor's white, bold still applies.
      s.baseFg = 7;
      applyFg(s);
    } else if (p >= 40 && p <= 47) {
      s.bg = p - 40;
    } else if (p === 49) {
      // Default background: the editor's black.
      s.bg = 0;
    } else if (p >= 90 && p <= 97) {
      s.baseFg = p - 90 + 8;
      applyFg(s);
    } else if (p >= 100 && p <= 107) {
      if (opts.iceColors !== false) s.bg = p - 100 + 8;
    }
  }
}

/**
 * Character markers for a focused or active label, for `screen.colour === false`.
 *
 * With ANSI colour off the board strips every SGR, so a focused button or an
 * active tab drawn by colour alone looks like its neighbours. The marker is
 * `[Label]` for the active one and ` Label ` for the rest: the brackets take
 * the place of the padding spaces, so the width never changes (plan: colour-
 * aware SDK, "Marker rules").
 */

import type { Element } from '../core/element';

/** `[label]` when active, ` label ` when not. Always label.length + 2 wide. */
export function markLabel(label: string, active: boolean): string {
  return active ? `[${label}]` : ` ${label} `;
}

/**
 * Re-mark one already laid-out line of plain text (leading pad from centring
 * included). A label that carries its own brackets (`[ OK ]`) is unwrapped
 * first, so the inactive one reads ` OK ` and only the active one is bracketed.
 * The marked text is centred on the same span, so the line keeps its width.
 * Lines with escapes, or too tight to hold the two marker columns, are left as
 * they are.
 */
export function markLabelLine(line: string, active: boolean): string {
  if (/[\x00-\x1f]/.test(line)) return line;
  const body = line.trim();
  if (body === '') return line;
  const lead = line.length - line.trimStart().length;
  const bracketed = /^\[\s*(.*?)\s*\]$/.exec(body);
  const marked = markLabel(bracketed ? bracketed[1] : body, active);
  // Keep the centre of the old text so the label does not drift sideways.
  const start = Math.max(0, Math.round(lead + body.length / 2 - marked.length / 2));
  return ' '.repeat(start) + marked;
}

/** Label last composed per input, to tell a caller's own relabel from ours. */
const composedLabels = new WeakMap<Element, { base: string | undefined; composed: string | undefined }>();

/**
 * A text input with colour off: its reversed caret cell and selection are
 * stripped, so the terminal's own cursor is shown on the caret cell, and a
 * selection is counted in the label as `[N selected]`. `caret` is the absolute
 * cell (null when nothing is focused).
 */
export function syncColourOffInput(el: Element, caret: { x: number; y: number } | null, selected: number): void {
  const screen = el.screen;
  if (screen?.colour !== false) return;
  if (el.focused && caret) {
    screen.setCursorTarget(caret.x, caret.y);
    screen.showCursor();
  }
  const seen = composedLabels.get(el);
  const current = el.options.label;
  const base = seen && seen.composed === current ? seen.base : current;
  const composed = selected > 0 ? `${base ?? ''} [${selected} selected]`.trim() : base;
  if (composed !== current) el.options.label = composed;
  composedLabels.set(el, { base, composed });
}

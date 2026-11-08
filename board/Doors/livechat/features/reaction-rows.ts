/**
 * Reaction glyphs, the picker labels and the rows that sit under a message.
 *
 * Same layout as LIVECHAT68 (livechat_ui.c lc_react_rows), spec
 * thoughts/shared/plans/2026-11-08-livechat-reactions-spec.md:
 * `glyph count` items two spaces apart, wrapping at the log width, indented to
 * the message text, capped at half the width, no row when nothing has a count.
 *
 * The glyph is real emoji for a caller whose wire is UTF-8
 * (bbs.unicodeCapable, set once on open) and the ASCII face otherwise.
 */
import { EMOJI_DISPLAY, EMOJI_UTF8, REACTION_EMOJIS, REACTION_WORDS } from '../types/reaction.types';
import { getReactionCounts } from './reaction-store';

let utf8Caller = false;

export function setReactionGlyphMode(unicodeCapable: boolean): void { utf8Caller = unicodeCapable; }

/** The glyph for a reaction name; an unknown name shows as itself. */
export function reactionGlyph(name: string, utf8: boolean = utf8Caller): string {
  return (utf8 ? EMOJI_UTF8[name] : undefined) ?? EMOJI_DISPLAY[name] ?? name;
}

/** Terminal columns of a glyph: every emoji is 2, an ASCII face is its length. */
export function glyphWidth(glyph: string): number {
  return Object.values(EMOJI_UTF8).includes(glyph) ? 2 : glyph.length;
}

/** Picker line: glyph padded to 3, a space, the word (`:)  Thumbs Up`). */
export function reactionPickerLabel(i: number, utf8: boolean = utf8Caller): string {
  const name = REACTION_EMOJIS[i];
  const g = reactionGlyph(name, utf8);
  return g + ' '.repeat(Math.max(0, 3 - glyphWidth(g))) + ' ' + REACTION_WORDS[i];
}

/**
 * The rows for one message: [] when no reaction has a count, else one string
 * per row, each already indented. Rows are plain text (no colour tags).
 */
export function reactionRowTexts(
  counts: Readonly<Record<string, number>>,
  indent: number,
  width: number,
  utf8: boolean = utf8Caller
): string[] {
  const pad = Math.max(0, Math.min(indent, Math.floor(width / 2)));
  const rows: string[] = [];
  let row = '';
  let col = 0;
  for (const [name, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    const glyph = reactionGlyph(name, utf8);
    const item = `${glyph} ${n}`;
    const len = glyphWidth(glyph) + 1 + String(n).length;
    if (row !== '' && col + 2 + len <= width) {
      row += '  ' + item;
      col += 2 + len;
    } else {
      if (row !== '') rows.push(row);
      row = ' '.repeat(pad) + item;
      col = pad + len;
    }
  }
  if (row !== '') rows.push(row);
  return rows;
}

/** Columns before the message text: `[time] <nick> ` read off the first painted row. */
export function textIndent(firstRow: string): number {
  const visible = firstRow.replace(/\{[^}]*\}/g, '');
  const m = /^(\[[^\]]*\] )?(<[^>]*> )?/.exec(visible);
  return m ? m[0].length : 0;
}

export interface DisplayRows {
  raw: string[];
  rendered: string[];
  ids: (string | null)[];
  /** Display index of each source row: reaction rows push later rows down. */
  at: number[];
}

/**
 * The log as painted: every message row, with its reaction rows after the
 * message's last row. Reaction rows carry the message id, so a click on one
 * names its message, and every consumer that counts rows (scroll, the message
 * picker, right-click) reads this one list.
 */
export function withReactionRows(
  raw: readonly string[],
  rendered: readonly string[],
  ids: readonly (string | null)[],
  width: number,
  accent: string,
  utf8: boolean = utf8Caller
): DisplayRows {
  const out: DisplayRows = { raw: [], rendered: [], ids: [], at: [] };
  let first = 0;
  for (let i = 0; i < raw.length; i++) {
    out.at.push(out.raw.length);
    out.raw.push(raw[i]);
    out.rendered.push(rendered[i]);
    out.ids.push(ids[i]);
    const id = ids[i];
    if (id == null) { first = i + 1; continue; }
    if (ids[i + 1] === id) continue;
    for (const r of reactionRowTexts(getReactionCounts(id), textIndent(raw[first]), width, utf8)) {
      const tagged = `{${accent}-fg}${r}{/${accent}-fg}`;
      out.raw.push(tagged);
      out.rendered.push(tagged);
      out.ids.push(id);
    }
    first = i + 1;
  }
  return out;
}

/** ` [<3 2] [:) 1]` one-line form for the /reactions answer; empty when none. */
export function formatReactionCounts(messageId: string | number): string {
  const entries = Object.entries(getReactionCounts(messageId));
  if (entries.length === 0) return '';
  return ' ' + entries.map(([emoji, n]) => `[${reactionGlyph(emoji)} ${n}]`).join(' ');
}

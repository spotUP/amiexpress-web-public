/**
 * Tip frame layout, pure: the rows for any screen width.
 *
 * Geometry comes from the caller (screen.width), never a constant: the
 * frame grows on wide screens and stacks borderless on the 40-column
 * tier. Tested in tests/layout.test.ts and pinned at 80.
 */
import { getCompactProfile, calculateDialogWidth } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { amigaSafe } from './catalog';
import type { Tip } from './tips';

export interface TipFrame {
  /** Frame outer width, including borders where drawn. */
  frameWidth: number;
  /** Frame outer height, including borders where drawn. */
  frameHeight: number;
  /** False on the 40-column tier: no frames, chrome in one row. */
  bordered: boolean;
  /** Text width inside the frame: every content row fits exactly this. */
  innerWidth: number;
  /**
   * Columns of padding inside the frame, and so the LEFT of every content
   * row. Blessed child coordinates are already inner-relative (the parent's
   * border is added for them, sdk element.ts:572-576), so this must NOT
   * include the border - a door that added one pushed its rows off the
   * frame (2026-09-13).
   */
  padding: number;
  title: string;
  body: string[];
  hint: string;
}

/**
 * Where each content box sits INSIDE the frame, and how many rows it has
 * to sit in.
 *
 * Blessed child coordinates are inner-relative: the SDK adds the parent's
 * border offset itself (element.ts:572-576). The door added one on top of
 * that, which pushed the hint row onto the frame's own bottom border at 80
 * columns and one column past the right edge at 40 (2026-09-13). The
 * geometry is one function now, so the rows the app draws are the rows
 * this file's tests measure.
 */
export interface TipBoxRows {
  title: number;
  body: number;
  hint: number;
  /** Left of every content box, inner-relative. */
  left: number;
  /** Rows inside the frame: a box at or past this one is on the border. */
  innerRows: number;
}

export function tipBoxRows(frame: TipFrame): TipBoxRows {
  return {
    title: 0,
    body: 2,
    hint: 2 + frame.body.length + 1,
    left: frame.padding,
    innerRows: frame.frameHeight - (frame.bordered ? 2 : 0),
  };
}

export function wrapWords(text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const raw of words) {
    let word = raw;
    const next = line ? `${line} ${word}` : word;
    if (next.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      // A single word wider than the row is cut, never pushed past it:
      // the transducer would hard-wrap it mid-row on a C64.
      while (line.length === 0 && word.length > width) {
        lines.push(word.slice(0, width));
        word = word.slice(width);
      }
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/**
 * Rows for this tip on a screen this wide. Inner text width is frame
 * minus borders and padding; on 40 columns the frame IS the screen
 * (minus padding) and the hint shortens to fit the cursor row.
 */
export function buildTipFrame(tip: Tip, screenWidth: number): TipFrame {
  const w = Math.max(40, screenWidth || 80);
  // Paint boundary: facts and manifests arrive as free text, and only
  // Amiga Latin-1 paints. Sanitize once here rather than in every picker.
  tip = { ...tip, title: amigaSafe(tip.title), body: amigaSafe(tip.body) };  const compact = getCompactProfile(w);
  const bordered = compact.borders;
  // The SDK's own dialog curve: near-full-width on narrow screens, a
  // percentage on wide ones. Never a literal cap of ours.
  const frameWidth = bordered ? calculateDialogWidth(w) : w - compact.padding * 2;
  const inner = frameWidth - (bordered ? 2 + 2 * compact.padding : 0);
  const title = `Tip of the day - ${tip.title}`.slice(0, inner);
  const body = wrapWords(tip.body, inner, 3);
  const command = tip.command ? `Run ${tip.command} at the menu. ` : '';
  const longHint = `${command}Any key continues...`;
  const hint = longHint.length <= inner ? longHint : 'Any key...';
  const frameHeight = (bordered ? 2 : 0) + 1 + 1 + body.length + 1 + 1;
  return {
    frameWidth, frameHeight, bordered, innerWidth: inner,
    padding: bordered ? compact.padding : 0,
    title, body, hint,
  };
}

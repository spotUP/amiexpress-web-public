/**
 * Making somebody else's video frame fit YOUR tile.
 *
 * A sender encodes ASCII for the size of its OWN tile, and every viewer's
 * tile can be a different size - a phone, a maximised window and an 80x25
 * BBS view all watching the same person. Whoever's tile does not match gets
 * a frame that is too wide, every row wraps onto the next, and the picture
 * arrives as stripes (screenshot, 2026-08-26).
 *
 * ASCII cannot be rescaled - half a block character is nothing - so the frame
 * is CLIPPED to the tile instead: too wide is cut, too tall is trimmed, too
 * small is left alone and simply occupies less of the tile. A smaller picture
 * is honest; a wrapped one is unreadable.
 *
 * Pure, and tag-aware: blessed colour tags take no columns on screen, so they
 * must not be counted when measuring - and a clipped row must not end in the
 * middle of one.
 */

/** Visible columns a line occupies, ignoring blessed colour tags. */
export function visibleWidth(line: string): number {
  return line.replace(/\{[^}]*\}/g, '').length;
}

/**
 * Cut a line to `width` visible columns, keeping its tags intact.
 *
 * Tags are copied through and cost nothing; the cut lands on a character
 * boundary, never inside `{cyan-fg}`. A trailing reset is appended when the
 * line carried any tags, so a clipped row cannot leak its colour into
 * whatever the terminal draws next.
 */
export function clipToWidth(line: string, width: number): string {
  if (width <= 0) return '';
  if (visibleWidth(line) <= width) return line;

  let out = '';
  let shown = 0;
  let i = 0;
  let sawTag = false;

  while (i < line.length && shown < width) {
    if (line[i] === '{') {
      const end = line.indexOf('}', i);
      if (end !== -1) {
        out += line.slice(i, end + 1);
        i = end + 1;
        sawTag = true;
        continue;
      }
    }
    out += line[i];
    shown++;
    i++;
  }

  return sawTag ? `${out}{/}` : out;
}

/**
 * Fit a whole frame to a tile EXACTLY: `height` rows of `width` columns.
 *
 * Both directions matter, and only one of them used to be handled.
 *
 * Too big is clipped: a frame one row too tall used to shove the status bar
 * off the bottom of its own tile.
 *
 * Too small is PADDED, which it was not. A sender encodes for the size of
 * its own tile, so a viewer with a larger tile received a smaller picture -
 * and every cell the new frame did not reach still held the previous one.
 * The result was fragments of old video around the live picture that never
 * went away (reported 2026-08-26 as "old video frames not clearing"). A
 * frame that covers the whole tile cannot leave anything behind.
 */
export function fitFrameToTile(frame: string, width: number, height: number): string {
  if (width <= 0 || height <= 0) return '';

  const rows = frame.split('\n');
  const blank = ' '.repeat(width);
  const out: string[] = [];

  for (let i = 0; i < height; i++) {
    const row = rows[i];
    if (row === undefined) {
      out.push(blank);
      continue;
    }

    const clipped = clipToWidth(row, width);
    const short = width - visibleWidth(clipped);
    out.push(short > 0 ? clipped + ' '.repeat(short) : clipped);
  }

  return out.join('\n');
}

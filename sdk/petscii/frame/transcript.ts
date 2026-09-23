/**
 * A SESSION'S OUTPUT, READ BACK AS A TRANSCRIPT.
 *
 * What the board sends a caller is not a document - it is a film: the same
 * cells rewritten, cursors jumped, screens cleared and drawn again. Strip the
 * escapes out of it and print what is left and you get every frame stacked on
 * the one before, which is what the admin session log did: "its also the same
 * in the logs in the web admin ui, mangled by screen clears" (the sysop,
 * 2026-09-24).
 *
 * A terminal already solves this, and the board already has one. Replay the
 * stream through `FrameReconstructor` - the same reference screen the PETSCII
 * work is measured against - and write down each row AS IT LEAVES: scrolled
 * off the top, or wiped by a clear. What is still on the screen at the end is
 * the last frame, and it goes on the bottom.
 *
 * The result reads the way the caller's own scrollback would, which is the
 * only definition of "the log" that is not somebody's opinion.
 */

import { FrameReconstructor } from './ansi-screen';

export interface TranscriptOptions {
  /** The caller's screen. Eighty by twenty-five unless the session says otherwise. */
  cols?: number;
  rows?: number;
  /**
   * Drop a row that repeats the one before it.
   *
   * A board redrawing the same menu retires the same rows again; without this
   * a log of six menu visits is six copies. On by default, because a log is
   * read by a person.
   */
  collapseRepeats?: boolean;
}

/**
 * Every line the caller ever had on his screen, in the order he saw them.
 */
export function ansiTranscript(output: string, options: TranscriptOptions = {}): string[] {
  const lines: string[] = [];
  const collapse = options.collapseRepeats !== false;

  const keep = (line: string): void => {
    if (collapse && lines.length > 0 && lines[lines.length - 1] === line) return;
    lines.push(line);
  };

  const screen = new FrameReconstructor({
    cols: options.cols ?? 80,
    rows: options.rows ?? 25,
    onRetire: keep,
  });

  screen.write(output);

  // Whatever is still on the glass is the last thing he saw.
  const frame = screen.snapshot();
  const rows = frame.cells.map((row) => row.map((cell) => cell.ch ?? ' ').join('').replace(/\s+$/, ''));
  let last = rows.length - 1;
  while (last >= 0 && rows[last].trim() === '') last--;
  for (let y = 0; y <= last; y++) keep(rows[y]);

  // A transcript that ends in blank rows is a transcript with a tail of
  // nothing; the reader has scrolled far enough already.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

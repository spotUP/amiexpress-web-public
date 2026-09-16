/**
 * The row loop of XIMIOHandler.emitText, and what it leaves behind at a pause.
 *
 * express.e's displayFile (6746-6849) prints a file ONE LINE AT A TIME and asks
 * checkForPause after each, so the answer to `More(y/n/ns)?` decides what
 * happens to the rest of the file: anything but `n` goes on with it, `n`
 * abandons it. This port emits a whole JH_SF message in one call, and until
 * 2026-09-16 that call simply RETURNED at the prompt, which threw the unsent
 * lines away - the sysop's Super-AmiLog bulletin (38 rows, Bulls door, `B 6`)
 * ended at row 23 whatever he answered. So the loop reports the lines it did
 * not reach, the handler holds them between the prompt and the answer, and
 * the reply that releases the door is sent only after the last of them.
 */
import { AnsiUtil } from '../../utils/ansi.util';
import { looksLikeAsciiArt, positionsCursorAbsolutely } from '../../utils/ascii-art.util';
import { wrapLine } from './line-wrap.util';
import { getNewlineMode } from './newline-mode.util';

/**
 * One message's lines, prepared for the wire (newlines normalised, split),
 * with what the loop needs to send them or go on sending them after a pause:
 * whether rows are being counted and may pause, and whether the last row
 * gets the attribute reset the message's colours earn.
 */
export interface PreparedLines {
  lines: string[];
  hasTrailingNewline: boolean;
  trackLines: boolean;
  autoPause: boolean;
  containsAnsiSgr: boolean;
}

/** What the loop asks of the handler that owns the wire and the row count. */
export interface LineSink {
  /** Column the caller's screen wraps at; 0 for no wrapping. */
  lineWrap: number;
  /**
   * Put one finished row on the wire.
   *
   * Named `write`, not `emit`: it hands bytes to the caller's socket through
   * the handler, and a method called `emit` here reads as a socket EVENT to
   * anything scanning for them - the transport census flagged it as an
   * unruled variable-emit site the day this module was split out.
   */
  write(text: string): void;
  /** One more row has gone out with a newline (express.e's lineCount++). */
  countRow(): void;
  /**
   * A clear-screen went out: the count starts over (express.e:1670-1674,
   * aePuts zeroes lineCount when the string carries a form feed). Without
   * this a 23-row bulletin that opens with `~f` paged at its LAST row on a
   * 24-row screen - the clear counted as a row.
   */
  resetRows(): void;
  /** The row count has reached the screen: put the prompt up and stop here. */
  pauseDue(): boolean;
}

export interface EmitLinesResult {
  bytes: number;
  paused: boolean;
  /** The lines still owed when `paused`; null when the pause fell on the last row. */
  remainder: PreparedLines | null;
}

/**
 * Send prepared lines one wire row at a time. A wrapped segment is at most one
 * row wide, so when the pause falls in the middle of a wrapped line the rest
 * of that line re-enters as rows of its own.
 */
export function emitPreparedLines(job: PreparedLines, sink: LineSink): EmitLinesResult {
  const { lines, hasTrailingNewline, trackLines, autoPause, containsAnsiSgr } = job;
  const newlineMode = getNewlineMode();
  let bytes = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastLine = i === lines.length - 1;
    const shouldAddLineBreak = !isLastLine || hasTrailingNewline;

    const visibleLine = AnsiUtil.stripAnsiForPlainText(line);
    // A door that moves the cursor to a row and column is PAINTING a
    // screen, not printing a line, and has no lines to wrap. Breaking
    // one moves everything after the break somewhere the door never
    // asked for: DOORREPO's /help came out with every row cut short and
    // its remainder starting the row below (screenshot, 2026-09-01).
    //
    // The door's own bytes were captured and replayed and render
    // perfectly, and processRawText passes them through byte-identical -
    // the break was inserted here. looksLikeAsciiArt() was the only
    // exemption and asks whether the text LOOKS like art; a help row of
    // ordinary words does not, so it was wrapped.
    const lineLooksLikeArt = looksLikeAsciiArt(visibleLine);
    const segments = (lineLooksLikeArt || positionsCursorAbsolutely(line))
      ? [line]
      : wrapLine(line, sink.lineWrap);

    for (let s = 0; s < segments.length; s++) {
      const segment = segments[s];
      const isLastSegment = s === segments.length - 1;
      const endsInNewline = !isLastSegment || shouldAddLineBreak;
      const suffix = endsInNewline ? newlineMode.lineSuffix : '';
      const ansiReset = (containsAnsiSgr && isLastLine && isLastSegment && endsInNewline)
        ? '\x1b[0m' : '';
      const output = `${segment}${ansiReset}${suffix}`;

      // Emit output BEFORE checking pause
      sink.write(output);
      bytes += output.length;

      // express.e only increments lineCount and checks pause if a newline was emitted
      if (trackLines && endsInNewline) {
        // `~f` arrives as ESC[2J from parseMciCodes; a door's own form feed as \f.
        if (output.includes('\x1b[2J') || output.includes('\f')) sink.resetRows();
        sink.countRow();
        if (autoPause && sink.pauseDue()) {
          const remaining = [...segments.slice(s + 1), ...lines.slice(i + 1)];
          return {
            bytes,
            paused: true,
            remainder: remaining.length > 0 ? { ...job, lines: remaining } : null,
          };
        }
      }
    }
  }
  return { bytes, paused: false, remainder: null };
}

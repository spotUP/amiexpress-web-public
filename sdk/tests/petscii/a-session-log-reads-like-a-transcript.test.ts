/**
 * A SESSION LOG READS LIKE WHAT THE CALLER SAW.
 *
 * "its also the same in the logs in the web admin ui, mangled by screen
 * clears" and "the logs should not clear" (the sysop, 2026-09-24).
 *
 * The admin log stripped the escapes and printed what was left. But what the
 * board sends is not a document, it is a film - the same cells rewritten,
 * cursors jumped, screens cleared and drawn again - so stripping left every
 * frame stacked on the one before, positioned by nothing.
 *
 * A terminal already solves this and the board already has one. Replay the
 * stream through the reference screen and write each row down AS IT LEAVES:
 * scrolled off the top, or wiped by a clear. What is still on the glass at
 * the end is the last frame.
 */
import { ansiTranscript } from '../../petscii/frame/transcript';

const CLEAR = '\x1b[2J\x1b[H';
const HOME = '\x1b[H';

describe('a session replayed as a transcript', () => {
  it('keeps what a clear wiped, in the order it was shown', () => {
    const output = `first screen\r\n${CLEAR}second screen\r\n`;

    expect(ansiTranscript(output)).toEqual(['first screen', 'second screen']);
  });

  it('keeps every screen of a board that repaints, not just the last', () => {
    const output = [
      `${CLEAR}MAIN MENU\r\n`,
      `${CLEAR}FILE AREAS\r\n`,
      `${CLEAR}MESSAGE BASES\r\n`,
    ].join('');

    expect(ansiTranscript(output)).toEqual(['MAIN MENU', 'FILE AREAS', 'MESSAGE BASES']);
  });

  it('does not stack a repaint on top of the screen before it', () => {
    // The old log's failure: home the cursor, draw again, and the two frames
    // came out interleaved because nothing was positioned.
    const output = `${CLEAR}AAAA\r\nBBBB\r\n${HOME}CCCC\r\n`;
    const lines = ansiTranscript(output);

    expect(lines).toContain('CCCC');
    expect(lines).not.toContain('AAAABBBB');
    expect(lines.filter((line) => line === 'BBBB')).toHaveLength(1);
  });

  it('writes down a row when it scrolls off the top', () => {
    const rows = 5;
    const output = Array.from({ length: 8 }, (_, i) => `line ${i}\r\n`).join('');

    expect(ansiTranscript(output, { rows })).toEqual([
      'line 0', 'line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7',
    ]);
  });

  it('collapses a menu shown twice into one, for a reader', () => {
    const output = `${CLEAR}MENU\r\n${CLEAR}MENU\r\n`;

    expect(ansiTranscript(output)).toEqual(['MENU']);
  });

  it('keeps both when the caller asks for every frame', () => {
    const output = `${CLEAR}MENU\r\n${CLEAR}MENU\r\n`;

    expect(ansiTranscript(output, { collapseRepeats: false })).toEqual(['MENU', 'MENU']);
  });

  it('carries no escape sequences into the log', () => {
    const output = `${CLEAR}\x1b[1;32mgreen text\x1b[0m\r\n`;

    expect(ansiTranscript(output).join('\n')).not.toContain('\x1b');
    expect(ansiTranscript(output)).toContain('green text');
  });

  it('does not end in a tail of blank rows', () => {
    const output = `${CLEAR}something\r\n\r\n\r\n\r\n`;

    expect(ansiTranscript(output)).toEqual(['something']);
  });

  it('reads a forty-column session at forty columns', () => {
    const output = `${CLEAR}${'x'.repeat(40)}${'y'.repeat(5)}`;
    const lines = ansiTranscript(output, { cols: 40, rows: 25 });

    // Forty columns then a wrap, not a forty-five column line nobody had.
    expect(lines[0]).toBe('x'.repeat(40));
    expect(lines[1]).toBe('y'.repeat(5));
  });
});

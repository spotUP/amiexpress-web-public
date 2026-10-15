/**
 * THE MAIL COMPOSER'S DIALOGS AT FORTY COLUMNS.
 *
 * Every box in this door was a literal: a 70-column header dialog with
 * 64-column inputs inside it, a 60-column exit confirm, a `'50%'` notice. A
 * C64 has forty, so the dialog's right border and the buttons anchored to it
 * were off the glass, and an input sized to the DIALOG ran the caller's own
 * typing off it too.
 *
 * The eighty-column answers are what the door drew before - that screen is
 * not redrawn to fix a C64 - and that is half of what this file pins.
 */
import {
  headerDialog,
  headerHints,
  noticeWidth,
} from '../../../../../Doors/mail-composer/layout';

/** Printable columns of a hint row as the door joins it. */
const hintWidth = (hints: Array<{ key: string; does: string }>): number =>
  hints.map(h => `${h.key}: ${h.does}`).join('  ').length;

describe('the New Message dialog', () => {
  it('is seventy columns on an eighty-column board, as it always was', () => {
    const dialog = headerDialog(80, 24);

    expect(dialog.width).toBe(70);
    expect(dialog.height).toBe(12);
    expect(dialog.inner).toBe(64);
  });

  it('fits a C64 screen, and its inputs fit the dialog', () => {
    const dialog = headerDialog(40, 25);

    expect(dialog.width).toBeLessThanOrEqual(40);
    expect(dialog.height).toBeLessThanOrEqual(25);
    // Two columns of border and two of inset on each side.
    expect(dialog.inner).toBeLessThanOrEqual(dialog.width - 4);
  });

  it('never returns a dialog wider than the caller, at any width', () => {
    for (const width of [20, 40, 64, 80, 132]) {
      expect(headerDialog(width, 25).width).toBeLessThanOrEqual(Math.max(20, width));
    }
  });
});

describe('the hint row under the fields', () => {
  it('says what the keys do in full on a wide screen', () => {
    expect(headerHints(80).map(h => h.does)).toEqual(['Next field', 'Continue', 'Cancel']);
  });

  it('shortens the WORDS at forty, and keeps every key', () => {
    const hints = headerHints(40);

    expect(hints.map(h => h.key)).toEqual(['Tab', 'Enter', 'ESC']);
    expect(hintWidth(hints)).toBeLessThanOrEqual(headerDialog(40, 25).inner);
  });

  it('is what overflowed before: the long row does not fit a C64 dialog', () => {
    expect(hintWidth(headerHints(80))).toBeGreaterThan(headerDialog(40, 25).inner);
  });
});

describe('a notice', () => {
  it('is half the screen on a wide board and the whole of a C64 one', () => {
    expect(noticeWidth(80)).toBe('50%');
    expect(noticeWidth(40)).toBe(38);
  });
});

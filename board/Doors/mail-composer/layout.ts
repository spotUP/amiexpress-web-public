/**
 * THE MAIL COMPOSER'S DIALOGS, sized to the screen they open on.
 *
 * Every box here was a literal - a 70-column header dialog with 64-column
 * inputs inside it, a 60-column confirm - and a C64 has forty. A dialog
 * wider than the screen puts its right border and its buttons off the glass,
 * and an input sized to the DIALOG rather than to the screen runs the
 * caller's own typing off it too.
 *
 * One function, two answers, and the eighty-column one is exactly what the
 * door drew before: the sysop's board is not redrawn to fix a C64.
 */
import { isCompactWidth } from '@amiexpress/bbs-door-sdk';

export interface ComposerDialog {
  /** The dialog box itself. */
  width: number;
  height: number;
  /** An input or list inside it, inset by two columns on each side. */
  inner: number;
}

/** The New Message header dialog: To, Subject, and the buttons under them. */
export function headerDialog(screenWidth: number, screenHeight: number): ComposerDialog {
  const width = Math.max(20, Math.min(70, screenWidth));
  return {
    width,
    height: Math.max(8, Math.min(12, screenHeight)),
    // Two columns of border and two of inset on each side.
    inner: Math.max(8, width - 6),
  };
}

/** A notice or a confirm - `width: '50%'` at eighty, the screen at forty. */
export function noticeWidth(screenWidth: number): string | number {
  return isCompactWidth(screenWidth) ? Math.max(20, screenWidth - 2) : '50%';
}

/**
 * The hint row under the header dialog's fields.
 *
 * `Tab: Next field  Enter: Continue  ESC: Cancel` is forty-five printable
 * columns; the dialog's interior on a C64 is thirty-four. The words are what
 * shortens, never the keys - a caller who cannot see `ESC` has lost the way
 * out of the box.
 */
export function headerHints(screenWidth: number): Array<{ key: string; does: string }> {
  if (isCompactWidth(screenWidth)) {
    return [
      { key: 'Tab', does: 'Next' },
      { key: 'Enter', does: 'OK' },
      { key: 'ESC', does: 'Cancel' },
    ];
  }
  return [
    { key: 'Tab', does: 'Next field' },
    { key: 'Enter', does: 'Continue' },
    { key: 'ESC', does: 'Cancel' },
  ];
}

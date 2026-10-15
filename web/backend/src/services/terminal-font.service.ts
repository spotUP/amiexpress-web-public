/**
 * Choosing the terminal font - the one path both font menus take.
 *
 * W row 18 and F in the user stats screen each had their own list, their own
 * numbering and their own way of applying the pick: W sent `set-font`, which
 * the browser applies, and the stats menu sent `font-changed`, which nothing
 * listens for, so its pick was saved and only showed at the next login.
 */
import type { BBSSession } from '../index';
import { TERMINAL_FONTS } from '../constants/terminal-fonts';
import { sessionWantsPetscii } from '../utils/petscii-session-model';

/** The menu rows: `[n] label`, numbered from 1. */
export function fontMenuRows(): string[] {
  return TERMINAL_FONTS.map((font, index) => `[${index + 1}] ${font.label}`);
}

/** The font a typed menu number names, or null for anything else. */
export function fontForChoice(input: string): string | null {
  const n = Number(input.trim());
  return Number.isInteger(n) && n >= 1 && n <= TERMINAL_FONTS.length ? TERMINAL_FONTS[n - 1].id : null;
}

export type FontChoiceResult = 'set' | 'petscii';

/**
 * Save the caller's font and put it on his screen now.
 *
 * A PETSCII caller is refused: his screen is the C64 character ROM, and the
 * pick would reach the hidden xterm behind the canvas (the sysop,
 * 2026-09-28). The menus check first and never offer it; this holds the rule
 * where the pick is applied as well.
 */
export async function chooseTerminalFont(
  socket: { emit: (event: string, ...args: unknown[]) => unknown },
  session: BBSSession,
  fontId: string,
): Promise<FontChoiceResult> {
  if (sessionWantsPetscii(session)) return 'petscii';
  if (session.user) {
    const { db } = require('../database');
    await db.updateUser(session.user.id, { fontPreference: fontId });
    session.user.fontPreference = fontId;
  }
  socket.emit('set-font', fontId);
  return 'set';
}

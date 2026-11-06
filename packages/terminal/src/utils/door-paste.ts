/**
 * Pasted text for a door in game mode.
 *
 * In game mode the door's keys travel as key-down events and xterm's onData
 * is dropped, so a paste (which xterm delivers through onData) never reached
 * the door. The terminal now sends the pasted text itself on `door:paste`.
 * Line breaks become CR, as xterm's own paste does: a terminal's Enter is CR.
 */

/** Largest paste sent to a door, in characters. The backend enforces the same cap. */
export const DOOR_PASTE_MAX = 16384;

/** The text to send for a paste, or null when there is nothing to send. */
export function doorPasteText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/\r?\n/g, '\r').slice(0, DOOR_PASTE_MAX);
  return text === '' ? null : text;
}

/**
 * What a client door is currently asking the player to do.
 *
 * Touch controls cannot be one thing. During play a tap should rotate the
 * piece or launch the ball; on a menu the same tap has to mean Enter, and a
 * swipe has to mean an arrow key - otherwise a phone player simply cannot get
 * past the title screen (reported live: "I can't navigate the menu in
 * Arkanoid with the phone", 2026-08-25).
 *
 * Nothing can infer this from outside: only the door knows whether it is
 * showing a menu or a playfield. So the door says so, and because client
 * doors run in the same page as the terminal UI, saying so is a DOM event
 * rather than a round trip through the server.
 */

export type DoorInputMode = 'game' | 'menu';

/** The event the terminal UI listens for. */
export const INPUT_MODE_EVENT = 'bbs:input-mode';

/**
 * Tell the terminal UI which control scheme the player needs.
 *
 * Safe to call on every state change and safe to call repeatedly - the UI
 * only acts when the mode actually changes. Does nothing outside a browser,
 * so a door running headlessly (tests, the corpus runner) is unaffected.
 */
export function setInputMode(mode: DoorInputMode): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(INPUT_MODE_EVENT, { detail: mode }));
}

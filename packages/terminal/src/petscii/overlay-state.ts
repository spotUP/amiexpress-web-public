/**
 * Pure state machine for the PETSCII overlay's visibility (final review
 * wave, Finding 2).
 *
 * Controller's overlay ruling: xterm stays VISIBLE and FOCUSED at all
 * times as the interaction surface (it is the login state machine -
 * term.onData IS the web login path). PetsciiCanvas becomes an overlay
 * drawn on top of it while a raw PETSCII screen (.seq via `petscii-bytes`)
 * plays, and gets DISMISSED (hidden, not unmounted - the underlying
 * PetsciiMachine/queue survive across shows) on either of:
 *
 *  - the next 'ansi-output' text write arriving AFTER the byte stream has
 *    finished draining (the art is done and the login/menu prompt is
 *    arriving underneath it) - not an ansi-output that happens to land
 *    mid-drain, which the art itself hasn't finished painting yet;
 *  - any user keypress (classic BBS "press a key to continue", same UX as
 *    the RIP screen-picture linger - see rip-linger.ts - except this one
 *    must NOT swallow the key: xterm keeps focus throughout, so the same
 *    keystroke also reaches the server as normal input).
 *
 * Extracted as a pure reducer (instead of ad-hoc useState flags scattered
 * through BBSTerminal.tsx) so the transition logic is unit-testable in
 * isolation - the DOM/socket wiring around it is exercised only by the
 * manual verification script.
 */

export interface PetsciiOverlayState {
  /** Whether the PetsciiCanvas overlay should be shown on top of xterm. */
  visible: boolean;
  /**
   * Whether the current petscii-bytes stream has finished draining into
   * the PetsciiMachine (baud-paced feed queue empty). Gates whether an
   * 'ansi-output' event is allowed to auto-dismiss the overlay - one that
   * arrives before the art has finished painting must not hide it early.
   */
  drained: boolean;
}

export type PetsciiOverlayEvent =
  /** A `petscii-bytes` payload arrived - (re)show the overlay. */
  | { type: 'bytes-arrived' }
  /** The baud-paced feed queue emptied - the current screen finished painting. */
  | { type: 'drain-complete' }
  /** An 'ansi-output' (or plain 'output') text write arrived. */
  | { type: 'ansi-output' }
  /** The user pressed a key while the overlay was up. */
  | { type: 'keypress' };

export const initialPetsciiOverlayState: PetsciiOverlayState = {
  visible: false,
  drained: true,
};

export function petsciiOverlayReducer(
  state: PetsciiOverlayState,
  event: PetsciiOverlayEvent
): PetsciiOverlayState {
  switch (event.type) {
    case 'bytes-arrived':
      // A new (or resumed) screen is painting - show it, and it is by
      // definition not yet drained.
      return { visible: true, drained: false };

    case 'drain-complete':
      if (!state.visible) return state;
      return { ...state, drained: true };

    case 'ansi-output':
      // Only dismiss once the art actually finished - an ansi-output that
      // sneaks in mid-drain must not cut the picture short.
      if (state.visible && state.drained) {
        return { visible: false, drained: true };
      }
      return state;

    case 'keypress':
      // "Press a key to continue" always works, drained or not - the user
      // gets to skip ahead just like the RIP linger's dismiss key.
      if (state.visible) {
        return { visible: false, drained: true };
      }
      return state;

    default:
      return state;
  }
}

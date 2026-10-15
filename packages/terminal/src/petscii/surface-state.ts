/**
 * Which surface owns the session: xterm (ANSI, 80 columns) or the PETSCII
 * canvas (a simulated C64, 40x25). Replaces the overlay reducer of the
 * 2026-09-01 overhaul (the canvas used to be a transient picture over a
 * still-live xterm; it is now THE surface for the whole session).
 *
 * Only a PETSCII event can select the canvas. There is deliberately no
 * 'ansi-output' or 'keypress' event: text arriving, keys pressed, screens
 * draining never move the surface - an 80-column session can never end up
 * on the canvas by accident, and a 'P' session never falls back to xterm
 * until a fresh session starts.
 */
export type PetsciiSurface = 'xterm' | 'canvas';

export type PetsciiSurfaceEvent =
  /** A PETSCII session is starting: 40x25 terminal-resize, petscii-bytes or petscii-output arrived. */
  | { type: 'petscii-session-start' }
  /** A genuinely fresh session begins on this mounted component (token login, restore failed, reconnect failed). */
  | { type: 'session-reset' };

export const initialPetsciiSurface: PetsciiSurface = 'xterm';

export function petsciiSurfaceReducer(state: PetsciiSurface, event: PetsciiSurfaceEvent): PetsciiSurface {
  switch (event.type) {
    case 'petscii-session-start': return 'canvas';
    case 'session-reset': return 'xterm';
    default: return state;
  }
}

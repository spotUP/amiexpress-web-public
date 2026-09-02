/**
 * Final review wave, Finding 2 (Critical): a web session that answers 'P'
 * to the graphics prompt used to have its login prompt (ansi-output)
 * rendered invisible - the first `petscii-bytes` swapped xterm's
 * `display:none` in for the PetsciiCanvas overlay, and stayed that way
 * forever (no dismissal existed), so the ansi-output login prompt drawn
 * into the now-hidden xterm was never seen and its focus was dead (the
 * canvas's own onData bypasses the web login state machine, which lives
 * on term.onData).
 *
 * Controller's ruling: xterm stays visible/focused at all times; the
 * PetsciiCanvas becomes a dismissible overlay on top of it, closed either
 * by the next ansi-output arriving after the byte stream drains, or by
 * any keypress. `petsciiOverlayReducer` is the pure state machine behind
 * that; BBSTerminal.tsx wires socket events/DOM listeners to it (not
 * covered here - see the manual verification script in the final wave
 * report).
 *
 * Imported straight from packages/terminal following the precedent in
 * tests/petscii/petscii-keymap.test.ts and petscii-machine.test.ts (no
 * React/DOM dependency in overlay-state.ts, so plain ts-jest resolves it
 * fine without a browser-like test environment).
 */
import {
  petsciiOverlayReducer,
  initialPetsciiOverlayState,
} from '../../../../packages/terminal/src/petscii/overlay-state';
import type { PetsciiOverlayState } from '../../../../packages/terminal/src/petscii/overlay-state';

describe('petsciiOverlayReducer', () => {
  it('starts hidden', () => {
    expect(initialPetsciiOverlayState).toEqual({ visible: false, drained: true });
  });

  it('bytes-arrived shows the overlay and marks it not-yet-drained', () => {
    const state = petsciiOverlayReducer(initialPetsciiOverlayState, { type: 'bytes-arrived' });
    expect(state).toEqual({ visible: true, drained: false });
  });

  it('ansi-output arriving WHILE still draining does not dismiss the overlay (art not finished)', () => {
    const shown: PetsciiOverlayState = { visible: true, drained: false };
    const state = petsciiOverlayReducer(shown, { type: 'ansi-output' });
    expect(state.visible).toBe(true);
  });

  it('drain-complete then ansi-output dismisses the overlay (art finished, prompt arriving underneath)', () => {
    let state = petsciiOverlayReducer({ visible: true, drained: false }, { type: 'drain-complete' });
    expect(state).toEqual({ visible: true, drained: true });

    state = petsciiOverlayReducer(state, { type: 'ansi-output' });
    expect(state).toEqual({ visible: false, drained: true });
  });

  it('any keypress dismisses the overlay even mid-drain ("press a key to continue" skips ahead)', () => {
    const shown: PetsciiOverlayState = { visible: true, drained: false };
    const state = petsciiOverlayReducer(shown, { type: 'keypress' });
    expect(state).toEqual({ visible: false, drained: true });
  });

  it('ansi-output while already hidden is a no-op', () => {
    const state = petsciiOverlayReducer(initialPetsciiOverlayState, { type: 'ansi-output' });
    expect(state).toBe(initialPetsciiOverlayState);
  });

  it('keypress while already hidden is a no-op', () => {
    const state = petsciiOverlayReducer(initialPetsciiOverlayState, { type: 'keypress' });
    expect(state).toBe(initialPetsciiOverlayState);
  });

  it('drain-complete while hidden is a no-op', () => {
    const state = petsciiOverlayReducer(initialPetsciiOverlayState, { type: 'drain-complete' });
    expect(state).toBe(initialPetsciiOverlayState);
  });

  it('a second bytes-arrived while the overlay is already up (queued next screen) resets drained', () => {
    const drained: PetsciiOverlayState = { visible: true, drained: true };
    const state = petsciiOverlayReducer(drained, { type: 'bytes-arrived' });
    expect(state).toEqual({ visible: true, drained: false });
  });

  it('full sequence: bytes-arrived -> drain-complete -> keypress dismisses before any ansi-output shows up', () => {
    let state = initialPetsciiOverlayState;
    state = petsciiOverlayReducer(state, { type: 'bytes-arrived' });
    expect(state.visible).toBe(true);
    state = petsciiOverlayReducer(state, { type: 'drain-complete' });
    expect(state.visible).toBe(true);
    state = petsciiOverlayReducer(state, { type: 'keypress' });
    expect(state).toEqual({ visible: false, drained: true });
  });
});

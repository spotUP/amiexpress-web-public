/**
 * THE NON-NEGOTIABLE on the web side: only a PETSCII event can turn the
 * canvas on. The reducer has no ansi-output/keypress/drain cases at all -
 * this pins that an unknown event leaves the xterm surface alone.
 */
import { petsciiSurfaceReducer, initialPetsciiSurface } from '../../../../packages/terminal/src/petscii/surface-state';

describe('petsciiSurfaceReducer', () => {
  it('starts on xterm', () => expect(initialPetsciiSurface).toBe('xterm'));
  it('a PETSCII session start selects the canvas and stays there', () => {
    const s = petsciiSurfaceReducer('xterm', { type: 'petscii-session-start' });
    expect(s).toBe('canvas');
    expect(petsciiSurfaceReducer(s, { type: 'petscii-session-start' })).toBe('canvas');
  });
  it('a session reset returns to xterm', () => {
    expect(petsciiSurfaceReducer('canvas', { type: 'session-reset' })).toBe('xterm');
  });
  it('nothing else moves the surface (ansi-output, keypress, drain are not events here)', () => {
    for (const type of ['ansi-output', 'keypress', 'drain-complete', 'bytes-arrived']) {
      expect(petsciiSurfaceReducer('xterm', { type } as any)).toBe('xterm');
    }
  });
});

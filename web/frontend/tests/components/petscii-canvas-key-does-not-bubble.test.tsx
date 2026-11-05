/**
 * ONE PRESS, ONE DELIVERY - ON A CANVAS TOO.
 *
 * `BBSTerminal` keeps a window-level keydown listener for game mode. On an
 * xterm session it never sees a typed key, because xterm consumes the event
 * before it bubbles. A canvas does not consume anything, so with a hybrid
 * door in game mode one press went to the server TWICE: once through this
 * canvas's `onData` and the shared input path, and once again at the window.
 * The sysop typed `test` into LiveChat on a PETSCII session and read
 * `tteesstt` (2026-09-22); the board's trace named both deliveries
 * `route=key-down`.
 *
 * Imported from source so a stale packages/terminal dist cannot make this
 * pass.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

vi.mock('../../../../packages/terminal/src/petscii/glyph-atlas', async (orig) => ({
  ...(await orig<object>()),
  buildGlyphAtlas: () => new Promise(() => {}),
}));

afterEach(cleanup);

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { load: () => Promise.resolve([]) },
});

describe('a key the PETSCII canvas has taken', () => {
  it('reaches onData once and never reaches a window listener', () => {
    const bytes: number[][] = [];
    const atWindow: string[] = [];
    const listener = (event: KeyboardEvent) => atWindow.push(event.key);
    window.addEventListener('keydown', listener);

    try {
      const { container } = render(
        <PetsciiCanvas machine={new PetsciiMachine()} focusable focusOnMount onData={(b) => bytes.push([...b])} />,
      );
      const canvas = container.querySelector('canvas')!;
      fireEvent.keyDown(canvas, { key: 'a', code: 'KeyA' });

      expect(bytes.length).toBe(1);
      expect(atWindow).toEqual([]);
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });

  it('lets a key it does NOT take through, so browser chords still work', () => {
    const bytes: number[][] = [];
    const atWindow: string[] = [];
    const listener = (event: KeyboardEvent) => atWindow.push(event.key);
    window.addEventListener('keydown', listener);

    try {
      const { container } = render(
        <PetsciiCanvas machine={new PetsciiMachine()} focusable focusOnMount onData={(b) => bytes.push([...b])} />,
      );
      const canvas = container.querySelector('canvas')!;
      // A Cmd chord is the browser's, not the board's - see handleKeyDown.
      fireEvent.keyDown(canvas, { key: 'r', code: 'KeyR', metaKey: true });

      expect(bytes).toEqual([]);
      expect(atWindow).toEqual(['r']);
    } finally {
      window.removeEventListener('keydown', listener);
    }
  });
});

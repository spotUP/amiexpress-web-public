/**
 * "There is a blue border around the canvas" (2026-09-02).
 *
 * The full-canvas PETSCII session makes the <canvas> the keyboard focus
 * owner (tabIndex 0 + focus()). A focused element gets the browser's
 * default :focus-visible outline, which Chrome paints blue - so the C64
 * screen grew a border the machine never set (its border colour is 0).
 * The canvas must opt out of the ring; the blinking cursor is the focus
 * indicator. Imported from source so a stale packages/terminal dist
 * cannot make this pass.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

// jsdom has no 2D canvas context; the atlas build would reject. Never resolve
// it - this test is about the element, not the paint.
vi.mock('../../../../../packages/terminal/src/petscii/glyph-atlas', async (orig) => ({
  ...(await orig<object>()),
  buildGlyphAtlas: () => new Promise(() => {}),
}));

afterEach(cleanup);

// jsdom has no CSS Font Loading API; the glyph atlas awaits document.fonts.load.
Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { load: () => Promise.resolve([]) },
});

describe('PetsciiCanvas focus ring', () => {
  it('suppresses the browser focus outline on the focused canvas', () => {
    const { container } = render(
      <PetsciiCanvas machine={new PetsciiMachine()} focusable focusOnMount />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(document.activeElement).toBe(canvas);
    expect(canvas!.style.outline).toBe('none');
  });
});

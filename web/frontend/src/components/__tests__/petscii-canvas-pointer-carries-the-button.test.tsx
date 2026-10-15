/**
 * The canvas is the only thing that knows WHICH button was pressed and what
 * was held with it. Before mouse input reached doors its one consumer was
 * the selection rectangle, which has no button, so the pointer carried
 * neither - and a door cannot tell a right-click from a left one without it.
 *
 * Imported from source so a stale packages/terminal dist cannot make this
 * pass.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { PetsciiCanvas } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import type { PetsciiCellPointer } from '../../../../../packages/terminal/src/petscii/PetsciiCanvas';
import { PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';

vi.mock('../../../../../packages/terminal/src/petscii/glyph-atlas', async (orig) => ({
  ...(await orig<object>()),
  buildGlyphAtlas: () => new Promise(() => {}),
}));

afterEach(cleanup);

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { load: () => Promise.resolve([]) },
});

function canvasWithPointer(): { canvas: HTMLCanvasElement; seen: PetsciiCellPointer[] } {
  const seen: PetsciiCellPointer[] = [];
  const { container } = render(
    <PetsciiCanvas machine={new PetsciiMachine()} onCellPointer={(p) => seen.push(p)} />,
  );
  const canvas = container.querySelector('canvas')!;
  // jsdom gives every element a zero-sized rect; the canvas maps a point to a
  // cell from its own geometry, so put the pointer at its origin.
  canvas.getBoundingClientRect = () => ({
    x: 0, y: 0, top: 0, left: 0, right: 352, bottom: 232, width: 352, height: 232,
    toJSON: () => ({}),
  }) as DOMRect;
  return { canvas, seen };
}

describe('a pointer report from the C64 canvas', () => {
  it('carries the button and the modifiers', () => {
    const { canvas, seen } = canvasWithPointer();

    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 40, buttons: 2, button: 2, ctrlKey: true });

    expect(seen.length).toBe(1);
    expect(seen[0].type).toBe('down');
    expect(seen[0].button).toBe(2);
    expect(seen[0].ctrl).toBe(true);
    expect(seen[0].shift).toBe(false);
  });

  it('reports the wheel, with how far it turned', () => {
    const { canvas, seen } = canvasWithPointer();

    fireEvent.wheel(canvas, { clientX: 40, clientY: 40, deltaY: -120 });

    expect(seen.length).toBe(1);
    expect(seen[0].type).toBe('wheel');
    expect(seen[0].deltaY).toBe(-120);
  });
});

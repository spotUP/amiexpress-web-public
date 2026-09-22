/**
 * "a gap in the web terminal is mouse input" (the sysop, 2026-09-22).
 *
 * On an eighty-column session xterm reports the mouse and every door that
 * asked for it is clickable. On a PETSCII session the pointer drove the
 * selection rectangle and the clipboard and nothing else, so the same doors
 * were dead on the C64 screen.
 *
 * The board already had the door half - `mouseEventsEnabled` gates the
 * `mouse-*` handlers and blessed's `parseJsonMouseEvent` turns them into
 * real mouse events - so what this pins is the decision the canvas makes:
 * whose pointer it is, and which report it becomes.
 */
import { describe, it, expect } from 'vitest';
import {
  mouseReportFor,
  pointerBelongsToDoor,
} from '../../../../packages/terminal/src/petscii/petscii-mouse';
import type { PetsciiCellPointer } from '../../../../packages/terminal/src/petscii/PetsciiCanvas';

const pointer = (over: Partial<PetsciiCellPointer> = {}): PetsciiCellPointer => ({
  type: 'down', x: 4, y: 7, buttons: 1, button: 0,
  shift: false, ctrl: false, alt: false,
  ...over,
});

describe('a pointer over the C64 screen', () => {
  it('belongs to the door while one is up', () => {
    expect(pointerBelongsToDoor(pointer(), true)).toBe(true);
  });

  it('belongs to the caller when he holds shift - that is how he selects', () => {
    expect(pointerBelongsToDoor(pointer({ shift: true }), true)).toBe(false);
    expect(mouseReportFor(pointer({ shift: true }), true)).toBeNull();
  });

  it('belongs to the caller when no door is listening', () => {
    expect(pointerBelongsToDoor(pointer(), false)).toBe(false);
    expect(mouseReportFor(pointer(), false)).toBeNull();
  });
});

describe('the report a door receives', () => {
  it('a press is a click, at the cell it was over', () => {
    expect(mouseReportFor(pointer(), true)).toEqual({
      event: 'mouse-click',
      payload: { x: 4, y: 7, button: 0, shift: false, ctrl: false, alt: false },
    });
  });

  it('a release is a mouse-up, which the board never throttles', () => {
    expect(mouseReportFor(pointer({ type: 'up', buttons: 0 }), true)?.event).toBe('mouse-up');
  });

  it('a move with a button held is a drag; with none it is a hover', () => {
    expect(mouseReportFor(pointer({ type: 'move', buttons: 1 }), true)?.event).toBe('mouse-drag');
    expect(mouseReportFor(pointer({ type: 'move', buttons: 0 }), true)?.event).toBe('mouse-hover');
  });

  it('the wheel carries how far it turned, which is how blessed tells up from down', () => {
    const up = mouseReportFor(pointer({ type: 'wheel', buttons: 0, deltaY: -120 }), true);
    expect(up?.event).toBe('mouse-wheel');
    expect(up?.payload.deltaY).toBe(-120);
  });

  it('carries the right button and the modifiers a door reads', () => {
    const right = mouseReportFor(pointer({ button: 2, ctrl: true }), true);
    expect(right?.payload.button).toBe(2);
    expect(right?.payload.ctrl).toBe(true);
  });
});

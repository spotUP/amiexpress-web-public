/**
 * WHAT A POINTER OVER THE C64 SCREEN MEANS.
 *
 * On an eighty-column session xterm reports the mouse and every door that
 * asked for it is clickable: LiveChat's menu bar, its context menus,
 * DOORMAN's rows. On a PETSCII session the pointer drove the selection
 * rectangle and the clipboard and NOTHING else - `onCellPointer` had no
 * other consumer - so the same doors were dead on the C64 screen (the sysop,
 * 2026-09-22: "a gap in the web terminal is mouse input").
 *
 * The board already has the door half: `session.mouseEventsEnabled` gates
 * the `mouse-*` socket handlers, and blessed's program parses those JSON
 * payloads into real mouse events (`parseJsonMouseEvent`). What was missing
 * is anything sending them from a canvas.
 *
 * SELECTION AND CLICKING BOTH WANT THE DRAG, so the rule is xterm's: while a
 * door is listening the pointer belongs to the DOOR, and SHIFT is how the
 * caller takes it back to select and copy. With no door, a drag selects as
 * it always has.
 *
 * Pure, so the decision is a test rather than a walk through a browser.
 */
import type { PetsciiCellPointer } from './PetsciiCanvas';

/** The socket event and payload for one pointer report. */
export interface MouseReport {
  event: 'mouse-click' | 'mouse-drag' | 'mouse-hover' | 'mouse-up' | 'mouse-wheel';
  payload: {
    x: number;
    y: number;
    button: number;
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    deltaY?: number;
  };
}

/** Whether this pointer is the door's, or the caller's own selection. */
export function pointerBelongsToDoor(pointer: PetsciiCellPointer, doorActive: boolean): boolean {
  if (!doorActive) return false;
  // Shift is the caller taking the pointer back to select and copy.
  return !pointer.shift;
}

/**
 * The report to send, or null when this pointer is not the door's.
 *
 * A move with no button held is a HOVER - blessed uses it for highlight and
 * for menu tracking - and a move with one held is a DRAG.
 */
export function mouseReportFor(pointer: PetsciiCellPointer, doorActive: boolean): MouseReport | null {
  if (!pointerBelongsToDoor(pointer, doorActive)) return null;

  const payload = {
    x: pointer.x,
    y: pointer.y,
    button: pointer.button,
    shift: pointer.shift,
    ctrl: pointer.ctrl,
    alt: pointer.alt,
  };

  switch (pointer.type) {
    case 'down':
      return { event: 'mouse-click', payload };
    case 'up':
      return { event: 'mouse-up', payload };
    case 'move':
      return {
        event: (pointer.buttons & 0x7) !== 0 ? 'mouse-drag' : 'mouse-hover',
        payload,
      };
    case 'wheel':
      return { event: 'mouse-wheel', payload: { ...payload, deltaY: pointer.deltaY ?? 0 } };
    default:
      return null;
  }
}

/**
 * Dragging in TEXT mode selects a block.
 *
 * Sysop, 2026-09-15, testing the text tool: "i cant select with the mouse
 * either in text mode that would be nice". Draw mode has had the select
 * tool's rectangle for ever; text mode's whole mouse was a click that moved
 * the cursor, so there was no way to lift part of a screen you were typing on.
 *
 * It is a RECTANGLE rather than a run of text that wraps at the line end,
 * because this is an art editor: what you want out of a screen is a box of
 * it. That is also why it needs no clipboard of its own - the text branch
 * fills the SAME cell clipboard draw mode uses, so a block lifted while
 * typing can be pasted while drawing.
 *
 * These drive the widget's real mouse handler, because the bug being
 * prevented is "the handler is never reached": the events carry the actions
 * blessed emits (mousedown / mousemove with a button / mouseup).
 */

import { describe, it, expect } from '@jest/globals';
import { Screen, ANSIEditor } from '../engines/ui/blessed';

function editorWithText(lines: string[]): { screen: any; editor: any } {
  const screen = new Screen({ smartCSR: true } as any);
  const editor: any = new ANSIEditor({
    parent: screen, width: 60, height: 20, initialMode: 'text',
    showLineNumbers: false, initialContent: lines.join('\n'),
  } as any);
  return { screen, editor };
}

/** One blessed mouse event at a viewport cell. */
function mouse(editor: any, action: string, col: number, line: number, button = 'left') {
  editor.viewport.emit('mouse', {
    action,
    button: action === 'mousemove' ? button : button,
    x: editor.viewport.aleft + col,
    y: editor.viewport.atop + line,
  });
}

function drag(editor: any, from: [number, number], to: [number, number]) {
  mouse(editor, 'mousedown', from[0], from[1]);
  mouse(editor, 'mousemove', to[0], to[1]);
  mouse(editor, 'mouseup', to[0], to[1]);
}

describe('a mouse drag in text mode', () => {
  it('selects the rectangle it was dragged over', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD', 'SECOND LINE']);

    drag(editor, [2, 0], [5, 1]);

    expect(editor.textSelectionBounds()).toEqual({ l1: 0, l2: 1, c1: 2, c2: 5 });
    screen.destroy();
  });

  it('normalises a drag made up and to the left', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD', 'SECOND LINE']);

    drag(editor, [5, 1], [2, 0]);

    expect(editor.textSelectionBounds()).toEqual({ l1: 0, l2: 1, c1: 2, c2: 5 });
    screen.destroy();
  });

  it('treats a press and release in one cell as a click, not a selection', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD']);

    drag(editor, [3, 0], [3, 0]);

    // Left set, the next Copy would silently take one character instead of
    // the whole canvas.
    expect(editor.textSelectionBounds()).toBeNull();
    screen.destroy();
  });

  it('does not extend the selection when the button is not held', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD']);

    mouse(editor, 'mousedown', 1, 0);
    editor.viewport.emit('mouse', {
      action: 'mousemove', button: undefined,
      x: editor.viewport.aleft + 9, y: editor.viewport.atop,
    });

    expect(editor.textSelectionBounds()).toEqual({ l1: 0, l2: 0, c1: 1, c2: 1 });
    screen.destroy();
  });

  it('ignores the wheel, which is scrolling and not pointing', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD']);

    drag(editor, [1, 0], [4, 0]);
    mouse(editor, 'wheeldown', 8, 0);

    expect(editor.textSelectionBounds()).toEqual({ l1: 0, l2: 0, c1: 1, c2: 4 });
    screen.destroy();
  });
});

describe('what the selection is for', () => {
  it('copies the block into the same clipboard draw mode uses', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD', 'SECOND LINE']);

    drag(editor, [0, 0], [4, 0]);
    editor.copySelection();

    expect(editor.clipboard).toHaveLength(1);
    expect(editor.clipboard[0].map((c: any) => c.char).join('')).toBe('HELLO');
    screen.destroy();
  });

  it('cut takes the characters out of the text as well', () => {
    const { screen, editor } = editorWithText(['HELLO WORLD']);

    drag(editor, [0, 0], [4, 0]);
    editor.cutSelection();

    expect(editor.clipboard[0].map((c: any) => c.char).join('')).toBe('HELLO');
    expect(editor.lines[0]).toBe('      WORLD');
    expect(editor.textSelectionBounds()).toBeNull();
    screen.destroy();
  });

  it('copies every line of a multi-line block, padding short ones', () => {
    const { screen, editor } = editorWithText(['ABCDEFGH', 'IJ']);

    drag(editor, [1, 0], [4, 1]);
    editor.copySelection();

    expect(editor.clipboard.map((row: any) => row.map((c: any) => c.char).join('')))
      .toEqual(['BCDE', 'J   ']);
    screen.destroy();
  });

  it('is dropped by ESC before ESC means leaving the editor', () => {
    let exited = false;
    const { screen, editor } = editorWithText(['HELLO WORLD']);
    editor.onExitCallback = () => { exited = true; };

    drag(editor, [0, 0], [4, 0]);
    // This blessed's el.key(name, fn) subscribes to `keypress <name>`
    // (core/element.ts:2173), not a bare 'keypress' and not 'key escape'.
    // Emitting either of those tests nothing at all.
    editor.viewport.emit('keypress escape', '\x1b', { name: 'escape' });

    expect(editor.textSelectionBounds()).toBeNull();
    expect(exited).toBe(false);
    screen.destroy();
  });
});

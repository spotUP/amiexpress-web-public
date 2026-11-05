/**
 * ANSI editor shortcuts, after Moebius (hlotvonen/moebiusXBIN,
 * app/document/input/keyboard.js): undo/redo, digit colours, tool keys,
 * cursor motion. Pure decision table; the component executes.
 */
import { describe, expect, it } from 'vitest';
import { editorShortcut } from '../../src/components/editor-shortcuts';

describe('editorShortcut', () => {
  it('undoes and redoes', () => {
    expect(editorShortcut({ key: 'z', ctrlKey: true })).toEqual({ action: 'undo' });
    expect(editorShortcut({ key: 'Z', ctrlKey: true, shiftKey: true })).toEqual({ action: 'redo' });
    expect(editorShortcut({ key: 'y', ctrlKey: true })).toEqual({ action: 'redo' });
    expect(editorShortcut({ key: 'z', metaKey: true })).toEqual({ action: 'undo' });
  });
  it('maps digits to palette slots', () => {
    expect(editorShortcut({ key: '3', code: 'Digit3', ctrlKey: true })).toEqual({ action: 'fg', index: 3 });
    expect(editorShortcut({ key: '5', code: 'Digit5', altKey: true })).toEqual({ action: 'bg', index: 5 });
    expect(editorShortcut({ key: '#', code: 'Digit3', altKey: true, shiftKey: true })).toEqual({ action: 'bg', index: 3 });
  });
  it('maps Alt+letter to every tool, Shift for fills', () => {
    expect(editorShortcut({ key: 'd', code: 'KeyD', altKey: true })).toEqual({ action: 'tool', tool: 'draw' });
    expect(editorShortcut({ key: 's', code: 'KeyS', altKey: true })).toEqual({ action: 'tool', tool: 'select' });
    expect(editorShortcut({ key: 't', code: 'KeyT', altKey: true })).toEqual({ action: 'tool', tool: 'text' });
    expect(editorShortcut({ key: 'B', code: 'KeyB', altKey: true, shiftKey: true })).toEqual({ action: 'tool', tool: 'box-fill' });
    expect(editorShortcut({ key: 'E', code: 'KeyE', altKey: true, shiftKey: true })).toEqual({ action: 'tool', tool: 'ellipse-fill' });
  });
  it('moves the cursor everywhere, deletes forward', () => {
    expect(editorShortcut({ key: 'ArrowLeft' })).toEqual({ action: 'move', dx: -1, dy: 0 });
    expect(editorShortcut({ key: 'Home' })).toEqual({ action: 'row', edge: 'start' });
    expect(editorShortcut({ key: 'End' })).toEqual({ action: 'row', edge: 'end' });
    expect(editorShortcut({ key: 'PageUp' })).toEqual({ action: 'page', dy: -10 });
    expect(editorShortcut({ key: 'PageDown' })).toEqual({ action: 'page', dy: 10 });
    expect(editorShortcut({ key: 'Delete' })).toEqual({ action: 'delete' });
  });
  it('leaves typing, IME and browser-owned keys alone', () => {
    expect(editorShortcut({ key: 'a' })).toEqual({ action: 'none' });
    expect(editorShortcut({ key: 'Enter' })).toEqual({ action: 'none' });
    expect(editorShortcut({ key: 'F5' })).toEqual({ action: 'none' });
    expect(editorShortcut({ key: 'q', ctrlKey: true })).toEqual({ action: 'none' });
  });
});

describe('what the artists asked for', () => {
  it('toggles insert mode on the Insert key', () => {
    expect(editorShortcut({ key: 'Insert' })).toEqual({ action: 'insert-mode' });
  });

  it('centres the row on Alt+Shift+C, and still copies on Alt+C', () => {
    expect(editorShortcut({ key: 'C', code: 'KeyC', altKey: true, shiftKey: true }))
      .toEqual({ action: 'centre-line' });
    expect(editorShortcut({ key: 'c', code: 'KeyC', altKey: true }))
      .toEqual({ action: 'copy' });
  });

  it('leaves Insert alone when a modifier is held', () => {
    expect(editorShortcut({ key: 'Insert', ctrlKey: true })).toEqual({ action: 'none' });
  });
});

/**
 * Ctrl+K takes a line out, Ctrl+Shift+K puts one in.
 *
 * The sysop's own choice: "we need the standard shortcuts for adding and
 * removing lines ctrl+k to remove but i dont remember which one is used to
 * add" (2026-09-14).
 *
 * The pairing is Shift on the SAME key rather than the DOS-era one. TheDraw
 * and its descendants inserted with Ctrl+N, and a browser keeps Ctrl+N for a
 * new window - a shortcut the page never receives is worse than an unfamiliar
 * one.
 *
 * Recorded conflict: the board's own door-side editor binds Ctrl+K to "delete
 * to end of line" and Ctrl+D to "delete line"
 * (sdk/engines/ui/ansi-editor/input/keyboard-handler.ts:260-268). The two
 * editors disagree about Ctrl+K, deliberately and on the sysop's word.
 */
describe('the line shortcuts', () => {
  it('removes the cursor line on Ctrl+K', () => {
    expect(editorShortcut({ key: 'k', ctrlKey: true })).toEqual({ action: 'remove-line' });
  });

  it('inserts a line on Ctrl+Shift+K', () => {
    expect(editorShortcut({ key: 'k', ctrlKey: true, shiftKey: true }))
      .toEqual({ action: 'insert-line' });
  });

  it('answers the same for Cmd on a Mac', () => {
    expect(editorShortcut({ key: 'k', metaKey: true })).toEqual({ action: 'remove-line' });
  });

  it('leaves a bare K to the artist', () => {
    // K is a character to draw with, and the editor must not eat it.
    expect(editorShortcut({ key: 'k' })).not.toEqual({ action: 'remove-line' });
  });

  it('does not fire with Alt held', () => {
    // Alt is the tool prefix here; Alt+K is not a line command.
    expect(editorShortcut({ key: 'k', ctrlKey: true, altKey: true }))
      .not.toEqual({ action: 'remove-line' });
  });
});

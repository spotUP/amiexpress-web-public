/**
 * The shortcuts have to be pressable on the keyboard the sysop draws with.
 *
 * "this help text is chaotic and hard to read ... i dont even have all the
 * buttons on my mac m1 laptop keyboard" (2026-09-14). An M1 laptop has no
 * Insert, no Home, no End, no PageUp and no PageDown. Five of the editor's
 * shortcuts were therefore unreachable for him, and the help listed them
 * anyway, in one six-line paragraph.
 */
import { describe, expect, it } from 'vitest';
import { editorShortcut } from '../src/components/editor-shortcuts';
import { editorHelp } from '../src/components/editor-help';

const alt = (code: string) => editorShortcut({ key: '', code, altKey: true });

describe('the keys an M1 laptop does not have', () => {
  it('reaches the row ends without Home or End', () => {
    expect(alt('ArrowLeft')).toEqual({ action: 'row', edge: 'start' });
    expect(alt('ArrowRight')).toEqual({ action: 'row', edge: 'end' });
  });

  it('pages without PageUp or PageDown', () => {
    expect(alt('ArrowUp')).toEqual({ action: 'page', dy: -10 });
    expect(alt('ArrowDown')).toEqual({ action: 'page', dy: 10 });
  });

  it('toggles insert mode without an Insert key', () => {
    expect(alt('KeyI')).toEqual({ action: 'insert-mode' });
  });

  it('leaves the full-keyboard versions working', () => {
    // This ADDS a way in; it takes none away.
    expect(editorShortcut({ key: 'Home' })).toEqual({ action: 'row', edge: 'start' });
    expect(editorShortcut({ key: 'PageDown' })).toEqual({ action: 'page', dy: 10 });
    expect(editorShortcut({ key: 'Insert' })).toEqual({ action: 'insert-mode' });
  });

  it('does not break the plain arrows', () => {
    expect(editorShortcut({ key: 'ArrowLeft' })).toEqual({ action: 'move', dx: -1, dy: 0 });
  });
});

describe('the help a person reads', () => {
  it('names no key a Mac laptop lacks', () => {
    const text = editorHelp(true).flatMap(g => g.rows.map(r => r.keys)).join(' ');

    for (const absent of ['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Backspace']) {
      expect(text, `${absent} is not on an M1 keyboard`).not.toContain(absent);
    }
  });

  it('still offers them to a keyboard that has them', () => {
    const text = editorHelp(false).flatMap(g => g.rows.map(r => r.keys)).join(' ');

    expect(text).toContain('Home');
    expect(text).toContain('PageUp');
    expect(text).toContain('Insert');
  });

  it('says Cmd on a Mac and Ctrl everywhere else', () => {
    const mac = editorHelp(true).flatMap(g => g.rows.map(r => r.keys)).join(' ');
    const pc = editorHelp(false).flatMap(g => g.rows.map(r => r.keys)).join(' ');

    expect(mac).toContain('Cmd+Z');
    expect(pc).toContain('Ctrl+Z');
  });

  it('groups them by what the artist is doing, not by when they were written', () => {
    const titles = editorHelp(true).map(g => g.title);

    expect(titles).toEqual(['Tools', 'Colours', 'Moving the cursor', 'Editing', 'Copy and paste']);
    // Every group carries something, or it is a heading over nothing.
    for (const group of editorHelp(true)) expect(group.rows.length).toBeGreaterThan(0);
  });

  it('describes every shortcut in words, not just as a key', () => {
    for (const group of editorHelp(true)) {
      for (const row of group.rows) {
        expect(row.what.length).toBeGreaterThan(3);
        expect(row.keys.length).toBeGreaterThan(0);
      }
    }
  });
});

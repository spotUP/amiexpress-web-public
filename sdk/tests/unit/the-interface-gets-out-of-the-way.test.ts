/**
 * HIDING THE INTERFACE, IN BOTH EDITORS.
 *
 * "all ui should be hideable" (the sysop, 2026-09-23), asking for the PETSCII
 * studio and the ANSI editor door to behave the same way.
 *
 * The ANSI editor already had `toggleUI` on F2, and one thing wrong with it,
 * which this file pins: it was bound to the VIEWPORT only, which is text
 * mode. A caller in DRAW mode - the one who wants the screen to himself -
 * pressed F2 and nothing happened at all.
 * The PETSCII editor takes the same option name and the same default key, so
 * one door hosting both sets one key.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';
import { PetsciiEditor } from '../../engines/ui/blessed/widgets/petscii-editor';

function screenAt(width: number, height: number): any {
  return new Screen({ width, height, output: () => {} } as any);
}

describe('the ANSI editor', () => {
  let screen: any;

  afterEach(() => { try { screen?.destroy(); } catch { /* leaving anyway */ } });

  it('hides every part of the interface on the hide key', () => {
    screen = screenAt(80, 24);
    const editor: any = new ANSIEditor({
      parent: screen, top: 0, left: 0, width: 80, height: 24,
      showMenuBar: true, showToolbar: true, showSidebar: true, showStatusBar: true,
    } as any);

    (editor as any).toggleUI();

    for (const part of ['menuBar', 'fkeyToolbar', 'sidebar', 'statusBar']) {
      expect((editor as any)[part]?.hidden).toBe(true);
    }
  });

  it('answers the hide key in DRAW mode, not only in text mode', () => {
    screen = screenAt(80, 24);
    const editor: any = new ANSIEditor({
      parent: screen, top: 0, left: 0, width: 80, height: 24,
      showMenuBar: true, showToolbar: true, showSidebar: true, showStatusBar: true,
      initialMode: 'draw',
    } as any);

    // The canvas is what has the focus while drawing; the key has to be bound
    // there too, which is what was missing.
    editor.drawCanvas.emit('keypress f2', undefined, { name: 'f2' });

    expect(editor.menuBar?.hidden).toBe(true);
  });

  it('brings it all back on the same key', () => {
    screen = screenAt(80, 24);
    const editor: any = new ANSIEditor({
      parent: screen, top: 0, left: 0, width: 80, height: 24,
      showMenuBar: true, showToolbar: true, showSidebar: true, showStatusBar: true,
    } as any);

    (editor as any).toggleUI();
    (editor as any).toggleUI();

    expect(editor.menuBar?.hidden).toBe(false);
    expect(editor.statusBar?.hidden).toBe(false);
  });
});

describe('the PETSCII editor', () => {
  let screen: any;

  afterEach(() => { try { screen?.destroy(); } catch { /* leaving anyway */ } });

  it('takes the same hide key, by the same option name', () => {
    screen = screenAt(80, 25);
    const editor: any = new PetsciiEditor({
      parent: screen, top: 0, left: 0, width: 80, height: 25,
      hideUIHotkey: 'f9',
    } as any);

    editor.emit('keypress', undefined, { name: 'f9' });

    expect(editor.chromeVisible('menuBar')).toBe(false);
  });

  it('defaults to F2, as the ANSI editor does', () => {
    screen = screenAt(80, 25);
    const editor: any = new PetsciiEditor({
      parent: screen, top: 0, left: 0, width: 80, height: 25,
    } as any);

    editor.emit('keypress', undefined, { name: 'f2' });

    expect(editor.chromeVisible('tools')).toBe(false);
  });
});

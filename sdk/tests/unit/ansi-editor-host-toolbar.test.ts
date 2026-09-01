/**
 * A host can put its own controls on a strip under the canvas.
 *
 * The sprite studio's playback, frame stepping, onion skin and zoom all
 * lived in menus, which is two clicks and a dropdown for something you do
 * on every frame. This is the same contribution idea as extraMenus: the
 * host says what the controls ARE, and the widget - the only thing that
 * knows where the canvas ended up after centring - decides where they go.
 *
 * Room is the whole test for whether it appears. A small sprite in a wide
 * terminal has a spare row under it; a full-screen document at 80x25 does
 * not, and there the strip stays away without anyone telling it about
 * terminal modes.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(width = 120, height = 40): any {
  return new Screen({ title: 'host-toolbar', responsive: true, width, height } as any);
}

/** The strip's segments, in bar order, as { text, left }. */
function segments(editor: any): Array<{ text: string; left: number }> {
  const bar = editor.extraToolbarBar;
  if (!bar) return [];
  return (bar.children as any[])
    .map(c => ({
      text: String(c.content ?? '').replace(/\{[^}]*\}/g, ''),
      left: c.position.left as number,
    }))
    .sort((a, b) => a.left - b.left);
}

describe('ANSIEditor host toolbar', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  it('creates no strip when the host supplies none', () => {
    const editor: any = new ANSIEditor({ parent: screen, canvasWidth: 8, canvasHeight: 4 } as any);
    expect(editor.extraToolbarBar).toBeUndefined();
  });

  it('puts the host segments on one row under the canvas', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: '>', action: () => {} }], [{ label: '1/4' }]],
    } as any);

    const bar = editor.extraToolbarBar;
    expect(bar).toBeDefined();
    expect(bar.hidden).toBe(false);
    expect(bar.position.top).toBe(
      (editor.drawCanvas.position.top as number) + (editor.drawCanvas.height as number),
    );
    expect(bar.position.left).toBe(editor.drawCanvas.position.left);
    expect(bar.height).toBe(1);
    expect(segments(editor).map(s => s.text)).toEqual(['>', ' | ', '1/4']);
  });

  it('separates groups and leaves one space inside a group', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 20, canvasHeight: 4,
      extraToolbar: [
        [{ label: '<<', action: () => {} }, { label: '>>', action: () => {} }],
        [{ label: 'ONION on', action: () => {} }],
      ],
    } as any);

    const seen = segments(editor);
    expect(seen.map(s => s.text)).toEqual(['<<', '>>', ' | ', 'ONION on']);
    expect(seen.map(s => s.left)).toEqual([0, 3, 5, 8]);
    expect(editor.extraToolbarBar.width).toBe(16);
  });

  it('runs a segment’s action when it is clicked', () => {
    let clicks = 0;
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: 'PLAY', action: () => { clicks++; } }]],
    } as any);

    const button = (editor.extraToolbarBar.children as any[])[0];
    button.emit('click', { x: 0, y: 0 });
    expect(clicks).toBe(1);
  });

  it('re-reads a function label on refresh, and nothing else', () => {
    let frame = 1;
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: () => `${frame}/12` }, { label: 'fixed' }]],
    } as any);

    expect(segments(editor).map(s => s.text)).toEqual(['1/12', 'fixed']);
    frame = 11;
    editor.refreshExtraToolbar();
    expect(segments(editor).map(s => s.text)).toEqual(['11/12', 'fixed']);
    // A wider readout moves what follows it, or the two would overlap.
    expect(segments(editor)[1].left).toBe(6);
  });

  it('stays away when the canvas leaves no room under it', () => {
    // 80x25 with a full-screen document: menu bar, F-keys, 25 rows of
    // canvas and a status bar already overflow, and there is no spare row.
    const small: any = makeScreen(80, 25);
    try {
      const editor: any = new ANSIEditor({
        parent: small,
        width: 80, height: 25,
        canvasWidth: 80, canvasHeight: 25,
        extraToolbar: [[{ label: '>', action: () => {} }]],
      } as any);
      expect(editor.extraToolbarBar).toBeUndefined();
    } finally { small.destroy(); }
  });

  it('goes away with the canvas in text mode and comes back in draw mode', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      initialMode: 'draw',
      extraToolbar: [[{ label: '>', action: () => {} }]],
    } as any);

    editor.toggleMode();
    expect(editor.extraToolbarBar.hidden).toBe(true);
    editor.toggleMode();
    expect(editor.extraToolbarBar.hidden).toBe(false);
  });

  it('follows the canvas when F2 hides the chrome and shows it again', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: '>', action: () => {} }]],
    } as any);

    editor.toggleUI();   // chrome off - the strip is chrome
    expect(editor.extraToolbarBar.hidden).toBe(true);

    editor.toggleUI();   // and back
    const bar = editor.extraToolbarBar;
    expect(bar.hidden).toBe(false);
    expect(bar.position.top).toBe(
      (editor.drawCanvas.position.top as number) + (editor.drawCanvas.height as number),
    );
  });
});

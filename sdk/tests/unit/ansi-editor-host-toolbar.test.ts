/**
 * A host can put its own controls on the right of the editor's footer.
 *
 * The sprite studio's playback, frame stepping, onion skin and zoom all
 * lived in menus, which is two clicks and a dropdown for something you do
 * on every frame. This is the same contribution idea as extraMenus: the
 * host says what the controls ARE, and the widget places them.
 *
 * They floated under the canvas for one commit. The sysop's verdict on the
 * screenshot - "this was an ugly toolbar, move it to the footer on the
 * right side instead" - is also the simpler design: the status bar is the
 * one row of chrome that is always there, so there is no room test, no
 * repositioning when the canvas moves, and nothing to hide when F2 takes
 * the chrome away.
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

/** The status bar's own text, tags stripped. */
function statusText(editor: any): string {
  return String(editor.statusBar.content ?? '').replace(/\{[^}]*\}/g, '');
}

describe('ANSIEditor host toolbar', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  it('creates no strip when the host supplies none', () => {
    const editor: any = new ANSIEditor({ parent: screen, canvasWidth: 8, canvasHeight: 4 } as any);
    expect(editor.extraToolbarBar).toBeUndefined();
  });

  it('puts the host segments on the right of the status bar', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: '>', action: () => {} }], [{ label: '1/4' }]],
    } as any);

    const bar = editor.extraToolbarBar;
    expect(bar).toBeDefined();
    expect(bar.parent).toBe(editor.statusBar);
    expect(bar.position.right).toBe(0);
    expect(bar.height).toBe(1);
    expect(segments(editor).map(s => s.text)).toEqual(['>', ' · ', '1/4']);
  });

  it('has no strip to put anywhere when the footer is switched off', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      showStatusBar: false,
      extraToolbar: [[{ label: '>', action: () => {} }]],
    } as any);
    expect(editor.extraToolbarBar).toBeUndefined();
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
    expect(seen.map(s => s.text)).toEqual(['<<', '>>', ' · ', 'ONION on']);
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

  it('leaves the status bar its own text when there is room for both', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: '>', action: () => {} }]],
    } as any);
    editor.brushMode = 'half-block';
    editor.updateStatusBar();

    const text = statusText(editor);
    expect(text).toContain('X:');
    expect(text).toContain('HLF');
    expect(text.length).toBeLessThanOrEqual(120 - editor.extraToolbarWidth - 1);
  });

  it('drops its own tail readouts rather than paint under the strip', () => {
    const small: any = makeScreen(80, 25);
    try {
      const editor: any = new ANSIEditor({
        parent: small,
        width: 80, height: 25,
        canvasWidth: 8, canvasHeight: 4,
        extraToolbar: [[
          { label: '|< << |> >> >|', action: () => {} },
          { label: '3/12 [+] [-] ONION on 2x' },
        ]],
      } as any);
      editor.brushMode = 'half-block';
      editor.iceColorsEnabled = true;
      editor.updateStatusBar();

      const text = statusText(editor);
      expect(text).toContain('X:');           // the head always survives
      expect(text).not.toContain('iCE');      // the tail is what goes
      expect(text.length).toBeLessThanOrEqual(80 - editor.extraToolbarWidth - 1);
    } finally { small.destroy(); }
  });

  it('goes away with the rest of the chrome when F2 hides it', () => {
    const editor: any = new ANSIEditor({
      parent: screen,
      canvasWidth: 8, canvasHeight: 4,
      extraToolbar: [[{ label: '>', action: () => {} }]],
    } as any);

    editor.toggleUI();
    expect(editor.statusBar.hidden).toBe(true);   // the strip lives inside it
    editor.toggleUI();
    expect(editor.statusBar.hidden).toBe(false);
    expect(editor.extraToolbarBar.parent).toBe(editor.statusBar);
  });
});

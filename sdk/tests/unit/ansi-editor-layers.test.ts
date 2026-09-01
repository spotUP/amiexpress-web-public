/**
 * A layer you cannot see is not a layer.
 *
 * Audited 2026-09-02 against "most entries seem dead in the file menu and
 * many other menus": every Layer action had a real body, and the whole menu
 * was still decoration, because nothing COMPOSITED the layers. Each layer
 * owned a canvas, the active one was what the tools painted, and the
 * renderer drew that one alone - so Add Layer, Toggle Visibility, Move Up
 * and Move Down changed state nobody could see.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeEditor(screen: any): any {
  return new ANSIEditor({ parent: screen, canvasWidth: 4, canvasHeight: 2 } as any);
}

/** The painted glyphs, tags stripped. syncCoreCanvasToDisplay is the
 *  repaint; updateDisplay only moves the cursor in draw mode. */
function painted(editor: any): string {
  editor.syncCoreCanvasToDisplay();
  return String(editor.drawCanvas.content ?? '').replace(/\{[^}]*\}/g, '');
}

describe('ANSIEditor layers', () => {
  let screen: any;
  beforeEach(() => { screen = new Screen({ title: 'layers', responsive: true, width: 60, height: 20 } as any); });
  afterEach(() => screen?.destroy());

  it('shows a lower layer through the gaps in the active one', () => {
    const editor = makeEditor(screen);
    editor.cellCanvas[0][0] = { char: 'B', fg: 7, bg: 0 };   // background layer
    editor.addLayer();                                        // new active layer
    editor.cellCanvas[0][1] = { char: 'T', fg: 7, bg: 0 };   // painted on top

    const out = painted(editor);
    expect(out).toContain('T');
    expect(out).toContain('B');
  });

  it('hides it again when the layer is switched off', () => {
    const editor = makeEditor(screen);
    editor.cellCanvas[0][0] = { char: 'B', fg: 7, bg: 0 };
    editor.addLayer();
    expect(painted(editor)).toContain('B');

    editor.toggleLayerVisibility(0);
    expect(painted(editor)).not.toContain('B');
  });

  it('lets the active layer cover what is under it', () => {
    const editor = makeEditor(screen);
    editor.cellCanvas[0][0] = { char: 'B', fg: 7, bg: 0 };
    editor.addLayer();
    editor.cellCanvas[0][0] = { char: 'T', fg: 7, bg: 0 };

    const out = painted(editor);
    expect(out).toContain('T');
    expect(out).not.toContain('B');
  });

  it('draws one layer exactly as it always did', () => {
    // The single-layer case is every existing host, and must not change.
    const editor = makeEditor(screen);
    editor.cellCanvas[0][0] = { char: 'X', fg: 7, bg: 0 };
    expect(painted(editor)).toContain('X');
    expect(editor.layers.length).toBe(1);
  });
});

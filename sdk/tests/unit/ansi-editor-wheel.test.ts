/**
 * The wheel over the canvas is an event, not a stroke.
 *
 * Asked for the sprite studio: "can we add support for scrollwheel for
 * zooming?" Zoom is the HOST's idea - the editor has no zoom UI, only the
 * scale it was built with - so the widget reports the wheel and the door
 * decides what it means.
 *
 * The other half matters as much: a wheel event must never paint. It
 * arrives on the same 'mouse' handler as a drag, and blessed reports it
 * with a button, so without a guard scrolling over your art would draw on
 * it.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({ title: 'wheel', responsive: true, width: 100, height: 40 } as any);
}

describe('ANSIEditor canvas wheel', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const make = (): any => new ANSIEditor({
    parent: screen, canvasWidth: 4, canvasHeight: 2,
    initialMode: 'draw', transparentBackground: true,
  } as any);

  // On the WIDGET, which is where a wheel turn is heard: the draw canvas is
  // only as big as the art now that it is centred, so scrolling over the
  // space around a 5x2 sprite never touches it.
  const wheel = (editor: any, action: 'wheelup' | 'wheeldown') => {
    editor.emit('mouse', {
      x: editor.drawCanvas.ileft + 1,
      y: editor.drawCanvas.itop + 1,
      action, button: 'left',
    });
  };

  it('reports a wheel up as an event the host can act on', () => {
    const editor = make();
    const seen: string[] = [];
    editor.on('canvas-wheel', (d: any) => seen.push(d.direction));
    wheel(editor, 'wheelup');
    expect(seen).toEqual(['up']);
  });

  it('reports a wheel down', () => {
    const editor = make();
    const seen: string[] = [];
    editor.on('canvas-wheel', (d: any) => seen.push(d.direction));
    wheel(editor, 'wheeldown');
    expect(seen).toEqual(['down']);
  });

  it('does NOT paint when the wheel turns', () => {
    const editor = make();
    editor.currentChar = '#';
    // Through the CANVAS handler too - that is the one that could paint.
    editor.drawCanvas.emit('mouse', {
      x: editor.drawCanvas.ileft + 1, y: editor.drawCanvas.itop + 1,
      action: 'wheelup', button: 'left',
    });
    wheel(editor, 'wheelup');
    wheel(editor, 'wheeldown');
    const canvas = editor.getCoreCanvas();
    for (const row of canvas) {
      for (const cell of row) {
        expect(cell.char).not.toBe('#');
      }
    }
  });

  it('does not move the drawing cursor either', () => {
    const editor = make();
    editor.cursor = { line: 0, col: 0 };
    editor.drawCanvas.emit('mouse', {
      x: editor.drawCanvas.ileft + 2, y: editor.drawCanvas.itop + 1,
      action: 'wheelup', button: 'left',
    });
    expect(editor.cursor).toEqual({ line: 0, col: 0 });
  });

  it('is heard over the space AROUND a small centred canvas', () => {
    const editor = make();
    const seen: string[] = [];
    editor.on('canvas-wheel', (d: any) => seen.push(d.direction));
    // Far outside the 4x2 canvas box, still inside the editor.
    editor.emit('mouse', { x: 70, y: 20, action: 'wheeldown', button: undefined });
    expect(seen).toEqual(['down']);
  });

  it('says where the pointer was, so a host could zoom about it', () => {
    const editor = make();
    let at: any = null;
    editor.on('canvas-wheel', (d: any) => { at = d; });
    wheel(editor, 'wheelup');
    expect(at.col).toBe(1);
    expect(at.line).toBe(1);
  });
});

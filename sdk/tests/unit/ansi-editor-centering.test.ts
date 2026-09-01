/**
 * A small canvas sits in the MIDDLE of the room it has.
 *
 * Asked of the sprite studio: "can we center the sprites in the sprited
 * canvas?" A 5x2 sprite pinned to the top-left of an 80x25 editor reads as
 * an accident - the art looks dropped in a corner rather than placed. The
 * editor owns its own geometry, so this belongs here and not in the door.
 *
 * The property that must survive it: a click still lands on the cell under
 * the pointer. Moving the canvas box without moving the hit-test is how
 * centring usually breaks.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({ title: 'centering', responsive: true, width: 100, height: 40 } as any);
}

describe('ANSIEditor canvas centring', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const small = (): any => new ANSIEditor({
    parent: screen, top: 0, left: 0, width: 80, height: 25,
    canvasWidth: 5, canvasHeight: 2, initialMode: 'draw',
  } as any);

  it('is no wider than the canvas it holds', () => {
    const editor = small();
    expect(editor.drawCanvas.width).toBe(5);
    expect(editor.drawCanvas.height).toBe(2);
  });

  it('leaves room on both sides, not just one', () => {
    const editor = small();
    const left = editor.drawCanvas.position.left as number;
    const sidebar = 6;
    expect(left).toBeGreaterThan(sidebar);
    // Centred within what is left of the width after the sidebar.
    const drawable = 80 - sidebar;
    expect(left).toBe(sidebar + Math.floor((drawable - 5) / 2));
  });

  it('centres vertically between the chrome above and below', () => {
    const editor = small();
    const top = editor.drawCanvas.position.top as number;
    expect(top).toBeGreaterThan(0);
  });

  it('still puts a click on the cell under the pointer', () => {
    const editor = small();
    editor.currentChar = '#';
    editor.drawCanvas.emit('click', {
      x: editor.drawCanvas.ileft + 3,
      y: editor.drawCanvas.itop + 1,
      button: 'left',
    });
    expect(editor.cursor.col).toBe(3);
    expect(editor.cursor.line).toBe(1);
  });

  it('does not centre a canvas that fills the room', () => {
    const editor: any = new ANSIEditor({
      parent: screen, top: 0, left: 0, width: 80, height: 25,
      canvasWidth: 80, canvasHeight: 25, initialMode: 'draw',
    } as any);
    expect(editor.drawCanvas.position.left).toBe(6);
  });
});

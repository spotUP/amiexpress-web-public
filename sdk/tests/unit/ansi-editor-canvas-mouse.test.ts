/**
 * The draw canvas asks THIS engine for the mouse, not blessed's.
 *
 * The widget was forked from blessed and kept blessed's call: on focus it
 * ran `program.setMouse({ allMotion: true }, true)`, and on blur the same
 * with `allMotion: false`. This engine's Program has no `setMouse` - it
 * never did - so the guard `if (this.screen && program)` passed and the
 * call threw `setMouse is not a function` every time the canvas took
 * focus. In doors, not only in tests: the sprite editor died opening a
 * sprite, and the SDK's own suite never touched focus so nothing said so.
 *
 * What the canvas actually wants is all-motion reporting, for drag-to-draw.
 * `enableMouse()` writes `?1003h`, which IS all motion, and is what Button
 * and RadioSet already call on themselves.
 *
 * Blur deliberately does nothing: blessed's `allMotion: false` drops to
 * button-only reporting and this Program has no such middle setting, so the
 * honest choice is to leave the screen's mouse alone rather than take it
 * away from every other widget.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';
import { Program } from '../../engines/ui/blessed/core/program';

function makeScreen(): any {
  return new Screen({ title: 'canvas-mouse', responsive: true, width: 100, height: 40 } as any);
}

describe('ANSIEditor draw canvas mouse', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const make = (): any => new ANSIEditor({
    parent: screen, canvasWidth: 4, canvasHeight: 2,
    initialMode: 'draw', transparentBackground: true,
  } as any);

  it('focuses without a listener throwing where nobody sees it', () => {
    // `expect(focus).not.toThrow()` would pass on the broken code: the
    // engine's emit() swallows a listener's error on purpose (events.ts:60)
    // so one bad door listener cannot take the door down, and reports it to
    // console.error instead. That is exactly why this bug survived - the
    // throw was never anywhere a caller or a test would look. So watch the
    // place it actually lands.
    const editor = make();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      editor.drawCanvas.focus();
      const swallowed = spy.mock.calls
        .map((args) => args.join(' '))
        .filter((line) => line.includes('threw'));
      expect(swallowed).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('turns on all-motion reporting when the canvas takes focus', () => {
    const editor = make();
    const program = (screen as any).program;
    program.disableMouse();
    expect(program._mouseEnabled).toBe(false);

    editor.drawCanvas.focus();

    // ?1003h is all-motion. Without it a drag reports nothing between
    // press and release, and drawing by dragging paints one cell.
    expect(program._mouseEnabled).toBe(true);
  });

  it('leaves the screen mouse alone when the canvas loses it', () => {
    const editor = make();
    const program = (screen as any).program;
    editor.drawCanvas.focus();
    expect(program._mouseEnabled).toBe(true);

    const other = new (require('../../engines/ui/blessed/widgets/box').Box)({
      parent: screen, top: 0, left: 0, width: 4, height: 1, focusable: true, clickable: true,
    } as any);
    other.focus();

    // The canvas blurred. Another widget still wants the mouse, and the
    // canvas must still be clickable for the caller to click back into it.
    expect(program._mouseEnabled).toBe(true);
    expect(editor.drawCanvas.clickable).toBe(true);
  });

  it('never reaches for setMouse, which this Program does not implement', () => {
    // The bug in one line: the fork's API is not this engine's API.
    expect((Program.prototype as any).setMouse).toBeUndefined();
    expect(typeof (Program.prototype as any).enableMouse).toBe('function');
  });
});

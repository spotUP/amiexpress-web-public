/**
 * You can see where the canvas ends.
 *
 * Sysop, 2026-09-15: "i need to see what is the canvas and whats outside the
 * canvas in the ansi editor, most usefull in responsive mode".
 *
 * `centredCanvasGeometry` centres the canvas in the room left over, so as
 * soon as the terminal is bigger than the art - which is what responsive mode
 * is for - the canvas floats in dead space. Both were black, so an 80x25
 * screen and the terminal around it were one undifferentiated field and an
 * artist drawing to the edge could not tell whether he had reached it.
 *
 * The surround is the theme's `dim`, and the property that makes that safe is
 * asserted here rather than trusted: EVERY theme has a black `ground` and a
 * `dim` that is not black, so the canvas is always the darker rectangle.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen, ANSIEditor } from '../engines/ui/blessed';
import { THEMES } from '../engines/ui/theme';

describe('the surround', () => {
  it('is a different colour from the canvas', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const editor: any = new ANSIEditor({
      parent: screen, width: 120, height: 40, canvasWidth: 80, canvasHeight: 25,
    } as any);

    expect(editor.style.bg).toBeDefined();
    expect(editor.style.bg).not.toBe('black');
    expect(editor.drawCanvas.style.bg).toBe('black');
    screen.destroy();
  });

  it('does not overrule a host that brought its own', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const editor: any = new ANSIEditor({
      parent: screen, width: 120, height: 40,
      style: { bg: 'magenta' },
    } as any);

    expect(editor.style.bg).toBe('magenta');
    screen.destroy();
  });

  // The whole scheme rests on this. A theme whose dim IS black would put the
  // editor back where it started, silently, for the people using that theme.
  it('works in every theme, because none of them dims to black', () => {
    for (const theme of THEMES) {
      expect(theme.tokens.ground).toBe('black');
      expect(theme.tokens.dim.toLowerCase()).not.toBe('black');
      expect(theme.tokens.dim.toLowerCase()).not.toBe('#000000');
    }
  });
});

describe('the canvas in a terminal bigger than it', () => {
  it('is centred, which is what leaves the dead space to mark', () => {
    const screen = new Screen({ smartCSR: true } as any);
    const editor: any = new ANSIEditor({
      parent: screen, width: 120, height: 40, canvasWidth: 80, canvasHeight: 25,
      showSidebar: false, showMenuBar: false, showToolbar: false, showStatusBar: false,
    } as any);

    // Room 120 wide, art 80 wide: 20 columns of surround on each side.
    expect(editor.drawCanvas.left).toBeGreaterThan(0);
    expect(editor.drawCanvas.width).toBe(80);
    screen.destroy();
  });
});

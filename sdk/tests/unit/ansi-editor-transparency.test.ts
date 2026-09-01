/**
 * ANSIEditor gains a real transparent-cell concept.
 *
 * Task 2 of the "ansi-editor sprite-capable" plan
 * (.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/). Before this
 * change, "nothing here" was only ever an implicit convention - a cell with
 * char===' ' and bg===0 - duplicated inline (bg-only) at composeLayers() and
 * mergeLayerDown(), while the unused core library isCellEmpty() used a
 * stricter (fg===7-requiring) test nothing actually called (see
 * thoughts/shared/research/2026-09-01_ansi-editor-internals.md section 6).
 * There was no way to mark a cell transparent independent of its char/fg/bg,
 * which the sprite/game-cell use case needs: a deliberately-drawn opaque
 * cell that happens to look like "nothing" must stay distinguishable from an
 * actually-empty cell.
 *
 * `isCellEmpty()` is now the ONE definition of empty, unifying both
 * call sites, extended with an explicit `transparent` flag on `Cell` that
 * overrides char/fg/bg entirely. The measurement group below captures
 * TODAY's actual compositing behavior for the one case the research doc
 * calls out as ambiguous - `{char:' ', fg:3, bg:0}` - BEFORE any source
 * change, and is asserted to hold after the change too: the bg-only half of
 * the unified test is deliberately kept looser than the old core library's
 * fg===7 requirement, because that requirement was never actually wired
 * into the widget's own compositing and switching to it here would be a
 * real behavior change (composited cells would suddenly start occluding
 * layers below them).
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';
import * as CoreCanvas from '../../engines/ui/ansi-editor/core/canvas';
import type { Cell } from '../../engines/ui/ansi-editor/types';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-transparency',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

const GUIDE_TOKEN = '{gray-fg}{black-bg}.{/black-bg}{/gray-fg}';
/** Today's (and the preserved) rendering of an untouched/erased {fg:7,bg:0} space. */
const OPAQUE_BLACK_SPACE_TOKEN = '{white-fg}{black-bg} {/black-bg}{/white-fg}';

describe('CoreCanvas.isCellEmpty - the one definition of empty', () => {
  it('null/undefined is empty', () => {
    expect(CoreCanvas.isCellEmpty(null)).toBe(true);
    expect(CoreCanvas.isCellEmpty(undefined)).toBe(true);
  });

  it('a plain erased space (char:" ", fg:7, bg:0, no transparent marker) is empty - unchanged from today', () => {
    const cell: Cell = { char: ' ', fg: 7, bg: 0, blink: false };
    expect(CoreCanvas.isCellEmpty(cell)).toBe(true);
  });

  it('the measured ambiguous case ({char:" ", fg:3, bg:0}) is empty - preserved from today\'s bg-only compositing convention', () => {
    const cell: Cell = { char: ' ', fg: 3, bg: 0, blink: false };
    expect(CoreCanvas.isCellEmpty(cell)).toBe(true);
  });

  it('a cell explicitly marked transparent:true is empty regardless of char/fg/bg', () => {
    const cell: Cell = { char: 'A', fg: 5, bg: 3, transparent: true };
    expect(CoreCanvas.isCellEmpty(cell)).toBe(true);
  });

  it('a deliberately-drawn opaque cell (non-space, non-empty bg) is NOT empty - the distinction the sprite codec depends on', () => {
    const cell: Cell = { char: 'A', fg: 5, bg: 3 };
    expect(CoreCanvas.isCellEmpty(cell)).toBe(false);
  });

  it('a deliberately-drawn solid black glyph is NOT empty, unlike a transparent cell that merely looks the same', () => {
    const opaqueBlack: Cell = { char: '█', fg: 0, bg: 0 }; // full block, black-on-black
    const transparentCell: Cell = { char: ' ', fg: 7, bg: 0, transparent: true };
    expect(CoreCanvas.isCellEmpty(opaqueBlack)).toBe(false);
    expect(CoreCanvas.isCellEmpty(transparentCell)).toBe(true);
  });
});

describe('composeLayers/mergeLayerDown preserve today\'s bg-only compositing convention (measured before this change)', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any); // default 80x25, no transparentBackground
  });

  afterEach(() => screen?.destroy());

  it('composeLayers: a top-layer cell with {char:" ", fg:3, bg:0} does not occlude the layer below it', () => {
    editor.layers[0].canvas[0][0] = { char: 'B', fg: 2, bg: 4, blink: false };
    editor.addLayer();
    editor.layers[editor.activeLayerIndex].canvas[0][0] = { char: ' ', fg: 3, bg: 0, blink: false };

    const composed = editor.composeLayers();
    expect(composed[0][0]).toEqual({ char: 'B', fg: 2, bg: 4, blink: false });
  });

  it('mergeLayerDown: the same ambiguous cell does not overwrite the layer below it', () => {
    editor.layers[0].canvas[0][0] = { char: 'B', fg: 2, bg: 4, blink: false };
    editor.addLayer();
    editor.layers[editor.activeLayerIndex].canvas[0][0] = { char: ' ', fg: 3, bg: 0, blink: false };

    editor.mergeLayerDown();

    expect(editor.layers[0].canvas[0][0]).toEqual({ char: 'B', fg: 2, bg: 4, blink: false });
  });

  it('composeLayers: a deliberately-drawn opaque cell (non-space) DOES occlude the layer below it', () => {
    editor.layers[0].canvas[0][0] = { char: 'B', fg: 2, bg: 4, blink: false };
    editor.addLayer();
    editor.layers[editor.activeLayerIndex].canvas[0][0] = { char: 'X', fg: 1, bg: 1, blink: false };

    const composed = editor.composeLayers();
    expect(composed[0][0]).toEqual({ char: 'X', fg: 1, bg: 1, blink: false });
  });
});

describe('ANSIEditor transparentBackground:true', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen, transparentBackground: true } as any);
  });

  afterEach(() => screen?.destroy());

  it('a freshly created canvas is all-transparent', () => {
    const canvas = editor.getCoreCanvas();
    expect(canvas).not.toBeNull();
    for (const row of canvas!) {
      for (const cell of row) {
        expect(cell.transparent).toBe(true);
        expect(cell.char).toBe(' ');
      }
    }
  });

  it('erasing a cell makes it transparent, not black', () => {
    editor.cursor.col = 3;
    editor.cursor.line = 2;
    editor.eraseAtCursor();

    const cell = editor.getCoreCanvas()[2][3];
    expect(cell.transparent).toBe(true);
    expect(cell.char).toBe(' ');
  });

  it('a transparent cell renders as a distinct guide glyph, not a solid black cell', () => {
    const content = editor.drawCanvas.getContent();
    expect(content).toContain(GUIDE_TOKEN);
    expect(content).not.toContain(OPAQUE_BLACK_SPACE_TOKEN);
  });

  it('painting a character clears transparent on that cell', () => {
    editor.cursor.col = 5;
    editor.cursor.line = 1;
    editor.currentChar = 'X';
    editor.currentFg = 4;
    editor.currentBg = 2;
    editor.drawAtCursor();

    const cell = editor.getCoreCanvas()[1][5];
    expect(cell.char).toBe('X');
    expect(cell.transparent).toBeFalsy();
  });

  it('painting then erasing the same cell makes it transparent again', () => {
    editor.cursor.col = 0;
    editor.cursor.line = 0;
    editor.currentChar = 'X';
    editor.drawAtCursor();
    expect(editor.getCoreCanvas()[0][0].transparent).toBeFalsy();

    editor.eraseAtCursor();
    expect(editor.getCoreCanvas()[0][0].transparent).toBe(true);
  });

  it('newDocument() (File > New) produces an all-transparent canvas again', () => {
    editor.cursor.col = 0;
    editor.cursor.line = 0;
    editor.currentChar = 'X';
    editor.drawAtCursor();
    expect(editor.getCoreCanvas()[0][0].char).toBe('X');

    editor.newDocument();

    const canvas = editor.getCoreCanvas();
    for (const row of canvas) {
      for (const cell of row) {
        expect(cell.transparent).toBe(true);
      }
    }
  });
});

describe('ANSIEditor with transparentBackground absent (default) - no regression', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any); // no transparentBackground option at all
  });

  afterEach(() => screen?.destroy());

  it('a freshly created canvas is NOT transparent - every cell is a plain opaque {fg:7,bg:0} space', () => {
    const canvas = editor.getCoreCanvas();
    for (const row of canvas!) {
      for (const cell of row) {
        expect(cell.transparent).toBeFalsy();
        expect(cell.char).toBe(' ');
        expect(cell.fg).toBe(7);
        expect(cell.bg).toBe(0);
      }
    }
  });

  it('erasing a cell resets it to an opaque black space - never marks it transparent', () => {
    editor.cursor.col = 3;
    editor.cursor.line = 2;
    editor.eraseAtCursor();

    const cell = editor.getCoreCanvas()[2][3];
    expect(cell.transparent).toBeFalsy();
    expect(cell).toEqual({ char: ' ', fg: 7, bg: 0, blink: false });
  });

  it('rendering never emits the transparency guide glyph', () => {
    const content = editor.drawCanvas.getContent();
    expect(content).not.toContain(GUIDE_TOKEN);
    expect(content).toContain(OPAQUE_BLACK_SPACE_TOKEN);
  });

  it('painting a character behaves exactly as today (no transparent field involved)', () => {
    editor.cursor.col = 5;
    editor.cursor.line = 1;
    editor.currentChar = 'X';
    editor.currentFg = 4;
    editor.currentBg = 2;
    editor.drawAtCursor();

    const cell = editor.getCoreCanvas()[1][5];
    expect(cell).toEqual({ char: 'X', fg: 4, bg: 2, blink: false });
  });
});

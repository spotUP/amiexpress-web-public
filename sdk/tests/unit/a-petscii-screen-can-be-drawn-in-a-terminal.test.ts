/**
 * A PETSCII SCREEN, DRAWN FROM A TERMINAL.
 *
 * The board's PETSCII editor lived only in the admin web studio; the sysop
 * asked for it where the callers are, and for it to live in the SDK so the
 * studio door and the mail composer can share one editor ("move the petscii
 * stuff to sdk level so to say", 2026-09-23).
 *
 * The one thing worth proving about a widget that paints PETSCII is what
 * lands ON THE GLASS: the caller's transducer has to draw the exact screen
 * code and the exact colour the artist chose, with no question mark for a
 * glyph it could not map and no charset switch to reflow the screen. So the
 * frames go through `AnsiToPetsciiTransducer` into a `PetsciiMachine` - the
 * same pair a real caller has - and the assertions are about cells, not about
 * the markers the widget happened to write.
 */
import { Screen } from '../../engines/ui/blessed/core/screen';
import { PetsciiEditor } from '../../engines/ui/blessed/widgets/petscii-editor';
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { blankSurface, stamp } from '../../petscii/editor-surface';
import { colourMarker, puaForScreenCode } from '../../petscii/pua';

const RED = 2;
const CYAN = 3;
const HEART = 0x53;          // screen code $53, a filled heart
const CORNER = 0x70;         // screen code $70, a box corner
const QUESTION_MARK = 0x3f;
const CHARSET_BANK0 = 0x8e;

function editorOn(screen: any, options: Record<string, unknown> = {}): any {
  return new PetsciiEditor({
    parent: screen, top: 0, left: 0, width: 40, height: 25, ...options,
  } as any);
}

/** What a C64 shows for what the widget wrote. */
function glass(writes: string[]) {
  const transducer = new AnsiToPetsciiTransducer();
  const bytes = Array.from(transducer.transduce(writes.join('')));
  const machine = new PetsciiMachine();
  machine.feed(bytes);
  return {
    bytes,
    cell: (x: number, y: number) => ({
      screenCode: machine.state.screen[y * 40 + x],
      colour: machine.state.colorRam[y * 40 + x],
    }),
    machine,
  };
}

describe('a PETSCII editor in a terminal', () => {
  let screen: any;
  let writes: string[];
  let editor: any;

  beforeEach(() => {
    writes = [];
    screen = new Screen({
      width: 80, height: 25, responsive: true, output: (d: string) => writes.push(d),
    } as any);
    screen.resize(40, 25);
    editor = editorOn(screen);
    editor.focus();
    writes.length = 0;
  });

  afterEach(() => { try { screen?.destroy(); } catch { /* leaving anyway */ } });

  describe('what it puts on the glass', () => {
    it('draws the screen code the artist chose', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(3, 4);

      expect(glass(writes).cell(3, 4)).toEqual({ screenCode: HEART, colour: RED });
    });

    it('never draws a question mark for a graphic', () => {
      editor.setBrush({ screenCode: CORNER, color: CYAN, reverse: false });
      editor.applyAt(0, 0);
      editor.setBrush({ screenCode: 0x7f, color: CYAN, reverse: false });
      editor.applyAt(1, 0);

      const painted = glass(writes);
      expect(painted.cell(0, 0).screenCode).not.toBe(QUESTION_MARK);
      expect(painted.cell(1, 0).screenCode).not.toBe(QUESTION_MARK);
    });

    it('never switches the caller to the graphics bank', () => {
      editor.setBrush({ screenCode: CORNER, color: CYAN, reverse: false });
      editor.applyAt(2, 2);

      expect(glass(writes).bytes).not.toContain(CHARSET_BANK0);
    });

    it('carries reverse as the fill it is', () => {
      editor.setBrush({ screenCode: 0x20, color: RED, reverse: true });
      editor.applyAt(5, 5);

      expect(glass(writes).cell(5, 5).screenCode & 0x80).not.toBe(0);
    });

    it('paints a whole loaded screen cell for cell', () => {
      let surface = blankSurface();
      surface = stamp(surface, 0, 0, { screenCode: HEART, color: RED, reverse: false });
      surface = stamp(surface, 39, 24, { screenCode: CORNER, color: CYAN, reverse: false });
      editor.setSurface(surface);

      const painted = glass(writes);
      expect(painted.cell(0, 0)).toEqual({ screenCode: HEART, colour: RED });
      expect(painted.cell(39, 24)).toEqual({ screenCode: CORNER, colour: CYAN });
    });
  });

  describe('every colour a C64 has', () => {
    /*
     * The pen survives the CELL BUFFER, which is where it used to die.
     * blessed keeps a palette index per cell, and the pen was being spelled
     * as truecolor and reduced by neo-blessed's luminance matcher - which
     * put VIC red on xterm 238, a dark grey. Sixteen colours in, sixteen
     * colours out, or the editor lies about what it drew.
     */
    it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
      'comes back off the glass as colour %i', (vic) => {
        writes.length = 0;
        editor.setBrush({ screenCode: HEART, color: vic, reverse: false });
        editor.applyAt(vic, 1);

        expect(glass(writes).cell(vic, 1)).toEqual({ screenCode: HEART, colour: vic });
      });
  });

  describe('the cursor', () => {
    it('rests on the cell the brush is over', () => {
      editor.moveCursor(6, 3);

      const { machine } = glass(writes);
      expect({ x: machine.state.cursorX, y: machine.state.cursorY }).toEqual({ x: 6, y: 3 });
    });

    it('carries the colour the next stamp will lay down', () => {
      editor.setBrush({ color: CYAN });
      editor.moveCursor(2, 0);

      const { machine } = glass(writes);
      const cell = machine.state.cursorY * 40 + machine.state.cursorX;
      // The pen at the cursor is what the canvas draws the cursor block in.
      expect(machine.state.colorRam[cell]).toBeDefined();
      expect(machine.state.cursorX).toBe(2);
    });
  });

  describe('the tools', () => {
    it('draws glyph and colour together', () => {
      editor.setTool('draw');
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(1, 1);

      const cell = editor.getSurface();
      expect(cell.screen[1 * 40 + 1]).toBe(HEART);
      expect(cell.colorRam[1 * 40 + 1]).toBe(RED);
    });

    it('changes the character and keeps the colour', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(1, 1);
      editor.setTool('characterOnly');
      editor.setBrush({ screenCode: CORNER, color: CYAN, reverse: false });
      editor.applyAt(1, 1);

      expect(editor.getSurface().screen[41]).toBe(CORNER);
      expect(editor.getSurface().colorRam[41]).toBe(RED);
    });

    it('changes the colour and keeps the character', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(1, 1);
      editor.setTool('colourOnly');
      editor.setBrush({ color: CYAN });
      editor.applyAt(1, 1);

      expect(editor.getSurface().screen[41]).toBe(HEART);
      expect(editor.getSurface().colorRam[41]).toBe(CYAN);
    });

    it('fills what is connected and nothing else', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.setTool('fill');
      editor.applyAt(0, 0);

      const surface = editor.getSurface();
      expect(surface.screen[0]).toBe(HEART);
      expect(surface.screen[999]).toBe(HEART);
    });

    it('lifts a rectangle and stamps it somewhere else', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(0, 0);
      editor.applyAt(1, 0);
      editor.setTool('brush');
      editor.lift({ x: 0, y: 0 }, { x: 1, y: 0 });
      editor.applyAt(10, 10);

      const surface = editor.getSurface();
      expect(surface.screen[10 * 40 + 10]).toBe(HEART);
      expect(surface.screen[10 * 40 + 11]).toBe(HEART);
    });

    it('adds and removes a line at the cursor', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(0, 0);
      editor.cursor = { x: 0, y: 0 };
      editor.addLine();
      expect(editor.getSurface().screen[40]).toBe(HEART);   // pushed to row 1

      editor.deleteLine();
      expect(editor.getSurface().screen[0]).toBe(HEART);    // pulled back to row 0
    });
  });

  describe('undo', () => {
    it('takes back a stroke', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(4, 4);
      expect(editor.getSurface().screen[4 * 40 + 4]).toBe(HEART);

      editor.undo();
      expect(editor.getSurface().screen[4 * 40 + 4]).toBe(0x20);
    });

    it('puts it back', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(4, 4);
      editor.undo();
      editor.redo();

      expect(editor.getSurface().screen[4 * 40 + 4]).toBe(HEART);
    });
  });

  describe('a C64 keyboard', () => {
    it('picks a colour from a colour chord', () => {
      editor.emit('keypress', colourMarker(CYAN), { name: undefined });

      expect(editor.brush.color).toBe(CYAN);
    });

    it('picks a glyph from a graphics key', () => {
      editor.emit('keypress', puaForScreenCode(CORNER), { name: undefined });

      expect(editor.brush.screenCode).toBe(CORNER);
    });

    it('types a graphic onto the screen in Text mode', () => {
      editor.setTool('text');
      editor.cursor = { x: 2, y: 2 };
      editor.emit('keypress', puaForScreenCode(CORNER), { name: undefined });

      expect(editor.getSurface().screen[2 * 40 + 2]).toBe(CORNER);
      expect(editor.cursor).toEqual({ x: 3, y: 2 });
    });

    it('stamps where the cursor is when Space is pressed', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.cursor = { x: 7, y: 7 };
      editor.emit('keypress', ' ', { name: 'space' });

      expect(editor.getSurface().screen[7 * 40 + 7]).toBe(HEART);
    });
  });

  describe('what a host saves', () => {
    it('writes a .seq that reads back as the same screen', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(3, 3);
      const before = editor.getSurface();

      const bytes = editor.toSeq();
      const reader = editorOn(screen);
      reader.fromSeq(bytes);
      const after = reader.getSurface();

      expect(Array.from(after.screen)).toEqual(Array.from(before.screen));
      expect(Array.from(after.colorRam)).toEqual(Array.from(before.colorRam));
    });

    it('writes a message body as authored text, with no escape in it', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(0, 0);

      const body = editor.toPua();
      expect(body).toContain(puaForScreenCode(HEART));
      expect(body).toContain(colourMarker(RED));
      expect(body).not.toContain('\x1b');
    });

    it('reads its own message body back onto the canvas', () => {
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(0, 0);
      editor.setBrush({ screenCode: CORNER, color: CYAN, reverse: false });
      editor.applyAt(1, 0);
      const body = editor.toPua();

      const reader = editorOn(screen);
      reader.fromPua(body);

      expect(reader.getSurface().screen[0]).toBe(HEART);
      expect(reader.getSurface().colorRam[0]).toBe(RED);
      expect(reader.getSurface().screen[1]).toBe(CORNER);
      expect(reader.getSurface().colorRam[1]).toBe(CYAN);
    });

    it('refuses a bank-0 glyph somebody else authored', () => {
      const bankZero = String.fromCodePoint(0xe000 + CORNER);
      const reader = editorOn(screen);
      reader.fromPua(bankZero);

      // Not drawn as a bank-0 screen code: the board runs one bank, and a
      // `$8E` would reflow every letter already on the caller's screen.
      expect(reader.getSurface().screen[0]).not.toBe(CORNER);
      expect(reader.getSurface().charsetBank).toBe(1);
    });
  });

  describe('a viewer', () => {
    it('does not draw', () => {
      const viewer = editorOn(screen, { readOnly: true });
      viewer.setBrush({ screenCode: HEART, color: RED, reverse: false });
      viewer.applyAt(1, 1);

      expect(viewer.getSurface().screen[41]).toBe(0x20);
    });
  });
});

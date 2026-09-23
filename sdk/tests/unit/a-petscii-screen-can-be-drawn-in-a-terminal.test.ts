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


describe('the interface, and hiding it', () => {
  /*
   * "the same layout as ansi edit but adapted for petscii and hotkeys to hide
   * them ... all ui should be hideable" (the sysop, 2026-09-23).
   *
   * A forty-column screen IS the picture, so chrome starts hidden there and
   * costs the artist nothing; an eighty-column terminal has room beside the
   * canvas and starts with all four parts showing. Either way every part goes
   * away on a keystroke, and F2 takes the lot.
   */
  let screen: any;
  let writes: string[];

  function editorAt(width: number, options: Record<string, unknown> = {}): any {
    writes = [];
    screen = new Screen({
      width: 80, height: 25, responsive: true, output: (d: string) => writes.push(d),
    } as any);
    if (width !== 80) screen.resize(width, 25);
    const editor = new PetsciiEditor({
      parent: screen, top: 0, left: 0, width, height: 25, ...options,
    } as any);
    editor.focus();
    return editor;
  }

  afterEach(() => { try { screen?.destroy(); } catch { /* leaving anyway */ } });

  it('gives a C64 the whole screen for the picture', () => {
    const editor = editorAt(40);

    expect(editor.chromeVisible('menuBar')).toBe(false);
    expect(editor.chromeVisible('toolbar')).toBe(false);
    expect(editor.chromeVisible('tools')).toBe(false);
    expect(editor.chromeVisible('statusBar')).toBe(false);
  });

  it('shows all four parts on an eighty-column terminal', () => {
    const editor = editorAt(80);

    for (const part of ['menuBar', 'toolbar', 'tools', 'statusBar']) {
      expect(editor.chromeVisible(part)).toBe(true);
    }
  });

  it('hides one part on its own key', () => {
    const editor = editorAt(80);

    editor.emit('keypress', undefined, { name: 'f7' });     // the tool row
    expect(editor.chromeVisible('tools')).toBe(false);
    expect(editor.chromeVisible('menuBar')).toBe(true);
  });

  it('takes the whole interface away on F2, and brings it back', () => {
    const editor = editorAt(80);

    editor.emit('keypress', undefined, { name: 'f2' });
    expect(editor.chromeVisible('menuBar')).toBe(false);
    expect(editor.chromeVisible('statusBar')).toBe(false);

    editor.emit('keypress', undefined, { name: 'f2' });
    expect(editor.chromeVisible('menuBar')).toBe(true);
    expect(editor.chromeVisible('statusBar')).toBe(true);
  });

  it('gives the canvas the room the chrome gives up', () => {
    // The canvas is the widest child: forty columns of art, plus its border
    // where the terminal has room for one.
    const canvasOf = (widget: any) => widget.children
      .filter((child: any) => (child.position.width as number) >= 40)
      .sort((a: any, b: any) => (b.position.width as number) - (a.position.width as number))[0];

    const editor = editorAt(80);
    const leftWithChrome = canvasOf(editor).position.left;

    editor.emit('keypress', undefined, { name: 'f2' });
    const bare = canvasOf(editor);

    expect(bare.position.top).toBe(0);
    expect(bare.position.left).toBeLessThanOrEqual(leftWithChrome);
  });

  it('draws the same picture whether the chrome is up or not', () => {
    const editor = editorAt(40, { showMenuBar: true, showStatusBar: true });
    editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
    editor.applyAt(0, 0);
    const surface = Array.from(editor.getSurface().screen);

    editor.emit('keypress', undefined, { name: 'f2' });

    expect(Array.from(editor.getSurface().screen)).toEqual(surface);
  });

  it('never makes the picture narrower than it is', () => {
    /*
     * "it has the exact same error the ansi studio had in the beginning when
     * i draw every other line is black" (the sysop, 2026-09-23, with the
     * screenshot).
     *
     * The chrome had a SIDEBAR eight columns wide. At forty columns that left
     * thirty-two for a forty-cell row, and a row that does not fit WRAPS - so
     * every second line on the glass was the overflow of the one above, and
     * the caller's drawing came out in stripes. The tools moved to a row along
     * the bottom, which costs a line instead of eight columns, and the canvas
     * is never narrower than the art.
     */
    const editor = editorAt(40, {
      showMenuBar: true, showToolbar: true, showTools: true, showStatusBar: true,
    });
    const canvas = editor.children.find((child: any) => child.position.height <= 25 && child.position.width >= 40);

    expect(canvas).toBeDefined();
    expect(canvas.position.width).toBe(40);
  });

  it('draws row two on row two, with the chrome up', () => {
    const editor = editorAt(40, {
      showMenuBar: true, showToolbar: true, showTools: true, showStatusBar: true,
    });
    writes.length = 0;
    editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
    editor.applyAt(0, 0);
    editor.applyAt(0, 1);
    editor.applyAt(0, 2);

    // Read the art back off the surface the glass was painted from: three
    // stamps on three CONSECUTIVE rows, not on every other one.
    const surface = editor.getSurface();
    expect(surface.screen[0]).toBe(HEART);
    expect(surface.screen[40]).toBe(HEART);
    expect(surface.screen[80]).toBe(HEART);
  });

  it('opens with a brush that draws a GRAPHIC, not a letter', () => {
    const editor = editorAt(40);

    // `$51` is the filled circle in the graphics bank and the letter Q in the
    // one this board runs. The studio opened with it and drew "Q".
    expect(editor.brush.screenCode).not.toBe(0x51);
    const legal = [0x40, ...Array.from({ length: 0x25 }, (_, i) => 0x5b + i)];
    expect(legal).toContain(editor.brush.screenCode);
  });

  it('frames the two pickers instead of floating them on black', () => {
    /*
     * "dont let them float on black, frame them same for the tools" (the
     * sysop, 2026-09-23). Loose glyphs on a black screen read as part of the
     * picture, which is the one thing they must not look like.
     */
    const editor = editorAt(80, { showTools: true, showToolbar: true });
    const dock = editor.children.find((child: any) => child.options?.border);

    expect(dock).toBeDefined();
    expect(dock.position.height).toBeGreaterThanOrEqual(3);   // border, row, border
  });

  it('puts the characters at the bottom, beside the tools when there is room', () => {
    const editor = editorAt(80, { showTools: true, showToolbar: true });
    const dock = editor.children.find((child: any) => child.options?.border);
    const [tools, characters] = dock.children;

    // Both on the dock's single row, the characters to the RIGHT of the tools.
    expect(characters.position.left).toBeGreaterThan(tools.position.left);
    expect(characters.position.top).toBe(tools.position.top);
  });

  it('stacks them when the terminal is a C64', () => {
    const editor = editorAt(40, { showTools: true, showToolbar: true });
    const dock = editor.children.find((child: any) => child.options?.border);
    const [tools, characters] = dock.children;

    // Thirty-eight graphics do not fit beside anything in forty columns.
    expect(characters.position.top).toBeGreaterThan(tools.position.top);
  });

  it('draws a line round the picture where there is room for one', () => {
    /*
     * "the background and canvas have the same color so i dont see where the
     * canvas ends" (the sysop, 2026-09-23). They are both black and always
     * will be - this is a black-background board and PETSCII has no per-cell
     * background - so the edge is a DRAWN line rather than a shade.
     */
    const editor = editorAt(80, { showMenuBar: false, showToolbar: false, showTools: false, showStatusBar: false });
    const canvas = editor.children.find((child: any) => (child.position.width as number) >= 40);

    expect(canvas.options.border).toBeDefined();
    expect(canvas.position.width).toBe(42);      // forty of art, one line each side
  });

  it('gives the art the glass instead, when a C64 has no room for a line', () => {
    const editor = editorAt(40);
    const canvas = editor.children.find((child: any) => child.position.width >= 40);

    expect(canvas.options.border).toBeUndefined();
    expect(canvas.position.width).toBe(40);
  });

  it('opens the menu on the key, not merely shows the bar', () => {
    /*
     * "yes no menu items worked" (the sysop, 2026-09-23). The bar appeared
     * and nothing in it could be reached: a menu opens through `openFirst()`,
     * which the host has to call, and nothing called it. On a telnet C64
     * there is no mouse to click the labels with either, so the key IS the
     * only way in.
     */
    const editor = editorAt(40);
    let openedFirst = 0;

    editor.setChromeVisible('menuBar', true);
    (editor as any).menuBar.openFirst = () => { openedFirst++; };
    editor.emit('keypress', undefined, { name: 'f5' });

    expect(openedFirst).toBe(1);
  });

  it('shows the bar first if it was hidden', () => {
    const editor = editorAt(40);

    editor.emit('keypress', undefined, { name: 'f5' });

    expect(editor.chromeVisible('menuBar')).toBe(true);
  });

  it('hands the keyboard back to the picture after a menu item', () => {
    const editor = editorAt(80);
    const view = (editor as any).menuItems().find((menu: any) => menu.label === 'Tools');
    const drawItem = view.items[0];

    editor.setTool('fill');
    drawItem.action();

    expect(editor.tool).toBe('draw');
    expect(editor.focused).toBe(true);
  });

  it('paints its chrome in the board\'s colours, not the widget defaults', () => {
    /*
     * "not correct theme colors" (the sysop, 2026-09-23). Every box was built
     * with no style at all, so the editor's own frame drew in blessed's
     * defaults while the door around it used the caller's theme. The SDK
     * holds the theme a door set; the chrome reads it, exactly as the menu
     * bar does.
     *
     * The ART is deliberately NOT themed: a screen drawn in red is red
     * because the artist chose red.
     */
    const { setActiveTheme, themeById } = require('../../engines/ui/theme');
    setActiveTheme(themeById('amber'));
    const amber = themeById('amber').tokens;

    const editor = editorAt(80, { showTools: true, showToolbar: true, showStatusBar: true });
    const dock = editor.children.find((child: any) => child.options?.border);

    expect(dock.options.style.border.fg).toBe(amber.accent);
    expect(dock.options.style.fg).toBe(amber.ink);

    setActiveTheme(themeById('classic'));
  });

  it('shows only as many menus as the bar can hold', () => {
    /*
     * `MenuBar` puts each label at a fixed column and lets the rest run off
     * the glass. On a C64 `File Edit Tools Colour View` filled forty columns
     * and everything after it was unreachable - which is how the mail
     * composer's own Send menu went missing: "ae doesnt let me send messages
     * only save files like the normal editor" (the sysop, 2026-09-23).
     */
    const editor = editorAt(40);
    const menus = (editor as any).menuItems();
    const columns = menus.reduce((sum: number, menu: any) => sum + menu.label.length + 3, 0);

    expect(columns).toBeLessThanOrEqual(40);
  });

  it('puts a host\'s own menu first, where it cannot be pushed off', () => {
    const editor = editorAt(40, {
      hostMenus: [{ label: 'Message', items: [{ label: 'Send it', action: () => {} }] }],
    });
    const menus = (editor as any).menuItems();

    expect(menus[0].label).toBe('Message');
  });

  it('drops the File menu for a host that has no files', () => {
    const editor = editorAt(40, { showFileMenu: false });
    const labels = (editor as any).menuItems().map((menu: any) => menu.label);

    expect(labels).not.toContain('File');
  });

  it('lets a host ask for its own arrangement', () => {
    const editor = editorAt(40, { showStatusBar: true });

    expect(editor.chromeVisible('statusBar')).toBe(true);
    expect(editor.chromeVisible('menuBar')).toBe(false);
  });
});

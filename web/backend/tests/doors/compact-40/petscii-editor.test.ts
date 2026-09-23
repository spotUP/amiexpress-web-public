/**
 * THE PETSCII STUDIO ON A C64'S GLASS.
 *
 * The door this test exists for is the one a forty-column caller runs, and
 * the art it edits is exactly the size of his screen: 40x25, with nowhere to
 * put a toolbar. So what is measured here is that the CANVAS is the screen -
 * all of it, no chrome stealing a row - and that a requester opened over it
 * still fits inside the glass.
 *
 * Driven, not read: the door's real `start()` builds a real blessed Screen at
 * the size a stub `bbs` reports, which is the pair `executeTypeScriptDoor`
 * hands a door in production.
 */

const { PetsciiStudioDoor } = require('../../../../../Doors/petscii-editor/index');

type Coords = { xi: number; xl: number; yi: number; yl: number };

function coords(element: any): Coords | null {
  const c = element._getCoords?.(true) || element._getCoords?.();
  return c ? { xi: c.xi, xl: c.xl, yi: c.yi, yl: c.yl } : null;
}

/** Every element the door put on the screen, the screen itself excluded. */
function elements(screen: any): any[] {
  const out: any[] = [];
  const walk = (node: any): void => {
    for (const child of node.children ?? []) { out.push(child); walk(child); }
  };
  walk(screen);
  return out;
}

function context(width: number, height: number, accessLevel = 100, wire: string[] = []) {
  return {
    bbs: {
      write: (data: string) => { wire.push(data); }, writeLine: () => {}, on: () => {},
      getTerminalSize: () => ({ width, height }),
      enableWideMode: () => {}, disableWideMode: () => {},
      enableMouseEvents: () => {}, disableMouseEvents: () => {},
      getTheme: () => 'classic',
      connectionType: 'web', unicodeCapable: true,
      isPetsciiMode: () => width <= 40,
    },
    storage: {
      keys: async () => [], load: async () => null,
      save: async () => {}, delete: async () => {},
    },
    user: { name: 'spot', accessLevel },
    output: { writeLine: () => {} },
    close: () => {},
  } as any;
}

/**
 * The door opens ON the help page, which is what the sysop asked for. A test
 * that wants the canvas has to put it away first, the way a caller does.
 */
async function dismissHelp(door: any): Promise<void> {
  // The way blessed delivers a key: the focused element gets `keypress <name>`,
  // which is what `Element.key(['enter'], ...)` listens for.
  door.screen.getFocused()?.emit('keypress enter', '\r', { name: 'enter' });
  await new Promise((r) => setTimeout(r, 10));
}

async function openedAt(width: number, height: number, wire: string[] = []): Promise<any> {
  const door: any = new PetsciiStudioDoor();
  door.setContext(context(width, height, 100, wire));
  // start() resolves only when the door exits; everything measured here is
  // built synchronously before it waits.
  await Promise.race([door.start(), new Promise((r) => setTimeout(r, 250))]);
  return door;
}

describe('the PETSCII studio at forty columns', () => {
  let door: any;

  afterEach(() => { try { door?.destroy(); } catch { /* leaving anyway */ } });

  it('gives the art the whole screen', async () => {
    door = await openedAt(40, 25);

    expect(coords(door.editor)).toEqual({ xi: 0, xl: 40, yi: 0, yl: 25 });
    // And every part of the interface starts hidden, because on a C64 the
    // screen IS the picture and a menu bar costs a row of it.
    for (const part of ['menuBar', 'toolbar', 'tools', 'statusBar']) {
      expect(door.editor.chromeVisible(part)).toBe(false);
    }
  });

  it('paints nothing off the glass', async () => {
    door = await openedAt(40, 25);

    for (const element of elements(door.screen)) {
      const box = coords(element);
      if (!box) continue;
      expect(box.xl).toBeLessThanOrEqual(40);
      expect(box.yl).toBeLessThanOrEqual(25);
    }
  });

  it('keeps a requester inside the glass too', async () => {
    door = await openedAt(40, 25);
    const opening = door.showHelp();            // the tallest page the door has
    await new Promise((r) => setTimeout(r, 10));

    for (const element of elements(door.screen)) {
      const box = coords(element);
      if (!box) continue;
      expect(box.xl).toBeLessThanOrEqual(40);
      expect(box.yl).toBeLessThanOrEqual(25);
    }

    door.screen.dialogOpen = false;
    void opening;                                // it resolves when the door closes
  });

  it('spends a stamp on one cell, not on a frame', async () => {
    /*
     * A door repaints what CHANGED. The canvas rewrites its whole content on
     * every stroke - which is fine, and deliberate - because blessed's cell
     * buffer is differential and only the cells that differ reach the wire.
     * This is the measurement that keeps that true: a full 40x25 frame is
     * over a thousand cells, and a stamp is one.
     */
    const wire: string[] = [];
    door = await openedAt(40, 25, wire);
    await dismissHelp(door);
    wire.length = 0;

    door.editor.setBrush({ screenCode: 0x51, color: 2, reverse: false });
    door.editor.applyAt(10, 10);

    const bytes = wire.join('').length;
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(200);
  });

  it('brings the interface back on a keystroke, and takes it away again', async () => {
    door = await openedAt(40, 25);

    door.editor.toggleAllChrome();
    expect(door.editor.chromeVisible('menuBar')).toBe(true);
    expect(door.editor.chromeVisible('statusBar')).toBe(true);

    door.editor.toggleAllChrome();
    expect(door.editor.chromeVisible('menuBar')).toBe(false);
  });
});

describe('the PETSCII studio at eighty columns', () => {
  let door: any;

  afterEach(() => { try { door?.destroy(); } catch { /* leaving anyway */ } });

  it('shows the whole interface, with the art still forty columns', async () => {
    door = await openedAt(80, 25);

    for (const part of ['menuBar', 'toolbar', 'tools', 'statusBar']) {
      expect(door.editor.chromeVisible(part)).toBe(true);
    }
    // The canvas is the widest child: forty columns of art, plus the line
    // round it where the terminal has room for one.
    const canvas = door.editor.children
      .filter((child: any) => (child.position.width as number) >= 40)
      .sort((a: any, b: any) => (b.position.width as number) - (a.position.width as number))[0];
    expect(canvas).toBeDefined();
    expect(coords(canvas)!.xl).toBeLessThanOrEqual(80);
  });
});

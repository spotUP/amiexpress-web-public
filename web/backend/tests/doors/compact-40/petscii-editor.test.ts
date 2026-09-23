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
    const opening = door.pickColour();          // F3, the longest list of the four
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
    wire.length = 0;

    door.editor.setBrush({ screenCode: 0x51, color: 2, reverse: false });
    door.editor.applyAt(10, 10);

    const bytes = wire.join('').length;
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(200);
  });

  it('carries no permanent chrome', async () => {
    door = await openedAt(40, 25);

    expect(door.sidebar).toBeNull();
  });
});

describe('the PETSCII studio at eighty columns', () => {
  let door: any;

  afterEach(() => { try { door?.destroy(); } catch { /* leaving anyway */ } });

  it('keeps the art forty columns wide and puts the tools beside it', async () => {
    door = await openedAt(80, 25);

    expect(coords(door.editor)!.xl).toBe(40);
    expect(door.sidebar).not.toBeNull();
    expect(coords(door.sidebar)!.xi).toBeGreaterThanOrEqual(40);
    expect(coords(door.sidebar)!.xl).toBeLessThanOrEqual(80);
  });
});

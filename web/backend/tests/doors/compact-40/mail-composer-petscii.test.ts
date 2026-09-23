/**
 * A C64 CALLER WRITES HIS MESSAGE IN PETSCII.
 *
 * The composer has always built the ANSI editor widget, and a PETSCII caller
 * could not reach the door at all - `ae.info` carried no MIN_COLUMNS, so the
 * width gate was default-closed at eighty. Now the door opens at forty and
 * picks the editor by terminal, which is how this board treats everything a
 * caller authors: one form, a renderer per terminal.
 *
 * Two things are worth proving, and they are the two that would break a
 * caller:
 *
 *   1. a PETSCII session gets the PETSCII editor, and the body it produces is
 *      AUTHORED TEXT - glyph and pen markers, no ESC - because a message has
 *      every escape stripped out of it before it is stored;
 *   2. the body reads back as the same picture, since that is the whole point
 *      of writing it.
 *
 * The widget is driven directly rather than through the door's promise: the
 * composer's own flow waits on a header dialog and a keypress, and what is
 * under test is the editor it chooses and the body that editor yields.
 */

const { Screen, PetsciiEditor } = require('../../../../../sdk/engines/ui/blessed');
const { colourMarker, puaForScreenCode } = require('../../../../../sdk/petscii/pua');
const { readFileSync } = require('fs');
const { join } = require('path');

const REPO = join(__dirname, '..', '..', '..', '..', '..');
const HEART = 0x53;
const RED = 2;

function screenAt(width: number, height: number): any {
  const screen = new Screen({ width: 80, height, responsive: true, output: () => {} } as any);
  if (width !== 80) screen.resize(width, height);
  return screen;
}

describe('the composer on a C64', () => {
  it('is reachable at all - ae.info opens at forty columns', () => {
    const info = readFileSync(join(REPO, 'Commands', 'BBSCmd', 'ae.info'), 'utf8');

    expect(info).toMatch(/^MIN_COLUMNS=40$/m);
  });

  it('picks the editor by the terminal, not by a constant', () => {
    const source = readFileSync(join(REPO, 'Doors', 'mail-composer', 'index.ts'), 'utf8');

    expect(source).toContain('isPetsciiMode');
    expect(source).toContain('new PetsciiEditor');
    expect(source).toContain('new ANSIEditor');
  });

  it('writes a body of authored markers, with no escape in it', () => {
    const screen = screenAt(40, 25);
    try {
      const editor: any = new PetsciiEditor({
        parent: screen, top: 0, left: 0, width: 40, height: 25,
      } as any);
      editor.setBrush({ screenCode: HEART, color: RED, reverse: false });
      editor.applyAt(0, 0);

      const body = editor.toPua();
      expect(body).toContain(puaForScreenCode(HEART));
      expect(body).toContain(colourMarker(RED));
      expect(body).not.toContain('\x1b');
    } finally {
      screen.destroy();
    }
  });

  it('reads its own body back as the same picture', () => {
    const screen = screenAt(40, 25);
    try {
      const written: any = new PetsciiEditor({
        parent: screen, top: 0, left: 0, width: 40, height: 25,
      } as any);
      written.setBrush({ screenCode: HEART, color: RED, reverse: false });
      written.applyAt(2, 1);
      const body = written.toPua();

      const read: any = new PetsciiEditor({
        parent: screen, top: 0, left: 0, width: 40, height: 25,
      } as any);
      read.fromPua(body);

      expect(read.getSurface().screen[1 * 40 + 2]).toBe(HEART);
      expect(read.getSurface().colorRam[1 * 40 + 2]).toBe(RED);
    } finally {
      screen.destroy();
    }
  });

  it('fits the glass it is drawn on', () => {
    const screen = screenAt(40, 25);
    try {
      const editor: any = new PetsciiEditor({
        parent: screen, top: 0, left: 0, width: 40, height: 25,
      } as any);
      const box = editor._getCoords();

      expect(box.xl).toBeLessThanOrEqual(40);
      expect(box.yl).toBeLessThanOrEqual(25);
    } finally {
      screen.destroy();
    }
  });
});

describe('the composer on an eighty-column board', () => {
  it('still builds the ANSI editor, and the send path is shared', () => {
    const source = readFileSync(join(REPO, 'Doors', 'mail-composer', 'index.ts'), 'utf8');

    // One send/draft/discard branch, taking the content rather than reading
    // it - the ANSI body and the PETSCII one differ only in how they are got.
    expect(source).toContain('finishWith(editor.getContent()');
    expect(source).toContain('finishWith(editor.toPua()');
    expect(source.match(/action === 'send'/g) ?? []).toHaveLength(1);
  });
});

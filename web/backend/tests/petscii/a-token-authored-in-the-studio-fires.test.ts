/**
 * THE REACHABILITY PIN for the PETSCII editor.
 *
 * Everything else in that work is a unit test over a pure function, and the
 * two defects the design found were invisible to every one of them:
 *
 *   1. `writeSeq` chose the SHIFTED PETSCII byte for screen codes $40-$5F, so
 *      a typed `~` was written $DE and a `|` was written $DC - the MCI gate
 *      byte and the default terminator. The round trip stayed green, because
 *      both bytes draw the same glyph.
 *   2. The file opened with the charset byte, so express.e's first-byte `~`
 *      gate (express.e:6800-6806, petscii-screen.render.ts:252) never opened
 *      at all.
 *
 * Either one silently turns an artist's MCI token into art: the board draws
 * the token's LETTERS. Nothing throws and nothing logs.
 *
 * So this test builds a screen the way the editor does - `typeChar` into a
 * surface, then `writeSeq` with the gate - and hands it to `displayScreen`,
 * the board's own entry point. It is the only test in this feature that
 * proves the new code is REACHED by the product.
 *
 * SKIP_DB_INIT + emit-spy socket + latin1 fixtures are the idiom of
 * `tests/petscii/seq-mci.test.ts`; the token is `~VD|` because its value
 * ('2.00', mci-dispatch.ts:368) is a constant and needs no user record.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

process.env.SKIP_DB_INIT = '1';

import { blankSurface, typeChar, writeSeq } from '@amiexpress/bbs-door-sdk/petscii';
import { displayScreen } from '../../src/handlers/screen.handler';

interface Emit { event: string; data: any }

function makeSocket(emits: Emit[]) {
  return {
    id: `studio-token-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

/** Everything the caller's terminal received, as one latin1 string. */
function wireText(emits: Emit[]): string {
  return emits
    .map((e) =>
      e.event === 'petscii-bytes'
        ? Buffer.from(e.data, 'base64').toString('latin1')
        : typeof e.data === 'string'
          ? e.data
          : '',
    )
    .join('');
}

/** Type ASCII into a surface the way the editor's Text tool does. */
function typeInto(text: string) {
  let surface = blankSurface();
  let cursor = { x: 0, y: 0 };
  for (const ch of text) {
    const out = typeChar(surface, cursor.x, cursor.y, ch.charCodeAt(0), 1, false);
    surface = out.surface;
    cursor = out.cursor;
  }
  return surface;
}

async function show(bytes: Uint8Array): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-token-'));
  const seqPath = path.join(dir, 'STUDIO.SEQ');
  fs.writeFileSync(seqPath, Buffer.from(bytes));

  const emits: Emit[] = [];
  const shown = await displayScreen(makeSocket(emits), { petsciiMode: true, nodeId: 0 } as any, seqPath);
  expect(shown).toBe(true);
  return wireText(emits);
}

describe('a token authored in the artist studio', () => {
  it('is substituted by the board, not drawn as its own letters', async () => {
    const wire = await show(writeSeq(typeInto('~VD|'), { mciGate: true }));

    expect(wire).toContain('2.00');   // the value ~VD| stands for
    expect(wire).not.toContain('VD'); // the letters a broken gate would draw
  });

  it('is art when the artist leaves MCI off, and the letters are what shows', async () => {
    // The other half of the pin. Without it, a renderer that substituted
    // EVERYTHING would pass the test above while ignoring the gate - and the
    // gate is the sysop's control over whether a screen is art or a template.
    const wire = await show(writeSeq(typeInto('~VD|'), { mciGate: false }));

    expect(wire).toContain('VD');
    expect(wire).not.toContain('2.00');
  });
});

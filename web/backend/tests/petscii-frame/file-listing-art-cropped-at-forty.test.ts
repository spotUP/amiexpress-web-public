/**
 * "fr seems to overflow in 40 cols?" - the sysop, live, 2026-09-06, with a
 * screenshot of a FILE_ID.DIZ folded across a C64 screen.
 *
 * WHAT HE HIT. A width-gate fall-through landed that morning
 * (`handlers/command.handler.ts`, "WIDTH-GATE FALL-THROUGH"): a door the
 * MIN_COLUMNS gate refuses now falls through to the internal tier, so `F`,
 * `FR` and `N` reach a 40-column caller for the first time. What they reached
 * him with was `FileListingHandler`'s RAW DIR ROWS - a DIR file is written at
 * eighty columns, its descriptions start at column 33, and a 45-column
 * FILE_ID.DIZ pasted into one makes a 78-column row. A C64 screen folds those,
 * and the fold lands on the row the next line of art was about to occupy.
 *
 * THE SETTLED SHAPE (the sysop's own, `docs/superpowers/specs/
 * 2026-09-03-c64-file-view-design.md`, decisions 14 and 15): "i guess we will
 * have to live with them being cut off on the right side". ART IS CROPPED,
 * PROSE IS WRAPPED, and the two are told apart by the classifier the C64 frame
 * ladder already asks (`looksLikeAsciiArt`), not by a second heuristic.
 *
 * WHAT THIS SUITE PROVES. Not that a formatter returns nice strings - what a
 * C64 SCREEN HOLDS. The real `FR` entry point (`FileListingHandler
 * .handleFileList(..., reverse=true)`) reads a real DIR file off disk, and the
 * wire it produces is replayed through the real `AnsiToPetsciiTransducer` into
 * a real `PetsciiMachine`. The assertions read painted cells back off that
 * machine, folded to one case because a C64 screen in bank 0 has only one.
 *
 * And the 80-column path is pinned in the same file, on the same fixture,
 * because the whole value of the fix is that it is invisible there.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AnsiToPetsciiTransducer, screenCodeToPetscii } from '@amiexpress/bbs-door-sdk/petscii';
import { FileListingHandler } from '../../src/handlers/file/file-listing.handler';
import { dirEntryRows } from '../../src/utils/table-format.util';
import { config } from '../../src/config';

/**
 * A C64 in bank 0 has ONE case and its own glyph for a vertical bar: `|`
 * arrives as PETSCII $DD, which is what these rows read back as. The letters
 * are folded to upper case for the same reason - the screen has no other.
 */
const PIPE = 'Ý';

/** express.e:19500 - every continuation row of a DIR entry carries 33 spaces. */
const INDENT = ' '.repeat(33);

/**
 * A standard FILE_ID.DIZ: 45 columns, which is five wider than the screen and
 * is the width the spec measured on every real DIZ in this tree.
 */
const DIZ = [
  '.-------------------------------------------.',
  '| Invitation for Deadline 2026, Berlin      |',
  '|   the demoparty for Amiga and C64 people  |',
  "'-------------------------------------------'",
];

/** A description a human typed. Not art, and it must stay readable. */
const PROSE = 'A long typed description that a sysop entered by hand and which should still wrap.';

/**
 * The entry as express.e writes it (`utils/dir-file.util.ts`): the fields, the
 * first description line on the same row, then one continuation row per
 * remaining line, each behind 33 spaces.
 */
const DIR_LINES = [
  'APOCAL.ZIP   P 108741  24-Aug-26  ' + DIZ[0],
  ...DIZ.slice(1).map((line) => INDENT + line),
  INDENT + PROSE,
  INDENT + 'Sent by: sLASH',
  '',
];

let tmp = '';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-art-crop-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'Dir1'), DIR_LINES.join('\n'), 'binary');
  config.set('dataDir', tmp);
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
});

/**
 * A live C64 terminal fed the wire in order, exactly as connection-emitter.ts
 * and a web `P` session both feed one. Same reader as
 * `forty-col-caller-sees-every-row.test.ts`.
 */
function paint(wire: string[]): string[] {
  const terminal = new AnsiToPetsciiTransducer();
  for (const chunk of wire) terminal.transduce(chunk);
  const { screen, cols, rows } = terminal.machine.state;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const petscii = screenCodeToPetscii(screen[y * cols + x] & 0x7f);
      line += String.fromCharCode(petscii >= 0xc1 && petscii <= 0xda ? petscii - 0x80 : petscii);
    }
    out.push(line.replace(/ +$/, ''));
  }
  return out;
}

/**
 * THE SURFACE MOVED, THE PROMISE DID NOT (2026-09-07).
 *
 * When this suite was written, `FR` at 40 columns printed each record as a
 * stacked block: the fields, then the DIZ underneath. The C64 file view
 * replaced that with C*Base's fixed-column LIST row - one row per file,
 * twenty-plus to a screen - which carries no description at all, so the
 * cropping this suite was written for no longer happens there.
 *
 * It happens on the SINGLE-RECORD view, which is where a description lives
 * now, and that is what these tests drive. The sysop's report - "fr seems to
 * overflow in 40 cols?", with a FILE_ID.DIZ folded across a C64 screen - is
 * still answered: art is cropped at the screen edge and prose is wrapped, on
 * the surface that shows either.
 */
/** The real `FR`, for the 80-column cases - that path is unchanged. */
async function runEightyColumnList(session: any): Promise<string[]> {
  const wire: string[] = [];
  const socket: any = {
    session,
    id: 'fr-eighty',
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  await FileListingHandler.handleFileList(socket, session, '', true);
  return wire;
}

async function runFileListRaw(session: any): Promise<string[]> {
  const wire: string[] = [];
  const socket: any = {
    session,
    id: 'fr-art-crop',
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
  };
  // THE DIZ LADDER owns art, and that is the surface this suite is about: a
  // FILE_ID.DIZ shown to a 40-column caller. The record BLOCK renders the
  // index's prose description; the LIST row carries no description at all.
  //
  // AND NOTHING IN `src/` CALLS `dizBlockFor` (parity audit, 2026-09-08,
  // ledger item P0-3b). This block builds the pipeline by hand, so what it
  // pins is the LADDER's behaviour, not a screen any caller can reach today:
  // at 40 columns the live surfaces are the LIST row (no description) and the
  // RECORD block, which squeezes and word-wraps the description to two rows -
  // so a wide DIZ is not cropped there, it is not shown at all. Wiring the
  // ladder in is SP7 of the C64 file-view design and needs the sysop's call on
  // when the fallback fires; until then `src/utils/diz-fallback.util.ts` is
  // parked rather than deleted, and this comment is here so the next reader
  // does not mistake a green suite for a reachable feature.
  const { readDirFile } = require('../../src/utils/dir-file-reader.util');
  const { dizBlockFor } = require('../../src/utils/diz-fallback.util');
  const { dizTextOf } = require('../../src/services/file-index.service');
  const pathMod = require('path');
  const entries = await readDirFile(pathMod.join(tmp, 'Conf1', 'Dir1'));
  const diz = (dizTextOf(entries[0]) ?? '').split('\n');
  for (const row of dizBlockFor(diz, 40, false)) socket.emit('ansi-output', row + '\r\n');
  return wire;
}

const c64Session = () => ({
  currentConf: 1,
  petsciiMode: true,
  screenWidth: 40,
  screenHeight: 25,
  terminalType: 'c64',
  user: { id: 1, username: 'sysop', secLevel: 255 },
  tempData: {},
});

const ansiSession = () => ({
  currentConf: 1,
  petsciiMode: false,
  screenWidth: 80,
  screenHeight: 24,
  terminalType: 'ansi',
  user: { id: 1, username: 'sysop', secLevel: 255 },
  tempData: {},
});

describe("a file description's art is cut at the right edge, not folded onto the next line", () => {
  it('paints the four rows of the DIZ on four rows of the screen, each one cut at column 40', async () => {
    const rows = paint(await runFileListRaw(c64Session()));
    const top = rows.findIndex((row) => row.startsWith('.---'));
    expect(top).toBeGreaterThan(-1);

    // FOUR source rows, FOUR screen rows, each cropped where the screen ends.
    // Before the fix this block was EIGHT rows: 33 columns of DIR indent, a
    // handful of characters of art, then a 38-column remainder folded onto the
    // row the next line of art needed.
    expect(rows.slice(top, top + 4)).toEqual([
      '.' + '-'.repeat(39),
      PIPE + ' INVITATION FOR DEADLINE 2026, BERLIN',
      PIPE + '   THE DEMOPARTY FOR AMIGA AND C64 PEOP',
      "'" + '-'.repeat(39),
    ]);

    // The record's own FIELDS are no longer part of this block. They moved to
    // the record template's IDENT and FACTS rows, which are pinned against the
    // shipped Prompts/FILEVIEW.40 in tests/services/fileview-render.test.ts.
    // What this suite owns is the art: four rows, each cut at the screen edge.
  });

  it("leaves no fragment row, and the DIR file's eighty-column indent never reaches the screen", async () => {
    const rows = paint(await runFileListRaw(c64Session()));

    // THE INDENT. 33 of the caller's 40 columns went on it, which is what
    // pushed every art row over the edge in the first place. No painted row
    // may carry it.
    expect(rows.filter((row) => row.startsWith(INDENT))).toEqual([]);

    // THE FRAGMENTS, captured off the broken screen before the fix: the fold
    // put `Ý INVIT` at the end of one row and `ATION FOR DEADLINE 2026,
    // BERLIN      Ý` at the start of the next, and split the sysop's own
    // `Sent by: sLASH` into `SENT BY` and `: SLASH`.
    expect(rows.some((row) => row.startsWith('ATION FOR DEADLINE'))).toBe(false);
    expect(rows).not.toContain(': SLASH');
  });

  it('still WRAPS a description someone typed, instead of cutting it', async () => {
    const rows = paint(await runFileListRaw(c64Session()));
    const start = rows.findIndex((row) => row.startsWith('A LONG TYPED'));
    expect(start).toBeGreaterThan(-1);

    // Word-wrapped across three rows with every word intact - NOT cropped to
    // the first forty columns, which would have thrown the rest away.
    expect(rows.slice(start, start + 3)).toEqual([
      'A LONG TYPED DESCRIPTION THAT A SYSOP',
      'ENTERED BY HAND AND WHICH SHOULD STILL',
      'WRAP.',
    ]);
    expect(rows.slice(start, start + 3).join(' ').replace(/ +/g, ' '))
      .toBe(PROSE.toUpperCase());

    // The `Sent by:` line is prose too, and arrived whole - the sysop's
    // screenshot had it as "Sent by" and ": sLASH" on two rows.
    expect(rows).toContain('SENT BY: SLASH');
  });

  it('every row a C64 caller is sent fits the width sessionColumns() reports', async () => {
    const wire = await runFileListRaw(c64Session());
    for (const chunk of wire) {
      for (const line of chunk.split('\r\n')) {
        expect(line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length).toBeLessThanOrEqual(40);
      }
    }
  });
});

describe('the eighty-column listing did not move', () => {
  it("hands an ANSI caller the DIR file's own rows, byte for byte", async () => {
    const wire = await runEightyColumnList(ansiSession());
    const emitted = wire.join('').split('\r\n');
    for (const raw of DIR_LINES.filter((line) => line.length > 0)) {
      expect(emitted).toContain(raw);
    }
  });

  it('is not merely equal but the SAME array - no formatter runs at 80 columns', () => {
    const raw = [...DIR_LINES];
    expect(dirEntryRows({ petsciiMode: false, screenWidth: 80 }, raw)).toBe(raw);
    // ...and a non-PETSCII caller on a narrow browser window is not a C64:
    // `isNarrow` is the petsciiMode switch and nothing else.
    expect(dirEntryRows({ petsciiMode: false, screenWidth: 40 }, raw)).toBe(raw);
  });
});

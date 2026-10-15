/**
 * A 68K DOOR'S RULE REACHES A C64 AS A RULE, NOT A ROW OF QUESTION MARKS.
 *
 * END TO END, on the path a real PETSCII caller travels, for the five doors
 * the board already marks C64_ADAPT=40 that put latin-1 high bytes on the
 * glass every run:
 *
 *   captured 68K door output
 *     -> emitter.emit('ansi-output', chunk)
 *     -> installC64DoorAdapter's patched emit   (FrameReconstructor)
 *     -> quiet-gap tick on REAL timers          (frame boundary)
 *     -> adaptFrame + renderDiff                (40x25 ANSI)
 *     -> buildConnectionEmitter                 (the LIVE telnet/SSH transport)
 *     -> AnsiToPetsciiTransducer                (inside that emitter)
 *     -> connection.write                       (the wire)
 *     -> PetsciiMachine                         (the KERNAL oracle: what a C64 SHOWS)
 *
 * A 68K door's output is decoded latin1 out of the emulator
 * (`src/amiga-emulation/api/DosLibrary.ts:1222` and the FileHandle path), so
 * the code point the encoder sees IS the byte the door wrote. Until the Topaz
 * fold table `asciiToPetsciiByte` mapped four of the 96 latin-1 high bytes and
 * sent the other 92 to a C64 as '?'.
 *
 * Each case asserts BOTH directions on purpose: the folded run is on the
 * caller's screen, and the '?'-spelled run - the exact damage the sysop was
 * looking at - is NOT. Reverting the fold rows in
 * sdk/petscii/unicode-to-petscii.ts flips every one of them.
 */
import * as fs from 'fs';
import * as path from 'path';
import { adaptFrame, FrameReconstructor, type Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';
import {
  asciiToPetsciiByte,
  PetsciiMachine,
  printablePetsciiToScreenCode,
} from '@amiexpress/bbs-door-sdk/petscii';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { installC64DoorAdapter, uninstallC64DoorAdapter } from '../../src/server/c64-door-adapter';

const COLS = 40;
const ROWS = 25;
const SOURCE_COLS = 80;
const CHUNK = 64;
const CHUNKS_PER_FRAME = 8;
const TICK_MS = 5;
const MAX_FRAME_MS = 40;
const GAP_MS = 20;

const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

const DIR = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');
const manifest: Record<string, { encoding?: 'latin1' }> = JSON.parse(
  fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'),
);
const fixtureText = (id: string) =>
  fs
    .readFileSync(path.join(DIR, `${id}.${manifest[id].encoding === 'latin1' ? 'txt' : 'ans'}`))
    .toString(manifest[id].encoding ?? 'utf8');

/** One fixture through the real emitter with the adapter installed. */
async function drive(text: string): Promise<Buffer[]> {
  const writes: Buffer[] = [];
  const connection: any = {
    sessionId: 'latin1-topaz',
    session: { terminalType: 'c64', petsciiMode: true, screenWidth: COLS, screenHeight: ROWS },
    write: (data: Buffer | string) => writes.push(Buffer.from(data as any)),
    on: () => undefined,
    off: () => undefined,
    close: () => undefined,
  };
  const emitter = buildConnectionEmitter(connection);
  installC64DoorAdapter(emitter, connection.session, { tickMs: TICK_MS, maxFrameMs: MAX_FRAME_MS });
  for (let i = 0, n = 0; i < text.length; i += CHUNK, n++) {
    emitter.emit('ansi-output', text.slice(i, i + CHUNK));
    if (n % CHUNKS_PER_FRAME === CHUNKS_PER_FRAME - 1) await wait(GAP_MS);
  }
  uninstallC64DoorAdapter(emitter);
  return writes;
}

/**
 * The screen code the C64 shows for `ch`, taken from the SDK's own encoder
 * rather than from a table written here: a second opinion about the mapping is
 * exactly what an oracle must not be.
 */
const screenCodeOf = (ch: string): number =>
  printablePetsciiToScreenCode(asciiToPetsciiByte(ch.codePointAt(0) as number, 1).byte);

/** Is `text` on the machine's screen, on one row, as a contiguous run? */
function screenShows(machine: PetsciiMachine, text: string): boolean {
  const want = Array.from(text).map(screenCodeOf);
  for (let y = 0; y < ROWS; y++) {
    const row: number[] = [];
    for (let x = 0; x < COLS; x++) row.push(machine.state.screen[y * COLS + x] & 0x7f);
    for (let start = 0; start + want.length <= row.length; start++) {
      let hit = true;
      for (let i = 0; i < want.length; i++) if (row[start + i] !== want[i]) { hit = false; break; }
      if (hit) return true;
    }
  }
  return false;
}

/** Did the caller's screen EVER show `text` during the run? */
function everShowed(writes: ReadonlyArray<Buffer>, text: string): boolean {
  const machine = new PetsciiMachine();
  for (const chunk of writes) {
    machine.feed(chunk);
    if (screenShows(machine, text)) return true;
  }
  return false;
}

/** The 80x25 screen the adapter's reconstructor holds when the door stops, chunked identically. */
function reconstruct(text: string): Frame {
  const screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
  for (let i = 0; i < text.length; i += CHUNK) screen.write(text.slice(i, i + CHUNK));
  return screen.snapshot();
}

const isLatin1High = (ch: string) => {
  const cp = ch.codePointAt(0) as number;
  return cp >= 0xA0 && cp <= 0xFF;
};

/**
 * The five marked doors, each with a run the 68K binary really painted. `wrote`
 * is the door's own bytes; `shows` is what a C64 must end up with; `damage` is
 * what it showed before the fold table - the sysop-visible defect.
 */
const CASES: ReadonlyArray<{ id: string; wrote: string; shows: string; damage: string }> = [
  // HackCheck spells ENTER and FOUR with the registered-trademark glyph.
  { id: 'hackcheck', wrote: 'EnTe® thE laST foU® digiTs', shows: 'EnTeR thE laST foUR digiTs', damage: 'EnTe? thE laST foU? digiTs' },
  // 5D-User's credit line.
  { id: 'ulist', wrote: '©1993', shows: 'C1993', damage: '?1993' },
  // SiX-Status's copyright row.
  { id: 'six_status', wrote: '© 1995 b WHiZ', shows: 'C 1995 b WHiZ', damage: '? 1995 b WHiZ' },
  // DoorRepo's file list carries a filename with a sharp s in it.
  { id: 'doorrepo', wrote: '$CP-BUß1.lha', shows: '$CP-BUB1.lha', damage: '$CP-BU?1.lha' },
  // JoinCnf's logo row draws with ¡ AND '|' - which is why ¡ folds to '!' and
  // not to the vertical bar its bitmap is nearest to.
  { id: 'j', wrote: '/   ¡   \\', shows: '/   !   \\', damage: '/   ?   \\' },
];

describe.each(CASES)('$id: a latin-1 glyph a 68K door wrote', ({ id, wrote, shows, damage }) => {
  let writes: Buffer[];
  beforeAll(async () => { writes = await drive(fixtureText(id)); });

  it('is on the caller\'s 40x25 glass as the Topaz picture, not as a question mark', () => {
    expect({ id, shows: everShowed(writes, shows), damage: everShowed(writes, damage) })
      .toEqual({ id, shows: true, damage: false });
  });

  it('is really in the capture - the case would assert nothing otherwise', () => {
    expect(fixtureText(id)).toContain(wrote);
    expect(Array.from(wrote).some(isLatin1High)).toBe(true);
  });
});

describe('every latin-1 cell the ladder puts on a 40-column frame', () => {
  /**
   * The whole corpus, not just the five: no cell of any adapted frame may
   * resolve to '?' unless its byte is one of the three the encoder refuses on
   * purpose ($A7 SECTION SIGN, $B6 PILCROW, $BF INVERTED QUESTION MARK - see
   * sdk/tests/petscii/latin1-topaz-fold.test.ts).
   */
  const REFUSED = new Set(['§', '¶', '¿']);

  it('resolves to a real PETSCII glyph, across all 24 fixtures', () => {
    const damaged: Array<{ id: string; ch: string; count: number }> = [];
    let latin1Cells = 0;
    for (const id of Object.keys(manifest)) {
      const adapted = adaptFrame(reconstruct(fixtureText(id)), { cols: COLS, rows: ROWS });
      const bad = new Map<string, number>();
      for (const row of adapted.cells) {
        for (const cell of row) {
          if (!isLatin1High(cell.ch)) continue;
          latin1Cells++;
          if (asciiToPetsciiByte(cell.ch.codePointAt(0) as number, 1).byte === 0x3F && !REFUSED.has(cell.ch)) {
            bad.set(cell.ch, (bad.get(cell.ch) ?? 0) + 1);
          }
        }
      }
      for (const [ch, count] of bad) damaged.push({ id, ch, count });
    }
    // Non-vacuity: the corpus really does carry latin-1 cells at 40 columns.
    expect(latin1Cells).toBeGreaterThan(10);
    expect(damaged).toEqual([]);
  });
});

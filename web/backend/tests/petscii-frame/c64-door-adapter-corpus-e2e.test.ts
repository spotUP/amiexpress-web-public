/**
 * END-TO-END REACHABILITY for the C64 door adapter (Phase 3, Task 7).
 *
 * Every other test in this area proves one layer. This one proves the WHOLE
 * path a C64 caller actually travels, for all eleven corpus fixtures:
 *
 *   captured 68K door output
 *     -> emitter.emit('ansi-output', chunk)          (what a door does)
 *     -> installC64DoorAdapter's patched emit        (FrameReconstructor)
 *     -> quiet-gap tick on REAL timers               (frame boundary)
 *     -> adaptFrame + renderDiff                     (40x25 ANSI)
 *     -> buildConnectionEmitter                      (the LIVE telnet/SSH transport)
 *     -> AnsiToPetsciiTransducer                     (inside that emitter)
 *     -> connection.write                            (the wire)
 *     -> PetsciiMachine                              (the KERNAL oracle: what a C64 SHOWS)
 *
 * Nothing here is mocked but the socket the transport writes to. No emulator
 * is started: the fixtures ARE captured 68K output (sdk/tests/petscii/frame/
 * fixtures/manifest.json records the binary, the script and the sha256 of
 * each), which is what makes this affordable to run on every commit.
 *
 * The three questions, per fixture:
 *   1. does a PETSCII caller end on a screen a C64 can show?  (no ESC on the
 *      wire, 1000 cells, cursor inside 40x25, every adapted row 40 cells,
 *      every CUP the adapter emitted inside 25x40, first paint is clear+home)
 *   2. is anything the ladder produced LOST between there and the glass?
 *      (the oracle's screen IS the last adapted frame, cell for cell; and the
 *      per-rule corpus invariants hold on the frame the caller ends on)
 *   3. is an ANSI caller byte-for-byte unaffected?  (double capture: the same
 *      fixture through the same emitter with and without the adapter)
 *
 * Plus: the door's own screen text reached the caller at some point in the
 * run, and a mid-fixture disconnect leaves no adapter and no live timer.
 *
 * RED PROOF (recorded in the task report, applied to a SCRATCH COPY of the
 * adapter module, never to src): `c64AdapterDrives` -> `return true` makes
 * every case-3 identity assertion fail; -> `return false` makes every case-1
 * and case-2 assertion fail. Neither mutant leaves this file green.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  FrameReconstructor,
  adaptFrame,
  adaptRows,
  applyRule,
  chooseRule,
  columnParts,
  isBlank,
  isRuleRow,
  rowText,
  type Cell,
  type Frame,
} from '@amiexpress/bbs-door-sdk/petscii/frame';
import {
  PetsciiMachine,
  UNICODE_TO_PETSCII,
  printablePetsciiToScreenCode,
} from '@amiexpress/bbs-door-sdk/petscii';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
  c64AdapterFor,
} from '../../src/server/c64-door-adapter';

const COLS = 40;
const ROWS = 25;
/** The grid a 68K door believes it is painting on. */
const SOURCE_COLS = 80;
/** Door output arrives in small pieces; 64 bytes is what the identity pin uses. */
const CHUNK = 64;
/** A quiet gap after this many chunks, so the tick cuts a frame mid-stream. */
const CHUNKS_PER_FRAME = 8;
const TICK_MS = 5;
const MAX_FRAME_MS = 40;
/** Comfortably past TICK_MS: the adapter's own timer must fire, not a fake one. */
const GAP_MS = 20;

/**
 * Waits use the setTimeout captured BEFORE the census patches the global, so
 * the census counts the adapter's handles and nothing else.
 */
const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

// ---------------------------------------------------------------- fixtures

const DIR = path.resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures');

interface ManifestEntry {
  binary: string;
  /** Golden fixtures (`<id>.txt`) only: 8-bit door output, so latin1 or every block glyph becomes U+FFFD. */
  encoding?: 'latin1';
  /** Golden fixtures only: the capture keeps recording past the door's exit, so the LAST frame is the BBS menu. */
  containsBbsMenu?: boolean;
}

const manifest: Record<string, ManifestEntry> = JSON.parse(
  fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'),
);

const fixtureFile = (id: string) =>
  path.join(DIR, `${id}.${manifest[id].encoding === 'latin1' ? 'txt' : 'ans'}`);
const fixtureText = (id: string) =>
  fs.readFileSync(fixtureFile(id)).toString(manifest[id].encoding ?? 'utf8');

/**
 * A line of the DOOR's own screen that must reach the caller's glass at some
 * point in the run. Hand-picked from the fixture, exact case: the transducer
 * puts lowercase in screen codes $01-$1A and uppercase in $41-$5A, so case is
 * carried, not flattened.
 *
 * `fromBbsMenu` records the two goldens whose capture continues past the door
 * into the BBS's own menu repaint (manifest `containsBbsMenu`) - the door's
 * text is on the caller's screen EARLIER in the run, not at the end, which is
 * exactly what the progressive check below is for. The flag is cross-checked
 * against the manifest so this table cannot drift away from it.
 */
interface Signature {
  /** Text the door itself painted. */
  door: string;
  /** True when the fixture's LAST screen is the BBS menu rather than the door. */
  fromBbsMenu?: boolean;
}
const SIGNATURES: Record<string, Signature> = {
  aehelp: { door: 'Below are the available AmiExpress' },
  six_status: { door: 'S!X Stat V2.0' },
  kd_confstats: { door: 'All code by Json / KiNGDoM RoYaL' },
  color_wall: { door: 'cOLORWALL v1.3' },
  who: { door: 'WHo V2.0 by Spy' },
  ratiorep: { door: 'Ratio Report V1.7' },
  super_stats: { door: 'SEC LEVEL...: Sysop' },
  hststat: { door: 'Up and Download statistics' },
  rtw: { door: 'rTW v2.01', fromBbsMenu: true },
  ustats: { door: 'YoUr USeR StAtS', fromBbsMenu: true },
  what: { door: 'WHAT: Transfer Activities v2.0' },
  // The three doors marked on 2026-09-03. Their captures are HARNESS captures,
  // so no BBS menu rides along and `fromBbsMenu` stays false for all three.
  // Each signature is picked from the part of the screen the MARK is a promise
  // about - the working part, not the logo the crop is allowed to spoil.
  b: { door: 'Top Uploaders' },
  j: { door: 'Lamer Zone' },
  doorrepo: { door: 'DoorRepo v1.0' },
  // Batch 2, 2026-09-03. Same rule: a line from the working part of the
  // screen, exact case, and only characters the transducer can map (the
  // suite filters unmappable ones out, but a signature made of them would
  // assert nothing).
  size: { door: 'Total Bytes: 655450' },
  ulist: { door: 'cODED bY sVEN tHE cREATOR' },
  wall: { door: 'Enter your Line' },
  chat: { door: 'Rm(   0) Node' },
  mrcstat1: { door: 'MRC Chat Status' },
  pager5d: { door: 'Please enter your page reason' },
  dtagwall: { door: 'What color do you want on your line?' },
  avhbc: { door: 'Van Helsing' },
  hackcheck: { door: 'Digits:' },
};

// ---------------------------------------------------------------- sessions

const ansiSession = () => ({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24 });
const petsciiSession = () => ({ terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 });

// ------------------------------------------------------------ timer census

/**
 * Counts the timer handles created while it is armed and never cleared - the
 * "dispose() clears both handles" proof, made on the REAL global timers rather
 * than on jest's fake ones. `clearTimeout` on an already-fired handle still
 * takes it out of the set, and the adapter's flush() clears both handles
 * before it renders, so a clean run ends at zero.
 */
function censusTimers() {
  const live = new Set<unknown>();
  let made = 0;
  const st = global.setTimeout;
  const ct = global.clearTimeout;
  (global as any).setTimeout = (fn: any, ms?: number, ...rest: any[]) => {
    const handle = (st as any)(fn, ms, ...rest);
    live.add(handle);
    made++;
    return handle;
  };
  (global as any).clearTimeout = (handle: any) => {
    live.delete(handle);
    return (ct as any)(handle);
  };
  return {
    get live() { return live.size; },
    get made() { return made; },
    restore() { (global as any).setTimeout = st; (global as any).clearTimeout = ct; },
  };
}

// -------------------------------------------------------------- the driver

interface Wire {
  /** Everything connection.write received, in order. */
  writes: Buffer[];
  bytes: Buffer;
  /** DOUBLE CAPTURE: the ansi-output payloads that reached the transport - the adapter's frames when it is installed, the door's own chunks when it is not. */
  downstream: string[];
  liveTimers: number;
  timersMade: number;
  emitRestored: boolean;
  emitter: any;
}

/**
 * One fixture through the real emitter. `stopAfterChunks` cuts the stream
 * mid-fixture (the disconnect case).
 */
async function drive(
  text: string,
  session: any,
  useAdapter: boolean,
  opts: { stopAfterChunks?: number; uninstall?: boolean } = {},
): Promise<Wire> {
  const writes: Buffer[] = [];
  const connection: any = {
    sessionId: 'corpus-e2e',
    session,
    // TelnetConnection.write does `Buffer.from(data)` for a string (utf8) and
    // passes a Buffer through: the same two branches, so the bytes counted
    // here are the bytes that would go down the socket.
    write: (data: Buffer | string) => {
      writes.push(typeof data === 'string' ? Buffer.from(data) : Buffer.from(data));
    },
    on: () => undefined,
    off: () => undefined,
    close: () => undefined,
  };
  const emitter = buildConnectionEmitter(connection);

  // Recorded BEFORE the install, so it becomes the adapter's own downstream:
  // one entry per frame the adapter rendered.
  const downstream: string[] = [];
  const realEmit = emitter.emit.bind(emitter);
  const recorder = (event: string, ...args: any[]) => {
    if (event === 'ansi-output' && typeof args[0] === 'string') downstream.push(args[0]);
    return realEmit(event, ...args);
  };
  emitter.emit = recorder;

  const timers = censusTimers();
  try {
    if (useAdapter) installC64DoorAdapter(emitter, session, { tickMs: TICK_MS, maxFrameMs: MAX_FRAME_MS });
    const stopAfter = opts.stopAfterChunks ?? Infinity;
    let n = 0;
    for (let i = 0; i < text.length && n < stopAfter; i += CHUNK, n++) {
      emitter.emit('ansi-output', text.slice(i, i + CHUNK));
      if (n % CHUNKS_PER_FRAME === CHUNKS_PER_FRAME - 1) await wait(GAP_MS);
    }
    if (opts.uninstall !== false) uninstallC64DoorAdapter(emitter);
    return {
      writes,
      bytes: Buffer.concat(writes),
      downstream,
      liveTimers: timers.live,
      timersMade: timers.made,
      emitRestored: emitter.emit === recorder,
      emitter,
    };
  } finally {
    timers.restore();
  }
}

// ------------------------------------------------------------- the oracle

/**
 * The screen code (bank 1, reverse bit clear) the transducer prints for `ch`,
 * or null where it has no mapping and substitutes. Same derivation as
 * sdk/tests/petscii/frame/frame-render-roundtrip.test.ts, from the SDK's own
 * `printablePetsciiToScreenCode` + `UNICODE_TO_PETSCII` rather than a
 * hand-rolled table - a reverse table in the test would be a second opinion
 * about the mapping, which is exactly what an oracle must not be.
 */
function expectedScreenCode(ch: string): number | null {
  const code = ch.codePointAt(0) as number;
  if (code >= 0x61 && code <= 0x7a) return 0x01 + (code - 0x61);
  if (code >= 0x41 && code <= 0x5a) return 0x41 + (code - 0x41);
  if ((code >= 0x20 && code <= 0x3f) || code === 0x40 || code === 0x5b || code === 0x5d) {
    return printablePetsciiToScreenCode(code);
  }
  const mapped = UNICODE_TO_PETSCII.get(ch);
  return typeof mapped === 'number' ? printablePetsciiToScreenCode(mapped) : null;
}

/** What a real C64 is showing after eating these wire bytes. */
function oracle(bytes: Buffer): PetsciiMachine {
  const machine = new PetsciiMachine();
  machine.feed(bytes);
  return machine;
}

/**
 * Every cell of `frame` that the transducer HAS a screen code for, compared
 * with what the machine shows at that position. Returns the mismatches, so a
 * failure names the cell instead of just saying "false".
 *
 * (39,24) is skipped: printing there scrolls the KERNAL screen, so neither
 * the renderer nor the transducer ever paints it.
 */
function frameMismatches(machine: PetsciiMachine, frame: Frame): Array<Record<string, unknown>> {
  const bad: Array<Record<string, unknown>> = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (x === COLS - 1 && y === ROWS - 1) continue;
      const cell = frame.cells[y][x];
      const sc = expectedScreenCode(cell.ch);
      if (sc === null) continue; // unmappable glyph: the transducer substitutes
      const want = sc | (cell.rvs ? 0x80 : 0);
      const got = machine.state.screen[y * COLS + x];
      if (got !== want) bad.push({ x, y, ch: cell.ch, want, got });
    }
  }
  return bad;
}

/** How many cells of `frame` have no PETSCII screen code at all. */
const unmappable = (frame: Frame) =>
  frame.cells.reduce((n, row) => n + row.filter((c) => expectedScreenCode(c.ch) === null).length, 0);

/** Is `text` on the machine's screen, on one row, as a contiguous run? */
function screenShows(machine: PetsciiMachine, text: string): boolean {
  const want = Array.from(text).map(expectedScreenCode);
  if (want.some((c) => c === null)) throw new Error(`signature has an unmappable character: ${text}`);
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

/** Did the caller's screen EVER show `text` during the run? (frame by frame, in order) */
function everShowed(writes: ReadonlyArray<Buffer>, text: string): boolean {
  const machine = new PetsciiMachine();
  for (const chunk of writes) {
    machine.feed(chunk);
    if (screenShows(machine, text)) return true;
  }
  return false;
}

// ------------------------------------------------- corpus rule invariants

const cellText = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).join('');
const multiset = (cells: ReadonlyArray<Cell>) => cells.map((c) => c.ch).filter((ch) => ch !== ' ').sort();
const squeeze = (s: string) => s.replace(/\s+/g, '');

/**
 * `narrow`'s invariant, checked without re-implementing the rule: the output
 * row is the source columns in order, joined by exactly one space, each either
 * whole or a non-empty prefix followed by '>'. The walk BACKTRACKS because a
 * column can hold single spaces and '>' of its own.
 *
 * Same walker as sdk/tests/petscii/frame/corpus.test.ts - copied rather than
 * imported because that file is a test module (importing it would re-run its
 * 60-odd cases inside this suite).
 */
function narrowKeepsColumns(parts: string[], out: string): boolean {
  const walk = (i: number, s: string): boolean => {
    if (i === parts.length) return s.length === 0;
    const p = parts[i];
    const after = (rest: string) =>
      i === parts.length - 1 ? walk(i + 1, rest) : rest.startsWith(' ') && walk(i + 1, rest.slice(1));
    if (s.startsWith(p) && after(s.slice(p.length))) return true;
    for (let k = Math.min(p.length - 1, s.length - 1); k >= 1; k--) {
      if (s.slice(0, k) === p.slice(0, k) && s[k] === '>' && after(s.slice(k + 1))) return true;
    }
    return false;
  };
  return walk(0, out);
}

/**
 * The Phase 2 per-rule invariants, asserted on the frame the caller ENDS on.
 * Returns a list of violations (empty when the ladder lost nothing).
 */
function ruleViolations(frame: Frame): Array<Record<string, unknown>> {
  const bad: Array<Record<string, unknown>> = [];
  const { rows } = adaptRows(frame, { cols: COLS });
  for (let y = 0; y < frame.rows; y++) {
    const src = frame.cells[y];
    const out = rows.filter((r) => r.source === y);
    if (out.length === 0) continue;
    const joined = out.flatMap((r) => r.cells);
    const rule = out[0].rule;
    const where = { y, rule };
    if (rule === 'crop') {
      if (cellText(joined).trimEnd() !== cellText(src.slice(0, COLS)).trimEnd()) bad.push({ ...where, why: 'left 40 not verbatim' });
      const dropped = src.slice(COLS).filter((c) => !isBlank(c));
      const glyphs = Array.from(new Set(dropped.map((c) => c.ch)));
      if (glyphs.some((g) => /[A-Za-z0-9]/.test(g))) bad.push({ ...where, why: 'content cropped', glyphs });
      if (!isRuleRow(src) && glyphs.length > 1) bad.push({ ...where, why: 'more than one glyph cropped', glyphs });
      if (dropped.some((c) => c.rvs)) bad.push({ ...where, why: 'reverse video cropped' });
    } else if (rule === 'gutter' || rule === 'split') {
      const got = multiset(joined);
      const want = multiset(src);
      if (got.join('') !== want.join('')) bad.push({ ...where, why: 'non-space multiset changed' });
    } else if (rule === 'deindent') {
      if (out.length !== 1) bad.push({ ...where, why: 'deindent produced more than one row' });
      if (cellText(joined).trimEnd() !== cellText(src).trim()) bad.push({ ...where, why: 'deindent lost more than leading blanks' });
    } else if (rule === 'narrow') {
      if (out.length !== 1) bad.push({ ...where, why: 'narrow produced more than one row' });
      const parts = columnParts(src).map((p) => cellText(p as ReadonlyArray<Cell>));
      if (parts.length === 0) bad.push({ ...where, why: 'narrow on a row with no columns' });
      if (!narrowKeepsColumns(parts, cellText(joined).trimEnd())) bad.push({ ...where, why: 'narrow dropped more than a tail', parts });
    } else {
      if (squeeze(cellText(joined)) !== squeeze(cellText(src))) bad.push({ ...where, why: 'reflow lost or reordered characters' });
    }
  }
  return bad;
}

/** The 80x25 screen the adapter's own FrameReconstructor holds when the door stops, chunked identically. */
function reconstruct(text: string): Frame {
  const screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
  for (let i = 0; i < text.length; i += CHUNK) screen.write(text.slice(i, i + CHUNK));
  return screen.snapshot();
}

// ------------------------------------------------------------- the cases

describe.each(Object.keys(manifest))('fixture %s end to end', (id) => {
  const text = fixtureText(id);
  const source = reconstruct(text);
  const adapted = adaptFrame(source, { cols: COLS, rows: ROWS });

  let c64: Wire;
  let ansiWith: Wire;
  let ansiWithout: Wire;
  let machine: PetsciiMachine;

  beforeAll(async () => {
    c64 = await drive(text, petsciiSession(), true);
    ansiWith = await drive(text, ansiSession(), true);
    ansiWithout = await drive(text, ansiSession(), false);
    machine = oracle(c64.bytes);
  });

  // ---- case 1: a screen a C64 can show
  it('leaves the PETSCII caller on a 40x25 screen: no ESC on the wire, 1000 cells, cursor in range', () => {
    expect(c64.bytes.length).toBeGreaterThan(0);
    expect(c64.bytes.includes(0x1b)).toBe(false);
    expect(machine.state.screen.length).toBe(COLS * ROWS);
    expect({
      cursorInRange:
        machine.state.cursorX >= 0 && machine.state.cursorX < COLS &&
        machine.state.cursorY >= 0 && machine.state.cursorY < ROWS,
      cursor: [machine.state.cursorX, machine.state.cursorY],
    }).toEqual({ cursorInRange: true, cursor: [machine.state.cursorX, machine.state.cursorY] });
  });

  it('renders at least one frame, and the first one is a full clear+home paint', () => {
    expect(c64.downstream.length).toBeGreaterThan(0);
    expect(c64.downstream[0].startsWith('\x1b[2J\x1b[H')).toBe(true);
  });

  it('every adapted row is exactly 40 cells and every cursor address the adapter emitted is inside 25x40', () => {
    for (const row of adaptRows(source, { cols: COLS }).rows) {
      expect({ source: row.source, rule: row.rule, cells: row.cells.length })
        .toEqual({ source: row.source, rule: row.rule, cells: COLS });
    }
    const cups = [...c64.downstream.join('').matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    const outside = cups.filter((m) => Number(m[1]) > ROWS || Number(m[2]) > COLS).map((m) => m[0]);
    expect(outside).toEqual([]);
  });

  it('closes every frame it sends: no held escape, no bare CR at the end of a payload', () => {
    for (const frame of c64.downstream) {
      expect(frame).toMatch(/\x1b\[\d+;\d+H$/);
      expect(frame.endsWith('\r')).toBe(false);
    }
  });

  // ---- case 2: nothing the ladder produced is lost
  it('shows exactly the last adapted frame on the glass - every mappable cell, in place', () => {
    // Non-vacuity: the comparison skips cells PETSCII has no code for, so it
    // would pass on an empty screen. The painted-cell count is what stops
    // that, and the unmappable ones must stay a minority of the frame.
    const painted = adapted.cells.flat().filter((c) => !isBlank(c) && expectedScreenCode(c.ch) !== null).length;
    expect({ id, enoughCells: painted > 20, mostlyMappable: unmappable(adapted) < painted })
      .toEqual({ id, enoughCells: true, mostlyMappable: true });
    expect(frameMismatches(machine, adapted)).toEqual([]);
    expect([machine.state.cursorX, machine.state.cursorY]).toEqual([adapted.cursor.x, adapted.cursor.y]);
  });

  it('every non-blank row of the adapted tail is on the caller\'s screen', () => {
    // A row whose text contains a glyph PETSCII has no code for cannot be
    // asserted through the oracle as a run; the cell-for-cell check above
    // already covers every mappable cell of it.
    const tail = adaptRows(source, { cols: COLS }).rows.slice(-ROWS);
    const assertable = tail
      .map((row) => rowText(row.cells).trimEnd())
      .filter((t) => t.trim().length > 0)
      .filter((t) => Array.from(t.trim()).every((ch) => expectedScreenCode(ch) !== null));
    expect(assertable.length).toBeGreaterThan(0);
    expect(assertable.filter((t) => !screenShows(machine, t.trim()))).toEqual([]);
  });

  it('loses nothing per the corpus rule invariants on the frame the caller ends on', () => {
    expect(ruleViolations(source)).toEqual([]);
  });

  it('puts the door\'s own screen text in front of the caller', () => {
    const sig = SIGNATURES[id];
    expect({ id, fromBbsMenu: sig.fromBbsMenu ?? false })
      .toEqual({ id, fromBbsMenu: manifest[id].containsBbsMenu ?? false });
    expect({ id, showed: everShowed(c64.writes, sig.door) }).toEqual({ id, showed: true });
  });

  // ---- case 3: the 80-column non-negotiable
  it('is byte-for-byte identical for an ANSI caller, with the adapter and without it', () => {
    expect(ansiWith.bytes.length).toBeGreaterThan(0);
    expect(ansiWith.bytes.equals(ansiWithout.bytes)).toBe(true);
    expect(c64AdapterFor(ansiWith.emitter)).toBeNull();
  });

  it('adapts the PETSCII caller\'s bytes - otherwise the identity pin above is vacuous', () => {
    const plain = c64.bytes;
    expect(plain.length).toBeGreaterThan(0);
    expect(plain.equals(ansiWithout.bytes)).toBe(false);
  });

  // ---- timers
  it('leaves no live timer behind: uninstall disposed both handles', () => {
    expect({ live: c64.liveTimers, made: c64.timersMade > 0 }).toEqual({ live: 0, made: true });
    expect(c64.emitRestored).toBe(true);
    expect(c64AdapterFor(c64.emitter)).toBeNull();
  });
});

/**
 * The caller hangs up mid-door. The door.handler teardown path is
 * `uninstallC64DoorAdapter`, which must flush what the reconstructor holds,
 * clear both timers and put the original emit back - with the stream cut in
 * the middle of a fixture, i.e. mid-frame, not on a tidy boundary.
 */
describe('a mid-fixture disconnect', () => {
  it('flushes what it had, drops the adapter and leaves no live timer', async () => {
    const text = fixtureText('ustats');
    const run = await drive(text, petsciiSession(), true, { stopAfterChunks: 20 });
    expect(run.bytes.length).toBeGreaterThan(0);
    expect(run.bytes.includes(0x1b)).toBe(false);
    expect(run.liveTimers).toBe(0);
    expect(run.timersMade).toBeGreaterThan(0);
    expect(c64AdapterFor(run.emitter)).toBeNull();
    expect(run.emitRestored).toBe(true);
    // Cut at chunk 20 of 206: a partial screen, still 40x25 and still showable.
    const partial = oracle(run.bytes);
    expect(partial.state.screen.length).toBe(COLS * ROWS);
    expect(partial.state.cursorX).toBeLessThan(COLS);
    expect(partial.state.cursorY).toBeLessThan(ROWS);
  });

  it('stops adapting once it is gone: a later emit reaches the transport unadapted', async () => {
    const session = petsciiSession();
    const writes: Buffer[] = [];
    const connection: any = {
      sessionId: 'corpus-e2e-disconnect',
      session,
      write: (data: Buffer | string) => writes.push(typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)),
      on: () => undefined,
      off: () => undefined,
      close: () => undefined,
    };
    const emitter = buildConnectionEmitter(connection);
    const downstream: string[] = [];
    const realEmit = emitter.emit.bind(emitter);
    emitter.emit = (event: string, ...args: any[]) => {
      if (event === 'ansi-output' && typeof args[0] === 'string') downstream.push(args[0]);
      return realEmit(event, ...args);
    };
    installC64DoorAdapter(emitter, session, { tickMs: TICK_MS, maxFrameMs: MAX_FRAME_MS });
    emitter.emit('ansi-output', 'DOOR PAINTS');
    uninstallC64DoorAdapter(emitter);
    const framesWhileInstalled = downstream.length;
    emitter.emit('ansi-output', 'AFTER THE DOOR');
    expect(downstream.length).toBe(framesWhileInstalled + 1);
    expect(downstream[downstream.length - 1]).toBe('AFTER THE DOOR');
  });
});

/**
 * "i dont see the top of it" - the sysop, about GWALL on a C64.
 *
 * THE DEFECT, in two halves, both of which had to be fixed before a single row
 * changed on his screen.
 *
 * 1. THE PAUSE NEVER ARMED. `handleSendMessage` (io.ts, express.e:3406-3411's
 *    JH_SM) passed `state.autoPauseEnabled` as its pause gate, and that flag is
 *    set only by a `PAGINATION=` tooltype in the door's .info. GWALL declares
 *    none - `Commands/BBSCmd/GWALL.info` is read below and asserted to declare
 *    none, so this suite cannot drift away from the door - and neither do ctop,
 *    `I`, `games` or Olm. The adapted-frame page walk was therefore dead code
 *    for every one of them. express.e has no PAGINATION at all: checkForPause
 *    is called unconditionally from JH_SM and gates only on nonStopDisplayFlag
 *    and userLineLen (express.e:5181-5201). The tooltype is this board's own
 *    throttle on the LINE counter, and it stays there - an 80-column caller's
 *    wire must not move - but it no longer silences the adapted pause, which
 *    guards an overflow the door cannot know about because adaptation creates
 *    it downstream of the door.
 *
 * 2. THE OVERFLOW WAS MEASURED FROM THE WRONG END. The window came from
 *    `adaptFrame`, which anchors at `total - 25` where `total` counts the BLANK
 *    TAIL of the 80x25 grid: every unused source row costs an adapted row and
 *    shoves a PAINTED row off the top. `unseenRows()` measured the painted
 *    height instead, so the two disagreed and the caller lost the difference.
 *    Measured over the 29 corpus fixtures, 22 lost painted rows off the top -
 *    gwall 5 while unseenRows reported 1, olm 4 reporting 0, `b` 4/0, ratiorep
 *    4/0, super_stats 4/0, ulist 3/0, six_status 9 reporting 10. The window is
 *    now anchored on the painted height too (`C64DoorFrameAdapter.windowTop`),
 *    so the rows it pushes off the top ARE `unseenRows()`, and the pause walks
 *    exactly those.
 *
 * WHAT THIS SUITE PROVES, and it is not "a pause fired". The door's OWN bytes -
 * the captured 68K output of `Doors/GWall/GWall`, sha256 pinned in the corpus
 * manifest - are replayed the way `AEDoorLibrary.writeStr` sends them, one JH_SM
 * per line, through the real `XIMIOHandler.handleSendMessage` on a `petsciiMode`
 * 40x25 session with the real `installC64DoorAdapter` seam. The wire that comes
 * out is replayed through the real `AnsiToPetsciiTransducer` into a real
 * `PetsciiMachine`, and the assertions read SCREEN CODES back off that machine:
 * which rows the caller saw on page one, which on page two, and that page two
 * resumes at the row that was next - no repeat, no skip.
 *
 * CHUNK BOUNDARIES. Nothing here counts rows in a chunk. `adapter.write()` feeds
 * a FrameReconstructor that has already absorbed every write and resolved every
 * cursor move, and every measurement (`unseenRows`, `windowTop`, the paint) is
 * taken from that reconstructor, memoised per write. A source row built from
 * three JH_SM messages is one row when it is measured; a message that paints
 * over a row already on screen replaces it rather than adding one. The suite
 * exercises this directly: `writeStr` splits at 198 characters, so the wall's
 * long comment rows arrive as several messages, and the row census below is
 * taken against a reconstructor fed the SAME chunks.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  AnsiToPetsciiTransducer,
  PetsciiMachine,
  UNICODE_TO_PETSCII,
  printablePetsciiToScreenCode,
} from '@amiexpress/bbs-door-sdk/petscii';
import {
  FrameReconstructor,
  adaptRows,
  isBlank,
  rowText,
  type AdaptedRow,
} from '@amiexpress/bbs-door-sdk/petscii/frame';

import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import {
  C64DoorFrameAdapter,
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

const ROWS = 25;
const COLS = 40;
const SOURCE_COLS = 80;
/** express.e:5193, byte for byte. */
const PAUSE_PROMPT = '(Pause)...More(y/n/ns)? ';

const REPO = path.resolve(__dirname, '../../../..');
const FIXTURE = path.join(REPO, 'sdk/tests/petscii/frame/fixtures/gwall.ans');
const GWALL_INFO = path.join(REPO, 'Commands/BBSCmd/GWALL.info');

/** JH_SM - express.e:3406. */
const JH_SM = 4;

/**
 * The door's output as `AEDoorLibrary.writeStr` puts it on the wire: one JH_SM
 * per WriteStr call, the string carrying its own CRLF, `data` = the newline
 * flag. Split on CRLF and put it back, which is what the door's `transmit()`
 * (WriteStr(diface, line, LF)) produces.
 */
function writeStrMessages(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  for (;;) {
    const at = rest.indexOf('\r\n');
    if (at < 0) {
      if (rest.length > 0) out.push(rest);
      return out;
    }
    out.push(rest.slice(0, at + 2));
    rest = rest.slice(at + 2);
  }
}

// ------------------------------------------------------------- the oracle

/**
 * The screen code the transducer prints for `ch`, or null where it has none.
 * Same derivation as c64-door-adapter-corpus-e2e.test.ts, from the SDK's own
 * tables - a hand-rolled reverse table would be a second opinion about the
 * mapping, which is what an oracle must not be.
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

/** The screen codes an adapted row should light, `null` where PETSCII has none. */
const wantCodes = (row: AdaptedRow | undefined): Array<number | null> =>
  Array.from({ length: COLS }, (_, x) => {
    const cell = row?.cells[x];
    if (!cell) return printablePetsciiToScreenCode(0x20);
    const sc = expectedScreenCode(cell.ch);
    return sc === null ? null : sc | (cell.rvs ? 0x80 : 0);
  });

/**
 * A live C64 fed the wire in order, the way connection-emitter.ts feeds one.
 * `codes(y)` is what the KERNAL screen holds on row y; `text(y)` is the same
 * row read back as characters, case-folded because a bank-0 screen has one
 * case.
 */
class Glass {
  readonly terminal = new AnsiToPetsciiTransducer();
  readonly machine = new PetsciiMachine();
  private consumed = 0;
  constructor(private readonly wire: string[]) {}
  private settle(): void {
    while (this.consumed < this.wire.length) {
      const bytes = this.terminal.transduce(this.wire[this.consumed++]);
      if (bytes && bytes.length) this.machine.feed(Buffer.from(bytes));
    }
  }
  codes(y: number): number[] {
    this.settle();
    const out: number[] = [];
    for (let x = 0; x < COLS; x++) out.push(this.machine.state.screen[y * COLS + x]);
    return out;
  }
  text(y: number): string {
    return this.codes(y)
      .map((sc) => {
        const petscii = screenCodeToChar(sc & 0x7f);
        return petscii;
      })
      .join('')
      .replace(/ +$/, '');
  }
  screen(): string {
    return Array.from({ length: ROWS }, (_, y) => this.text(y)).join('\n');
  }
}

/** Screen code -> the ASCII letter a reader sees, upper-cased (bank 0 has one case). */
function screenCodeToChar(sc: number): string {
  if (sc >= 0x01 && sc <= 0x1a) return String.fromCharCode(0x41 + (sc - 0x01));
  if (sc >= 0x41 && sc <= 0x5a) return String.fromCharCode(0x41 + (sc - 0x41));
  if (sc >= 0x20 && sc <= 0x3f) return String.fromCharCode(sc);
  if (sc === 0x00) return '@';
  return '.';
}

/**
 * Compare one row of the glass with the adapted row it should be showing, cell
 * by cell, skipping the cells PETSCII has no code for (the transducer
 * substitutes there, and that substitution is the corpus suite's subject, not
 * this one's). Returns the mismatches so a failure names the cell.
 */
function rowMismatches(glass: Glass, y: number, row: AdaptedRow | undefined): Array<Record<string, unknown>> {
  const got = glass.codes(y);
  const want = wantCodes(row);
  const bad: Array<Record<string, unknown>> = [];
  for (let x = 0; x < COLS; x++) {
    // (39,24) is never painted: printing there scrolls the KERNAL screen.
    if (x === COLS - 1 && y === ROWS - 1) continue;
    if (want[x] === null) continue;
    if (got[x] !== want[x]) bad.push({ x, y, want: want[x], got: got[x], ch: row?.cells[x]?.ch });
  }
  return bad;
}

// -------------------------------------------------------------- the rig

interface Rig {
  handler: XIMIOHandler;
  socket: any;
  glass: Glass;
  adapter: C64DoorFrameAdapter;
  /** Everything the adapter's reconstructor was fed, so the suite can rebuild the frame it measured. */
  fedToAdapter: string[];
  pauses: () => number;
  resumes: () => number;
}

const petsciiSession = () => ({ terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 });
const ansiSession = () => ({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24 });

/**
 * The XIMIOHandler harness with the geometry `door.handler.launchAmigaDoor`
 * gives a real caller, and GWALL's real pagination setting:
 * `autoPauseEnabled` is FALSE because GWALL declares no PAGINATION tooltype.
 * That is the fault-1 non-vacuity - before the fix nothing in this rig could
 * pause.
 */
function buildRig(session: any, opts: { adapter?: boolean } = {}): Rig {
  const wire: string[] = [];
  let pauses = 0;
  let resumes = 0;
  const socket: any = {
    session,
    emit: (ev: string, payload: any) => {
      if (ev === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
  };
  const emulator: any = {
    pause: () => { pauses += 1; },
    resume: () => { resumes += 1; },
    readMemory: () => 0,
    readMemory32: () => 0,
    writeMemory: () => {},
  };
  const execLibrary: any = { replyMsg: () => {}, putMsg: () => {} };
  const messageParser: any = {
    writeCommand: () => {},
    writeMessageString: () => {},
    writeData: () => {},
    readString: () => '',
    getCommandName: () => 'JH_SM',
  };
  const state: any = {
    registered: true,
    shuttingDown: false,
    nonStopText: false,
    // GWALL's real setting. No PAGINATION tooltype -> door.handler leaves this false.
    autoPauseEnabled: false,
    lineCount: 0,
    lineWrap: session?.petsciiMode === true ? COLS : SOURCE_COLS,
    pauseLines: session?.petsciiMode === true ? 25 : 24,
    language: '',
    confAccess: '',
    carrierDropped: false,
    rawArrow: false,
    transfering: false,
    doorSilent: false,
  };
  const bbsSession: any = { doorCommand: 'GWALL', doorName: 'GWall', user: { secLevel: 100 } };
  const handler = new XIMIOHandler(emulator, execLibrary, socket, messageParser, state, bbsSession);
  (handler as any).getMessageString = (m: any) => m.string || '';

  let adapter: C64DoorFrameAdapter = null as any;
  const fedToAdapter: string[] = [];
  if (opts.adapter !== false) {
    adapter = installC64DoorAdapter(socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 })!;
    if (adapter) {
      // Tap what the reconstructor is fed, so the suite can rebuild the frame
      // the adapter measured WITHOUT asking the adapter for its own answer.
      const write = adapter.write.bind(adapter);
      (adapter as any).write = (text: string) => { fedToAdapter.push(text); write(text); };
    }
  }
  return { handler, socket, glass: new Glass(wire), adapter, fedToAdapter, pauses: () => pauses, resumes: () => resumes };
}

/** The adapted rows of everything the adapter has been fed so far. */
function census(fed: ReadonlyArray<string>): { rows: AdaptedRow[]; contentEnd: number } {
  const screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
  for (const chunk of fed) screen.write(chunk);
  const { rows } = adaptRows(screen.snapshot(), { cols: COLS });
  let contentEnd = rows.length;
  while (contentEnd > 0 && rows[contentEnd - 1].cells.every(isBlank)) contentEnd--;
  return { rows, contentEnd };
}

/** Feed the door's messages until one of them holds the caller, or they run out. */
function runUntilPause(rig: Rig, messages: ReadonlyArray<string>): number {
  let sent = 0;
  for (const text of messages) {
    rig.handler.handleSendMessage({
      msgAddr: 0xdead0000,
      command: JH_SM,
      data: 1,
      replyPort: 0,
      string: text,
    } as any);
    sent += 1;
    if (rig.handler.isWaitingForLineInput()) break;
  }
  return sent;
}

const fixture = fs.readFileSync(FIXTURE).toString('utf8');
const messages = writeStrMessages(fixture);

describe('i can see the top of the global wall', () => {
  it("GWALL declares no PAGINATION - the flag that used to decide this - and is marked C64_ADAPT", () => {
    // Non-vacuity for fault 1. If someone adds PAGINATION= to GWALL.info the
    // suite below would start passing for the wrong reason, so read the door.
    const info = fs.readFileSync(GWALL_INFO).toString('latin1');
    expect(info).not.toContain('PAGINATION=');
    expect(info).toContain('_ADAPT=40');
    expect(info).toContain('TYPE=XIM');
  });

  it("the door's own bytes arrive as more than one JH_SM per screen, so nothing here counts rows in a chunk", () => {
    expect(messages.length).toBeGreaterThan(20);
    expect(messages.join('')).toBe(fixture);
  });

  it('page one carries the masthead the sysop could not see, with the pause on its bottom row', () => {
    const rig = buildRig(petsciiSession());
    expect(rig.adapter).not.toBeNull();

    const sent = runUntilPause(rig, messages);
    // FAULT 1: this is zero unless JH_SM arms the adapted pause. GWALL has no
    // PAGINATION, so before the fix the walk never started and the caller was
    // shown adaptFrame's tail.
    expect(rig.pauses()).toBe(1);
    expect(sent).toBeLessThan(messages.length); // the door really is being held

    const { rows, contentEnd } = census(rig.fedToAdapter);
    // FAULT 2 non-vacuity: the frame really does overflow, and it overflows by
    // PAINTED rows, not by the grid's blank tail.
    expect(contentEnd).toBeGreaterThan(ROWS);

    // THE MASTHEAD. Row 0 of the adapted frame is the top of the wall's logo,
    // and it is on the caller's screen.
    expect(rowText(rows[0].cells).trim().length).toBeGreaterThan(0);
    // The wall's logo interleaves a separator glyph between its letters, so the
    // banner is read off the glass with the non-letters squeezed out, the way
    // the eye reads it.
    const letters = rig.glass.screen().replace(/[^A-Z ]/g, '');
    expect(letters).toContain('GLOBAL');
    expect(letters).toContain('THERM');
    expect(letters).toContain('NUCLEAR');
    // ...and the column heading under it, which is plain text.
    expect(rig.glass.screen()).toContain('COMMENT');

    // ...and page one IS adapted rows 0..23, cell for cell, in order.
    const wrong: Array<Record<string, unknown>> = [];
    for (let y = 0; y < ROWS - 1; y++) wrong.push(...rowMismatches(rig.glass, y, rows[y]));
    expect(wrong).toEqual([]);

    // The prompt is express.e:5193 unaltered, and it is on the bottom row -
    // nowhere else.
    expect(PAUSE_PROMPT).toBe('(Pause)...More(y/n/ns)? ');
    expect(rig.glass.text(ROWS - 1)).toBe(PAUSE_PROMPT.toUpperCase().replace(/ +$/, ''));
    expect(rig.glass.screen().split('\n').slice(0, ROWS - 1).join('\n')).not.toContain('PAUSE');

    uninstallC64DoorAdapter(rig.socket);
  });

  it('page two resumes at the row that was next - no repeat, no skip', () => {
    const rig = buildRig(petsciiSession());
    runUntilPause(rig, messages);
    const { rows, contentEnd } = census(rig.fedToAdapter);
    expect(contentEnd).toBeGreaterThan(ROWS);

    // What page one showed, read off the glass, before the key.
    const pageOne = Array.from({ length: ROWS - 1 }, (_, y) => rig.glass.text(y));

    rig.handler.queueInput(' ');
    expect(rig.resumes()).toBe(1);

    // Page two is adapted rows 24.. - the row after the last one page one
    // carried. NOT row 23 again (a repeat), NOT row 25 (a skipped row).
    const wrong: Array<Record<string, unknown>> = [];
    for (let y = 0; y < ROWS; y++) wrong.push(...rowMismatches(rig.glass, y, rows[ROWS - 1 + y]));
    expect(wrong).toEqual([]);

    // Said the way the sysop would read it. GWALL's last painted row is the
    // door's sign-off; it was NOT on page one and it IS on page two, and the
    // last thing page one carried - the door's own y/N prompt - is NOT
    // repeated on page two.
    const one = pageOne.join('\n');
    const two = rig.glass.screen();
    expect(one).toContain('PUSH THE BUTTON');
    expect(one).not.toContain('OK BE LIKE THAT');
    expect(two).toContain('OK BE LIKE THAT');
    expect(two).not.toContain('PUSH THE BUTTON');

    // NOTHING WAS LOST. Every painted adapted row was on page one or page two,
    // once. This is the assertion the bug fails: before the fix the caller only
    // ever saw the LAST 25 adapted rows of the frame, blank tail included.
    const seen = new Set<number>();
    for (let y = 0; y < ROWS - 1; y++) seen.add(y);
    for (let y = 0; y < ROWS; y++) seen.add(ROWS - 1 + y);
    const missed = Array.from({ length: contentEnd }, (_, i) => i).filter((i) => !seen.has(i));
    expect(missed).toEqual([]);

    uninstallC64DoorAdapter(rig.socket);
  });

  it('a caller with pausing turned off gets no pause - and still sees the top of the wall', () => {
    // The sysop's other rule, and the fault-2 red proof in one. nonStopText
    // means no prompt may ever appear, so the page walk cannot save this
    // caller: what he sees is whatever the un-walked window shows. Anchored on
    // `total` (blank tail included) that window started five painted rows down
    // and the masthead was gone; anchored on the PAINTED height it starts at
    // row 1 and the banner is on the glass.
    const rig = buildRig(petsciiSession());
    (rig.handler as any).state.nonStopText = true;
    for (const text of messages) {
      rig.handler.handleSendMessage({ msgAddr: 0xdead0000, command: JH_SM, data: 1, replyPort: 0, string: text } as any);
    }
    // The tick is 60 s in this rig, so ask for the frame the way the emulator's
    // own stop does (AmigaDoorSession -> flush).
    rig.adapter.flush();

    expect(rig.pauses()).toBe(0);
    expect(rig.glass.screen()).not.toContain('PAUSE');

    const { rows, contentEnd } = census(rig.fedToAdapter);
    const top = Math.max(0, contentEnd - ROWS);
    expect({ total: rows.length, contentEnd, top }).toEqual({ total: 30, contentEnd: 26, top: 1 });
    const wrong: Array<Record<string, unknown>> = [];
    for (let y = 0; y < ROWS; y++) wrong.push(...rowMismatches(rig.glass, y, rows[top + y]));
    expect(wrong).toEqual([]);
    const letters = rig.glass.screen().replace(/[^A-Z ]/g, '');
    expect(letters).toContain('GLOBAL');
    expect(letters).toContain('THERM');
    expect(rig.glass.screen()).toContain('COMMENT');

    uninstallC64DoorAdapter(rig.socket);
  });

  it('a screen whose painted rows FIT is shown from its first row, blank tail and all', () => {
    // Olm, the corpus fixture with 24 painted adapted rows inside a 30-row
    // adapted frame: six of those rows are the 80x25 grid's unused tail. The
    // old window counted them and started four painted rows down; the new one
    // shows the screen from row 0 and needs no pause at all. This is the class
    // the fault-2 measurement found 18 of.
    const session = petsciiSession();
    const wire: string[] = [];
    const socket: any = { session, emit: (ev: string, p: any) => { if (ev === 'ansi-output' && typeof p === 'string') wire.push(p); return true; } };
    const adapter = installC64DoorAdapter(socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 })!;
    const olm = fs.readFileSync(path.join(REPO, 'sdk/tests/petscii/frame/fixtures/olm.ans')).toString('utf8');
    for (let i = 0; i < olm.length; i += 64) adapter.write(olm.slice(i, i + 64));
    adapter.flush();

    const { rows, contentEnd } = census([olm]);
    expect({ total: rows.length, contentEnd }).toEqual({ total: 30, contentEnd: 24 });
    expect(adapter.unseenRows()).toBe(0);
    expect(adapter.pageOffset()).toBe(0);

    const glass = new Glass(wire);
    const wrong: Array<Record<string, unknown>> = [];
    for (let y = 0; y < ROWS; y++) wrong.push(...rowMismatches(glass, y, rows[y]));
    expect(wrong).toEqual([]);
    // Non-vacuity: the old window started at row 5 (30 adapted rows minus the
    // screen), and rows 1-4 of what it skipped are PAINTED - four rows of the
    // node table's head, lost to nothing but the grid's unused tail.
    expect(rows.slice(1, 5).map((r) => rowText(r.cells).trim()).filter((t) => t.length === 0)).toEqual([]);
    expect(Math.max(0, rows.length - ROWS)).toBe(5);

    uninstallC64DoorAdapter(socket);
  });

  it('the caller is not held again for rows he has already been walked past', () => {
    // The trap on the other side of the walk. `pageTop` is the high-water mark
    // of what he has seen: if the window dropped back to the un-walked anchor
    // when the walk ended, the top rows would read as unseen a second time and
    // the door would be held again on its very next message - a prompt the
    // caller can never get out of.
    const rig = buildRig(petsciiSession());
    const before = runUntilPause(rig, messages);
    expect(rig.pauses()).toBe(1);
    rig.handler.queueInput(' ');
    expect(rig.adapter.unseenRows()).toBe(0);

    // The rest of the door runs to the end with no second prompt.
    for (const text of messages.slice(before)) {
      rig.handler.handleSendMessage({ msgAddr: 0xdead0000, command: JH_SM, data: 1, replyPort: 0, string: text } as any);
    }
    rig.handler.handleSendMessage({ msgAddr: 0xdead0000, command: JH_SM, data: 1, replyPort: 0, string: 'BYE\r\n' } as any);
    expect(rig.pauses()).toBe(1);

    uninstallC64DoorAdapter(rig.socket);
  });

  it('the rows a 40-column caller used to lose off the top are the wall masthead, not blank filler', () => {
    // The measurement that named the bug, taken on the door's own final frame:
    // adaptFrame's window (anchored on `total`, blank tail and all) starts five
    // painted rows down, and every one of those five is painted.
    const screen = new FrameReconstructor({ cols: SOURCE_COLS, rows: ROWS });
    screen.write(fixture);
    const { rows } = adaptRows(screen.snapshot(), { cols: COLS });
    let contentEnd = rows.length;
    while (contentEnd > 0 && rows[contentEnd - 1].cells.every(isBlank)) contentEnd--;

    const oldTop = Math.max(0, rows.length - ROWS); // what adaptFrame would show
    const newTop = Math.max(0, contentEnd - ROWS);  // what windowTop() shows
    expect({ total: rows.length, contentEnd, oldTop, newTop })
      .toEqual({ total: 30, contentEnd: 26, oldTop: 5, newTop: 1 });

    // Those five rows are the masthead and the column heading - painted, not
    // tail. The logo interleaves a separator glyph between its letters, so the
    // word is read with those squeezed out, the way the eye reads it.
    const lost = rows.slice(0, oldTop).map((r) => rowText(r.cells).trim());
    expect(lost.filter((t) => t.length === 0)).toEqual([]);
    const letters = lost.join(' ').replace(/[^A-Za-z ]/g, '');
    expect(letters).toContain('GLOBAL');
    expect(letters).toContain('THERM');
    expect(lost.join(' ')).toContain('hANDLE');
  });
});

describe("an 80-column caller's pause is unchanged", () => {
  /** Drive an ANSI caller's JH_SM stream and return the wire, byte for byte. */
  function driveAnsi(autoPauseEnabled: boolean, texts: ReadonlyArray<string>): { wire: string; pauses: number } {
    const rig = buildRig(ansiSession(), { adapter: false });
    (rig.handler as any).state.autoPauseEnabled = autoPauseEnabled;
    const out: string[] = [];
    rig.socket.emit = (ev: string, payload: any) => {
      if (ev === 'ansi-output' && typeof payload === 'string') out.push(payload);
      return true;
    };
    for (const text of texts) {
      rig.handler.handleSendMessage({ msgAddr: 0xdead0000, command: JH_SM, data: 1, replyPort: 0, string: text } as any);
      if (rig.handler.isWaitingForLineInput()) break;
    }
    return { wire: out.join(''), pauses: rig.pauses() };
  }

  it('no adapter is installed for an 80-column session, so the adapted pause cannot reach it', () => {
    const session = ansiSession();
    const socket: any = { session, emit: () => true };
    expect(installC64DoorAdapter(socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 })).toBeNull();
    expect(socket.emit.name).not.toBe('patched');
  });

  it('GWALL - PAGINATION unset - still sends every row with no pause at all', () => {
    const { wire, pauses } = driveAnsi(false, messages);
    expect(pauses).toBe(0);
    expect(wire).not.toContain(PAUSE_PROMPT);
    // The whole door, verbatim: the wall's last comment and its sign-off are
    // both on the wire, so nothing was held back or windowed.
    expect(wire).toContain('David Bowman');
    expect(wire).toContain('ok be like that...');
  });

  it('PAGINATION unset means NO pause however long the door runs', () => {
    // The pin that rejects the easy version of the fault-1 fix. Arming
    // `autoPause` itself at JH_SM would have armed the adapted pause for a C64
    // caller AND started paginating every 80-column caller of every door that
    // declares no PAGINATION - sixty lines here, and not one prompt.
    const lines = Array.from({ length: 60 }, (_, i) => `LINE ${i}\r\n`);
    const { wire, pauses } = driveAnsi(false, lines);
    expect(pauses).toBe(0);
    expect(wire).not.toContain(PAUSE_PROMPT);
    expect(wire).toContain('LINE 59');
  });

  it('PAGINATION set still pauses on the SOURCE line count, at express.e:5191 exactly', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `LINE ${i}\r\n`);
    const { wire, pauses } = driveAnsi(true, lines);
    expect(pauses).toBe(1);
    // pauseLines is 24 for the ANSI session: the pause lands after the 24th
    // line and the prompt is the last thing on the wire.
    expect(wire.endsWith(PAUSE_PROMPT)).toBe(true);
    expect(wire).toContain('LINE 23');
    expect(wire).not.toContain('LINE 24');
  });

  it('GWALL at 80 columns is the SAME wire with PAGINATION on as with it off', () => {
    // The pin the fix must not move. GWALL paints 22 lines - under the 24-line
    // pause count either way - so an 80-column caller gets exactly one wire
    // whatever the tooltype says, and the adapted-frame pause the fix arms
    // cannot reach him because he has no adapter.
    const off = driveAnsi(false, messages);
    const on = driveAnsi(true, messages);
    expect(off.wire.length).toBeGreaterThan(0);
    expect(off.wire).toBe(on.wire);
    expect(off.pauses).toBe(0);
    expect(on.pauses).toBe(0);
    expect(off.wire).not.toContain(PAUSE_PROMPT);
    // ...and that wire carries the door's own rows, un-windowed: the row the
    // 40-column window used to drop off the top AND the last row of the door.
    expect(off.wire).toContain('cOMMENt');
    expect(off.wire).toContain('ok be like that...');
  });
});

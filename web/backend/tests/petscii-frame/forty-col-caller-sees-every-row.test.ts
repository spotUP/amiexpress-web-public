/**
 * BACKLOG 11.3 - the board's page-pause counted SOURCE rows, and a 40-column
 * caller is shown ADAPTED ones.
 *
 * THE DEFECT, measured on the real door file (`Doors/5D-ADIMENU/Text/games`,
 * the `games` command's menu) AS THE LADDER STOOD ON 2026-09-06 MORNING. 19
 * source rows; the C64 rule ladder reflowed the two-column entries and the
 * frame became 33 painted adapted rows on a 25-row screen.
 *
 * (Later the same day the `record` rung learned to place a right-hand field
 * flush against column 40, and that file became 24 painted rows - it fits, and
 * the suite asserts that it fits. The paging itself is proved on the same
 * door's rows repeated, `tallFile` below. The numbers in this header are the
 * measurement that motivated the window, not a claim about the file today.) `adaptFrame` resolves an overflow by showing the LAST 25 adapted
 * rows, so the title and nine games left the top having never been on the
 * caller's screen - and the source-row pause never fired, because 19 is under
 * any threshold.
 *
 * WHY COUNTING ADAPTED ROWS IN THE LINE COUNTER IS NOT THE FIX. The 80x25 grid
 * the door paints on has a BLANK TAIL, and adaptFrame adapts that too - one
 * adapted row per blank source row. Feeding the file into the reconstructor a
 * line at a time, painted rows start falling off the top at SOURCE LINE 4:
 *
 *   after src line 3: adaptedTotal=26 offset=1 leadBlank=1 paintedLost=0
 *   after src line 4: adaptedTotal=27 offset=2 leadBlank=1 paintedLost=1
 *   ...
 *   after src line 17: adaptedTotal=40 offset=15 leadBlank=1 paintedLost=14
 *
 * There is no line count at which a pause would have saved row 0. The loss is
 * a property of the WINDOW over the adapted frame, so the fix is a window the
 * pause walks from the top - `C64DoorFrameAdapter.showPause/nextPage/showPage`,
 * driven by xim/io.ts's existing pause machinery.
 *
 * WHAT THIS SUITE PROVES. Not "a pause was called" - which rows the caller
 * actually saw. The door's real menu bytes go through the real JH_SF handler
 * (`io-file-display.displayResolvedFile` -> `XIMIOHandler.emitText`), the real
 * `installC64DoorAdapter` seam on a `petsciiMode` session at 40x25, and the
 * wire that comes out is replayed through the real `AnsiToPetsciiTransducer`
 * into a real `PetsciiMachine`. The assertions read SCREEN CODES back off that
 * machine.
 *
 * The `~f` at the head of the file is replaced with the clear express.e's
 * sendCLS() sends (`ESC[2J ESC[H`), which is what `parseMciCodes` emits for it
 * - the subject here is the 33 rows that follow the clear, and substituting it
 * keeps the suite off the MCI slow path's database.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { AnsiToPetsciiTransducer, screenCodeToPetscii } from '@amiexpress/bbs-door-sdk/petscii';
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

/** express.e:5193, byte for byte. */
const PAUSE_PROMPT = '(Pause)...More(y/n/ns)? ';
/**
 * The same prompt as a C64 shows it. A PETSCII screen in bank 0 has one case,
 * so the ROW can only ever be pinned case-folded; the bytes themselves are
 * pinned on the constant above, which is the string io.ts hands the adapter.
 */
const PAUSE_ROW = PAUSE_PROMPT.toUpperCase().replace(/ +$/, '');

const GAMES_SOURCE = path.resolve(__dirname, '../../../../Doors/5D-ADIMENU/Text/games');

let tmpDir = '';
let gamesFile = '';
/**
 * The door's menu with its three WIDEST entry rows duplicated, so the adapted
 * frame is taller than the screen again.
 *
 * The real `games` file no longer overflows: on 2026-09-06 the ladder's
 * `record` rung learned to place a right-hand field flush against column 40,
 * and the menu's two-column entries stopped costing two rows each - 33 painted
 * adapted rows became 24, which fits a 25-row screen with the title on it. That
 * is the better outcome for that door and it is asserted below as such, but it
 * would have left the PAGING itself - the window, the prompt, the second page -
 * with no test at all.
 *
 * The extra rows are the door's OWN rows (the LORD, LORD2 and OOII lines, whose
 * right-hand names are long enough that `record` still spends a second row on
 * each), and only three of them: the SOURCE frame is 80x25, so a file with more
 * than 25 lines scrolls the title off the source screen before the ladder ever
 * sees it, and the suite would then be measuring the reconstructor rather than
 * the window.
 */
let tallFile = '';
/** Every `[CODE]` the door's menu offers, read off the door's own file. */
let entryCodes: string[] = [];

beforeAll(() => {
  const raw = fs.readFileSync(GAMES_SOURCE, 'latin1');
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forty-col-pause-'));
  gamesFile = path.join(tmpDir, 'games.txt');
  fs.writeFileSync(gamesFile, raw.replace(/~f/g, '\x1b[2J\x1b[H'), 'binary');
  entryCodes = Array.from(raw.matchAll(/\[\x1b\[37m([A-Z0-9]+)\x1b\[31m\]/g)).map((m) => m[1]);

  const lines = raw.replace(/~f/g, '\x1b[2J\x1b[H').split('\n');
  const widest = ['LORD', 'LORD2', 'OOII'];
  const tall = lines.flatMap((line) =>
    widest.some((code) => line.includes(`[\x1b[37m${code}\x1b[31m]`)) ? [line, line] : [line]);
  tallFile = path.join(tmpDir, 'games-tall.txt');
  fs.writeFileSync(tallFile, tall.join('\n'), 'binary');
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
});

interface Rig {
  handler: XIMIOHandler;
  socket: any;
  wire: string[];
  paused: () => number;
  resumed: () => number;
}

/**
 * The XIMIOHandler harness from `tests/amiga-emulation/jh-sf-sync-fastpath.ts`,
 * with the geometry `door.handler.launchAmigaDoor` gives a real caller:
 * `lineWrap` is `doorScreenWidth(session, terminalWidth)` (40 for a C64) and
 * `pauseLines` is the terminal height.
 */
function buildRig(session: any, pauseLines: number): Rig {
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
    getCommandName: () => 'JH_SF',
  };
  const state: any = {
    registered: true,
    shuttingDown: false,
    nonStopText: false,
    autoPauseEnabled: false,
    lineCount: 0,
    lineWrap: session?.petsciiMode === true ? 40 : 80,
    pauseLines,
    language: '',
    confAccess: '',
    carrierDropped: false,
    rawArrow: false,
    transfering: false,
    doorSilent: false,
  };
  const bbsSession: any = { bbsPath: tmpDir, dataDir: tmpDir, user: { secLevel: 100 } };
  const handler = new XIMIOHandler(emulator, execLibrary, socket, messageParser, state, bbsSession);
  (handler as any).getMessageString = (m: any) => m.string || '';
  return { handler, socket, wire, paused: () => pauses, resumed: () => resumes };
}

function showFileMsg(filePath: string): any {
  return { msgAddr: 0xdead0000, command: 8, data: 0, replyPort: 0, string: filePath };
}

/**
 * A live C64 terminal fed the wire in order, the way connection-emitter.ts and
 * the web `P` session both feed one. `rows()` reads the screen codes back as
 * text (bank 0, so letters come back uppercase - a C64 has no other case).
 */
class Screen {
  private readonly terminal = new AnsiToPetsciiTransducer();
  private consumed = 0;
  constructor(private readonly wire: string[]) {}
  rows(): string[] {
    while (this.consumed < this.wire.length) this.terminal.transduce(this.wire[this.consumed++]);
    const { screen, cols, rows } = this.terminal.machine.state;
    const out: string[] = [];
    for (let y = 0; y < rows; y++) {
      let line = '';
      for (let x = 0; x < cols; x++) {
        // Bank 0 has ONE case: 'A' arrives as PETSCII $C1 and 'a' as $41, and
        // both light the same glyph. Fold the shifted range onto ASCII so the
        // assertions can be written the way the sysop reads the screen.
        const petscii = screenCodeToPetscii(screen[y * cols + x] & 0x7f);
        line += String.fromCharCode(petscii >= 0xc1 && petscii <= 0xda ? petscii - 0x80 : petscii);
      }
      out.push(line.replace(/ +$/, ''));
    }
    return out;
  }
  text(): string {
    return this.rows().join('\n');
  }
}

const petsciiSession = () => ({ terminalType: 'c64', petsciiMode: true, screenWidth: 40, screenHeight: 25 });
const ansiSession = () => ({ terminalType: 'modern', petsciiMode: false, screenWidth: 80, screenHeight: 24 });

describe('a 40-column caller sees every game in the list, not the last 25 rows of it', () => {
  it('the whole menu is on ONE page now, title and all thirty games', async () => {
    // What the door itself does today. The `record` rung places the right-hand
    // `[CODE] Name` of each two-column entry flush against column 40 instead of
    // spending a second row on it, so the menu is 24 painted adapted rows - it
    // FITS, with the title on the same screen, and no pause is needed. The
    // window is what makes that true: the frame is still 32 adapted rows
    // because the source grid's blank tail adapts too, and the old behaviour
    // (show the LAST 25) would still have dropped the title.
    const session = petsciiSession();
    const rig = buildRig(session, 25);
    const adapter = installC64DoorAdapter(rig.socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 });
    expect(adapter).not.toBeNull();

    const screen = new Screen(rig.wire);
    await rig.handler.handleShowFile(showFileMsg(gamesFile));

    // NO PAUSE, and nothing left over: the whole menu is inside one page.
    expect(rig.paused()).toBe(0);
    expect(adapter!.unseenRows()).toBe(0);
    expect(adapter!.pageOffset()).toBe(0);

    // ...and that page, painted, is the menu with its title on it. The paint is
    // asked for explicitly because the 60-second tick above is what keeps every
    // other case here off the clock; `showPage` is the same repaint the pause
    // owner ends a walk with.
    adapter!.showPage();
    const rows = screen.rows();
    expect(rows.join('\n')).toContain('ONLINE GAMES FROM BBSLINK.NET');
    expect(entryCodes.length).toBeGreaterThan(25);
    expect(entryCodes.filter((code) => !rows.join('\n').includes(`[${code}]`))).toEqual([]);
    uninstallC64DoorAdapter(rig.socket);
  });

  it('a menu too tall for the screen pauses part-way down, and the page after carries the rows that were next', async () => {
    const session = petsciiSession();
    const rig = buildRig(session, 25);
    const adapter = installC64DoorAdapter(rig.socket, session as any, {
      tickMs: 60_000,
      maxFrameMs: 60_000,
    });
    expect(adapter).not.toBeNull();

    const screen = new Screen(rig.wire);
    await rig.handler.handleShowFile(showFileMsg(tallFile));

    // FIRST PAGE. The pause fired, the door is held, and the caller is looking
    // at the TOP of the menu - the thing that used to be scrolled away.
    const first = screen.rows();
    expect(rig.paused()).toBe(1);
    expect(first.join('\n')).toContain('ONLINE GAMES FROM BBSLINK.NET');
    expect(first[24]).toBe(PAUSE_ROW);
    expect(first.join('\n')).toContain('ARCL');

    // ...and it is NOT the tail: the last entries cannot be on this page.
    expect(first.join('\n')).not.toContain('USRP');

    // THE CALLER PRESSES SPACE. The next page must carry the rows that were
    // next, not a repeat and not the door's next screen.
    rig.handler.queueInput(' ');
    const second = screen.rows();
    expect(rig.resumed()).toBe(1);
    expect(second.join('\n')).toContain('USRP');

    // NOTHING LEFT THE SCREEN UNSEEN: every entry the door offers was on one
    // page or the other. This is the assertion the bug fails - before the fix
    // the caller only ever saw the last 25 adapted rows.
    const seen = `${first.join('\n')}\n${second.join('\n')}`;
    expect(entryCodes.length).toBeGreaterThan(25);
    const missing = entryCodes.filter((code) => !seen.includes(`[${code}]`));
    expect(missing).toEqual([]);

    uninstallC64DoorAdapter(rig.socket);
  });

  it('the pause prompt is express.e:5193 unaltered, only on the bottom row of the page', async () => {
    const session = petsciiSession();
    const rig = buildRig(session, 25);
    installC64DoorAdapter(rig.socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 });
    await rig.handler.handleShowFile(showFileMsg(tallFile));
    const rows = new Screen(rig.wire).rows();
    expect(PAUSE_PROMPT).toBe('(Pause)...More(y/n/ns)? ');
    expect(rows[24]).toBe(PAUSE_ROW);
    expect(rows.slice(0, 24).join('\n')).not.toContain('PAUSE');
    uninstallC64DoorAdapter(rig.socket);
  });

  it('a caller with pausing turned off still gets no pause', async () => {
    const session = petsciiSession();
    const rig = buildRig(session, 25);
    (rig.handler as any).state.nonStopText = true;
    installC64DoorAdapter(rig.socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 });
    await rig.handler.handleShowFile(showFileMsg(gamesFile));
    expect(rig.paused()).toBe(0);
    expect(rig.wire.join('')).not.toContain(PAUSE_PROMPT);
    uninstallC64DoorAdapter(rig.socket);
  });

  it('a file whose adapted frame FITS never enters the paged path', async () => {
    const session = petsciiSession();
    const rig = buildRig(session, 25);
    const short = path.join(tmpDir, 'short.txt');
    fs.writeFileSync(short, 'HELLO\nWORLD\n', 'binary');
    const adapter = installC64DoorAdapter(rig.socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 });
    await rig.handler.handleShowFile(showFileMsg(short));
    expect(rig.paused()).toBe(0);
    expect(adapter!.unseenRows()).toBe(0);
    expect(adapter!.pageOffset()).toBe(0);
    uninstallC64DoorAdapter(rig.socket);
  });
});

describe("an 80-column caller's pause is unchanged", () => {
  it('no adapter is installed, and a 19-row file under the pause count does not pause', async () => {
    const session = ansiSession();
    const rig = buildRig(session, 24);
    expect(installC64DoorAdapter(rig.socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 })).toBeNull();
    await rig.handler.handleShowFile(showFileMsg(gamesFile));
    expect(rig.paused()).toBe(0);
    expect(rig.wire.join('')).not.toContain(PAUSE_PROMPT);
    // Every row reached the wire verbatim - no adaptation, no window.
    expect(rig.wire.join('')).toContain('ONLINE GAMES FROM BBSLINK.NET');
    expect(rig.wire.join('')).toContain('Usurper');
  });

  it('a file OVER the pause count still pauses on the source-row count, at the same line', async () => {
    const session = ansiSession();
    const rig = buildRig(session, 24);
    const long = path.join(tmpDir, 'long.txt');
    fs.writeFileSync(long, Array.from({ length: 60 }, (_, i) => `LINE ${i}`).join('\n') + '\n', 'binary');
    await rig.handler.handleShowFile(showFileMsg(long));
    const bytes = rig.wire.join('');
    expect(rig.paused()).toBe(1);
    // express.e:5191 - the pause lands when lineCount reaches pauseLines, i.e.
    // after the 24th line, and the prompt is the last thing on the wire.
    expect(bytes.endsWith(PAUSE_PROMPT)).toBe(true);
    expect(bytes).toContain('LINE 23');
    expect(bytes).not.toContain('LINE 24');
  });

  it('the same bytes come out whether or not the adapter module is asked to install', async () => {
    const run = async (attemptInstall: boolean): Promise<string> => {
      const session = ansiSession();
      const rig = buildRig(session, 24);
      if (attemptInstall) installC64DoorAdapter(rig.socket, session as any, { tickMs: 60_000, maxFrameMs: 60_000 });
      await rig.handler.handleShowFile(showFileMsg(gamesFile));
      if (attemptInstall) uninstallC64DoorAdapter(rig.socket);
      return rig.wire.join('');
    };
    const withAttempt = await run(true);
    const without = await run(false);
    expect(withAttempt.length).toBeGreaterThan(0);
    expect(withAttempt).toBe(without);
  });
});

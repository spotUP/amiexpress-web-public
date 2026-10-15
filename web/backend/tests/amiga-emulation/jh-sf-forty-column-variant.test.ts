/**
 * Regression (backlog lane 13.2): a caller whose door output is being adapted
 * to 40 columns gets the sysop's hand-drawn narrow copy of a display file when
 * one exists, and the door's own file when it does not.
 *
 * Why this shape, and not a source-text pin: the thing that can break is the
 * CHOICE of file, so the test drives the real handler
 * (`XIMIOHandler.handleShowFile`, the entry point the door's JH_SF lands on),
 * with a REAL adapter installed by `installC64DoorAdapter`, and reads back the
 * path the handler actually opened.
 *
 * Which doors this is for, measured on 2026-09-07 by running them:
 *   - `wall` (dRE!WAll) fetches `dOORS:dRE/dRE!WAll/dRE!WAll.StYlE.1` - the
 *     banner, 78 columns - through JH_SF, having read the style number from
 *     its own `STYLES` tooltype.
 *   - `games` (5D-AdiMenu) fetches `DOORS:5D-AdiMenu/Text/games` - the whole
 *     menu screen, 65 columns - through JH_SF.
 * `ctop` and `conftop` are NOT covered: they open their `Conftop.header`
 * through dos.library, a path with no session on it. See
 * thoughts/shared/research/2026-09-07_door-external-header-files.md.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import {
  installC64DoorAdapter,
  uninstallC64DoorAdapter,
} from '../../src/server/c64-door-adapter';
import { narrowVariants } from '../../src/amiga-emulation/xim/io-file-display';

describe('JH_SF picks the 40-column variant for an adapted caller', () => {
  jest.setTimeout(5000);

  let tmpDir = '';

  const WIDE = 'the eighty column banner';
  const NARROW = 'the forty column banner';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-sf-40col-'));
    // The `games` shape: NAME.ext, with a narrow copy beside it.
    fs.writeFileSync(path.join(tmpDir, 'games.txt'), `${WIDE}\n`, 'binary');
    fs.writeFileSync(path.join(tmpDir, 'games_C64.txt'), `${NARROW}\n`, 'binary');
    // The dRE!WAll shape: the "extension" is a STYLE NUMBER, and the narrow
    // copy a sysop would draw is `...StYlE.1_C64`.
    fs.writeFileSync(path.join(tmpDir, 'wall.StYlE.1'), `${WIDE}\n`, 'binary');
    fs.writeFileSync(path.join(tmpDir, 'wall.StYlE.1_C64'), `${NARROW}\n`, 'binary');
    // A door file with no narrow copy at all.
    fs.writeFileSync(path.join(tmpDir, 'only.txt'), `${WIDE}\n`, 'binary');
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ }
  });

  function buildHandler(adapted: boolean, columns: 40 | 80 = 40, baseDir = tmpDir): { handler: XIMIOHandler; socket: any } {
    const socket: any = { emit: () => true };
    if (adapted) {
      // petsciiMode is what `c64AdapterDrives` reads; the adapter it installs
      // is what `c64AdapterFor` finds inside the handler.
      socket.session = { petsciiMode: true, ...(columns === 80 ? { petsciiColumns: 80 } : {}) };
      installC64DoorAdapter(socket, socket.session);
    }

    const emulator: any = {
      pause: () => {},
      resume: () => {},
      readMemory: () => 0,
      readMemory32: () => 0,
      writeMemory: () => {},
    };
    const execLibrary: any = { replyMsg: () => {}, putMsg: () => {} };
    const messageParser: any = {
      writeCommand: () => {},
      writeMessageString: () => {},
      writeData: () => {},
      getCommandName: (_cmd: number) => 'TEST_CMD',
    };
    const state: any = {
      registered: true,
      shuttingDown: false,
      nonStopText: true,
      autoPauseEnabled: false,
      lineCount: 0,
      lineWrap: 0,
      pauseLines: 24,
      language: '',
      confAccess: '',
      carrierDropped: false,
      rawArrow: false,
      transfering: false,
      doorSilent: false,
    };
    const bbsSession: any = { bbsPath: baseDir, dataDir: baseDir, user: { secLevel: 100 } };

    const handler = new XIMIOHandler(
      emulator,
      execLibrary,
      socket,
      messageParser,
      state,
      bbsSession,
    );
    (handler as any).getMessageString = (m: any) => m.string || '';
    return { handler, socket };
  }

  function buildMsg(filePath: string): any {
    return { msgAddr: 0xdead0000, command: 8, data: 1, replyPort: 0, string: filePath };
  }

  /**
   * The text the handler actually put on the caller's screen.
   *
   * `emitText` is the ONE call every display path funnels through, and taking
   * it here reads the bytes the caller would have received - past the
   * adapter's own PETSCII conversion, which is not what this test is about.
   */
  async function textShownFor(name: string, adapted: boolean, columns: 40 | 80 = 40, baseDir = tmpDir): Promise<string> {
    const { handler, socket } = buildHandler(adapted, columns, baseDir);
    const shown: string[] = [];
    (handler as any).emitText = (text: string) => { shown.push(text); };
    try {
      await handler.handleShowFile(buildMsg(path.join(baseDir, name)));
    } finally {
      if (adapted) uninstallC64DoorAdapter(socket, { silent: true });
    }
    expect(shown.length).toBe(1);
    return shown[0];
  }

  test('NAME.ext: the adapted caller is shown NAME_C64.ext', async () => {
    expect(await textShownFor('games.txt', true)).toContain(NARROW);
  });

  test('NAME.ext: an 80-column caller is shown the door\'s own file', async () => {
    expect(await textShownFor('games.txt', false)).toContain(WIDE);
  });

  /**
   * The gate the wide screen needs (2026-09-07). `_C64` names art the sysop
   * drew for the C64's forty columns; an 80-column PETSCII caller has an
   * adapter too, and serving him that art is the same mistake as folding
   * .seq onto his screen. One sentence for both: art named for the C64's
   * screen is 40 columns wide, and the wide caller gets the door's own file.
   */
  test("an 80-column PETSCII caller is shown the door's own file, not the _C64 art", async () => {
    expect(await textShownFor('games.txt', true, 80)).toContain(WIDE);
    expect(await textShownFor('wall.StYlE.1', true, 80)).toContain(WIDE);
  });

  test('a numbered style file: the adapted caller is shown NAME.1_C64', async () => {
    expect(await textShownFor('wall.StYlE.1', true)).toContain(NARROW);
  });

  test('no narrow copy drawn: the adapted caller still gets the door\'s file', async () => {
    expect(await textShownFor('only.txt', true)).toContain(WIDE);
  });

  test('both spellings of a narrow name are probed, whole-name first', () => {
    expect(narrowVariants('/x/wall.StYlE.1')).toEqual([
      '/x/wall.StYlE.1_C64',
      path.join('/x', 'wall.StYlE_C64.1'),
    ]);
    // An extensionless name has only one spelling, and it is not repeated.
    expect(narrowVariants('/x/games')).toEqual(['/x/games_C64']);
  });
});

/**
 * THE ART ITSELF, on this board.
 *
 * The suite above proves the machinery picks a `_C64` file. This one proves
 * the board HAS one where it needs one, and that it is really narrow - a
 * variant nobody drew is a rung that never fires, and a "narrow" variant
 * that is 78 columns wide is worse than none, because the ladder would have
 * folded the wide file and this one is passed through untouched.
 *
 * `dRE!WAll` is the door it matters for: `dRE!WAll.info` carries `STYLES=2`,
 * so the banner a caller meets is `dRE!WAll.StYlE.2`, and the door fetches it
 * through JH_SF - the route this variant lives on.
 */
describe("the board's own 40-column door art", () => {
  const REPO = path.resolve(__dirname, '../../../..');
  const WALL = path.join(REPO, 'Doors', 'dRE', 'dRE!WAll');

  /** Printable width: SGR sequences occupy no column. */
  const widthOf = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, '').length;

  /** The style number the door's own icon selects. */
  function styleFromInfo(): string {
    const info = fs.readFileSync(path.join(WALL, 'dRE!WAll.info'), 'latin1');
    const match = info.match(/STYLES=(\d+)/);
    expect(match).not.toBeNull();
    return match![1];
  }

  test('the style dRE!WAll.info selects has a narrow copy beside it', () => {
    const style = styleFromInfo();
    expect(fs.existsSync(path.join(WALL, `dRE!WAll.StYlE.${style}`))).toBe(true);
    expect(fs.existsSync(path.join(WALL, `dRE!WAll.StYlE.${style}_C64`))).toBe(true);
  });

  test('every narrow copy is really 40 columns or less, and its wide original is not', () => {
    const narrow = fs.readdirSync(WALL).filter((f) => f.endsWith('_C64'));
    expect(narrow.length).toBeGreaterThan(0);
    for (const file of narrow) {
      const rows = fs.readFileSync(path.join(WALL, file), 'latin1').split('\n').filter((r) => r.length > 0);
      expect({ file, rows: rows.length > 0 }).toEqual({ file, rows: true });
      for (const row of rows) {
        expect({ file, row, width: widthOf(row) <= 40 }).toEqual({ file, row, width: true });
      }
      // The point of the exercise: the door's own file did NOT fit.
      const wide = fs.readFileSync(path.join(WALL, file.replace(/_C64$/, '')), 'latin1')
        .split('\n').filter((r) => r.length > 0);
      expect({ file, wideOverflows: wide.some((r) => widthOf(r) > 40) }).toEqual({ file, wideOverflows: true });
    }
  });
});

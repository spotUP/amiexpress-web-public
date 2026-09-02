/**
 * What "points at nothing" has to mean: the caller pressing that key gets
 * nothing. Not "the exact string after the code is not a filename".
 *
 * Both defects here were found while adding the dead-reference health check on
 * 2026-09-02, by running it over the real board and reading every finding:
 *
 * 1. `~SR_` names a POOL BASE. The board picks at random from
 *    `001.logoff.txt`..`999.logoff.txt` beside it and nothing called plain
 *    `logoff` ever exists, so asking whether the base is a file called 12 live
 *    references dead.
 * 2. A screen names its target in Amiga assigns, and `BBS:` is not the only
 *    one - `WORK:bbs/Screens/logoff/logoff` appears in 42 screens on this
 *    board. Stripping `BBS:` by hand answered for one assign and treated every
 *    other as a literal directory name, which is not the verdict the loader
 *    reaches at runtime.
 *
 * A checker that cries wolf 12 times is a checker a sysop stops reading.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex, invalidateScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

const refsFor = (rel: string) => {
  const index = buildScreenIndex(root);
  return index.files[rel]?.mci ?? [];
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mci-resolve-'));
  write('ConfConfig.info', 'NCONFS=1\nNAME.1=Demoscene\nLOCATION.1=BBS:Conf1/\n');
  invalidateScreenIndex();
});

afterEach(() => {
  invalidateScreenIndex();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a ~SR_ reference resolves through its numbered pool', () => {
  it('is live when the pool has art in it', () => {
    write('Screens/Logoff.txt', '~SR_bbs:Screens/logoff/logoff\r\n');
    write('Screens/logoff/001.logoff.txt', 'bye\r\n');

    const [ref] = refsFor('Screens/Logoff.txt');

    expect(ref.code).toBe('SR');
    expect(ref.resolves).toBe(true);
  });

  it('is dead when the pool is empty', () => {
    write('Screens/Logoff.txt', '~SR_bbs:Screens/logoff/logoff\r\n');

    const [ref] = refsFor('Screens/Logoff.txt');

    expect(ref.resolves).toBe(false);
  });
});

describe('an assign is resolved the way the BOARD resolves it', () => {
  it('collapses a redundant bbs/ under the board root', () => {
    /*
     * `~SR_WORK:bbs/...` is what this board's screens actually say. Read
     * literally that is `<root>/bbs/...` and there is no `bbs` directory, so
     * the manager called a hundred live references dead and told the sysop
     * that art the board draws at every logoff was never displayed. They knew
     * better: "the logoff ansi logos are also flagged as not in use i doubt
     * that".
     *
     * The runtime strips it in the ~SR_ sentinel (screen.handler:558-562) and
     * again on the ~SS_ path (screen.handler:1031). The index has to make the
     * same move or it is answering a different question from the board.
     */
    write('Screens/logon20.txt', '~SS_WORK:bbs/Screens/flt.txt\r\n');
    write('Screens/flt.txt', 'art\r\n');

    expect(refsFor('Screens/logon20.txt')[0].resolves).toBe(true);
  });

  it('finds a numbered pool whose files carry no extension', () => {
    // This board's flt pool is `001.flt`, `002.flt` - no extension after the
    // stem at all. Requiring one called all 58 references to it dead.
    write('Screens/logon20.txt', '~5SR_WORK:bbs/Screens/flt/flt\r\n');
    write('Screens/flt/001.flt', 'art\r\n');

    expect(refsFor('Screens/logon20.txt')[0].resolves).toBe(true);
  });

  it('still reports a reference with nothing behind it', () => {
    // The point of the check survives: a target that exists nowhere is dead.
    write('Screens/logon20.txt', '~SS_WORK:bbs/Screens/nothing.txt\r\n');

    expect(refsFor('Screens/logon20.txt')[0].resolves).toBe(false);
  });
});

describe('a screen found outside the first search directory', () => {
  it('is read by the screen that resolves to it', () => {
    /*
     * `LOGON24` is looked for in several places and lives in `Screens/`. The
     * index listed its variants from the FIRST location - the board root -
     * so the file came back read by nobody and the manager offered it for
     * deletion. Reported by the sysop, who knew what it was for:
     * "Logon24hrs.txt is flagged as not used but it's used when a user runs
     * out of time".
     */
    write('Screens/Logon24hrs.txt', 'your time is up\r\n');

    const index = buildScreenIndex(root);

    expect(index.files['Screens/Logon24hrs.txt'].readBy.length).toBeGreaterThan(0);
    expect(index.unused.some(u => u.relPath === 'Screens/Logon24hrs.txt')).toBe(false);
  });
});

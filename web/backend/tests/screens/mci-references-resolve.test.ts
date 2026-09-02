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

describe('an assign other than BBS: is resolved, not read as a directory name', () => {
  it('follows WORK: to where the board would look', () => {
    // WORK: is the board root here (BBSPaths), so this names <root>/bbs/... -
    // which is NOT <root>/Screens/..., and that is the whole point: 142 of
    // this board's screens reference art through a path this port cannot reach
    // while the art itself sits in Screens/.
    write('Screens/logon20.txt', '~SS_WORK:bbs/Screens/flt.txt\r\n');
    write('Screens/flt.txt', 'art\r\n');

    const [ref] = refsFor('Screens/logon20.txt');

    expect(ref.resolves).toBe(false);

    // And it IS found once the file sits where that assign actually points.
    write('bbs/Screens/flt.txt', 'art\r\n');
    invalidateScreenIndex();

    expect(refsFor('Screens/logon20.txt')[0].resolves).toBe(true);
  });
});

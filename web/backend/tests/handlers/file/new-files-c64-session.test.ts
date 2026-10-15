/**
 * WHAT THE SYSOP SAW, in a PETSCII session on conference 2, 2026-09-07:
 *
 *   Searching for files newer than: 09-07-26
 *   Scanning directory 1
 *   Scanning directory 1
 *
 * and then a board that sat there until he pressed Enter.
 *
 * TWO faults, and the first one is on the live disk: `Conf3/` holds BOTH
 * `DIR1` and `Dir1`. AmigaDOS cannot tell them apart and a board can only
 * have one DIR1, but ext4 holds two files, and the walker returned two
 * entries with index 1 - so the scan announced directory 1 twice and read one
 * of them twice. Same collision class as `Doors/GWall` vs `Doors/Gwall`.
 *
 * The second is the silence at the end: the scan left `menuPause` set, so the
 * board waited for a keypress with nothing on screen to say so.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayNewFiles } from '../../../src/handlers/file/file.handler';
import { getDirFiles } from '../../../src/utils/max-dirs.util';
import { config } from '../../../src/config';

const ROW = 'DEMO.LHA     P   10431  01-21-26  A file from January';

let tmp = '';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'newfiles-c64-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  // The live collision, reproduced: two files, one Amiga name.
  fs.writeFileSync(path.join(tmp, 'Conf1', 'DIR1'), ROW + '\n', 'binary');
  fs.writeFileSync(path.join(tmp, 'Conf1', 'Dir1'), ROW + '\n', 'binary');
  config.set('dataDir', tmp);
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
});

async function run(): Promise<{ out: string; session: any }> {
  const wire: string[] = [];
  const session: any = {
    currentConf: 1,
    petsciiMode: true,
    screenWidth: 40,
    screenHeight: 25,
    terminalType: 'c64',
    user: { id: 1, username: 'sysop', secLevel: 255, newSinceDate: new Date(2026, 0, 1) },
    tempData: {},
  };
  const socket: any = {
    session,
    id: 'newfiles-c64',
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  await displayNewFiles(socket, session, '');
  return { out: wire.join(''), session };
}

describe('a C64 caller scanning a conference whose DIR file exists in two cases', () => {
  it('collapses DIR1 and Dir1 into ONE directory', async () => {
    const dirs = await getDirFiles(1, tmp);
    expect(dirs.map((d) => d.index)).toEqual([1]);
  });

  it('announces directory 1 once, not twice', async () => {
    const { out } = await run();
    const announcements = out.split('Scanning directory 1').length - 1;
    expect(announcements).toBe(1);
  });

  it('lists the file once, not twice', async () => {
    const { out } = await run();
    expect(out.split('DEMO.LHA').length - 1).toBe(1);
  });

  it('ends at the menu loop\'s pause, which is what says it is waiting', async () => {
    // "it gets stuck there as well ... i can exit with enter". The fix was
    // first a "Press any key" printed by the scan itself (4adf5a915); since
    // 22dfb105c the scan ends the way `F` does and express.e's myNewFiles
    // (27906-28023) does - no prompt of its own, menuPause set - and the
    // menu loop takes it from there (the dispatcher takes every finished
    // command round the menu loop, proven in
    // a-command-returns-to-the-prompt.test.ts).
    const { out, session } = await run();
    expect(out).not.toMatch(/Press any key to continue/);
    expect(session.menuPause).toBe(true);
    expect(session.subState).toBe('display_menu');
  });
});

/**
 * QUICKNEW LISTS WHAT THE DIR FILE HOLDS - NOT WHAT THE CATALOGUE REMEMBERS.
 *
 * express.e has no file catalogue: a conference's DIR files are the whole
 * truth (N is `displayFileList` reading them, express.e:27626 / 27840+), and
 * the QuickNew door the batch line names opens the DIR file its config names
 * and nothing else (Doors/QuickNew/QuickNew.asm `processBlock` -> `loadfile`).
 *
 * The board's generator asked the SQL `file_entries` table first and read the
 * DIR only when that came back empty. A row outlives its file - nothing
 * deletes or moves one (db-disk audit 2026-10-04 §6) - so the new-files
 * screen listed files FM had deleted and missed files moved in or added
 * outside the port.
 *
 * Driven through `generateQuickNewFromConfig`, the function the logoff batch
 * calls (batch-scheduler.ts), on a temp board: the catalogue holds a file
 * that is gone, the DIR holds the file that is there.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quicknew-dir-truth-'));

// The stale catalogue: a row for a file the sysop deleted with FM.
jest.mock('../../src/database', () => ({
  db: {
    getFileAreas: async () => [{ id: 7, name: 'Conference 1 - Dir 1', conferenceId: 1 }],
    getFileEntries: async () => [{
      id: 1, filename: 'GHOST.LHA', size: 5 * 1024 * 1024, uploadDate: new Date(), status: 'active',
    }],
  },
}));
jest.mock('../../src/config', () => ({
  config: { getConfig: () => ({ dataDir: tmp }), get: (k: string) => (k === 'dataDir' ? tmp : undefined) },
}));

import { generateQuickNewFromConfig } from '../../src/utils/quicknew-generator';
import { getSystemTime } from '../../src/utils/date-time.util';

const mmddyy = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`;

function writeBoard(dirContent: string): string {
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'DIR1'), dirContent, 'latin1');
  const cfg = [
    '\x1b[0m',
    '\x1b[35m',
    '1',
    'Last @D Days in >> Test Area << (Files: @N, Megs: @M.0)',
    'Yesterdays Statistics : @Y Files, @B.0 Megs !',
    '#',
    'BBS:Conf1/DIR1',
    '',
  ].join('\n');
  const cfgPath = path.join(tmp, 'QuickNew.Config1');
  fs.writeFileSync(cfgPath, cfg, 'latin1');
  return cfgPath;
}

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('quicknew lists what the DIR file holds', () => {
  it('lists the file in the DIR and not the deleted file the catalogue still has', async () => {
    const today = mmddyy(getSystemTime());
    const cfgPath = writeBoard(
      `REAL.LHA     P   2048  ${today}  A file that is on the board\n`,
    );

    const text = await generateQuickNewFromConfig(cfgPath, 7);
    expect(text).not.toBeNull();
    expect(text).toContain('REAL.LHA');
    expect(text).not.toContain('GHOST.LHA');
    expect(text).toContain('Files: 01');
  });

  it('shows no files for an empty DIR file, whatever the catalogue says', async () => {
    const cfgPath = writeBoard('');

    const text = await generateQuickNewFromConfig(cfgPath, 7);
    expect(text).not.toBeNull();
    expect(text).not.toContain('GHOST.LHA');
    expect(text).toContain('Files: 00');
  });
});

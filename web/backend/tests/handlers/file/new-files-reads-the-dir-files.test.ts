/**
 * `N` ANSWERS FROM THE DIR FILES, which is where this board's files are.
 *
 * It used to answer from the SQL `file_entries` mirror. Nothing imports the
 * DIR files into that mirror - `database/file-repository.ts` writes a row only
 * when a file is uploaded THROUGH THE WEB - so a conference whose DIR files
 * are full of records reported "no new files" and `F`, a keystroke later,
 * listed them. Measured on the live board 2026-09-07: conference 1's two file
 * areas hold 0 rows between them while DIR files on disk carry entries.
 *
 * Nothing is lost by reading the disk: the upload path writes the row AND the
 * DIR entry (`server/file-socket-handlers.ts`, "Write to DIR file").
 *
 * express.e:27906-28023 is the rule this pins, and it is NOT "filter entries
 * by date". A DIR file is chronological, so express.e finds the FIRST entry at
 * or after the date and then dumps the REST OF THE FILE (`displayIt2(fp1)`,
 * express.e:28007) - which is why the third fixture entry below, whose date
 * column is junk, must still be listed once the second one matches.
 *
 * Driven through the real `displayNewFiles`, asserting on what the CALLER
 * receives, with no database in the picture at all.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { displayNewFiles } from '../../../src/handlers/file/file.handler';
import { config } from '../../../src/config';

/** express.e:19500 - continuation rows of a DIR entry carry 33 spaces. */
const INDENT = ' '.repeat(33);

const DIR_LINES = [
  // Older than the search date: must not be listed.
  'ANCIENT.LHA  P   4096  01-Jan-20  A file from before the last call',
  // The first entry at or after it: the scan starts here.
  'NEWTHING.LHA P 108741  24-Aug-26  The one the caller has not seen',
  INDENT + 'and a second line of its description',
  // Junk in the date column. express.e dumps the rest of the file once the
  // scan has started, so this is listed even though it parses to nothing.
  'ALSONEW.ZIP  P  20000  ??-???-??  Listed because the file is dumped from',
  '',
];

let tmp = '';

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'new-files-disk-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'Dir1'), DIR_LINES.join('\n'), 'binary');
  config.set('dataDir', tmp);
  config.set('bbsRoot', tmp);
});

afterAll(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
});

/** The real `N`, and every byte it wrote. */
async function runNewFiles(params = 'NS'): Promise<string> {
  const wire: string[] = [];
  const session: any = {
    currentConf: 1,
    screenWidth: 80,
    screenHeight: 24,
    terminalType: 'ansi',
    // The last call was after ANCIENT.LHA and before NEWTHING.LHA.
    user: { id: 1, username: 'sysop', secLevel: 255, newSinceDate: new Date(2026, 7, 1) },
    tempData: {},
  };
  // A real socket has listeners, and the pause machinery installs one before
  // the first directory: without `on` the scan throws into displayNewFiles'
  // catch, which writes through the BUFFERED emitText and shows as an empty
  // wire rather than an error.
  const socket: any = {
    session,
    id: 'new-files-disk',
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket,
    once: () => socket,
    off: () => socket,
    removeListener: () => socket,
    removeAllListeners: () => socket,
  };
  await displayNewFiles(socket, session, params);
  return wire.join('');
}

describe('the new-files scan reads the conference DIR files', () => {
  it('lists a file that exists only on disk, which the SQL mirror never knew about', async () => {
    const out = await runNewFiles();

    // THE SYMPTOM. Before the fix this scan queried `file_entries` for the
    // conference's areas, found nothing, and said so - with the record sitting
    // in Dir1 the whole time.
    expect(out).toContain('NEWTHING.LHA');
    expect(out).not.toMatch(/No file areas available/);
  });

  it('starts at the first entry on or after the date and dumps the rest of the file', async () => {
    const out = await runNewFiles();

    // express.e:28007 - once the scan finds its entry it displays to EOF, so
    // the entry whose date column is unparseable is still listed.
    expect(out).toContain('ALSONEW.ZIP');
    expect(out.indexOf('NEWTHING.LHA')).toBeLessThan(out.indexOf('ALSONEW.ZIP'));

    // And the description rows come with it.
    expect(out).toContain('and a second line of its description');
  });

  it('does not list a file older than the caller\'s last call', async () => {
    const out = await runNewFiles();
    expect(out).not.toContain('ANCIENT.LHA');
  });

  it('names the directory it scanned, as express.e:27914 does', async () => {
    const out = await runNewFiles();
    expect(out).toContain('Scanning directory 1');
  });
});

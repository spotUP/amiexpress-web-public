/**
 * A FILE_ID.DIZ CANNOT PAINT THE REST OF THE LISTING.
 *
 * Reported from the board, 2026-09-22: "testing FR via telnet ansi colors in
 * the file list that should not be there" - every row from one entry onward
 * came out cyan, filenames, sizes, dates and other people's art alike.
 *
 * It was one byte sequence in the DIR file. `Conf1/DIR1` line 232, inside
 * `ht-hc3.txt`, ends `in the world\x1b[36m` and nothing follows it: the whole
 * 28,534-byte file holds exactly ONE escape, and that one is unterminated. The
 * listing wrote the DIR file's rows verbatim, so the pen stayed open and every
 * later row inherited it.
 *
 * express.e has the same hole and sketched the fix without wiring it:
 * `displayIt3` carries `DEF color = 0` and `IF(color=1) THEN aePuts('[0m')`,
 * and nothing in the procedure ever sets `color` (express.e:27776-27802). A
 * real /X bleeds too. Parity is not the goal where parity is the bug.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FileListingHandler } from '../../../src/handlers/file/file-listing.handler';
import { config } from '../../../src/config';
import { resetFileViewLayoutCache } from '../../../src/services/file-layout.service';

const INDENT = ' '.repeat(33);

/** The live shape: an art row that opens a pen and never closes it. */
const DIR = [
  'HT-HC3.TXT   N 230765  24-Aug-26  .________________________',
  INDENT + '| /\\/  \\ \\ \\    in the world\x1b[36m',
  INDENT + 'Sent by: sysop',
  'PLAIN.LHA    P   1024  12-24-92  A record with no colour in it',
  INDENT + 'Sent by: someone',
  '',
].join('\n');

let tmp = '';
let previousDataDir: string;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diz-colour-'));
  fs.mkdirSync(path.join(tmp, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Conf1', 'DIR1'), DIR, 'binary');
  previousDataDir = config.get('dataDir');
  config.set('dataDir', tmp);
  resetFileViewLayoutCache();
});

afterAll(() => {
  config.set('dataDir', previousDataDir);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* noop */ }
  resetFileViewLayoutCache();
});

/** Everything the caller's terminal received, in order, as one string. */
async function wireFor(width: number): Promise<string> {
  const wire: string[] = [];
  const session: any = {
    currentConf: 1,
    screenWidth: width,
    screenHeight: 25,
    petsciiMode: false,
    terminalType: 'ansi',
    user: { id: 1, username: 'sysop', secLevel: 255, newSinceDate: new Date(2026, 0, 1) },
    tempData: {},
  };
  const socket: any = {
    session,
    id: `colour-${width}`,
    emit: (event: string, payload: any) => {
      if (event === 'ansi-output' && typeof payload === 'string') wire.push(payload);
      return true;
    },
    on: () => socket, once: () => socket, off: () => socket,
    removeListener: () => socket, removeAllListeners: () => socket,
  };
  await FileListingHandler.handleFileList(socket, session, '', false);
  return wire.join('');
}

describe('an entry that opens a colour', () => {
  it('closes it before the next entry is written', async () => {
    const wire = await wireFor(80);

    const opened = wire.indexOf('\x1b[36m');
    expect(opened).toBeGreaterThan(-1);          // the fixture's own pen

    const nextEntry = wire.indexOf('PLAIN.LHA');
    expect(nextEntry).toBeGreaterThan(opened);   // and it comes later

    // A reset between the two: that is the whole fix.
    const reset = wire.indexOf('\x1b[0m', opened);
    expect(reset).toBeGreaterThan(-1);
    expect(reset).toBeLessThan(nextEntry);
  });
});

describe('an entry with no colour in it', () => {
  it('is written exactly as the DIR file holds it', async () => {
    const wire = await wireFor(80);

    /*
     * The ENTRY's own rows, not the listing's furniture: the pause prompt
     * after the last entry is the board's and has always carried its own
     * pens. Between this entry's filename and the end of its `Sent by:` row
     * there must be no escape at all - the 80-column format is frozen, and a
     * record with no colour in it must be byte-for-byte what it always was.
     */
    const from = wire.indexOf('PLAIN.LHA');
    const entry = wire.slice(from, wire.indexOf('Sent by: someone', from) + 'Sent by: someone'.length);
    expect(entry).toContain('A record with no colour in it');
    expect(entry).not.toContain('\x1b');
  });
});

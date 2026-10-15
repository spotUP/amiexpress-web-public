/**
 * Under conference accounting the ratio gate reads the caller's OWN record
 * for each conference.
 *
 * express.e:19845-19902 checkRatiosAndTime: `cb:=confBases.item(
 * getConfIndex(i,1))` - his slot in conference i's Conf.DB - and calcConfBad
 * (19797-19821) gives `ratio * uploadBytes - downloadBytes` from it. A sysop
 * sets that ratio per caller (CM 1, the account editor's G).
 *
 * The port read the board-wide `conferences` row, whose ratio nothing
 * sets per caller: it was 0, `cRatio === 0` skipped the check, and a
 * per-conference ratio was never enforced.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-ratio-'));
setBoardRoot(board);
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-var-requires */
const { checkRatiosAndTime } = require('../../src/services/download-booking.service');
const mpfm = require('../../src/services/MessagePointerFileManager');
const { loadConferenceAccount } = require('../../src/utils/message-pointers.util');
/* eslint-enable @typescript-eslint/no-var-requires */

// ACSPermission.CONFERENCE_ACCOUNTING = 57; nothing else granted.
const flags = '?'.repeat(87).split('');
flags[57] = 'T';

function writeMyRecord(fields: Record<string, number>) {
  fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
  const file = Buffer.alloc(mpfm.CONFBASE_RECORD_SIZE * 2);
  const rec = mpfm.deserializeConfBase(Buffer.alloc(mpfm.CONFBASE_RECORD_SIZE));
  mpfm.serializeConfBase({ ...rec, ...fields }).copy(file, mpfm.CONFBASE_RECORD_SIZE);
  fs.writeFileSync(path.join(board, 'Conf1', 'Conf.DB'), file);
}

/** A caller in conference 1: its join swapped his counters in (express.e:5026, 4893-4905). */
function aCaller(): any {
  const session = {
    currentConf: 1,
    nodeId: 1,
    // The board-wide row: ratio 0, lots of uploads - nobody's own figures.
    conferences: [{ id: 1, name: 'General', ratio: 0, ratioType: 0, uploads: 500, downloads: 0, bytesUpload: 99999999, bytesDownload: 0 }],
    user: {
      id: 'u1', username: 'LEECH', secLevel: 20, slotNumber: 2,
      securityFlags: flags.join(''), timeTotal: 3600, timeUsed: 0, byteLimit: 0,
    },
  };
  loadConferenceAccount(session, 1);
  return session;
}

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

describe('the per-conference ratio is the caller\'s own', () => {
  test('a 1:1 byte ratio in his record with nothing uploaded refuses the download', async () => {
    writeMyRecord({ ratio: 1, ratioType: 0, bytesUpload: 0, bytesDownload: 0 });

    const verdict = await checkRatiosAndTime(aCaller(), [{ name: 'a.lha', size: 1000, confNum: 1 }]);

    expect(verdict.status).toBe(0);
    expect(verdict.error).toBe('Conf 1: Not enough free bytes for requested downloads.');
  });

  test('the same ratio with enough of his own uploads lets it through', async () => {
    writeMyRecord({ ratio: 1, ratioType: 0, bytesUpload: 5000, bytesDownload: 0 });

    const verdict = await checkRatiosAndTime(aCaller(), [{ name: 'a.lha', size: 1000, confNum: 1 }]);

    expect(verdict.status).not.toBe(0);
  });
});

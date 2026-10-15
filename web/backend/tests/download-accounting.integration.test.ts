/**
 * A download under conference accounting is booked in the caller's OWN
 * record for the file's conference - his slot in that conference's Conf.DB
 * (express.e:15439-15452 updateDownloadStats: `cb:=confBases.item(
 * getConfIndex(fileItem.confNum,1))`, addBCD downloadBytesBCD, downloads+1).
 *
 * The port added it to the board-wide `conferences` row instead, so every
 * caller's FS showed everyone's downloads as his own.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from './helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-accounting-'));
setBoardRoot(board);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { bookConference } = require('../src/services/download-booking.service');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { messagePointerFileManager, CONFBASE_RECORD_SIZE } = require('../src/services/MessagePointerFileManager');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readPackedBCD } = require('../src/utils/bcd-math.util');

// ACSPermission.CONFERENCE_ACCOUNTING = 57; "T" grants it.
const flags = '?'.repeat(87).split('');
flags[57] = 'T';

describe('download accounting (per caller, per conference)', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
    fs.writeFileSync(path.join(board, 'Conf1', 'Conf.DB'), Buffer.alloc(CONFBASE_RECORD_SIZE * 10));
  });

  afterAll(() => {
    fs.rmSync(board, { recursive: true, force: true });
  });

  it("books the download in the caller's own Conf.DB record and nobody else's", async () => {
    const session: any = {
      user: { username: 'tester', secLevel: 50, slotNumber: 3, securityFlags: flags.join(''), secOverride: '' },
      currentConf: 1,
      nodeId: 1,
    };

    await bookConference(session, { confNum: 1, size: 200 }, false);
    await bookConference(session, { confNum: 1, size: 50 }, false);

    const mine = messagePointerFileManager.readRecordOrZero(1, 3);
    expect(mine.downloads).toBe(2);
    expect(mine.bytesDownload).toBe(250);
    expect(readPackedBCD(mine.downloadBytesBCD, 0)).toBe(250n);

    const neighbour = messagePointerFileManager.readRecordOrZero(1, 4);
    expect(neighbour.downloads).toBe(0);
    expect(neighbour.bytesDownload).toBe(0);
  });

  it('books nothing when the credit account does not track downloads', async () => {
    const session: any = {
      user: {
        username: 'credit', secLevel: 50, slotNumber: 3, securityFlags: flags.join(''),
        creditDays: 5, creditStartDate: Math.floor(Date.now() / 1000) - 100, creditTracking: 0,
      },
      currentConf: 1,
      nodeId: 1,
    };

    await bookConference(session, { confNum: 1, size: 300 }, false);

    const mine = messagePointerFileManager.readRecordOrZero(1, 3);
    expect(mine.downloads).toBe(0);
    expect(mine.bytesDownload).toBe(0);
  });
});

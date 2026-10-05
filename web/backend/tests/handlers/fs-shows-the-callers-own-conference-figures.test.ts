/**
 * FS shows the caller his OWN figures for each conference.
 *
 * express.e:24141-24189 fileStatus: under ACS_CONFERENCE_ACCOUNTING it runs
 * `loadMsgPointers(i,1)` for every conference (24167), which copies the
 * caller's record from that conference's Conf.DB - his slot, his uploads,
 * downloads, bytes and ratio (4893-4905) - and prints those.
 *
 * The port printed the board-wide `conferences` row instead, which every
 * caller's transfers were added into: FS showed everyone's totals as the
 * caller's own, and the ratio column said what nobody had set.
 *
 * Driven through the dispatcher the board runs (processBBSCommand 'FS' ->
 * display-file-commands -> the DI-resolved FileStatusHandler), with a real
 * Conf.DB on a temporary board, and a call-count on the record read to prove
 * the disk record is what was shown.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-own-figures-'));
process.env.BBS_DATA_DIR = board;
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => {
  const states = jest.requireActual('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, BBSSession: {} };
});

/* eslint-disable @typescript-eslint/no-var-requires */
const { processBBSCommand } = require('../../src/handlers/command.handler');
const { initializeContainer } = require('../../src/container');
const { flushOutput } = require('../../src/utils/output.util');
const mpfm = require('../../src/services/MessagePointerFileManager');
/* eslint-enable @typescript-eslint/no-var-requires */

const MY_SLOT = 2;

function recordWith(fields: Record<string, number>): Buffer {
  const rec = mpfm.deserializeConfBase(Buffer.alloc(mpfm.CONFBASE_RECORD_SIZE));
  return mpfm.serializeConfBase({ ...rec, ...fields });
}

describe('FS prints the caller\'s own Conf.DB record for each conference', () => {
  beforeAll(() => {
    fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
    const file = Buffer.alloc(mpfm.CONFBASE_RECORD_SIZE * 3);
    // slot 1: somebody else, with large figures and a ratio
    recordWith({ upload: 900, downloads: 800, bytesUpload: 90000, bytesDownload: 80000, ratio: 9 }).copy(file, 0);
    // slot 2: the caller
    recordWith({ upload: 4, downloads: 7, bytesUpload: 4321, bytesDownload: 7654, ratio: 2 })
      .copy(file, mpfm.CONFBASE_RECORD_SIZE * (MY_SLOT - 1));
    fs.writeFileSync(path.join(board, 'Conf1', 'Conf.DB'), file);

    initializeContainer({
      db: {
        // The board-wide row the port used to print - everyone's traffic.
        getConferences: jest.fn().mockResolvedValue([
          { id: 1, name: 'General', uploads: 555, bytesUpload: 5555555, downloads: 666, bytesDownload: 6666666, ratio: 0 },
        ]),
      },
    });
  });

  afterAll(() => {
    fs.rmSync(board, { recursive: true, force: true });
  });

  test('the row is the caller\'s slot in Conf1/Conf.DB, read from disk', async () => {
    const read = jest.spyOn(mpfm.messagePointerFileManager, 'readRecordOrZero');
    const emitted: string[] = [];
    const session: any = {
      currentConf: 1,
      currentMsgBase: 1,
      nodeId: 1,
      tempData: {},
      user: {
        id: 'u-fs', username: 'SPOT', slotNumber: MY_SLOT,
        // ACS_CONFERENCE_ACCOUNTING granted through the flags string.
        securityFlags: 'T'.repeat(87), confAccess: 'X', byteLimit: 0,
        uploads: 1, downloads: 1, bytesUpload: 1, bytesDownload: 1,
      },
    };
    const socket: any = {
      id: `fs-own-${Date.now()}`,
      session,
      emit(event: string, data: string) { if (event === 'ansi-output') emitted.push(data); return true; },
      on() { return socket; },
    };

    // He is in conference 1: its join swapped his counters in (express.e:5026,
    // 4893-4905), and FS saves them back before it reads the records (24162).
    require('../../src/utils/message-pointers.util').loadConferenceAccount(session, 1);
    await processBBSCommand(socket, session, 'FS', '');
    flushOutput(socket);
    const out = emitted.join('');

    // Sentinel: the record read ran for this conference and this caller.
    expect(read).toHaveBeenCalledWith(1, MY_SLOT);

    // Visible text: express.e's row resets after the number (24179).
    const row = out.replace(/\x1b\[[0-9;]*m/g, '').split('\r\n').find(l => l.includes('1> '));
    expect(row).toBeDefined();
    expect(row).toContain('4      ');                 // his uploads
    expect(row).toContain('4321');
    expect(row).toContain('7      ');                 // his downloads
    expect(row).toContain('7654');
    expect(row).toContain('2:1');                     // his ratio
    expect(out).not.toContain('5555555');             // not the board-wide row
    expect(out).not.toContain('90000');               // not the neighbour's slot
  });
});

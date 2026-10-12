/**
 * The scan flags CF edits, and the ones a new account starts with, live in
 * handle[0] of the caller's Conf.DB record.
 *
 * express.e:24780 / 24789 / 24812: CF ORs, clears or Eors `cb.handle[0]`, and
 * every scan reads it back from there (572-591). express.e:30121-30122 gives
 * a new account clearMsgPointers' defaults (8594-8624: DEFAULT_NEWSCAN,
 * DEFAULT_NEW_FILES, DEFAULT_ZOOM) and saves them into each Conf.DB.
 *
 * The port kept CF's flags in `conf_base` only, so a door or AmiExpress tool
 * reading Conf.DB never saw them, and a new account's records stayed zero.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { setBoardRoot } from '../helpers/board-root';

const board = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-flags-'));
setBoardRoot(board);

jest.mock('../../src/database', () => ({
  db: { getUserById: jest.fn(async () => ({ slotNumber: 3 })) },
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: (conf: number) => (conf === 2 ? { defaultNewscan: true, defaultZoom: true } : {}),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const pointers = require('../../src/utils/message-pointers.util');
const mpfm = require('../../src/services/MessagePointerFileManager');
const { applyTooltypes } = require('../../src/utils/info-file.util');
/* eslint-enable @typescript-eslint/no-var-requires */

function handleOnDisk(conf: number, slot: number): Buffer {
  const file = fs.readFileSync(path.join(board, `Conf${conf}`, 'Conf.DB'));
  return file.subarray((slot - 1) * 74, (slot - 1) * 74 + 16);
}

afterAll(() => fs.rmSync(board, { recursive: true, force: true }));

describe('scan flags live in the caller\'s Conf.DB record', () => {
  beforeAll(() => {
    applyTooltypes(path.join(board, 'ConfConfig.info'), [
      ['NCONFS', '2'], ['NAME.1', 'One'], ['LOCATION.1', 'BBS:Conf1/'], ['NAME.2', 'Two'], ['LOCATION.2', 'BBS:Conf2/'],
    ]);
    fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
    fs.mkdirSync(path.join(board, 'Conf2'), { recursive: true });
  });

  test('CF turning mail scan on writes MAIL_SCAN_MASK into handle[0], keeping the vote bits', async () => {
    mpfm.messagePointerFileManager.patchRecord(1, 3, { handle: Buffer.from([0x80 | 8, 0x55, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) });

    const after = await pointers.setConferenceScanFlags('caller', 1, 1, (f: number) => f | 4);

    expect(after).toBe(0x80 | 8 | 4);
    expect(handleOnDisk(1, 3)[0]).toBe(0x80 | 8 | 4);
    expect(handleOnDisk(1, 3)[1]).toBe(0x55);
    expect(await pointers.getConferenceScanFlags('caller', 1, 1)).toBe(0x80 | 8 | 4);
  });

  test("a new account's records start with the conference's default scans and nothing else", async () => {
    mpfm.messagePointerFileManager.patchRecord(2, 3, { confYM: 99, ratio: 7, handle: Buffer.alloc(16, 0xff) });

    await pointers.clearMsgPointers('new-caller');

    expect(handleOnDisk(1, 3)[0]).toBe(0);
    expect(handleOnDisk(2, 3)[0]).toBe(4 | 2); // DEFAULT_NEWSCAN | DEFAULT_ZOOM
    expect(handleOnDisk(2, 3)[1]).toBe(0);     // a reused slot's votes are gone
    const rec = mpfm.messagePointerFileManager.readRecordOrZero(2, 3);
    expect(rec.confYM).toBe(0);
    expect(rec.ratio).toBe(0);
  });
});

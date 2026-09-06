/**
 * A new message never lands on top of an existing one.
 *
 * `mailStat.highMsgNum` is NOT the highest message number in the base - it is
 * the number express.e will hand to the NEXT message:
 *
 *   express.e:10688  mh.msgNumb := mailStat.highMsgNum     (the next msg TAKES it)
 *   express.e:12418  mailStat.highMsgNum := ... + 1        (bumped after each save)
 *   express.e:8693   a fresh, empty msgbase starts at 1    (with no message 1 yet)
 *   express.e:11759  a caught-up pointer is msgNum+1, so a pointer may
 *                    legitimately EQUAL highMsgNum
 *
 * Every conference on the live board this port never wrote to agrees:
 * highMsgNum is exactly max(msgNumb)+1 (Conf2 173/172, Conf5 3/2, Conf12
 * 39/38, and every empty base 1/0).
 *
 * On 2026-09-06 two conferences had their MailStats re-derived from their disk
 * headers to stop an every-login rescan, and the rebuild set
 * `highMsgNum = max(msgNumb)` - one too low. `getNextMessageNumber` returns
 * `highMsgNum` verbatim, so the next message posted to such a conference is
 * given a number that is ALREADY IN USE, and express.e:10694-10695 opens the
 * body file `MODE_NEWFILE` - it truncates. The existing message's body is
 * destroyed and the HeaderFile grows a duplicate record.
 *
 * This pins the outcome on a fixture board, never the sysop's data.
 *
 * Both BBS_ROOT and BBS_DATA_DIR are set: `messageIndexManager` resolves the
 * HeaderFile and MailStats against BBS_ROOT, while `message-file.util`
 * resolves message BODIES against the bbsDataPath it is handed. Setting only
 * one of them reads headers from the fixture and bodies from the real
 * checkout.
 */

process.env.TELNET_PORT = '0';
process.env.SSH_PORT = '0';
process.env.BACKEND_PORT = '0';
process.env.PORT = '0';

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * finishConferenceScan and friends reach `require('../command.handler')`,
 * whose module graph loads src/index.ts and starts live setIntervals that
 * keep the jest worker alive. Nothing here needs it; it only has to be
 * requireable.
 */
jest.mock('../../../src/handlers/command.handler', () => ({
  advanceDisplayFlow: jest.fn(async () => {}),
  processCommand: jest.fn(async () => true),
}));

const CONF = 1;
const MSG_BASE = 1;

/** The fixture's real contents: three messages, numbered 1..3. */
const HIGHEST = 3;
const EVERY_MESSAGE = Array.from({ length: HIGHEST }, (_, i) => i + 1);

/** What the last message's body says before anybody posts anything new. */
const ORIGINAL_BODY = 'the message that must not be overwritten';

describe('a new message never lands on top of an existing one', () => {
  let originalBbsRoot: string | undefined;
  let originalBbsDataDir: string | undefined;
  let tmpRoot = '';

  beforeAll(() => {
    originalBbsRoot = process.env.BBS_ROOT;
    originalBbsDataDir = process.env.BBS_DATA_DIR;
  });

  afterEach(() => {
    jest.resetModules();
    process.env.BBS_ROOT = originalBbsRoot;
    process.env.BBS_DATA_DIR = originalBbsDataDir;
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = '';
  });

  /** A board with three messages on disk, each with a body. */
  function setUpBoard() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-msgnum-'));
    process.env.BBS_ROOT = tmpRoot;
    process.env.BBS_DATA_DIR = tmpRoot;
    jest.resetModules();

    const { messageIndexManager, MsgStatus } = require('../../../src/services/MessageIndexManager');
    const messageFile = require('../../../src/utils/message-file.util');

    messageIndexManager.initializeMessageIndex(CONF);

    for (const n of EVERY_MESSAGE) {
      messageIndexManager.appendMessageHeader(CONF, {
        status: MsgStatus.NORMAL, msgNumb: n,
        toName: 'ALL', fromName: 'SysOp', subject: `msg ${n}`,
        msgDate: 0, recv: 0, extMsgNum: -1,
      });
    }

    const msgBaseDir = path.join(tmpRoot, `Conf${CONF}`, 'MsgBase');
    fs.mkdirSync(msgBaseDir, { recursive: true });
    for (const n of EVERY_MESSAGE) {
      fs.writeFileSync(
        path.join(msgBaseDir, String(n)),
        n === HIGHEST ? ORIGINAL_BODY : `body ${n}`,
        'latin1'
      );
    }

    return { messageIndexManager, messageFile, msgBaseDir };
  }

  function post(messageFile: any, subject: string, body: string): Promise<number> {
    return messageFile.writeMessageFile(
      CONF,
      MSG_BASE,
      {
        from: 'SysOp', to: 'ALL', subject,
        date: messageFile.formatMessageDate(new Date()),
        body,
      },
      tmpRoot,
      0
    );
  }

  test('a rebuild from disk leaves the next number one past the highest message', () => {
    const { messageIndexManager } = setUpBoard();

    messageIndexManager.rebuildHeaders(CONF, messageIndexManager.readHeaderFile(CONF));

    const stats = messageIndexManager.readMailStats(CONF)!;
    expect(stats.highMsgNum).toBe(HIGHEST + 1);
    expect(stats.lowestKey).toBe(1);
    expect(stats.lowestNotDel).toBe(1);
    // express.e:10688 — the number the next message will actually take.
    expect(messageIndexManager.getNextMessageNumber(CONF)).toBe(HIGHEST + 1);
  });

  test('an empty message base rebuilds to the fresh-msgbase value, not zero', () => {
    const { messageIndexManager } = setUpBoard();
    const EMPTY_CONF = 2;

    messageIndexManager.initializeMessageIndex(EMPTY_CONF);
    messageIndexManager.rebuildHeaders(EMPTY_CONF, []);

    // express.e:8691-8693 — lowestKey 1, highMsgNum 1, lowestNotDel 0.
    const stats = messageIndexManager.readMailStats(EMPTY_CONF)!;
    expect(stats.highMsgNum).toBe(1);
    expect(stats.lowestNotDel).toBe(0);
    expect(messageIndexManager.getNextMessageNumber(EMPTY_CONF)).toBe(1);
  });

  test('a new message never lands on top of an existing one', async () => {
    const { messageIndexManager, messageFile, msgBaseDir } = setUpBoard();

    // The repair, exactly as it was run on conferences 1 and 3.
    messageIndexManager.rebuildHeaders(CONF, messageIndexManager.readHeaderFile(CONF));

    const assigned = await post(messageFile, 'the new one', 'a brand new message');

    // BOTH bodies survive: the old one is untouched AND the new one exists.
    // Asserted before the number, because THIS is the loss - with the old
    // rebuild this read back 'a brand new message'.
    expect(fs.readFileSync(path.join(msgBaseDir, String(HIGHEST)), 'latin1'))
      .toBe(ORIGINAL_BODY);
    expect(fs.readFileSync(path.join(msgBaseDir, String(HIGHEST + 1)), 'latin1'))
      .toContain('a brand new message');

    // It took the next free number, not the one the last message holds.
    expect(assigned).toBe(HIGHEST + 1);

    // And the HeaderFile holds no duplicate message number.
    const numbers = messageIndexManager.readHeaderFile(CONF).map((h: any) => h.msgNumb);
    expect(numbers).toEqual([...EVERY_MESSAGE, HIGHEST + 1]);
    expect(new Set(numbers).size).toBe(numbers.length);

    // The stats moved on again, so the message after that is safe too.
    expect(messageIndexManager.getNextMessageNumber(CONF)).toBe(HIGHEST + 2);
  });

  test('two posts after a rebuild take two different numbers', async () => {
    const { messageIndexManager, messageFile, msgBaseDir } = setUpBoard();

    messageIndexManager.rebuildHeaders(CONF, messageIndexManager.readHeaderFile(CONF));

    const first = await post(messageFile, 'first', 'first body');
    const second = await post(messageFile, 'second', 'second body');

    expect(first).toBe(HIGHEST + 1);
    expect(second).toBe(HIGHEST + 2);
    expect(fs.readFileSync(path.join(msgBaseDir, String(first)), 'latin1'))
      .toContain('first body');
    expect(fs.readFileSync(path.join(msgBaseDir, String(second)), 'latin1'))
      .toContain('second body');
  });

  test('the rebuild rewrites the stats without touching a byte of the HeaderFile', () => {
    const { messageIndexManager } = setUpBoard();
    const headerPath = path.join(tmpRoot, `Conf${CONF}`, 'MsgBase', 'HeaderFile');

    const before = fs.readFileSync(headerPath);
    messageIndexManager.rebuildHeaders(CONF, messageIndexManager.readHeaderFile(CONF));
    const after = fs.readFileSync(headerPath);

    expect(after.equals(before)).toBe(true);
    expect(after.length).toBe(HIGHEST * 110);
  });
});

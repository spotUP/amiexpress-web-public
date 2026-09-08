/**
 * What AEW_MSGQUERY answers, against a message base built for the purpose.
 *
 * The board decodes and the door renders: this handler is the ONLY place a
 * 110-byte HeaderFile record is turned into something a C door can read, and
 * the only place the caller's ACS is applied to it. Every test here is named
 * after the symptom a caller would report.
 *
 * The board is not a fixture (RULES.md): these assert EXACT values, so the
 * input is a message base this file writes into a temp directory, never the
 * live one.
 *
 * BBS_ROOT and BBS_DATA_DIR both point at it on purpose. `messageIndexManager`
 * resolves HeaderFile against BBS_ROOT while message BODIES are found through
 * `config.get('dataDir')`, which reads BBS_DATA_DIR - set only one and the
 * headers come from the fixture while the bodies are looked for in the real
 * checkout.
 */
process.env.TELNET_PORT = '0';
process.env.SSH_PORT = '0';
process.env.BACKEND_PORT = '0';
process.env.PORT = '0';
process.env.SKIP_SERVER_START = '1';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { ACSPermission } from '../../src/constants/acs-permissions';
import { ScanFlags } from '../../src/types/message-pointers';

jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn(() => ({
    forceNewscan: false, noNewscan: false, showNewFiles: false,
    noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
  })),
}));

const CONF = 1;
const MSG_BASE = 1;

/**
 * A caller's ACS string: every flag '?' (undecided, falls through to the level
 * table) except the ones named here, which are hard 'T'.
 */
function acs(...granted: ACSPermission[]): string {
  const flags = new Array(90).fill('?');
  for (const g of granted) flags[g] = 'T';
  return flags.join('');
}

describe('AEW_MSGQUERY answers', () => {
  let db: any;
  let caller: any;
  let tmpRoot = '';
  let originalBbsRoot: string | undefined;
  let originalBbsDataDir: string | undefined;
  let msgfeed: typeof import('../../src/amiga-emulation/xim/msgfeed');

  const BODY_OF_ONE =
    'This is the body of message one.\n' +
    'It is deliberately longer than one XIM chunk so that BODY has to page: ' +
    'x'.repeat(400) +
    '\nAnd a last line.';

  beforeAll(async () => {
    db = (global as any).testDb;
    if (!db) throw new Error('Test database not initialized');
    caller = await db.getUserByUsername('sysop');
    if (!caller) throw new Error('sysop user missing');
    originalBbsRoot = process.env.BBS_ROOT;
    originalBbsDataDir = process.env.BBS_DATA_DIR;
  });

  afterEach(() => {
    process.env.BBS_ROOT = originalBbsRoot;
    process.env.BBS_DATA_DIR = originalBbsDataDir;
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = '';
    jest.resetModules();
  });

  /**
   * Six messages, one of each shape the filter has to tell apart.
   *
   *   1  P  EALL   Spot      public, ordinary
   *   2  R  SYSOP  Phantasm  private - never in this feed
   *   3  D  EALL   Rebel     deleted - never in this feed
   *   4  P  ALL    Rebel     public, addressed ALL
   *   5  p  EALL   Nark      public but CENSORED - ACS decides
   *   6  P  EALL   Spot      a subject with a pipe in it
   */
  function setUpBoard() {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amix-msgquery-'));
    process.env.BBS_ROOT = tmpRoot;
    process.env.BBS_DATA_DIR = tmpRoot;
    jest.resetModules();

    const { messageIndexManager, MsgStatus } = require('../../src/services/MessageIndexManager');
    msgfeed = require('../../src/amiga-emulation/xim/msgfeed');

    messageIndexManager.initializeMessageIndex(CONF);

    const when = Math.floor(Date.UTC(2026, 8, 8, 12, 0, 0) / 1000); // 08Sep26
    const rows = [
      { status: MsgStatus.NORMAL,   msgNumb: 1, toName: 'EALL',  fromName: 'Spot',     subject: 'Anyone still cracking?' },
      { status: MsgStatus.PRIVATE,  msgNumb: 2, toName: 'SYSOP', fromName: 'Phantasm', subject: 'Private note' },
      { status: MsgStatus.DELETED,  msgNumb: 3, toName: 'EALL',  fromName: 'Rebel',    subject: 'Killed' },
      { status: MsgStatus.NORMAL,   msgNumb: 4, toName: 'ALL',   fromName: 'Rebel',    subject: 'Forty cols' },
      { status: MsgStatus.CENSORED, msgNumb: 5, toName: 'EALL',  fromName: 'Nark',     subject: 'Censored one' },
      { status: MsgStatus.NORMAL,   msgNumb: 6, toName: 'EALL',  fromName: 'Spot',     subject: 'Pipes | and stuff' },
    ];
    for (const r of rows) {
      messageIndexManager.appendMessageHeader(CONF, { ...r, msgDate: when, recv: 0, extMsgNum: 0 });
    }

    const msgBase = path.join(tmpRoot, `Conf${CONF}`, 'MsgBase');
    fs.mkdirSync(msgBase, { recursive: true });
    for (const r of rows) {
      fs.writeFileSync(
        path.join(msgBase, String(r.msgNumb)),
        r.msgNumb === 1 ? BODY_OF_ONE + '\n' : `body of ${r.msgNumb}\n`,
        'latin1',
      );
    }

    // Written explicitly rather than left to the appends, so the pointer
    // validation below is deterministic: express.e:5037-5038 pulls a fresh
    // caller's pointer UP to lowestNotDel before anything is scanned, so the
    // pointer STAT reports is 1 here and never 0.
    messageIndexManager.writeMailStats(CONF, {
      lowestKey: 1, highMsgNum: 7, lowestNotDel: 1, pad: Buffer.alloc(6),
    });

    const sqlite = (db as any).db;
    sqlite.prepare(
      `INSERT INTO conf_base (user_id, conference_id, message_base_id,
                              last_new_read_conf, last_msg_read_conf, scan_flags)
       VALUES (?, ?, ?, 0, 0, ?)
       ON CONFLICT(user_id, conference_id, message_base_id)
       DO UPDATE SET last_new_read_conf = 0, last_msg_read_conf = 0, scan_flags = excluded.scan_flags`
    ).run(caller.id, CONF, MSG_BASE, ScanFlags.MAIL_SCAN | ScanFlags.FILE_SCAN);

    return msgfeed;
  }

  /** A session for a caller with the ACS flags named. */
  function sessionFor(...granted: ACSPermission[]) {
    return {
      user: { ...caller, securityFlags: acs(...granted), secOverride: '' },
      currentConf: CONF,
      currentMsgBase: MSG_BASE,
      conferenceName: 'Amiga Chat',
      nodeId: 1,
    } as any;
  }

  /** The rows of a LIST answer, without the trailing empty split. */
  function rowsOf(text: string): string[] {
    return text.split('\n').filter(line => line.length > 0);
  }

  it("answers STAT with the conference's public count and the caller's pointer", async () => {
    const feed = setUpBoard();

    const answer = await feed.handleMsgQuery('STAT', sessionFor(ACSPermission.READ_PRIV_EALL));
    const [total, unread, pointer, name] = answer.text.split('|');

    // 1, 4, 5 and 6 are public and this caller may read all four. 2 is
    // private and 3 is deleted.
    expect(total).toBe('4');
    // The pointer is at 1, so 4, 5 and 6 are above it. 4 is addressed ALL and
    // this caller's MAILSCAN_ALL bit is off, so it is not new FOR HIM
    // (message-scan.handler.ts:284-299) - 5 and 6 are.
    expect(unread).toBe('2');
    expect(pointer).toBe('1');
    expect(name).toBe('Amiga Chat');
    expect(answer.bytes).toBe(answer.text.length);

    // The count and the flags cannot disagree: both come from the same walk.
    const listing = await feed.handleMsgQuery('LIST 1 50', sessionFor(ACSPermission.READ_PRIV_EALL));
    const flagged = rowsOf(listing.text).filter(r => r.split('|')[4] === 'N');
    expect(flagged).toHaveLength(2);
  });

  it('LIST returns rows in ascending message number and never a partial row', async () => {
    const feed = setUpBoard();

    const answer = await feed.handleMsgQuery('LIST 1 50', sessionFor(ACSPermission.READ_PRIV_EALL));
    const rows = rowsOf(answer.text);
    const numbers = rows.map(r => Number(r.split('|')[0]));

    expect(numbers).toEqual([1, 4, 5, 6]);
    // Every row ends with a newline, including the last: truncation is always
    // at a row boundary, so a door never has to reassemble half a row.
    expect(answer.text.endsWith('\n')).toBe(true);
    expect(answer.text.length).toBeLessThanOrEqual(feed.MSGQUERY_REPLY_MAX);
    expect(answer.bytes).toBe(answer.text.length);
  });

  it('never lists a message whose status byte is R (private)', async () => {
    const feed = setUpBoard();
    // A sysop with every read permission there is still does not see message 2
    // in this feed: it is not public, and this door is the PUBLIC feed.
    const answer = await feed.handleMsgQuery(
      'LIST 1 50',
      sessionFor(ACSPermission.SYSOP_READ, ACSPermission.READ_PRIV_EALL, ACSPermission.READ_PRIV_ALL),
    );
    expect(rowsOf(answer.text).map(r => r.split('|')[0])).not.toContain('2');
    expect(answer.text).not.toContain('Phantasm');
  });

  it('never lists a message whose status byte is D (deleted)', async () => {
    const feed = setUpBoard();
    const answer = await feed.handleMsgQuery(
      'LIST 1 50',
      sessionFor(ACSPermission.SYSOP_READ, ACSPermission.READ_PRIV_EALL),
    );
    expect(rowsOf(answer.text).map(r => r.split('|')[0])).not.toContain('3');
    expect(answer.text).not.toContain('Killed');
  });

  it('lists an EALL message even though readMessageFile would call it private', async () => {
    const feed = setUpBoard();
    // utils/message-file.util.ts:309 derives isPrivate from `toName !== 'ALL'`,
    // so it reports EVERY eALL message as private. Copying that shortcut here
    // would empty the public feed of exactly the messages it exists to show.
    const { readMessageFile } = require('../../src/utils/message-file.util');
    const asTheReaderSeesIt = await readMessageFile(CONF, 1, tmpRoot);
    expect(asTheReaderSeesIt.isPrivate).toBe(true);   // the known bug, pinned

    const answer = await feed.handleMsgQuery('LIST 1 50', sessionFor());
    expect(rowsOf(answer.text).map(r => r.split('|')[0])).toContain('1');
  });

  it('hides a message the caller\'s ACS does not permit (READ_PRIV_EALL off)', async () => {
    const feed = setUpBoard();

    // express.e:12344-12348: a CENSORED public message ('p') is suppressed
    // unless the caller is a sysop or holds READ_PRIV_EALL / READ_PRIV_ALL for
    // the name it is addressed to.
    const without = await feed.handleMsgQuery('LIST 1 50', sessionFor());
    expect(rowsOf(without.text).map(r => r.split('|')[0])).not.toContain('5');

    const with_ = await feed.handleMsgQuery('LIST 1 50', sessionFor(ACSPermission.READ_PRIV_EALL));
    expect(rowsOf(with_.text).map(r => r.split('|')[0])).toContain('5');
  });

  it('a negative first starts that many rows back from the end', async () => {
    const feed = setUpBoard();
    // Message numbers are SPARSE - 1, 4, 5, 6 here - so a door cannot work out
    // "the last two" from a total and a highest number. Without this it would
    // open a long conference on its OLDEST messages, which is the wrong end of
    // a discussion.
    const answer = await feed.handleMsgQuery('LIST -1 2', sessionFor(ACSPermission.READ_PRIV_EALL));
    expect(rowsOf(answer.text).map(r => r.split('|')[0])).toEqual(['5', '6']);

    // And it is still plain ascending order, never reversed.
    const whole = await feed.handleMsgQuery('LIST -1 50', sessionFor(ACSPermission.READ_PRIV_EALL));
    expect(rowsOf(whole.text).map(r => r.split('|')[0])).toEqual(['1', '4', '5', '6']);
  });

  it('a pipe in a subject arrives as ! and the row still splits into 5 fields', async () => {
    const feed = setUpBoard();

    const answer = await feed.handleMsgQuery('LIST 6 1', sessionFor());
    const row = rowsOf(answer.text)[0]!;
    const fields = row.split('|');

    expect(fields).toHaveLength(5);
    expect(fields[0]).toBe('6');
    expect(fields[1]).toBe('Spot');
    expect(fields[2]).toBe('Pipes ! and stuff');
    expect(fields[3]).toBe('08Sep26');
    expect(fields[4]).toMatch(/^[N*-]$/);
  });

  it('BODY returns the same bytes in chunks that it does whole', async () => {
    const feed = setUpBoard();
    const session = sessionFor();

    let reassembled = '';
    for (let chunk = 0; ; chunk++) {
      const part = await feed.handleMsgQuery(`BODY 1 ${chunk}`, session);
      if (part.bytes === 0) break;
      expect(part.bytes).toBe(part.text.length);
      expect(part.text.length).toBeLessThanOrEqual(feed.MSGQUERY_REPLY_MAX);
      reassembled += part.text;
      if (chunk > 40) throw new Error('BODY never said it was finished');
    }

    // More than one chunk, or the test is not proving paging at all.
    expect(reassembled.length).toBeGreaterThan(feed.MSGQUERY_REPLY_MAX);
    expect(reassembled).toBe(BODY_OF_ONE);
  });

  it('a body a caller may not read is not served by BODY either', async () => {
    const feed = setUpBoard();
    // Message 2 is private; the feed refuses it whatever the caller asks for.
    const answer = await feed.handleMsgQuery('BODY 2 0', sessionFor());
    expect(answer.bytes).toBe(0);
    expect(answer.text).toBe('');
  });

  it('an unknown verb is answered with nothing rather than guessed at', async () => {
    const feed = setUpBoard();
    const answer = await feed.handleMsgQuery('DELETE 1', sessionFor());
    expect(answer).toEqual({ text: '', bytes: 0 });
  });
});

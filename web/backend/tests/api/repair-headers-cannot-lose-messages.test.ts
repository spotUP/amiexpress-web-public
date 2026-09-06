/**
 * The admin's "repair headers" button, which used to be a data-loss trap.
 *
 * It rebuilt the disk HeaderFile FROM THE DATABASE, renumbering from 1, and
 * `rebuildHeaders` REPLACES the file. On this board:
 *
 *   Conf1/MsgBase/HeaderFile   328 records, message numbers up to 318
 *   SQL rows for conference 1  ~158
 *
 * so one press would have left ~158 records numbered 1..158. The rest keep
 * their body files and lose their headers - and nothing on this board can
 * reach a message whose header is gone. The surviving records would also
 * carry DB message k's sender and subject over disk slot k's body, and every
 * one of them got `recv: 0`, marking the whole conference unread again: the
 * exact symptom the button's own comment promised to fix.
 *
 * The board's rule is `AmiExpress reads disk, not DB` - the HeaderFile and
 * MailStats are what the BBS and every 68K door read, SQL mirrors them for the
 * web UI. So the repair now runs off the disk, and the mirror is consulted
 * only for a conference that has no HeaderFile at all.
 *
 * The fixture models the real shape: more headers on disk than rows in the
 * mirror, and a stale MailStats.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() },
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  },
}));

import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { messageIndexManager, MsgStatus, type MsgHeader } from '../../src/services/MessageIndexManager';
import {
  repairConferenceHeaders,
  assertNoHeaderLoss,
} from '../../src/services/message-header-repair';

const CONF = 1;
/** The real Conf1 holds 328 records numbered to 318; the mirror holds ~158. */
const ON_DISK = 318;
const IN_MIRROR = 158;
const AT_RISK = ON_DISK - IN_MIRROR;

/** The stale value that makes validatePointers rewind the pointer every login. */
const STALE_HIGH = 151;

let root: string;

function header(n: number): MsgHeader {
  return {
    status: n % 7 === 0 ? MsgStatus.PRIVATE : MsgStatus.NORMAL,
    msgNumb: n,
    toName: n % 7 === 0 ? 'SYSOP' : 'ALL',
    fromName: `sender${n}`,
    subject: `subject ${n}`,
    msgDate: 1_700_000_000 + n,
    // Half the board has been read. A rebuild from the mirror sets every
    // recv to 0, which is how the button re-announced the whole conference.
    recv: n % 2 === 0 ? 1_700_000_500 + n : 0,
    extMsgNum: 0,
  };
}

/** A board whose disk index is the truth and whose MailStats has gone stale. */
function makeBoard(): void {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-headers-'));
  process.env.BBS_ROOT = root;
  process.env.BBS_DATA_DIR = root;
  messageIndexManager.setBbsRoot(root);

  const msgBase = path.join(root, `Conf${CONF}`, 'MsgBase');
  fs.mkdirSync(msgBase, { recursive: true });

  messageIndexManager.initializeMessageIndex(CONF);
  for (let n = 1; n <= ON_DISK; n++) {
    messageIndexManager.appendMessageHeader(CONF, header(n));
    fs.writeFileSync(path.join(msgBase, String(n)), `body ${n}\r\n`, 'latin1');
  }

  // Stale, exactly as Conf1 is: the headers go to 318, the stats say 151.
  messageIndexManager.writeMailStats(CONF, {
    lowestKey: 1, highMsgNum: STALE_HIGH, lowestNotDel: 1, pad: Buffer.alloc(6),
  });
}

/** The mirror: fewer rows, renumbered from 1, every one of them unread. */
function mirrorHeaders(): MsgHeader[] {
  const rows: MsgHeader[] = [];
  for (let n = 1; n <= IN_MIRROR; n++) {
    rows.push({
      status: MsgStatus.NORMAL, msgNumb: n,
      toName: 'ALL', fromName: 'sql', subject: 'from the mirror',
      msgDate: 1_700_000_000, recv: 0, extMsgNum: -1,
    });
  }
  return rows;
}

afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  delete process.env.BBS_ROOT;
  delete process.env.BBS_DATA_DIR;
  jest.restoreAllMocks();
});

describe('repairing a conference that has headers on disk', () => {
  beforeEach(() => makeBoard());

  it(`keeps every one of the ${AT_RISK} messages the mirror does not hold`, async () => {
    const before = messageIndexManager.readHeaderFile(CONF);
    expect(before).toHaveLength(ON_DISK);

    await repairConferenceHeaders({
      conferenceId: CONF,
      index: messageIndexManager,
      databaseHeaders: async () => mirrorHeaders(),
    });

    const after = messageIndexManager.readHeaderFile(CONF);
    expect(after).toHaveLength(ON_DISK);
    expect(after.map(h => h.msgNumb)).toEqual(before.map(h => h.msgNumb));
    // The ones only the disk knew about are still addressable by number.
    for (let n = IN_MIRROR + 1; n <= ON_DISK; n++) {
      expect(after.some(h => h.msgNumb === n)).toBe(true);
    }
  });

  it('does not read the mirror at all when the disk has headers', async () => {
    const mirror = jest.fn(async () => mirrorHeaders());

    await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager, databaseHeaders: mirror,
    });

    expect(mirror).not.toHaveBeenCalled();
  });

  it('leaves sender, subject and the received flag exactly as the disk had them', async () => {
    const before = messageIndexManager.readHeaderFile(CONF);

    await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager, databaseHeaders: async () => mirrorHeaders(),
    });

    const after = messageIndexManager.readHeaderFile(CONF);
    expect(after.map(h => [h.msgNumb, h.fromName, h.subject, h.recv, h.status]))
      .toEqual(before.map(h => [h.msgNumb, h.fromName, h.subject, h.recv, h.status]));
    // Rebuilding from the mirror set every recv to 0; nothing here does.
    expect(after.filter(h => h.recv !== 0).length).toBeGreaterThan(0);
  });

  it('re-derives the stale MailStats that made every login rescan the conference', async () => {
    expect(messageIndexManager.readMailStats(CONF)!.highMsgNum).toBe(STALE_HIGH);

    const result = await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager,
    });

    expect(result.source).toBe('disk');
    expect(messageIndexManager.readMailStats(CONF)!.highMsgNum).toBe(ON_DISK);
    expect(result.mailStatBefore!.highMsgNum).toBe(STALE_HIGH);
    expect(result.mailStatAfter!.highMsgNum).toBe(ON_DISK);
  });

  it('a dry run reports the same numbers and writes nothing', async () => {
    const result = await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager, dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.rebuilt).toBe(0);
    expect(messageIndexManager.readMailStats(CONF)!.highMsgNum).toBe(STALE_HIGH);
  });
});

describe('the no-loss rule itself', () => {
  it('refuses a rebuild that holds fewer headers than the disk, and says how many', () => {
    expect(() => assertNoHeaderLoss(CONF, ON_DISK, IN_MIRROR))
      .toThrow(new RegExp(`${AT_RISK} messages? unreachable`));
  });

  it('allows a rebuild that holds the same number, or more', () => {
    expect(() => assertNoHeaderLoss(CONF, ON_DISK, ON_DISK)).not.toThrow();
    expect(() => assertNoHeaderLoss(CONF, ON_DISK, ON_DISK + 1)).not.toThrow();
  });

  it('never lets the mirror become the source while the disk holds headers', async () => {
    makeBoard();
    // The old route's shape - disk headers present, mirror smaller - is now
    // unreachable: `databaseHeaders` is consulted ONLY for an empty disk, and
    // assertNoHeaderLoss stands behind that. Both halves are pinned: the
    // mirror is never called (above) and the guard throws with a count (below).
    const mirror = jest.fn(async () => mirrorHeaders());
    const result = await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager, databaseHeaders: mirror,
    });

    expect(mirror).not.toHaveBeenCalled();
    expect(result.source).toBe('disk');
    expect(result.headersAfter).toBe(ON_DISK);
  });
});

describe('a conference with no HeaderFile at all', () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-empty-'));
    process.env.BBS_ROOT = root;
    process.env.BBS_DATA_DIR = root;
    messageIndexManager.setBbsRoot(root);
    fs.mkdirSync(path.join(root, `Conf${CONF}`, 'MsgBase'), { recursive: true });
  });

  it('is rebuilt from the mirror, because there is nothing on disk to lose', async () => {
    const result = await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager, databaseHeaders: async () => mirrorHeaders(),
    });

    expect(result.source).toBe('database');
    expect(messageIndexManager.readHeaderFile(CONF)).toHaveLength(IN_MIRROR);
  });

  it('reports rather than guesses when there is no mirror either', async () => {
    const result = await repairConferenceHeaders({
      conferenceId: CONF, index: messageIndexManager,
    });

    expect(result.source).toBe('none');
    expect(result.rebuilt).toBe(0);
    expect(result.message).toContain('Nothing was changed');
  });
});

describe('pressing the button', () => {
  let app: express.Application;

  beforeEach(() => {
    makeBoard();
    const { createConfigRouter } = require('../../src/api/config-routes');
    // The mirror the old route would have rebuilt from.
    const database: any = {
      // ConfigService and a couple of routes reach for these at construction.
      getConfigRepository: () => ({ get: () => undefined, set: () => undefined, all: () => [] }),
      getMessageBases: async () => [{ id: 1, conferenceId: CONF, name: 'Main' }],
      getMessages: async () => mirrorHeaders().map(h => ({
        body: 'from the mirror\r\n', isPrivate: false, toUser: 'ALL',
        author: 'sql', subject: 'from the mirror', timestamp: new Date(1_700_000_000_000),
      })),
    };
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(database));
  });

  it(`cannot lose the ${AT_RISK} messages, however many times it is pressed`, async () => {
    const before = messageIndexManager.readHeaderFile(CONF).map(h => h.msgNumb);

    for (let press = 0; press < 3; press++) {
      const res = await request(app).post('/api/config/messages/repair-headers').query({ conf: CONF });
      expect(res.status).toBe(200);

      // The message loss FIRST, so a regression fails on the thing that
      // matters rather than on a field name.
      const onDisk = messageIndexManager.readHeaderFile(CONF);
      expect(onDisk).toHaveLength(ON_DISK);
      expect(onDisk.map(h => h.msgNumb)).toEqual(before);

      expect(res.body.data.source).toBe('disk');
      expect(res.body.data.headersAfter).toBe(ON_DISK);
    }
  });

  it('fixes the stale MailStats it was always meant to fix', async () => {
    const res = await request(app).post('/api/config/messages/repair-headers').query({ conf: CONF });

    expect(res.body.data.mailStatBefore.highMsgNum).toBe(STALE_HIGH);
    expect(res.body.data.mailStatAfter.highMsgNum).toBe(ON_DISK);
    expect(messageIndexManager.readMailStats(CONF)!.highMsgNum).toBe(ON_DISK);
  });

  it('answers a dry run without writing', async () => {
    const res = await request(app)
      .post('/api/config/messages/repair-headers')
      .query({ conf: CONF, dryRun: 'true' });

    expect(res.body.data.dryRun).toBe(true);
    expect(messageIndexManager.readMailStats(CONF)!.highMsgNum).toBe(STALE_HIGH);
  });
});

/**
 * The board and an emulated door share one MailLock, and it is express.e's.
 *
 * express.e's lockMsgBase (express.e:11944-11964) takes an exclusive AmigaDOS
 * `Lock()` on `<msgBase>MailLock`, creates the file when it is missing, and
 * never writes or deletes it. The FILE is only the thing being locked; who
 * holds the HANDLE is the lock, and AmigaOS drops a handle when its holder
 * dies.
 *
 * This port used to write a timestamp into the file instead. The board
 * stamped UTC milliseconds and the SUBS door stamped express.e's
 * getSystemTime (local wall clock + 21600 s), so in CEST a lock the door left
 * behind read as eight hours in the future and refused every board post in
 * that conference for about eight hours - and the door read a live board lock
 * as eight hours stale and posted over it (2026-10-04 SUBS proposal,
 * conflict 1). Now neither side reads the file at all: the board and every
 * emulated dos.library `Lock(…, ACCESS_WRITE)` share one handle table
 * (utils/mail-lock.ts).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { config } from '../../src/config';
import { tryLockExclusive, unlockExclusive, releaseAllHeldBy } from '../../src/utils/mail-lock';

const CONF = 7;

let root: string;
let previousDataDir: string;

function lockPath(): string {
  return path.join(root, `Conf${CONF}`, 'MsgBase', 'MailLock');
}

function lockFileHolding(text: string): void {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  fs.writeFileSync(lockPath(), text);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'maillock-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  // The manager keeps its own root, taken at construction - the singleton
  // would otherwise reach into the real board while these tests write locks.
  messageIndexManager.setBbsRoot(root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
});

afterEach(() => {
  messageIndexManager.releaseMailLock(CONF, 1);
  messageIndexManager.releaseMailLock(CONF, 2);
  config.set('dataDir', previousDataDir);
  messageIndexManager.setBbsRoot(previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a stamp a door left in MailLock', () => {
  it('does not block board posts, whatever clock wrote it', () => {
    // What a killed SUBS left on 2026-10-04: getSystemTime() seconds, which
    // in CEST is 28 800 s ahead of UTC. The old reader saw a stamp in the
    // future and refused every post for about eight hours.
    const amigaNowCest = Math.floor(Date.now() / 1000) + 7200 + 21600;
    lockFileHolding(String(amigaNowCest));

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });

  it('does not block a post a second after it was written either', () => {
    lockFileHolding(String(Date.now()));

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });
});

describe('a door holding the exclusive lock', () => {
  it('refuses the board, as express.e refuses while anybody holds it', () => {
    lockFileHolding('');
    const door = {};
    expect(tryLockExclusive(lockPath(), door)).toBe(true);

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(false);

    unlockExclusive(lockPath(), door);
    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });

  it('is freed when the door ends without unlocking, as AmigaOS frees it', () => {
    lockFileHolding('');
    const door = {};
    tryLockExclusive(lockPath(), door);

    releaseAllHeldBy(door);

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });

  it('is the same lock whatever case the door spelled the name in', () => {
    lockFileHolding('');
    const door = {};
    tryLockExclusive(path.join(path.dirname(lockPath()), 'maillock'), door);

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(false);
    releaseAllHeldBy(door);
  });
});

describe('the lock the board takes', () => {
  it('excludes a second writer until it is released', () => {
    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
    expect(messageIndexManager.acquireMailLock(CONF, 2)).toBe(false);
    expect(tryLockExclusive(lockPath(), {})).toBe(false);

    messageIndexManager.releaseMailLock(CONF, 1);
    expect(messageIndexManager.acquireMailLock(CONF, 2)).toBe(true);
  });

  it('creates MailLock when missing and never writes or deletes it', () => {
    expect(fs.existsSync(lockPath())).toBe(false);

    messageIndexManager.acquireMailLock(CONF, 1);
    expect(fs.readFileSync(lockPath()).length).toBe(0);

    messageIndexManager.releaseMailLock(CONF, 1);
    expect(fs.existsSync(lockPath())).toBe(true);
  });
});

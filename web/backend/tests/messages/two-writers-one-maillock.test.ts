/**
 * The board and a C door share one MailLock file, and they must read it the
 * same way.
 *
 * 2026-09-22, reported from the board: "[INFO] Another task has the MsgBase
 * locked. Not posted." in SUBS, with nothing holding anything. Three
 * conferences were in that state - Conf1 and Conf3 since 2026-09-14, Conf5
 * (Up Rough Internal) since 2026-09-18 - and every post through the door had
 * been refused for as long as eight days.
 *
 * The cause was a difference of opinion about what the file means. express.e
 * takes an exclusive AmigaDOS `Lock()` on it and CREATES it when it is
 * missing (express.e:11944-11964): the file is the thing being locked, it is
 * left on disk for ever by design, and AmigaOS frees the handle when the
 * holder exits. The C SDK read the file's EXISTENCE as the lock, so a door
 * killed between take and unlock - inactivity fuse, dropped carrier, node
 * restart - blocked that conference permanently. This manager reads the
 * file's CONTENTS as a timestamp with a thirty-second window, which survives
 * a dead holder.
 *
 * Both write a stamp now. They do not write the same UNITS: this side writes
 * `Date.now()` in milliseconds, and the door writes seconds because a 68K
 * `long` is 32 bits and cannot hold a millisecond stamp. Each must therefore
 * understand the other, or a live lock reads as decades old and the second
 * writer posts straight over the first - which is the corruption the lock
 * exists to prevent.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { messageIndexManager } from '../../src/services/MessageIndexManager';
import { config } from '../../src/config';

const CONF = 7;

let root: string;
let previousDataDir: string;

function lockPath(): string {
  return path.join(root, `Conf${CONF}`, 'MsgBase', 'MailLock');
}

/** What the C door writes: whole seconds, no more digits than a long holds. */
function doorLock(unixSeconds: number): void {
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  fs.writeFileSync(lockPath(), String(unixSeconds));
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
  config.set('dataDir', previousDataDir);
  messageIndexManager.setBbsRoot(previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a lock the door is holding', () => {
  it('is respected, though the door wrote seconds and this side counts millis', () => {
    doorLock(Math.floor(Date.now() / 1000));

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(false);
  });

  it('stops being respected once it is older than the stale window', () => {
    doorLock(Math.floor(Date.now() / 1000) - 31);

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });
});

describe('a lock file that says nothing', () => {
  it('is free, because that is a holder that died mid-post', () => {
    // Exactly what was on the live volume: zero bytes, days old.
    fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
    fs.writeFileSync(lockPath(), '');

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });

  it('is free when it holds something that is not a stamp at all', () => {
    fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
    fs.writeFileSync(lockPath(), 'node 3\n');

    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
  });
});

describe('the lock this side takes', () => {
  it('reads as held by its own rules, and is released', () => {
    expect(messageIndexManager.acquireMailLock(CONF, 1)).toBe(true);
    expect(messageIndexManager.acquireMailLock(CONF, 2)).toBe(false);

    messageIndexManager.releaseMailLock(CONF, 1);
    expect(messageIndexManager.acquireMailLock(CONF, 2)).toBe(true);
  });

  it('is written in a shape the door can read: leading digits are the second', () => {
    messageIndexManager.acquireMailLock(CONF, 1);

    const written = fs.readFileSync(lockPath(), 'utf8');
    const digits = written.trim().match(/^\d+/)?.[0] ?? '';
    // The door reads the first ten digits and calls them seconds - which is
    // what they are, for any millisecond stamp.
    expect(digits.length).toBeGreaterThanOrEqual(10);
    const asSeconds = Number(digits.slice(0, 10));
    expect(Math.abs(asSeconds - Math.floor(Date.now() / 1000))).toBeLessThan(5);
  });
});

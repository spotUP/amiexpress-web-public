/**
 * Regression test for MailStats truncation recovery (2026-04-24).
 *
 * readMailStats used to throw 'Invalid MailStats file size' on any file <12
 * bytes, which blocked every message post in conferences whose
 * Conf*\/Messages/MailStats file was left from an older 2-int32 format
 * (8 bytes of zeroes). The fix treats undersized files as missing and
 * rebuilds with defaults so posting can proceed.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  readMailStats,
  writeMailStats,
  getMailStatsPath,
  getMessagesDir,
} from '../src/utils/message-file.util';

// getConferenceDir used by getMessagesDir expects {bbsRoot}/Conf{N}/Messages.
function setUp(confNum: number, seedBytes: Buffer | null): { bbsRoot: string; cleanup: () => void } {
  const bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mailstats-test-'));
  const messagesDir = getMessagesDir(confNum, bbsRoot);
  fs.mkdirSync(messagesDir, { recursive: true });
  if (seedBytes !== null) {
    fs.writeFileSync(getMailStatsPath(confNum, bbsRoot), seedBytes);
  }
  return { bbsRoot, cleanup: () => fs.rmSync(bbsRoot, { recursive: true, force: true }) };
}

describe('readMailStats recovery', () => {
  test('truncated 8-byte MailStats is rebuilt with defaults', async () => {
    const { bbsRoot, cleanup } = setUp(99, Buffer.alloc(8, 0));
    try {
      const stats = await readMailStats(99, bbsRoot);
      expect(stats).toEqual({ lowestKey: 1, lowestNotDel: 0, highMsgNum: 1 });

      // File should now be the canonical 18 bytes (axobjects.e mailStat SIZEOF).
      const onDisk = fs.readFileSync(getMailStatsPath(99, bbsRoot));
      expect(onDisk.length).toBe(18);
    } finally {
      cleanup();
    }
  });

  test('empty MailStats is rebuilt with defaults', async () => {
    const { bbsRoot, cleanup } = setUp(98, Buffer.alloc(0));
    try {
      const stats = await readMailStats(98, bbsRoot);
      expect(stats.highMsgNum).toBe(1);
      expect(fs.readFileSync(getMailStatsPath(98, bbsRoot)).length).toBe(18);
    } finally {
      cleanup();
    }
  });

  test('missing MailStats is created with defaults (existing behaviour preserved)', async () => {
    const { bbsRoot, cleanup } = setUp(97, null);
    try {
      const stats = await readMailStats(97, bbsRoot);
      expect(stats).toEqual({ lowestKey: 1, lowestNotDel: 0, highMsgNum: 1 });
      expect(fs.readFileSync(getMailStatsPath(97, bbsRoot)).length).toBe(18);
    } finally {
      cleanup();
    }
  });

  test('valid 18-byte MailStats is read verbatim', async () => {
    // axobjects.e mailStat field order: lowestKey(0) highMsgNum(4) lowestNotDel(8) pad[6](12)
    const buf = Buffer.alloc(18, 0);
    buf.writeInt32BE(5, 0);    // lowestKey
    buf.writeInt32BE(42, 4);   // highMsgNum
    buf.writeInt32BE(3, 8);    // lowestNotDel
    const { bbsRoot, cleanup } = setUp(96, buf);
    try {
      const stats = await readMailStats(96, bbsRoot);
      expect(stats).toEqual({ lowestKey: 5, lowestNotDel: 3, highMsgNum: 42 });
    } finally {
      cleanup();
    }
  });
});

describe('writeMailStats always produces 18 bytes', () => {
  test('fresh defaults serialize to exactly 18 bytes (axobjects.e SIZEOF mailStat)', async () => {
    const { bbsRoot, cleanup } = setUp(95, null);
    try {
      await writeMailStats(95, bbsRoot, { lowestKey: 1, lowestNotDel: 0, highMsgNum: 1 });
      const onDisk = fs.readFileSync(getMailStatsPath(95, bbsRoot));
      expect(onDisk.length).toBe(18);
    } finally {
      cleanup();
    }
  });
});

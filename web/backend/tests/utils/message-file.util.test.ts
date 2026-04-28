/**
 * Unit tests for message-file.util.ts
 * Tests AmiExpress message storage (1:1 port from express.e)
 *
 * Messages stored as .msg files in Conf{N}/Messages/{messageId}.msg
 * MailStats binary file tracks message IDs in Conf{N}/Messages/MailStats
 * Format: 3 x 4-byte big-endian LONGs + 6-byte pad = 18 bytes (lowestKey, highMsgNum, lowestNotDel, pad[6])
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getMessagesDir,
  getMailStatsPath,
  readMailStats,
  writeMailStats,
  getNextMessageId,
  formatMessageDate,
  writeMessageFile,
  readMessageFile,
  messageFileExists,
  deleteMessageFile,
  getAllMessageIds,
  type MailStats,
  type MessageFile,
} from '../../src/utils/message-file.util';

describe('Message File Utility (AmiExpress Message Storage)', () => {
  let testBbsPath: string;
  let confPath: string;

  beforeEach(async () => {
    testBbsPath = await fs.mkdtemp(path.join(os.tmpdir(), 'msg-test-'));
    confPath = path.join(testBbsPath, 'Conf1');
    await fs.mkdir(confPath, { recursive: true });
  });

  afterEach(async () => {
    if (fsSync.existsSync(testBbsPath)) {
      await fs.rm(testBbsPath, { recursive: true, force: true });
    }
  });

  describe('Path utilities', () => {
    it('should generate correct Messages directory path', () => {
      const result = getMessagesDir(1, testBbsPath);
      expect(result).toBe(path.join(testBbsPath, 'Conf1', 'Messages'));
    });

    it('should generate correct MailStats path', () => {
      const result = getMailStatsPath(1, testBbsPath);
      expect(result).toBe(path.join(testBbsPath, 'Conf1', 'Messages', 'MailStats'));
    });

    it('should handle different conference numbers', () => {
      expect(getMessagesDir(5, testBbsPath)).toContain('Conf5');
      expect(getMessagesDir(10, testBbsPath)).toContain('Conf10');
      expect(getMailStatsPath(5, testBbsPath)).toContain('Conf5/Messages/MailStats');
    });
  });

  describe('MailStats (binary format)', () => {
    describe('writeMailStats', () => {
      it('should write MailStats in correct binary format', async () => {
        const stats: MailStats = {
          lowestKey: 1,
          lowestNotDel: 5,
          highMsgNum: 100
        };

        await writeMailStats(1, testBbsPath, stats);

        const statsPath = getMailStatsPath(1, testBbsPath);
        const buffer = await fs.readFile(statsPath);

        // axobjects.e mailStat: lowestKey(0) highMsgNum(4) lowestNotDel(8) pad[6](12) = 18 bytes
        expect(buffer.length).toBe(18);
        expect(buffer.readInt32BE(0)).toBe(1);    // lowestKey
        expect(buffer.readInt32BE(4)).toBe(100);  // highMsgNum
        expect(buffer.readInt32BE(8)).toBe(5);    // lowestNotDel
      });

      it('should create Messages directory if missing', async () => {
        const stats: MailStats = { lowestKey: 1, lowestNotDel: 0, highMsgNum: 1 };

        await writeMailStats(1, testBbsPath, stats);

        const messagesDir = getMessagesDir(1, testBbsPath);
        expect(fsSync.existsSync(messagesDir)).toBe(true);
      });

      it('should handle zero values', async () => {
        const stats: MailStats = { lowestKey: 0, lowestNotDel: 0, highMsgNum: 0 };

        await writeMailStats(1, testBbsPath, stats);

        const buffer = await fs.readFile(getMailStatsPath(1, testBbsPath));
        expect(buffer.readInt32BE(0)).toBe(0);  // lowestKey
        expect(buffer.readInt32BE(4)).toBe(0);  // highMsgNum
        expect(buffer.readInt32BE(8)).toBe(0);  // lowestNotDel
      });

      it('should handle large values', async () => {
        const stats: MailStats = {
          lowestKey: 1000000,
          lowestNotDel: 999999,
          highMsgNum: 1000001
        };

        await writeMailStats(1, testBbsPath, stats);

        const buffer = await fs.readFile(getMailStatsPath(1, testBbsPath));
        expect(buffer.readInt32BE(0)).toBe(1000000);  // lowestKey
        expect(buffer.readInt32BE(4)).toBe(1000001);  // highMsgNum
        expect(buffer.readInt32BE(8)).toBe(999999);   // lowestNotDel
      });

      it('should overwrite existing MailStats', async () => {
        const stats1: MailStats = { lowestKey: 1, lowestNotDel: 1, highMsgNum: 10 };
        const stats2: MailStats = { lowestKey: 1, lowestNotDel: 5, highMsgNum: 20 };

        await writeMailStats(1, testBbsPath, stats1);
        await writeMailStats(1, testBbsPath, stats2);

        const buffer = await fs.readFile(getMailStatsPath(1, testBbsPath));
        expect(buffer.readInt32BE(4)).toBe(20);  // highMsgNum at offset 4
      });
    });

    describe('readMailStats', () => {
      it('should read MailStats from binary file', async () => {
        const expected: MailStats = { lowestKey: 1, lowestNotDel: 5, highMsgNum: 100 };
        await writeMailStats(1, testBbsPath, expected);

        const result = await readMailStats(1, testBbsPath);

        expect(result).toEqual(expected);
      });

      it('should create default MailStats if file missing', async () => {
        const result = await readMailStats(1, testBbsPath);

        expect(result).toEqual({
          lowestKey: 1,
          lowestNotDel: 0,
          highMsgNum: 1
        });

        // Should have written default to disk
        expect(fsSync.existsSync(getMailStatsPath(1, testBbsPath))).toBe(true);
      });

      it('should return defaults for undersized file (< 12 bytes)', async () => {
        const messagesDir = getMessagesDir(1, testBbsPath);
        await fs.mkdir(messagesDir, { recursive: true });

        // Write only 8 bytes (should be 18); production code rebuilds with defaults
        const buffer = Buffer.alloc(8);
        await fs.writeFile(getMailStatsPath(1, testBbsPath), buffer);

        const result = await readMailStats(1, testBbsPath);
        expect(result.lowestKey).toBe(1);
        expect(result.lowestNotDel).toBe(0);
        expect(result.highMsgNum).toBe(1);
      });

      it('should handle corrupted file', async () => {
        const messagesDir = getMessagesDir(1, testBbsPath);
        await fs.mkdir(messagesDir, { recursive: true });

        // Write garbage data (valid size but wrong format)
        const buffer = Buffer.alloc(12, 0xFF);
        await fs.writeFile(getMailStatsPath(1, testBbsPath), buffer);

        const result = await readMailStats(1, testBbsPath);

        // Should read the binary values even if they're "wrong"
        expect(result.lowestKey).toBe(-1);
        expect(result.lowestNotDel).toBe(-1);
        expect(result.highMsgNum).toBe(-1);
      });
    });

    describe('read/write round-trip', () => {
      it('should round-trip MailStats correctly', async () => {
        const original: MailStats = { lowestKey: 42, lowestNotDel: 40, highMsgNum: 50 };

        await writeMailStats(1, testBbsPath, original);
        const result = await readMailStats(1, testBbsPath);

        expect(result).toEqual(original);
      });
    });
  });

  describe('getNextMessageId', () => {
    it('should return current highMsgNum and increment', async () => {
      const stats: MailStats = { lowestKey: 1, lowestNotDel: 1, highMsgNum: 10 };
      await writeMailStats(1, testBbsPath, stats);

      const nextId = await getNextMessageId(1, testBbsPath);
      expect(nextId).toBe(10);

      const updated = await readMailStats(1, testBbsPath);
      expect(updated.highMsgNum).toBe(11);
    });

    it('should increment multiple times', async () => {
      await writeMailStats(1, testBbsPath, { lowestKey: 1, lowestNotDel: 0, highMsgNum: 1 });

      const id1 = await getNextMessageId(1, testBbsPath);
      const id2 = await getNextMessageId(1, testBbsPath);
      const id3 = await getNextMessageId(1, testBbsPath);

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);

      const stats = await readMailStats(1, testBbsPath);
      expect(stats.highMsgNum).toBe(4);
    });

    it('should create default MailStats if missing', async () => {
      const nextId = await getNextMessageId(1, testBbsPath);

      expect(nextId).toBe(1); // Default highMsgNum is 1

      const stats = await readMailStats(1, testBbsPath);
      expect(stats.highMsgNum).toBe(2); // Incremented to 2
    });
  });

  describe('formatMessageDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2025-12-05T14:32:10');
      const result = formatMessageDate(date);
      expect(result).toBe('05-Dec-25 14:32:10');
    });

    it('should handle different months', () => {
      expect(formatMessageDate(new Date('2025-01-15T00:00:00'))).toContain('Jan-25');
      expect(formatMessageDate(new Date('2025-02-15T00:00:00'))).toContain('Feb-25');
      expect(formatMessageDate(new Date('2025-06-15T00:00:00'))).toContain('Jun-25');
      expect(formatMessageDate(new Date('2025-12-15T00:00:00'))).toContain('Dec-25');
    });

    it('should pad single-digit days', () => {
      const date = new Date('2025-05-03T10:00:00');
      expect(formatMessageDate(date)).toMatch(/^03-/);
    });

    it('should pad hours, minutes, seconds', () => {
      const date = new Date('2025-05-15T03:05:08');
      const result = formatMessageDate(date);
      expect(result).toContain('03:05:08');
    });

    it('should handle year 2000 correctly', () => {
      const date = new Date('2000-05-15T12:00:00');
      expect(formatMessageDate(date)).toContain('-00 ');
    });

    it('should handle year 2099', () => {
      const date = new Date('2099-05-15T12:00:00');
      expect(formatMessageDate(date)).toContain('-99 ');
    });
  });

  describe('writeMessageFile', () => {
    it('should write message file with correct format', async () => {
      const message = {
        from: 'Alice',
        to: 'Bob',
        subject: 'Test Message',
        date: '05-Dec-25 14:32:10',
        body: 'This is the message body.\nWith multiple lines.'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      expect(msgNum).toBe(1); // First message

      const filePath = path.join(getMessagesDir(1, testBbsPath), '1.msg');
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      expect(lines[0]).toBe('Alice');
      expect(lines[1]).toBe('Bob');
      expect(lines[2]).toBe('Test Message');
      expect(lines[3]).toBe('05-Dec-25 14:32:10');
      expect(lines[4]).toBe('1');
      expect(lines.slice(5).join('\n')).toBe('This is the message body.\nWith multiple lines.');
    });

    it('should auto-increment message numbers', async () => {
      const message = {
        from: 'User',
        to: 'ALL',
        subject: 'Test',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      const msg1 = await writeMessageFile(1, 0, message, testBbsPath);
      const msg2 = await writeMessageFile(1, 0, message, testBbsPath);
      const msg3 = await writeMessageFile(1, 0, message, testBbsPath);

      expect(msg1).toBe(1);
      expect(msg2).toBe(2);
      expect(msg3).toBe(3);
    });

    it('should handle message to ALL (public)', async () => {
      const message = {
        from: 'SysOp',
        to: 'ALL',
        subject: 'System Notice',
        date: formatMessageDate(new Date()),
        body: 'Welcome to the BBS!'
      };

      await writeMessageFile(1, 0, message, testBbsPath);

      const filePath = path.join(getMessagesDir(1, testBbsPath), '1.msg');
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('ALL');
    });

    it('should handle empty body', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Empty',
        date: formatMessageDate(new Date()),
        body: ''
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      const filePath = path.join(getMessagesDir(1, testBbsPath), `${msgNum}.msg`);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(lines.slice(5).join('\n')).toBe('');
    });

    it('should handle long message body', async () => {
      const longBody = 'Line\n'.repeat(100);
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Long',
        date: formatMessageDate(new Date()),
        body: longBody
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      const filePath = path.join(getMessagesDir(1, testBbsPath), `${msgNum}.msg`);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain(longBody);
    });
  });

  describe('readMessageFile', () => {
    it('should read message file correctly', async () => {
      const original = {
        from: 'Alice',
        to: 'Bob',
        subject: 'Test',
        date: '05-Dec-25 14:32:10',
        body: 'Body text'
      };

      await writeMessageFile(1, 0, original, testBbsPath);
      const result = await readMessageFile(1, 1, testBbsPath);

      expect(result).not.toBeNull();
      expect(result!.from).toBe('Alice');
      expect(result!.to).toBe('Bob');
      expect(result!.subject).toBe('Test');
      expect(result!.date).toBe('05-Dec-25 14:32:10');
      expect(result!.msgNum).toBe(1);
      expect(result!.body).toBe('Body text');
      expect(result!.isPrivate).toBe(true); // to != 'ALL'
    });

    it('should detect public messages (to: ALL)', async () => {
      const message = {
        from: 'SysOp',
        to: 'ALL',
        subject: 'Public',
        date: formatMessageDate(new Date()),
        body: 'Public message'
      };

      await writeMessageFile(1, 0, message, testBbsPath);
      const result = await readMessageFile(1, 1, testBbsPath);

      expect(result!.isPrivate).toBe(false);
    });

    it('should return null for non-existent message', async () => {
      const result = await readMessageFile(1, 999, testBbsPath);
      expect(result).toBeNull();
    });

    it('should handle message with multiline body', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Multiline',
        date: formatMessageDate(new Date()),
        body: 'Line 1\nLine 2\nLine 3'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);
      const result = await readMessageFile(1, msgNum, testBbsPath);

      expect(result!.body).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should return null for invalid format (too few lines)', async () => {
      const messagesDir = getMessagesDir(1, testBbsPath);
      await fs.mkdir(messagesDir, { recursive: true });

      // Write malformed message (only 3 lines)
      await fs.writeFile(path.join(messagesDir, '1.msg'), 'Line1\nLine2\nLine3');

      const result = await readMessageFile(1, 1, testBbsPath);
      expect(result).toBeNull();
    });
  });

  describe('write/read round-trip', () => {
    it('should round-trip message correctly', async () => {
      const original = {
        from: 'TestUser',
        to: 'Recipient',
        subject: 'Round Trip Test',
        date: '01-Jan-26 00:00:00',
        body: 'This is a test message.\nWith multiple lines.\nAnd special chars: !@#$%'
      };

      const msgNum = await writeMessageFile(1, 0, original, testBbsPath);
      const result = await readMessageFile(1, msgNum, testBbsPath);

      expect(result).not.toBeNull();
      expect(result!.from).toBe(original.from);
      expect(result!.to).toBe(original.to);
      expect(result!.subject).toBe(original.subject);
      expect(result!.date).toBe(original.date);
      expect(result!.body).toBe(original.body);
    });
  });

  describe('messageFileExists', () => {
    it('should return true for existing message', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Exists',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(true);
    });

    it('should return false for non-existent message', () => {
      expect(messageFileExists(1, 999, testBbsPath)).toBe(false);
    });

    it('should return false for non-existent conference', () => {
      expect(messageFileExists(99, 1, testBbsPath)).toBe(false);
    });
  });

  describe('deleteMessageFile', () => {
    it('should rename message to .deleted', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Delete Me',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      await deleteMessageFile(1, msgNum, testBbsPath);

      const messagesDir = getMessagesDir(1, testBbsPath);
      expect(fsSync.existsSync(path.join(messagesDir, `${msgNum}.msg`))).toBe(false);
      expect(fsSync.existsSync(path.join(messagesDir, `${msgNum}.msg.deleted`))).toBe(true);
    });

    it('should not throw on deleting non-existent message', async () => {
      await expect(deleteMessageFile(1, 999, testBbsPath)).resolves.not.toThrow();
    });

    it('should remove message from active messages', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Test',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      await deleteMessageFile(1, msgNum, testBbsPath);

      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(false);
    });
  });

  describe('getAllMessageIds', () => {
    it('should return all message IDs sorted', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Test',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      await writeMessageFile(1, 0, message, testBbsPath);
      await writeMessageFile(1, 0, message, testBbsPath);
      await writeMessageFile(1, 0, message, testBbsPath);

      const ids = await getAllMessageIds(1, testBbsPath);

      expect(ids).toEqual([1, 2, 3]);
    });

    it('should return empty array for no messages', async () => {
      const ids = await getAllMessageIds(1, testBbsPath);
      expect(ids).toEqual([]);
    });

    it('should ignore .deleted files', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Test',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      await writeMessageFile(1, 0, message, testBbsPath);
      await writeMessageFile(1, 0, message, testBbsPath);

      await deleteMessageFile(1, 1, testBbsPath);

      const ids = await getAllMessageIds(1, testBbsPath);
      expect(ids).toEqual([2]); // Only non-deleted message
    });

    it('should ignore MailStats file', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Test',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      await writeMessageFile(1, 0, message, testBbsPath);

      const ids = await getAllMessageIds(1, testBbsPath);
      expect(ids).toEqual([1]); // MailStats not included
    });

    it('should handle gaps in message numbers', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Test',
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      await writeMessageFile(1, 0, message, testBbsPath);
      await writeMessageFile(1, 0, message, testBbsPath);
      await writeMessageFile(1, 0, message, testBbsPath);

      await deleteMessageFile(1, 2, testBbsPath);

      const ids = await getAllMessageIds(1, testBbsPath);
      expect(ids).toEqual([1, 3]); // Gap at 2
    });

    it('should return empty array for non-existent conference', async () => {
      const ids = await getAllMessageIds(99, testBbsPath);
      expect(ids).toEqual([]);
    });
  });

  describe('Real-world BBS message scenarios', () => {
    it('should handle typical message posting workflow', async () => {
      // User posts message
      const message = {
        from: 'retrouser',
        to: 'sysop',
        subject: 'Question about downloads',
        date: formatMessageDate(new Date()),
        body: 'Hi SysOp,\n\nWhere can I find the latest Amiga demos?\n\nThanks!'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      // Verify written
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(true);

      // SysOp reads message
      const read = await readMessageFile(1, msgNum, testBbsPath);
      expect(read!.from).toBe('retrouser');
      expect(read!.isPrivate).toBe(true);
    });

    it('should handle public announcement', async () => {
      const announcement = {
        from: 'SysOp',
        to: 'ALL',
        subject: 'System Maintenance Tonight',
        date: formatMessageDate(new Date()),
        body: 'The BBS will be down for maintenance tonight at 11 PM.\nExpected downtime: 2 hours.'
      };

      const msgNum = await writeMessageFile(1, 0, announcement, testBbsPath);
      const read = await readMessageFile(1, msgNum, testBbsPath);

      expect(read!.isPrivate).toBe(false);
      expect(read!.to).toBe('ALL');
    });

    it('should handle message deletion workflow', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Old Message',
        date: '01-Jan-90 00:00:00',
        body: 'This is old'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);

      // Message exists
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(true);

      // Delete message
      await deleteMessageFile(1, msgNum, testBbsPath);

      // No longer exists
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(false);

      // Not in active messages
      const allIds = await getAllMessageIds(1, testBbsPath);
      expect(allIds).not.toContain(msgNum);
    });

    it('should handle conference message scanning', async () => {
      // Post several messages
      for (let i = 0; i < 5; i++) {
        await writeMessageFile(1, 0, {
          from: `User${i}`,
          to: 'ALL',
          subject: `Message ${i}`,
          date: formatMessageDate(new Date()),
          body: `Body ${i}`
        }, testBbsPath);
      }

      // Scan conference
      const allIds = await getAllMessageIds(1, testBbsPath);
      expect(allIds).toHaveLength(5);
      expect(allIds).toEqual([1, 2, 3, 4, 5]);

      // Check MailStats
      const stats = await readMailStats(1, testBbsPath);
      expect(stats.highMsgNum).toBe(6); // Next message would be 6
    });
  });

  describe('Edge cases', () => {
    it('should handle very long subject', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'A'.repeat(200),
        date: formatMessageDate(new Date()),
        body: 'Body'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);
      const read = await readMessageFile(1, msgNum, testBbsPath);

      expect(read!.subject).toBe('A'.repeat(200));
    });

    it('should handle special characters in message', async () => {
      const message = {
        from: 'User™',
        to: 'Test©',
        subject: 'Special: !@#$%^&*()',
        date: formatMessageDate(new Date()),
        body: 'Body with ñ, é, ü, and emoji 🎉'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);
      const read = await readMessageFile(1, msgNum, testBbsPath);

      expect(read!.from).toBe('User™');
      expect(read!.to).toBe('Test©');
      expect(read!.body).toContain('emoji 🎉');
    });

    it('should handle message with only newlines in body', async () => {
      const message = {
        from: 'User',
        to: 'Test',
        subject: 'Newlines',
        date: formatMessageDate(new Date()),
        body: '\n\n\n'
      };

      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);
      const read = await readMessageFile(1, msgNum, testBbsPath);

      expect(read!.body).toBe('\n\n\n');
    });

    it('should handle message number overflow (large values)', async () => {
      const stats: MailStats = {
        lowestKey: 1,
        lowestNotDel: 1,
        highMsgNum: 999999
      };

      await writeMailStats(1, testBbsPath, stats);

      const nextId = await getNextMessageId(1, testBbsPath);
      expect(nextId).toBe(999999);

      const updated = await readMailStats(1, testBbsPath);
      expect(updated.highMsgNum).toBe(1000000);
    });
  });
});

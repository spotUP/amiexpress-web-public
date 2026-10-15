/**
 * Unit tests for `utils/message-file.util.ts` — express.e canonical layout.
 *
 * Layout:
 *   Body file: `<conf>/MsgBase/<msgNum>` (no extension, raw lines)
 *   HeaderFile: `<conf>/MsgBase/HeaderFile` (110-byte msgHeader records)
 *   MailStats:  `<conf>/MsgBase/MailStats` (18-byte BE struct)
 *
 * Semantics:
 *   `mailStat.highMsgNum` = NEXT id to assign (express.e:10688)
 *   `getNextMessageId` returns current high; append bumps high+1 (express.e:12418)
 *   On 1→2 transition `lowestNotDel := 1` (express.e:12419)
 *   Header field truncation: 31 chars (axobjects.e mailHeader)
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
} from '../../src/utils/message-file.util';
import { messageIndexManager } from '../../src/services/MessageIndexManager';

describe('Message File Utility (express.e canonical layout)', () => {
  let testBbsPath: string;

  beforeEach(async () => {
    testBbsPath = await fs.mkdtemp(path.join(os.tmpdir(), 'msg-test-'));
    await fs.mkdir(path.join(testBbsPath, 'Conf1'), { recursive: true });
    // Route the singleton at our temp dir for this test
    messageIndexManager.setBbsRoot(testBbsPath);
  });

  afterEach(async () => {
    if (fsSync.existsSync(testBbsPath)) {
      await fs.rm(testBbsPath, { recursive: true, force: true });
    }
  });

  describe('Path utilities', () => {
    it('resolves to <conf>/MsgBase/ (express.e msgBaseLocation)', () => {
      expect(getMessagesDir(1, testBbsPath)).toBe(
        path.join(testBbsPath, 'Conf1', 'MsgBase')
      );
    });

    it('places MailStats inside MsgBase/', () => {
      expect(getMailStatsPath(1, testBbsPath)).toBe(
        path.join(testBbsPath, 'Conf1', 'MsgBase', 'MailStats')
      );
    });

    it('handles different conference numbers', () => {
      expect(getMessagesDir(5, testBbsPath)).toContain('Conf5');
      expect(getMessagesDir(10, testBbsPath)).toContain('Conf10');
      expect(getMailStatsPath(5, testBbsPath)).toMatch(
        /Conf5[/\\]MsgBase[/\\]MailStats$/
      );
    });
  });

  describe('MailStats binary format', () => {
    it('writes 18-byte BE struct (lowestKey, highMsgNum, lowestNotDel, pad[6])', async () => {
      // Init MsgBase directory + initial MailStats so writeMailStats has somewhere to write
      messageIndexManager.initializeMessageIndex(1);

      const stats: MailStats = { lowestKey: 1, lowestNotDel: 5, highMsgNum: 100 };
      await writeMailStats(1, testBbsPath, stats);

      const buffer = await fs.readFile(getMailStatsPath(1, testBbsPath));
      expect(buffer.length).toBe(18);
      expect(buffer.readInt32BE(0)).toBe(1);    // lowestKey
      expect(buffer.readInt32BE(4)).toBe(100);  // highMsgNum
      expect(buffer.readInt32BE(8)).toBe(5);    // lowestNotDel
    });

    it('round-trips MailStats correctly', async () => {
      messageIndexManager.initializeMessageIndex(1);

      const original: MailStats = { lowestKey: 42, lowestNotDel: 40, highMsgNum: 50 };
      await writeMailStats(1, testBbsPath, original);

      const result = await readMailStats(1, testBbsPath);
      expect(result).toEqual(original);
    });

    it('readMailStats returns express.e fresh-init defaults when missing', async () => {
      // No MsgBase dir, no MailStats file
      const result = await readMailStats(1, testBbsPath);
      // express.e:8691-8693 defaults
      expect(result).toEqual({ lowestKey: 1, lowestNotDel: 0, highMsgNum: 1 });
    });
  });

  describe('getNextMessageId — express.e:10688', () => {
    it('returns the current highMsgNum (NOT high+1)', async () => {
      messageIndexManager.initializeMessageIndex(1);
      const stats: MailStats = { lowestKey: 1, lowestNotDel: 1, highMsgNum: 10 };
      await writeMailStats(1, testBbsPath, stats);

      const nextId = await getNextMessageId(1, testBbsPath);
      // current high IS the next id — high is bumped only when the header is appended
      expect(nextId).toBe(10);

      // Reading without writing should not have bumped high
      const after = await readMailStats(1, testBbsPath);
      expect(after.highMsgNum).toBe(10);
    });

    it('on a fresh msgbase returns 1', async () => {
      const nextId = await getNextMessageId(1, testBbsPath);
      expect(nextId).toBe(1);
    });
  });

  describe('formatMessageDate', () => {
    it('formats DD-MMM-YY HH:MM:SS', () => {
      expect(formatMessageDate(new Date('2025-12-05T14:32:10')))
        .toBe('05-Dec-25 14:32:10');
    });

    it('handles different months', () => {
      expect(formatMessageDate(new Date('2025-01-15T00:00:00'))).toContain('Jan-25');
      expect(formatMessageDate(new Date('2025-06-15T00:00:00'))).toContain('Jun-25');
      expect(formatMessageDate(new Date('2025-12-15T00:00:00'))).toContain('Dec-25');
    });

    it('pads single-digit days/hours/minutes/seconds', () => {
      const d = new Date('2025-05-03T03:05:08');
      expect(formatMessageDate(d)).toBe('03-May-25 03:05:08');
    });

    it('handles year-2000 wrap', () => {
      expect(formatMessageDate(new Date('2000-05-15T12:00:00'))).toContain('-00 ');
      expect(formatMessageDate(new Date('2099-05-15T12:00:00'))).toContain('-99 ');
    });
  });

  describe('writeMessageFile — body file + HeaderFile entry', () => {
    it('writes body to <conf>/MsgBase/<msgNum> (no .msg extension)', async () => {
      const message = {
        from: 'Alice',
        to: 'Bob',
        subject: 'Test',
        date: '05-Dec-25 14:32:10',
        body: 'This is the body.\nLine 2.',
      };
      const msgNum = await writeMessageFile(1, 0, message, testBbsPath);
      expect(msgNum).toBe(1);

      const filePath = path.join(getMessagesDir(1, testBbsPath), '1');
      expect(fsSync.existsSync(filePath)).toBe(true);
      // No .msg file (express.e doesn't add an extension)
      expect(fsSync.existsSync(filePath + '.msg')).toBe(false);

      const content = await fs.readFile(filePath, 'utf-8');
      // Body is stored raw — no metadata prefix
      expect(content).toBe('This is the body.\nLine 2.\n');
      expect(content).not.toContain('Alice');
      expect(content).not.toContain('Bob');
    });

    it('appends a HeaderFile entry with metadata', async () => {
      await writeMessageFile(1, 0, {
        from: 'Alice', to: 'Bob', subject: 'Hello',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      }, testBbsPath);

      const headers = messageIndexManager.readHeaderFile(1);
      expect(headers).toHaveLength(1);
      expect(headers[0].fromName).toBe('Alice');
      expect(headers[0].toName).toBe('Bob');
      expect(headers[0].subject).toBe('Hello');
      expect(headers[0].msgNumb).toBe(1);
      expect(headers[0].recv).toBe(0);
    });

    it('bumps highMsgNum unconditionally and sets lowestNotDel:=1 on first save', async () => {
      // Fresh msgbase: high=1, lowestNotDel=0
      const before = await readMailStats(1, testBbsPath);
      expect(before.highMsgNum).toBe(1);
      expect(before.lowestNotDel).toBe(0);

      const msgNum = await writeMessageFile(1, 0, {
        from: 'A', to: 'B', subject: 's',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      }, testBbsPath);
      expect(msgNum).toBe(1);

      // express.e:12418 high+=1 → 2; express.e:12419 high===2 → lowestNotDel:=1
      const after = await readMailStats(1, testBbsPath);
      expect(after.highMsgNum).toBe(2);
      expect(after.lowestNotDel).toBe(1);
    });

    it('auto-increments message numbers across multiple saves', async () => {
      const m = {
        from: 'U', to: 'ALL', subject: 's',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      };
      expect(await writeMessageFile(1, 0, m, testBbsPath)).toBe(1);
      expect(await writeMessageFile(1, 0, m, testBbsPath)).toBe(2);
      expect(await writeMessageFile(1, 0, m, testBbsPath)).toBe(3);

      const stats = await readMailStats(1, testBbsPath);
      // After N msgs starting from fresh init: high = N + 1
      expect(stats.highMsgNum).toBe(4);
    });

    it('handles empty body', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'Empty',
        date: '05-Dec-25 14:32:10',
        body: '',
      }, testBbsPath);

      const filePath = path.join(getMessagesDir(1, testBbsPath), String(msgNum));
      const content = await fs.readFile(filePath, 'utf-8');
      // Empty body still gets terminating newline
      expect(content).toBe('\n');
    });

    it('handles long bodies verbatim', async () => {
      const longBody = 'Line\n'.repeat(100);
      const msgNum = await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'Long',
        date: '05-Dec-25 14:32:10',
        body: longBody,
      }, testBbsPath);

      const filePath = path.join(getMessagesDir(1, testBbsPath), String(msgNum));
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content.startsWith(longBody)).toBe(true);
    });
  });

  describe('readMessageFile — composes body + HeaderFile', () => {
    it('reads body and metadata correctly', async () => {
      await writeMessageFile(1, 0, {
        from: 'Alice', to: 'Bob', subject: 'Test',
        date: '05-Dec-25 14:32:10',
        body: 'Body text',
      }, testBbsPath);

      const result = await readMessageFile(1, 1, testBbsPath);
      expect(result).not.toBeNull();
      expect(result!.from).toBe('Alice');
      expect(result!.to).toBe('Bob');
      expect(result!.subject).toBe('Test');
      expect(result!.msgNum).toBe(1);
      expect(result!.body).toBe('Body text');
      expect(result!.isPrivate).toBe(true);  // to != ALL
    });

    it('detects public messages (to: ALL)', async () => {
      await writeMessageFile(1, 0, {
        from: 'SysOp', to: 'ALL', subject: 'Pub',
        date: '05-Dec-25 14:32:10',
        body: 'Public',
      }, testBbsPath);

      const result = await readMessageFile(1, 1, testBbsPath);
      expect(result!.isPrivate).toBe(false);
    });

    it('returns null for non-existent message', async () => {
      const result = await readMessageFile(1, 999, testBbsPath);
      expect(result).toBeNull();
    });

    it('preserves multiline body verbatim', async () => {
      await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'M',
        date: '05-Dec-25 14:32:10',
        body: 'Line 1\nLine 2\nLine 3',
      }, testBbsPath);

      const result = await readMessageFile(1, 1, testBbsPath);
      expect(result!.body).toBe('Line 1\nLine 2\nLine 3');
    });

    it('returns null when body file is missing even if HeaderFile has it', async () => {
      await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 's',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      }, testBbsPath);
      // delete the body file directly
      const filePath = path.join(getMessagesDir(1, testBbsPath), '1');
      await fs.unlink(filePath);

      const result = await readMessageFile(1, 1, testBbsPath);
      expect(result).toBeNull();
    });
  });

  describe('messageFileExists', () => {
    it('returns true for existing message', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'E',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      }, testBbsPath);
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(true);
    });

    it('returns false for non-existent message', () => {
      expect(messageFileExists(1, 999, testBbsPath)).toBe(false);
    });

    it('returns false for non-existent conference', () => {
      expect(messageFileExists(99, 1, testBbsPath)).toBe(false);
    });
  });

  describe('deleteMessageFile', () => {
    it('removes the body file and marks header DELETED', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'D',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      }, testBbsPath);

      await deleteMessageFile(1, msgNum, testBbsPath);

      // Body gone
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(false);

      // Header still exists but status is 'D' (express.e DELETED = 0x44)
      const headers = messageIndexManager.readHeaderFile(1);
      expect(headers[0].status).toBe(0x44);
    });

    it('does not throw when deleting non-existent message', async () => {
      await expect(deleteMessageFile(1, 999, testBbsPath)).resolves.not.toThrow();
    });
  });

  describe('getAllMessageIds — filters DELETED status', () => {
    it('returns all live message ids sorted', async () => {
      const m = {
        from: 'U', to: 'T', subject: 's',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      };
      await writeMessageFile(1, 0, m, testBbsPath);
      await writeMessageFile(1, 0, m, testBbsPath);
      await writeMessageFile(1, 0, m, testBbsPath);

      expect(await getAllMessageIds(1, testBbsPath)).toEqual([1, 2, 3]);
    });

    it('returns empty for fresh msgbase', async () => {
      expect(await getAllMessageIds(1, testBbsPath)).toEqual([]);
    });

    it('skips deleted messages', async () => {
      const m = {
        from: 'U', to: 'T', subject: 's',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      };
      await writeMessageFile(1, 0, m, testBbsPath);
      await writeMessageFile(1, 0, m, testBbsPath);

      await deleteMessageFile(1, 1, testBbsPath);

      expect(await getAllMessageIds(1, testBbsPath)).toEqual([2]);
    });

    it('returns empty for non-existent conference', async () => {
      expect(await getAllMessageIds(99, testBbsPath)).toEqual([]);
    });
  });

  describe('Real-world scenarios', () => {
    it('typical post + read workflow', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'retrouser', to: 'sysop', subject: 'Question',
        date: '05-Dec-25 14:32:10',
        body: 'Hi SysOp,\n\nWhere can I find demos?\n\nThanks!',
      }, testBbsPath);

      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(true);

      const read = await readMessageFile(1, msgNum, testBbsPath);
      expect(read!.from).toBe('retrouser');
      expect(read!.isPrivate).toBe(true);
    });

    it('public announcement to ALL', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'SysOp', to: 'ALL', subject: 'Maintenance',
        date: '05-Dec-25 14:32:10',
        body: 'Down at 11pm.',
      }, testBbsPath);

      const read = await readMessageFile(1, msgNum, testBbsPath);
      expect(read!.isPrivate).toBe(false);
      expect(read!.to).toBe('ALL');
    });

    it('post → delete → not in active list', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'Old',
        date: '01-Jan-90 00:00:00',
        body: 'Old',
      }, testBbsPath);

      await deleteMessageFile(1, msgNum, testBbsPath);
      expect(messageFileExists(1, msgNum, testBbsPath)).toBe(false);
      expect(await getAllMessageIds(1, testBbsPath)).not.toContain(msgNum);
    });

    it('5 msgs + scan + MailStats high reflects next-to-assign', async () => {
      const m = {
        from: 'U', to: 'ALL', subject: 's',
        date: '05-Dec-25 14:32:10',
        body: 'b',
      };
      for (let i = 0; i < 5; i++) {
        await writeMessageFile(1, 0, { ...m, subject: `s${i}` }, testBbsPath);
      }

      expect(await getAllMessageIds(1, testBbsPath)).toEqual([1, 2, 3, 4, 5]);

      const stats = await readMailStats(1, testBbsPath);
      // 5 msgs posted starting from high=1 → high becomes 6 (next-to-assign)
      expect(stats.highMsgNum).toBe(6);
    });
  });

  describe('Edge cases', () => {
    it('truncates 31-char metadata fields (axobjects.e mailHeader)', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'User', to: 'Test',
        subject: 'A'.repeat(200),
        date: '05-Dec-25 14:32:10',
        body: 'b',
      }, testBbsPath);

      const read = await readMessageFile(1, msgNum, testBbsPath);
      // mailHeader.subject is CHAR[31] — anything past byte 30 truncates
      expect(read!.subject.length).toBe(31);
      expect(read!.subject).toBe('A'.repeat(31));
    });

    it('preserves UTF-8 in body, ASCII-truncates in metadata', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'User', to: 'Test', subject: 'Special',
        date: '05-Dec-25 14:32:10',
        body: 'Body with ñ é ü 🎉',
      }, testBbsPath);

      const read = await readMessageFile(1, msgNum, testBbsPath);
      // Body file is binary-safe — UTF-8 preserved
      expect(read!.body).toContain('🎉');
      // Metadata uses ASCII (mailHeader is ASCII bytes); non-ASCII chars get
      // dropped by Buffer.from(... 'ascii') in serializer, which is consistent
      // with express.e's StrCopy behavior.
      expect(read!.from).toBe('User');
    });

    it('preserves body of only newlines', async () => {
      const msgNum = await writeMessageFile(1, 0, {
        from: 'U', to: 'T', subject: 'NL',
        date: '05-Dec-25 14:32:10',
        body: '\n\n\n',
      }, testBbsPath);

      const read = await readMessageFile(1, msgNum, testBbsPath);
      expect(read!.body).toBe('\n\n\n');
    });
  });
});

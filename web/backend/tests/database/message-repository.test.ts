/**
 * Message Repository Tests
 */

jest.mock('../../src/services/MessageFileManager', () => ({
  messageFileManager: { writeMessageFile: jest.fn(), deleteMessageFile: jest.fn() }
}));
jest.mock('../../src/services/MessageIndexManager', () => ({
  messageIndexManager: {
    getNextMessageNumber: jest.fn().mockReturnValue(1),
    appendMessageHeader: jest.fn(),
    deleteMessageHeader: jest.fn(),
  },
  MsgStatus: { NORMAL: 0, PRIVATE: 1 },
}));

import { MessageRepository } from '../../src/database/message-repository';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

// Use seeded conference/msgbase IDs (1-4 are seeded)
const CONF_ID = 1;
const MB_ID = 1;

function makeMessage(overrides: any = {}) {
  return {
    conferenceId: CONF_ID,
    messageBaseId: MB_ID,
    subject: 'Test Subject',
    body: 'Test body text',
    author: 'tester',
    toUser: 'All',
    isPrivate: false,
    timestamp: new Date(),
    ...overrides,
  };
}

describe('MessageRepository', () => {
  let repo: MessageRepository;
  let rawDb: any;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new MessageRepository(rawDb);

    // Insert user required by sendOnlineMessage FK
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud)
      VALUES ('sender-1', 'sender_user', 'Sender User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run();
  }, 30000);

  beforeEach(() => {
    rawDb.exec(`DELETE FROM messages WHERE author = 'tester'`);
  });

  describe('createMessage', () => {
    it('returns a numeric id', async () => {
      const id = await repo.createMessage(makeMessage());
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getMessages', () => {
    it('returns messages in the conference/base', async () => {
      await repo.createMessage(makeMessage({ subject: 'Hello' }));
      await repo.createMessage(makeMessage({ subject: 'World' }));

      const msgs = await repo.getMessages(CONF_ID, MB_ID);
      expect(Array.isArray(msgs)).toBe(true);
      expect(msgs.length).toBeGreaterThanOrEqual(2);
    });

    it('respects limit option', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.createMessage(makeMessage({ subject: `Msg ${i}` }));
      }
      const msgs = await repo.getMessages(CONF_ID, MB_ID, { limit: 2 });
      expect(msgs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateMessage', () => {
    it('updates subject field', async () => {
      const id = await repo.createMessage(makeMessage({ subject: 'Before' }));
      await repo.updateMessage(id, { subject: 'After' });

      const msgs = await repo.getMessages(CONF_ID, MB_ID);
      const updated = msgs.find(m => m.id === id);
      expect(updated?.subject).toBe('After');
    });
  });

  describe('deleteMessage', () => {
    it('removes the message', async () => {
      const id = await repo.createMessage(makeMessage({ subject: 'ToDelete' }));
      await repo.deleteMessage(id);

      const msgs = await repo.getMessages(CONF_ID, MB_ID);
      expect(msgs.some(m => m.id === id)).toBe(false);
    });
  });

  describe('online messages (OLM)', () => {
    const RECIP_ID = 'olm-recip-fixed';

    beforeAll(() => {
      // Create fixed-id recipient user for OLM FK constraints
      rawDb.prepare(`
        INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
          timetotal, timelimit, timeused, calls, uploads, downloads,
          bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
          callstoday, expert, autorejoin, baud)
        VALUES ('${RECIP_ID}', 'olm_recipient', 'OLM Recip', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
      `).run();
    });

    it('sendOnlineMessage and getUnreadMessages round-trip', async () => {
      const msgId = await repo.sendOnlineMessage(
        'sender-1', 'SenderUser',
        RECIP_ID, 'RecipientUser',
        'Hello OLM!'
      );
      expect(typeof msgId).toBe('number');

      const unread = await repo.getUnreadMessages(RECIP_ID);
      expect(unread.some((m: any) => m.id === msgId)).toBe(true);
    });

    it('markMessageDelivered removes from unread', async () => {
      const msgId = await repo.sendOnlineMessage('sender-1', 'S1', RECIP_ID, 'R1', 'Test');

      await repo.markMessageDelivered(msgId);
      const unread = await repo.getUnreadMessages(RECIP_ID);
      expect(unread.some((m: any) => m.id === msgId)).toBe(false);
    });

    it('getUnreadMessageCount returns correct count', async () => {
      // Clean previous messages first
      rawDb.exec(`DELETE FROM online_messages WHERE to_user_id = '${RECIP_ID}'`);
      await repo.sendOnlineMessage('sender-1', 'S1', RECIP_ID, 'R1', 'Msg 1');
      await repo.sendOnlineMessage('sender-1', 'S1', RECIP_ID, 'R1', 'Msg 2');

      const count = await repo.getUnreadMessageCount(RECIP_ID);
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });
});

import { Database } from '../src/database';
import { ConfigManager } from '../src/config';

describe('End-to-End Tests - Full Sessions', () => {
  let db: Database;
  let config: ConfigManager;

  beforeAll(async () => {
    db = (global as any).testDb;
    config = new ConfigManager();
  });

  afterAll(async () => {
    // Database cleanup handled in setup.ts
  });

  describe('Complete User Session Flow', () => {
    test('should simulate complete BBS session from login to logout', async () => {
      // 1. User login
      const userId = await db.createUser({
        username: 'e2euser',
        passwordHash: 'hashedpass',
        realname: 'E2E Test User',
        location: 'Test City',
        email: 'e2e@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: false,
        ansi: true,
        linesPerScreen: 23,
        computer: 'Test',
        screenType: 'Amiga Ansi',
        protocol: '/X Zmodem',
        editor: 'Prompt',
        zoomType: 'QWK',
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: 'XXX',
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        phone: ''
      });

      // 2. Create session
      const sessionId = 'e2e-session-' + Date.now();
      await db.createSession({
        id: sessionId,
        userId: userId,
        socketId: 'e2e-socket',
        state: 'main_menu',
        subState: undefined,
        currentConf: 1,
        currentMsgBase: 1,
        timeRemaining: 60,
        lastActivity: new Date(),
        confRJoin: 1,
        msgBaseRJoin: 1,
        commandBuffer: '',
        menuPause: true,
        inputBuffer: '',
        relConfNum: 0,
        currentConfName: 'General',
        cmdShortcuts: false,
        tempData: undefined
      });

      // 3. Post a message
      const messageId = await db.createMessage({
        subject: 'E2E Test Message',
        body: 'This is a complete end-to-end test message',
        author: 'e2euser',
        timestamp: new Date(),
        conferenceId: 1,
        messageBaseId: 1,
        isPrivate: false,
        toUser: undefined,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      });

      // 4. Upload a file
      const fileId = await db.createFileEntry({
        filename: 'e2e-test.txt',
        description: 'E2E test file',
        size: 2048,
        uploader: 'e2euser',
        uploadDate: new Date(),
        downloads: 0,
        areaId: 1,
        fileIdDiz: undefined,
        rating: 0,
        votes: 0,
        status: 'active',
        checked: 'N',
        comment: undefined
      });

      // 5. Verify all operations succeeded
      const user = await db.getUserById(userId);
      const session = await db.getSession(sessionId);
      const messages = await db.getMessages(1, 1);
      const files = await db.getFileEntries(1);

      expect(user?.username).toBe('e2euser');
      expect(session?.state).toBe('main_menu');
      expect(messages.some(m => m.id === messageId)).toBe(true);
      expect(files.some(f => f.id === fileId)).toBe(true);

      // 6. Update user statistics
      await db.updateUser(userId, {
        uploads: 1,
        downloads: 1,
        bytesUpload: 2048,
        bytesDownload: 0
      });

      // 7. Verify statistics updated
      const updatedUser = await db.getUserById(userId);
      expect(updatedUser?.uploads).toBe(1);
      expect(updatedUser?.bytesUpload).toBe(2048);
    }, 30000);
  });

  describe('Multi-User Scenarios', () => {
    test('should handle multiple users in different conferences', async () => {
      // Create multiple users
      const user1Id = await db.createUser({
        username: 'user1',
        passwordHash: 'pass1',
        realname: 'User One',
        location: 'City1',
        email: 'user1@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: false,
        ansi: true,
        linesPerScreen: 23,
        computer: 'Test',
        screenType: 'Amiga Ansi',
        protocol: '/X Zmodem',
        editor: 'Prompt',
        zoomType: 'QWK',
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: 'XXX',
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        phone: ''
      });

      const user2Id = await db.createUser({
        username: 'user2',
        passwordHash: 'pass2',
        realname: 'User Two',
        location: 'City2',
        email: 'user2@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: false,
        ansi: true,
        linesPerScreen: 23,
        computer: 'Test',
        screenType: 'Amiga Ansi',
        protocol: '/X Zmodem',
        editor: 'Prompt',
        zoomType: 'QWK',
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: 'XXX',
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        phone: ''
      });

      // Create sessions for both users
      await db.createSession({
        id: 'session1',
        userId: user1Id,
        socketId: 'socket1',
        state: 'main_menu',
        subState: undefined,
        currentConf: 1,
        currentMsgBase: 1,
        timeRemaining: 60,
        lastActivity: new Date(),
        confRJoin: 1,
        msgBaseRJoin: 1,
        commandBuffer: '',
        menuPause: true,
        inputBuffer: '',
        relConfNum: 0,
        currentConfName: 'General',
        cmdShortcuts: false,
        tempData: undefined
      });

      await db.createSession({
        id: 'session2',
        userId: user2Id,
        socketId: 'socket2',
        state: 'main_menu',
        subState: undefined,
        currentConf: 2,
        currentMsgBase: 1,
        timeRemaining: 60,
        lastActivity: new Date(),
        confRJoin: 2,
        msgBaseRJoin: 1,
        commandBuffer: '',
        menuPause: true,
        inputBuffer: '',
        relConfNum: 0,
        currentConfName: 'Tech Support',
        cmdShortcuts: false,
        tempData: undefined
      });

      // Both users post messages in different conferences
      await db.createMessage({
        subject: 'User1 Message',
        body: 'Message from user 1 in General',
        author: 'user1',
        timestamp: new Date(),
        conferenceId: 1,
        messageBaseId: 1,
        isPrivate: false,
        toUser: undefined,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      });

      await db.createMessage({
        subject: 'User2 Message',
        body: 'Message from user 2 in Tech Support',
        author: 'user2',
        timestamp: new Date(),
        conferenceId: 2,
        messageBaseId: 1,
        isPrivate: false,
        toUser: undefined,
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      });

      // Verify messages are in correct conferences
      const conf1Messages = await db.getMessages(1, 1);
      const conf2Messages = await db.getMessages(2, 1);

      expect(conf1Messages.some(m => m.author === 'user1')).toBe(true);
      expect(conf2Messages.some(m => m.author === 'user2')).toBe(true);
      expect(conf1Messages.some(m => m.author === 'user2')).toBe(false);
      expect(conf2Messages.some(m => m.author === 'user1')).toBe(false);

      // Check active sessions
      const activeSessions = await db.getActiveSessions();
      expect(activeSessions.length).toBeGreaterThanOrEqual(2);
    }, 30000);
  });
});
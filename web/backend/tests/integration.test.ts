import { Database } from '../src/database';
import { ConfigManager } from '../src/config';

describe('Integration Tests - User Journeys', () => {
  let db: Database;
  let config: ConfigManager;

  beforeAll(async () => {
    db = (global as any).testDb;
    config = new ConfigManager();
  });

  afterAll(async () => {
    // Database cleanup handled in setup.ts
  });

  describe('Message Posting Journey', () => {
    test('should post message and retrieve it', async () => {
      // Create a test message
      const messageId = await db.createMessage({
        subject: 'Integration Test',
        body: 'This is an integration test message',
        author: 'testuser',
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

      // Retrieve messages
      const messages = await db.getMessages(1, 1);
      const foundMessage = messages.find(m => m.id === messageId);

      expect(foundMessage).toBeDefined();
      expect(foundMessage?.subject).toBe('Integration Test');
      expect(foundMessage?.body).toBe('This is an integration test message');
    });
  });

  describe('File Operations Journey', () => {
    test('should upload and download files', async () => {
      // Create a test file entry
      const fileId = await db.createFileEntry({
        filename: 'test.txt',
        description: 'Test file for integration',
        size: 1024,
        uploader: 'testuser',
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

      // Retrieve file
      const files = await db.getFileEntries(1);
      const foundFile = files.find(f => f.id === fileId);

      expect(foundFile).toBeDefined();
      expect(foundFile?.filename).toBe('test.txt');
      expect(foundFile?.size).toBe(1024);
    });
  });

  describe('Session Management Journey', () => {
    test('should create and manage user sessions', async () => {
      // Create session
      await db.createSession({
        id: 'test-session',
        userId: 'test-user-id',
        socketId: 'test-socket',
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

      // Retrieve session
      const session = await db.getSession('test-session');
      expect(session).toBeDefined();
      expect(session?.state).toBe('main_menu');
      expect(session?.currentConf).toBe(1);
    });
  });

  describe('Conference Navigation Journey', () => {
    test('should navigate conferences and message bases', async () => {
      // Get conferences
      const conferences = await db.getConferences();
      expect(conferences.length).toBeGreaterThan(0);

      // Get message bases for first conference
      const messageBases = await db.getMessageBases(conferences[0].id);
      expect(Array.isArray(messageBases)).toBe(true);

      // Get file areas for first conference
      const fileAreas = await db.getFileAreas(conferences[0].id);
      expect(Array.isArray(fileAreas)).toBe(true);
    });
  });
});
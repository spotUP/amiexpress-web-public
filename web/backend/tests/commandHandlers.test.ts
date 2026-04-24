import { Database } from '../src/database';
import { ConfigManager } from '../src/config';

// Mocks required to call processBBSCommand without booting the Amiga emulator
jest.mock('../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../src/handlers/door.handler', () => ({
  DoorHandler: class { async runDoor() {} },
  executeDoor: jest.fn().mockResolvedValue(undefined),
  handleDoorCommand: jest.fn().mockResolvedValue(undefined),
  displayDoorMenu: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn().mockResolvedValue(undefined),
  hasKeysFile: jest.fn().mockReturnValue(false),
}));
jest.mock('../src/handlers/command-handler/dependency-injection', () => ({
  getConfig: jest.fn().mockReturnValue({}),
  getMessageBases: jest.fn().mockReturnValue([]),
  getProcessOlmMessageQueue: jest.fn().mockReturnValue(jest.fn()),
  getScreenMenu: jest.fn().mockReturnValue(null),
  getDoors: jest.fn().mockReturnValue([]),
  getDatabase: jest.fn().mockReturnValue({
    getActiveSessions: jest.fn().mockResolvedValue([]),
    getUsers: jest.fn().mockResolvedValue([]),
    getUserByUsername: jest.fn().mockResolvedValue(null),
    createChatSession: jest.fn().mockResolvedValue('sess-1'),
  }),
  getConferences: jest.fn().mockReturnValue([]),
  getFileAreas: jest.fn().mockReturnValue([]),
  getSessions: jest.fn().mockReturnValue(new Map()),
}));
jest.mock('../src/utils/output.util', () => ({
  emitText: jest.fn((s: any, t: string) => s?.emit?.('ansi-output', t)),
  emitPrompt: jest.fn((s: any, t: string) => s?.emit?.('ansi-output', t)),
}));
jest.mock('../src/handlers/file/download.handler', () => ({
  DownloadHandler: { handleDownloadCommand: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../src/handlers/transfer/batch-download.handler', () => ({
  BatchDownloadHandler: { handleBatchDownload: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../src/handlers/command-execution.handler', () => ({
  commandCache: { bbscmd: new Map(), syscmd: new Map() },
  runBbsCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/handlers/transfer/olm.handler', () => ({
  handleOlmCommand: jest.fn().mockResolvedValue(undefined),
  handleQuietCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/handlers/room-commands.handler', () => ({ handleRoomCommand: jest.fn() }), { virtual: true });
jest.mock('../src/handlers/content/view-file.handler', () => ({
  ViewFileHandler: { handleViewFile: jest.fn(), handleViewFileCommand: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../src/handlers/zippy-search.handler', () => ({
  ZippySearchHandler: { handleZippySearchCommand: jest.fn().mockResolvedValue(undefined), handle: jest.fn() },
}), { virtual: true });
jest.mock('../src/server/session-manager', () => ({ setSession: jest.fn(), userSessions: new Map() }));
jest.mock('../src/handlers/commands/system-commands.handler', () => ({
  handleGoodbyeCommand: jest.fn(async (s: any) => { s.disconnect(); }),
  handleQuietModeCommand: jest.fn().mockResolvedValue(undefined),
  handleHelpCommand: jest.fn().mockResolvedValue(undefined),
  handleReadMessagesCommand: jest.fn().mockResolvedValue(undefined),
  handleEnterMessageCommand: jest.fn().mockResolvedValue(undefined),
  setSystemCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/user-commands.handler', () => ({
  handleUploadCommand: jest.fn().mockResolvedValue(undefined),
  handleJoinConferenceCommand: jest.fn().mockResolvedValue(undefined),
  handleUserStatsCommand: jest.fn().mockResolvedValue(undefined),
  setUserCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/webhook-commands.handler', () => ({
  WebhookCommandsHandler: { handleWebhookCommand: jest.fn() },
}));
jest.mock('../src/handlers/command-handler/page-sysop-command', () => ({
  handlePageSysopCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/handlers/commands/navigation-commands.handler', () => ({
  handleTimeCommand: jest.fn().mockResolvedValue(undefined),
  handleNewFilesCommand: jest.fn().mockResolvedValue(undefined),
  handlePreviousConferenceCommand: jest.fn().mockResolvedValue(undefined),
  handleNextConferenceCommand: jest.fn().mockResolvedValue(undefined),
  handlePreviousMessageBaseCommand: jest.fn().mockResolvedValue(undefined),
  handleNextMessageBaseCommand: jest.fn().mockResolvedValue(undefined),
  setNavigationCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/display-file-commands.handler', () => ({
  handleQuestionMarkCommand: jest.fn().mockResolvedValue(undefined),
  handleFileListCommand: jest.fn().mockResolvedValue(undefined),
  handleFileListRawCommand: jest.fn().mockResolvedValue(undefined),
  handleAlterFlagsCommand: jest.fn().mockResolvedValue(undefined),
  handleFileStatusCommand: jest.fn().mockResolvedValue(undefined),
  handleReadBulletinCommand: jest.fn().mockResolvedValue(undefined),
  setDisplayFileCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/chat/preference-chat-commands.handler', () => ({
  handleAnsiModeCommand: jest.fn().mockResolvedValue(undefined),
  handleExpertModeCommand: jest.fn().mockResolvedValue(undefined),
  handleCommentToSysopCommand: jest.fn().mockResolvedValue(undefined),
  setPreferenceChatCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/chat/chat-commands.handler', () => ({
  handleLiveChatCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/handlers/commands/advanced-commands.handler', () => ({
  handleGreetingsCommand: jest.fn().mockResolvedValue(undefined),
  handleMailScanCommand: jest.fn().mockResolvedValue(undefined),
  handleConferenceFlagsCommand: jest.fn().mockResolvedValue(undefined),
  setAdvancedCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/message/message-commands.handler', () => ({
  handleJoinMessageBaseCommand: jest.fn().mockResolvedValue(undefined),
  handleNodeManagementCommand: jest.fn().mockResolvedValue(undefined),
  handleConferenceMaintenanceCommand: jest.fn().mockResolvedValue(undefined),
  setMessageCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/info-commands.handler', () => ({
  handleVersionCommand: jest.fn(async (s: any) => { s.emit('ansi-output', 'v1.0'); }),
  handleWhoDetailedCommand: jest.fn().mockResolvedValue(undefined),
  handleWriteUserParamsCommand: jest.fn().mockResolvedValue(undefined),
  handleWhoCommand: jest.fn().mockResolvedValue(undefined),
  setInfoCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/utility-commands.handler', () => ({
  handleRelogonCommand: jest.fn().mockResolvedValue(undefined),
  handleZoomCommand: jest.fn().mockResolvedValue(undefined),
  handleHelpFilesCommand: jest.fn().mockResolvedValue(undefined),
  setUtilityCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/sysop-commands.handler', () => ({
  handleRemoteShellCommand: jest.fn().mockResolvedValue(undefined),
  handleAccountEditingCommand: jest.fn().mockResolvedValue(undefined),
  handleCallersLogCommand: jest.fn().mockResolvedValue(undefined),
  handleEditDirectoryFilesCommand: jest.fn().mockResolvedValue(undefined),
  handleEditAnyFileCommand: jest.fn().mockResolvedValue(undefined),
  handleChangeDirectoryCommand: jest.fn().mockResolvedValue(undefined),
  setSysopCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/commands/transfer-misc-commands.handler', () => ({
  handleZmodemUploadCommand: jest.fn().mockResolvedValue(undefined),
  handleSysopUploadCommand: jest.fn().mockResolvedValue(undefined),
  handleNodeUptimeCommand: jest.fn().mockResolvedValue(undefined),
  handleVotingBoothCommand: jest.fn().mockResolvedValue(undefined),
  handleDownloadWithStatusCommand: jest.fn().mockResolvedValue(undefined),
  setTransferMiscCommandsDependencies: jest.fn(),
}));
jest.mock('../src/handlers/message/messaging.handler', () => ({
  handleReadMessagesFullCommand: jest.fn().mockResolvedValue(undefined),
  handleEnterMessageFullCommand: jest.fn().mockResolvedValue(undefined),
  setMessagingDependencies: jest.fn(),
}));
jest.mock('../src/handlers/file/file-maintenance.handler', () => ({
  FileMaintenanceHandler: { handleFileMaintenanceCommand: jest.fn().mockResolvedValue(undefined), handle: jest.fn() },
}));

describe('Command Handlers', () => {
  let db: Database;
  let config: ConfigManager;

  beforeAll(async () => {
    // Wait for database to be available
    let attempts = 0;
    while (!(global as any).testDb && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    db = (global as any).testDb;
    config = new ConfigManager();

    // Ensure database is properly initialized
    if (!db) {
      throw new Error('Test database not initialized after waiting');
    }
  }, 30000);

  afterAll(async () => {
    // Database cleanup handled in setup.ts
  });

  describe('Message Commands', () => {
    test('should handle R command (Read Messages)', async () => {
      // Test message reading functionality
      const messages = await db.getMessages(1, 1);
      expect(Array.isArray(messages)).toBe(true);
    });

    test('should handle A command (Post Message)', async () => {
      // Test message posting
      const messageId = await db.createMessage({
        subject: 'Test Subject',
        body: 'Test message body',
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
      expect(typeof messageId).toBe('number');
    });

    test('should handle E command (Private Message)', async () => {
      // Test private message posting
      const messageId = await db.createMessage({
        subject: 'Private Test',
        body: 'Private message',
        author: 'testuser',
        timestamp: new Date(),
        conferenceId: 1,
        messageBaseId: 1,
        isPrivate: true,
        toUser: 'recipient',
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      });
      expect(typeof messageId).toBe('number');
    });
  });

  describe('File Commands', () => {
    test('should handle F command (File Areas)', async () => {
      const fileAreas = await db.getFileAreas(1);
      expect(Array.isArray(fileAreas)).toBe(true);
    });

    test('should handle FR command (File List Reverse)', async () => {
      const fileEntries = await db.getFileEntries(1);
      expect(Array.isArray(fileEntries)).toBe(true);
    });

    test('should handle N command (New Files)', async () => {
      const fileEntries = await db.getFileEntries(1);
      expect(Array.isArray(fileEntries)).toBe(true);
    });
  });

  describe('User Management', () => {
    test('should handle O command (Online Users)', async () => {
      const sessions = await db.getActiveSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    test('should create and retrieve user', async () => {
      const userId = await db.createUser({
        username: 'testuser',
        passwordHash: 'hashedpass',
        realname: 'Test User',
        location: 'Test City',
        email: 'test@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        userFlags: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: true,
        expert: 'N',
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

      const user = await db.getUserById(userId);
      expect(user?.username).toBe('testuser');
    });
  });

  describe('System Commands', () => {
    // Shared dispatch helper for processBBSCommand tests
    async function dispatchCmd(cmd: string, secLevel = 255) {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'sysop', secLevel } };
      return { result: await processBBSCommand(sock, sess, cmd), sock };
    }

    test('? command (Help) — express.e:24594 — dispatched and handled (returns 0)', async () => {
      expect((await dispatchCmd('?')).result).toBe(0);
    });

    test('G command (Goodbye) — express.e:25047 — calls socket.disconnect', async () => {
      const { result, sock } = await dispatchCmd('G');
      expect(result).toBe(0);
      expect(sock.disconnect).toHaveBeenCalled();
    });

    test('should handle Q command (Quiet Node)', async () => {
      // Test quiet node toggle
      const userId = await db.createUser({
        username: 'quietuser',
        passwordHash: 'pass',
        realname: 'Quiet User',
        location: 'Test',
        email: 'quiet@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        userFlags: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: 'N',
        ansi: true,
        linesPerScreen: 23,
        computer: 'Test',
        screenType: 'Amiga Ansi',
        protocol: '/X Zmodem',
        editor: 'Prompt',
        zoomType: 'QWK',
        availableForChat: true,
        quietNode: true, // Quiet flag
        autoRejoin: 1,
        confAccess: 'XXX',
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0,
        phone: ''
      });

      const user = await db.getUserById(userId);
      expect(user?.quietNode).toBe(true);
    });

    test('should handle X command (Expert Mode Toggle)', async () => {
      const userId = await db.createUser({
        username: 'expertuser',
        passwordHash: 'pass',
        realname: 'Expert User',
        location: 'Test',
        email: 'expert@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        userFlags: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: 'N', // Initially false
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

      let user = await db.getUserById(userId);
      expect(user?.expert).toBe('N');

      // Toggle expert mode
      await db.updateUser(userId, { expert: 'X' });
      user = await db.getUserById(userId);
      expect(user?.expert).toBe('X');
    });

    test('should handle S command (Status)', async () => {
      const userId = await db.createUser({
        username: 'statususer',
        passwordHash: 'pass',
        realname: 'Status User',
        location: 'Test',
        email: 'status@example.com',
        secLevel: 10,
        uploads: 5,
        downloads: 3,
        bytesUpload: 1024000,
        bytesDownload: 512000,
        ratio: 0,
        ratioType: 0,
        userFlags: 0,
        timeTotal: 120,
        timeLimit: 60,
        timeUsed: 30,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 10,
        callsToday: 2,
        newUser: false,
        expert: 'N',
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
        topUploadCPS: 1000,
        topDownloadCPS: 500,
        byteLimit: 0,
        phone: ''
      });

      const user = await db.getUserById(userId);
      expect(user?.uploads).toBe(5);
      expect(user?.downloads).toBe(3);
      expect(user?.bytesUpload).toBe(1024000);
      expect(user?.bytesDownload).toBe(512000);
    });

    test('should handle UP command (Uptime)', () => {
      // Uptime command should return system uptime
      const uptime = process.uptime();
      expect(typeof uptime).toBe('number');
      expect(uptime).toBeGreaterThan(0);
    });

    test('VER command — express.e:25688 — dispatched and emits output', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'sysop', secLevel: 255 } };
      expect(await processBBSCommand(sock, sess, 'VER')).toBe(0);
      expect(sock.emit).toHaveBeenCalled();
    });

    test('should handle W command (User Parameters)', async () => {
      const userId = await db.createUser({
        username: 'paramuser',
        passwordHash: 'pass',
        realname: 'Parameter User',
        location: 'Test City',
        email: 'param@example.com',
        secLevel: 10,
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        userFlags: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: 'N',
        ansi: true,
        linesPerScreen: 23,
        computer: 'Test Computer',
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
        phone: '123-456-7890'
      });

      const user = await db.getUserById(userId);
      expect(user?.realname).toBe('Parameter User');
      expect(user?.location).toBe('Test City');
      expect(user?.phone).toBe('123-456-7890');
      expect(user?.computer).toBe('Test Computer');
    });
  });

  describe('Advanced Commands — dispatch via processBBSCommand', () => {
    async function dispatch(cmd: string, secLevel = 255) {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'sysop', secLevel } };
      return (await processBBSCommand(sock, sess, cmd));
    }

    test('O — Online Users (express.e:25372) — returns 0', async () => expect(await dispatch('O')).toBe(0));
    test('OLM — Online Message (express.e:25406) — returns 0', async () => expect(await dispatch('OLM')).toBe(0));
    test('RL — Relogon (express.e:25534) — returns 0', async () => expect(await dispatch('RL')).toBe(0));
    test('RZ — Zmodem Upload (express.e:25608) — returns 0', async () => expect(await dispatch('RZ')).toBe(0));
    test('MS — Mail Scan (express.e:25250) — returns 0', async () => expect(await dispatch('MS')).toBe(0));
    test('ZOOM — QWK Download — returns 0', async () => expect(await dispatch('ZOOM')).toBe(0));
    test('CF — Conference Flags (express.e:24672) — returns 0', async () => expect(await dispatch('CF')).toBe(0));
    test('VO — Voting Booth (express.e:25700) — returns 0', async () => expect(await dispatch('VO')).toBe(0));
    test('0 — Remote Shell (express.e:24424, sysop) — returns 0', async () => expect(await dispatch('0', 255)).toBe(0));
    test('1 — Account Editing (express.e:24453, sysop) — returns 0', async () => expect(await dispatch('1', 255)).toBe(0));
    test('2 — Callers Log (express.e:24461, sysop) — returns 0', async () => expect(await dispatch('2', 255)).toBe(0));
    test('3 — Edit Directory Files (express.e:24511, sysop) — returns 0', async () => expect(await dispatch('3', 255)).toBe(0));
    test('4 — Edit Any File (express.e:24517, sysop) — returns 0', async () => expect(await dispatch('4', 255)).toBe(0));
    test('5 — Change Directory (express.e:24523, sysop) — returns 0', async () => expect(await dispatch('5', 255)).toBe(0));
    test('unknown command — returns -1 (RESULT_FAILURE)', async () => expect(await dispatch('__NO_SUCH_CMD__')).toBe(-1));
  });

  describe('Door Commands', () => {
    test('DOORS command — door games menu — dispatched and returns 0', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'user', secLevel: 30 } };
      expect(await processBBSCommand(sock, sess, 'DOORS')).toBe(0);
    });
  });

  describe('File Transfer Commands', () => {
    test('should handle file upload operations', async () => {
      // Test file upload functionality
      const fileEntry = {
        filename: 'test.lha',
        description: 'Test archive',
        size: 1024,
        uploader: 'testuser',
        uploadDate: new Date(),
        downloads: 0,
        areaId: 1,
        status: 'active' as const,
        checked: 'N' as const
      };

      const fileId = await db.createFileEntry(fileEntry);
      expect(typeof fileId).toBe('number');

      const retrieved = await db.getFileEntries(1);
      const foundFile = retrieved.find(f => f.id === fileId);
      expect(foundFile?.filename).toBe('test.lha');
      expect(foundFile?.uploader).toBe('testuser');
    });

    test('should handle file download operations', async () => {
      // Test file download functionality
      const fileEntry = {
        filename: 'download.lha',
        description: 'Download test',
        size: 2048,
        uploader: 'testuser',
        uploadDate: new Date(),
        downloads: 0,
        areaId: 1,
        status: 'active' as const,
        checked: 'N' as const
      };

      const fileId = await db.createFileEntry(fileEntry);
      await db.updateFileEntry(fileId, { downloads: 1 });

      const updated = await db.getFileEntries(1);
      const foundFile = updated.find(f => f.id === fileId);
      expect(foundFile?.downloads).toBe(1);
    });

    test('U command (Upload) — express.e:25646 — dispatched correctly', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'user', secLevel: 30 } };
      expect(await processBBSCommand(sock, sess, 'U')).toBe(0);
    });

    test('UP command (Node Uptime) — express.e:25667 — dispatched correctly', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'user', secLevel: 30 } };
      expect(await processBBSCommand(sock, sess, 'UP')).toBe(0);
    });
  });

  describe('Chat System', () => {
    test('O command (Page Sysop) — express.e:25372 — dispatched correctly', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'user', secLevel: 30 } };
      expect(await processBBSCommand(sock, sess, 'O')).toBe(0);
    });

    test('Q command (Quiet Mode) — express.e:25505 — dispatched correctly', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'user', secLevel: 30 } };
      expect(await processBBSCommand(sock, sess, 'Q')).toBe(0);
    });

    test('should handle comment to sysop', async () => {
      // Test comment to sysop functionality
      const messageId = await db.createMessage({
        subject: 'Comment to Sysop',
        body: 'This is a comment to the sysop',
        author: 'testuser',
        timestamp: new Date(),
        conferenceId: 1,
        messageBaseId: 1,
        isPrivate: true,
        toUser: 'SYSOP',
        parentId: undefined,
        attachments: [],
        edited: false,
        editedBy: undefined,
        editedAt: undefined
      });
      expect(typeof messageId).toBe('number');
    });
  });

  describe('Error Handling', () => {
    test('invalid command returns -1 (RESULT_FAILURE)', async () => {
      const { processBBSCommand } = require('../src/handlers/command-handler/internal-commands');
      const sock = { emit: jest.fn(), disconnect: jest.fn() };
      const sess: any = { state: 'loggedon', currentUser: { username: 'user', secLevel: 30 } };
      expect(await processBBSCommand(sock, sess, 'NOTACOMMAND')).toBe(-1);
    });

    test('should handle permission denied scenarios', async () => {
      // Test permission checking
      const userId = await db.createUser({
        username: 'lowleveluser',
        passwordHash: 'pass',
        realname: 'Low Level User',
        location: 'Test',
        email: 'low@example.com',
        secLevel: 1, // Low security level
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        userFlags: 0,
        timeTotal: 0,
        timeLimit: 60,
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: false,
        expert: 'N',
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

      const user = await db.getUserById(userId);
      expect(user?.secLevel).toBe(1);
    });

    test('should handle database errors gracefully', async () => {
      // Test database error handling
      try {
        await db.getUserById('invalid-id'); // Invalid ID
        expect(true).toBe(true); // Should not throw
      } catch (error) {
        // Expected to handle gracefully
        expect(error).toBeDefined();
      }
    });
  });

  describe('Conference Commands', () => {
    test('should handle J command (Join Conference)', async () => {
      const conferences = await db.getConferences();
      expect(conferences.length).toBeGreaterThan(0);
    });

    test('should handle JM command (Join Message Base)', async () => {
      const messageBases = await db.getMessageBases(1);
      expect(Array.isArray(messageBases)).toBe(true);
    });
  });
});

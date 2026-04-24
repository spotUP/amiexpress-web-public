/**
 * Tests for internal-commands.ts (processBBSCommand switch).
 * Verifies every command code returns RESULT_SUCCESS (0) or RESULT_FAILURE (-1).
 * express.e line references are in comments for each case.
 */

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
  doPause: jest.fn().mockResolvedValue(undefined),
  hasKeysFile: jest.fn().mockReturnValue(false),
}));
jest.mock('../../src/handlers/command-handler/dependency-injection', () => ({
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
jest.mock('../../src/utils/output.util', () => ({
  emitText: jest.fn((s: any, t: string) => s?.emit?.('ansi-output', t)),
  emitPrompt: jest.fn((s: any, t: string) => s?.emit?.('ansi-output', t)),
}));
jest.mock('../../src/handlers/file/download.handler', () => ({
  DownloadHandler: { handleDownloadCommand: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/handlers/transfer/batch-download.handler', () => ({
  BatchDownloadHandler: { handleBatchDownload: jest.fn().mockResolvedValue(undefined) },
}));

// ── Dynamic require mocks (lazy requires inside switch cases) ─────────────

jest.mock('../../src/handlers/transfer/olm.handler', () => ({
  handleOlmCommand: jest.fn().mockResolvedValue(undefined),
  handleQuietCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/handlers/room-commands.handler', () => ({
  handleRoomCommand: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });
jest.mock('../../src/handlers/content/view-file.handler', () => ({
  ViewFileHandler: {
    handleViewFile: jest.fn().mockResolvedValue(undefined),
    handleViewFileCommand: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../src/handlers/zippy-search.handler', () => ({
  ZippySearchHandler: {
    handleZippySearch: jest.fn().mockResolvedValue(undefined),
    handleZippySearchCommand: jest.fn().mockResolvedValue(undefined),
    handle: jest.fn().mockResolvedValue(undefined),
  },
}), { virtual: true });
jest.mock('../../src/server/session-manager', () => ({
  setSession: jest.fn(), userSessions: new Map(),
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({
  commandCache: { bbscmd: new Map(), syscmd: new Map() },
  runBbsCommand: jest.fn().mockResolvedValue(undefined),
}));

// ── Static-import mocks (modules imported at top of internal-commands.ts) ─

// door.handler needs displayDoorMenu in addition to executeDoor
jest.mock('../../src/handlers/door.handler', () => ({
  DoorHandler: class { async runDoor() {} },
  executeDoor: jest.fn().mockResolvedValue(undefined),
  handleDoorCommand: jest.fn().mockResolvedValue(undefined),
  displayDoorMenu: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/handlers/commands/system-commands.handler', () => ({
  handleGoodbyeCommand: jest.fn(async (socket: any) => { socket.disconnect(); }),
  handleQuietModeCommand: jest.fn().mockResolvedValue(undefined),
  handleHelpCommand: jest.fn().mockResolvedValue(undefined),
  handleReadMessagesCommand: jest.fn().mockResolvedValue(undefined),
  handleEnterMessageCommand: jest.fn().mockResolvedValue(undefined),
  setSystemCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/user-commands.handler', () => ({
  handleUploadCommand: jest.fn().mockResolvedValue(undefined),
  handleJoinConferenceCommand: jest.fn().mockResolvedValue(undefined),
  handleUserStatsCommand: jest.fn().mockResolvedValue(undefined),
  setUserCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/webhook-commands.handler', () => ({
  WebhookCommandsHandler: { handleWebhookCommand: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/handlers/command-handler/page-sysop-command', () => ({
  handlePageSysopCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/handlers/commands/navigation-commands.handler', () => ({
  handleTimeCommand: jest.fn().mockResolvedValue(undefined),
  handleNewFilesCommand: jest.fn().mockResolvedValue(undefined),
  handlePreviousConferenceCommand: jest.fn().mockResolvedValue(undefined),
  handleNextConferenceCommand: jest.fn().mockResolvedValue(undefined),
  handlePreviousMessageBaseCommand: jest.fn().mockResolvedValue(undefined),
  handleNextMessageBaseCommand: jest.fn().mockResolvedValue(undefined),
  setNavigationCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/display-file-commands.handler', () => ({
  handleQuestionMarkCommand: jest.fn().mockResolvedValue(undefined),
  handleFileListCommand: jest.fn().mockResolvedValue(undefined),
  handleFileListRawCommand: jest.fn().mockResolvedValue(undefined),
  handleAlterFlagsCommand: jest.fn().mockResolvedValue(undefined),
  handleFileStatusCommand: jest.fn().mockResolvedValue(undefined),
  handleReadBulletinCommand: jest.fn().mockResolvedValue(undefined),
  setDisplayFileCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/chat/preference-chat-commands.handler', () => ({
  handleAnsiModeCommand: jest.fn().mockResolvedValue(undefined),
  handleExpertModeCommand: jest.fn().mockResolvedValue(undefined),
  handleCommentToSysopCommand: jest.fn().mockResolvedValue(undefined),
  setPreferenceChatCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/chat/chat-commands.handler', () => ({
  handleLiveChatCommand: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/handlers/commands/advanced-commands.handler', () => ({
  handleGreetingsCommand: jest.fn().mockResolvedValue(undefined),
  handleMailScanCommand: jest.fn().mockResolvedValue(undefined),
  handleConferenceFlagsCommand: jest.fn().mockResolvedValue(undefined),
  setAdvancedCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/message/message-commands.handler', () => ({
  handleJoinMessageBaseCommand: jest.fn().mockResolvedValue(undefined),
  handleNodeManagementCommand: jest.fn().mockResolvedValue(undefined),
  handleConferenceMaintenanceCommand: jest.fn().mockResolvedValue(undefined),
  setMessageCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/info-commands.handler', () => ({
  handleVersionCommand: jest.fn(async (socket: any) => { socket.emit('ansi-output', 'v1.0'); }),
  handleWhoDetailedCommand: jest.fn().mockResolvedValue(undefined),
  handleWriteUserParamsCommand: jest.fn().mockResolvedValue(undefined),
  handleWhoCommand: jest.fn().mockResolvedValue(undefined),
  setInfoCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/utility-commands.handler', () => ({
  handleRelogonCommand: jest.fn().mockResolvedValue(undefined),
  handleZoomCommand: jest.fn().mockResolvedValue(undefined),
  handleHelpFilesCommand: jest.fn().mockResolvedValue(undefined),
  setUtilityCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/sysop-commands.handler', () => ({
  handleRemoteShellCommand: jest.fn().mockResolvedValue(undefined),
  handleAccountEditingCommand: jest.fn().mockResolvedValue(undefined),
  handleCallersLogCommand: jest.fn().mockResolvedValue(undefined),
  handleEditDirectoryFilesCommand: jest.fn().mockResolvedValue(undefined),
  handleEditAnyFileCommand: jest.fn().mockResolvedValue(undefined),
  handleChangeDirectoryCommand: jest.fn().mockResolvedValue(undefined),
  setSysopCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/commands/transfer-misc-commands.handler', () => ({
  handleZmodemUploadCommand: jest.fn().mockResolvedValue(undefined),
  handleSysopUploadCommand: jest.fn().mockResolvedValue(undefined),
  handleNodeUptimeCommand: jest.fn().mockResolvedValue(undefined),
  handleVotingBoothCommand: jest.fn().mockResolvedValue(undefined),
  handleDownloadWithStatusCommand: jest.fn().mockResolvedValue(undefined),
  setTransferMiscCommandsDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/message/messaging.handler', () => ({
  handleReadMessagesFullCommand: jest.fn().mockResolvedValue(undefined),
  handleEnterMessageFullCommand: jest.fn().mockResolvedValue(undefined),
  setMessagingDependencies: jest.fn(),
}));
jest.mock('../../src/handlers/file/file-maintenance.handler', () => ({
  FileMaintenanceHandler: {
    handleFileMaintenance: jest.fn().mockResolvedValue(undefined),
    handleFileMaintenanceCommand: jest.fn().mockResolvedValue(undefined),
    handle: jest.fn().mockResolvedValue(undefined),
  },
}));

import { processBBSCommand } from '../../src/handlers/command-handler/internal-commands';

function makeCtx(secLevel = 255) {
  const sock = { emit: jest.fn(), disconnect: jest.fn() };
  const sess: any = { state: 'loggedon', currentUser: { username: 'sysop', secLevel } };
  return { sock, sess };
}

async function run(cmd: string, secLevel = 255) {
  const { sock, sess } = makeCtx(secLevel);
  return { result: await processBBSCommand(sock, sess, cmd), sock, sess };
}

describe('processBBSCommand', () => {
  test('is a function', () => expect(typeof processBBSCommand).toBe('function'));

  describe('unknown command → RESULT_FAILURE (-1)', () => {
    test('"XYZ" returns -1', async () => expect((await run('XYZ')).result).toBe(-1));
    test('"BYE" returns -1 (handled in command.handler.ts)', async () => expect((await run('BYE')).result).toBe(-1));
  });

  describe('File commands → RESULT_SUCCESS (0)', () => {
    test('D — Download (express.e:24853)', async () => expect((await run('D')).result).toBe(0));
    test('DS — Download with Status (express.e:28302)', async () => expect((await run('DS')).result).toBe(0));
    test('DB — Batch Download', async () => expect((await run('DB')).result).toBe(0));
    test('U — Upload (express.e:25646)', async () => expect((await run('U')).result).toBe(0));
    test('UP — Node Uptime (express.e:25667)', async () => expect((await run('UP')).result).toBe(0));
    test('US — Sysop Upload (express.e:25660)', async () => expect((await run('US')).result).toBe(0));
    test('F — File Listings (express.e:24877)', async () => expect((await run('F')).result).toBe(0));
    test('FR — File Listings Raw (express.e:24883)', async () => expect((await run('FR')).result).toBe(0));
    test('FS — File Status (express.e:24872)', async () => expect((await run('FS')).result).toBe(0));
    test('FM — File Maintenance (express.e:24889)', async () => expect((await run('FM')).result).toBe(0));
    test('A — Alter Flags (express.e:24601)', async () => expect((await run('A')).result).toBe(0));
    test('N — New Files (express.e:25275)', async () => expect((await run('N')).result).toBe(0));
    test('RZ — Zmodem Upload (express.e:25608)', async () => expect((await run('RZ')).result).toBe(0));
  });

  describe('Message commands → RESULT_SUCCESS (0)', () => {
    test('R — Read Messages (express.e:25518)', async () => expect((await run('R')).result).toBe(0));
    test('E — Enter Message (express.e:24860)', async () => expect((await run('E')).result).toBe(0));
    test('MS — Mail Scan (express.e:25250)', async () => expect((await run('MS')).result).toBe(0));
    test('OLM — Online Message (express.e:25406)', async () => expect((await run('OLM')).result).toBe(0));
    test('B — Read Bulletin (express.e:24607)', async () => expect((await run('B')).result).toBe(0));
  });

  describe('Navigation commands → RESULT_SUCCESS (0)', () => {
    test('J — Join Conference (express.e:25113)', async () => expect((await run('J')).result).toBe(0));
    test('JM — Join Message Base (express.e:25185)', async () => expect((await run('JM')).result).toBe(0));
    test('< — Previous Conference (express.e:24529)', async () => expect((await run('<')).result).toBe(0));
    test('> — Next Conference (express.e:24548)', async () => expect((await run('>')).result).toBe(0));
    test('<< — Previous Message Base (express.e:24566)', async () => expect((await run('<<')).result).toBe(0));
    test('>> — Next Message Base (express.e:24580)', async () => expect((await run('>>')).result).toBe(0));
  });

  describe('User/preference commands → RESULT_SUCCESS (0)', () => {
    test('W — Write User Parameters (express.e:25712)', async () => expect((await run('W')).result).toBe(0));
    test('X — Expert Mode Toggle (express.e:26113)', async () => expect((await run('X')).result).toBe(0));
    test('Q — Quiet Mode (express.e:25505)', async () => expect((await run('Q')).result).toBe(0));
    test('RL — Relogon (express.e:25534)', async () => expect((await run('RL')).result).toBe(0));
    test('S — Statistics (express.e:25540)', async () => expect((await run('S')).result).toBe(0));
    test('T — Time/Date (express.e:25622)', async () => expect((await run('T')).result).toBe(0));
    test('H — Help (express.e:25075)', async () => expect((await run('H')).result).toBe(0));
    test('? — Show Menu (express.e:24594)', async () => expect((await run('?')).result).toBe(0));
    test('M — Toggle ANSI (express.e:25239)', async () => expect((await run('M')).result).toBe(0));
  });

  describe('Info/display commands → RESULT_SUCCESS (0)', () => {
    test('VER — Version (express.e:25688)', async () => {
      const { result, sock } = await run('VER');
      expect(result).toBe(0);
      expect(sock.emit).toHaveBeenCalled(); // VER must emit output
    });
    test('V — View File (express.e:25675)', async () => expect((await run('V')).result).toBe(0));
    test('VS — View Statistics (express.e:28376)', async () => expect((await run('VS')).result).toBe(0));
    test('WHO — Who is Online (express.e:26094)', async () => expect((await run('WHO')).result).toBe(0));
    test('WHD — Who Online Detailed (express.e:26104)', async () => expect((await run('WHD')).result).toBe(0));
    test('GR — Greetings (express.e:24411)', async () => expect((await run('GR')).result).toBe(0));
  });

  describe('Communication commands → RESULT_SUCCESS (0)', () => {
    test('O — Page Sysop (express.e:25372)', async () => expect((await run('O')).result).toBe(0));
    test('C — Comment to Sysop (express.e:24658)', async () => expect((await run('C')).result).toBe(0));
    test('VO — Voting Booth (express.e:25700)', async () => expect((await run('VO')).result).toBe(0));
    test('Z — Zippy Text Search (express.e:26123)', async () => expect((await run('Z')).result).toBe(0));
    test('ZOOM — QWK Download', async () => expect((await run('ZOOM')).result).toBe(0));
  });

  describe('Sysop commands → RESULT_SUCCESS (0)', () => {
    test('0 — Remote Shell (express.e:24424)', async () => expect((await run('0', 255)).result).toBe(0));
    test('1 — Account Editing (express.e:24453)', async () => expect((await run('1', 255)).result).toBe(0));
    test('2 — Callers Log (express.e:24461)', async () => expect((await run('2', 255)).result).toBe(0));
    test('3 — Edit Directory Files (express.e:24511)', async () => expect((await run('3', 255)).result).toBe(0));
    test('4 — Edit Any File (express.e:24517)', async () => expect((await run('4', 255)).result).toBe(0));
    test('5 — Change Directory (express.e:24523)', async () => expect((await run('5', 255)).result).toBe(0));
    test('NM — Node Management (sysop)', async () => expect((await run('NM', 255)).result).toBe(0));
    test('CM — Conference Maintenance (sysop)', async () => expect((await run('CM', 255)).result).toBe(0));
  });

  describe('Modern/web commands → RESULT_SUCCESS (0)', () => {
    test('DOORS — Door Games Menu', async () => expect((await run('DOORS')).result).toBe(0));
    test('CF — Conference Flags (express.e:24672)', async () => expect((await run('CF')).result).toBe(0));
  });

  describe('G (Goodbye) has special behavior', () => {
    test('G — Goodbye (express.e:25047) — returns 0 and calls disconnect', async () => {
      const { result, sock } = await run('G');
      expect(result).toBe(0);
      expect(sock.disconnect).toHaveBeenCalled();
    });
  });
});

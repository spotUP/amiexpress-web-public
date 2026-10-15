/**
 * EVERY INTERNAL COMMAND REACHES ITS HANDLER - through the dispatcher the
 * board actually runs.
 *
 * This replaces `tests/command-handler/internal-commands.test.ts`, which
 * asserted the same fifty-odd command codes against
 * `handlers/command-handler/internal-commands.ts` - a SECOND copy of the
 * dispatch switch that nothing imports (the 2026-09-08 parity audit found
 * fixes that had landed in it and never reached a caller). A green suite over
 * a module no caller reaches proves nothing about the board, which is the
 * failure the reachability ratchet exists to prevent and which this file is
 * the other half of.
 *
 * WHAT IT ASSERTS AND WHY IT IS DIFFERENT. The dead copy returned 0 or -1 per
 * case and the old suite pinned those numbers. The live dispatcher
 * (`command.handler.ts`'s `processBBSCommand`, express.e:28285-28402) returns
 * an `InternalCommandResult` and most cases return nothing at all - success
 * is silence, and only a refusal carries a code. So the property worth
 * pinning is not a number: it is that the command code lands in the handler
 * that owns it, and that an unknown code lands in none of them. That is
 * exactly what a fix landing in a dead copy breaks.
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
// THE LIVE PATH IS content/zippy-search.handler. The dead copy required
// `handlers/zippy-search.handler`, which does not exist - the old suite had to
// mock it `{ virtual: true }` to keep its Z case green. A test that invents the
// module under test is the whole disease in one line.
jest.mock('../../src/handlers/content/zippy-search.handler', () => ({
  ZippySearchHandler: {
    handleZippySearch: jest.fn().mockResolvedValue(undefined),
    handleZippySearchCommand: jest.fn().mockResolvedValue(undefined),
    handle: jest.fn().mockResolvedValue(undefined),
  },
}));
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
  getDoors: jest.fn().mockReturnValue([]),
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


import { processBBSCommand } from '../../src/handlers/command.handler';

import { DownloadHandler } from '../../src/handlers/file/download.handler';
import { ViewFileHandler } from '../../src/handlers/content/view-file.handler';
import { ZippySearchHandler } from '../../src/handlers/content/zippy-search.handler';
import { FileMaintenanceHandler } from '../../src/handlers/file/file-maintenance.handler';
import * as olm from '../../src/handlers/transfer/olm.handler';
import * as userCommands from '../../src/handlers/commands/user-commands.handler';
import * as systemCommands from '../../src/handlers/commands/system-commands.handler';
import * as navigationCommands from '../../src/handlers/commands/navigation-commands.handler';
import * as displayFileCommands from '../../src/handlers/commands/display-file-commands.handler';
import * as preferenceChat from '../../src/handlers/chat/preference-chat-commands.handler';
import * as advancedCommands from '../../src/handlers/commands/advanced-commands.handler';
import * as messageCommands from '../../src/handlers/message/message-commands.handler';
import * as infoCommands from '../../src/handlers/commands/info-commands.handler';
import * as utilityCommands from '../../src/handlers/commands/utility-commands.handler';
import * as sysopCommands from '../../src/handlers/commands/sysop-commands.handler';
import * as transferMisc from '../../src/handlers/commands/transfer-misc-commands.handler';
import * as messaging from '../../src/handlers/message/messaging.handler';
import * as pageSysop from '../../src/handlers/command-handler/page-sysop-command';
import * as doorHandler from '../../src/handlers/door.handler';

/**
 * Every mocked handler, so "an unknown command reaches nothing" can be said
 * about all of them at once rather than about the three somebody remembered.
 */
const EVERY_HANDLER = (): jest.Mock[] => [
  DownloadHandler.handleDownloadCommand,
  ViewFileHandler.handleViewFileCommand,
  ZippySearchHandler.handleZippySearchCommand,
  FileMaintenanceHandler.handleFileMaintenanceCommand,
  olm.handleOlmCommand, olm.handleQuietCommand,
  userCommands.handleUploadCommand, userCommands.handleJoinConferenceCommand, userCommands.handleUserStatsCommand,
  systemCommands.handleGoodbyeCommand, systemCommands.handleHelpCommand,
  navigationCommands.handleTimeCommand, navigationCommands.handleNewFilesCommand,
  navigationCommands.handlePreviousConferenceCommand, navigationCommands.handleNextConferenceCommand,
  navigationCommands.handlePreviousMessageBaseCommand, navigationCommands.handleNextMessageBaseCommand,
  displayFileCommands.handleQuestionMarkCommand, displayFileCommands.handleFileListCommand,
  displayFileCommands.handleFileListRawCommand, displayFileCommands.handleAlterFlagsCommand,
  displayFileCommands.handleFileStatusCommand, displayFileCommands.handleReadBulletinCommand,
  preferenceChat.handleAnsiModeCommand, preferenceChat.handleExpertModeCommand, preferenceChat.handleCommentToSysopCommand,
  advancedCommands.handleGreetingsCommand, advancedCommands.handleMailScanCommand, advancedCommands.handleConferenceFlagsCommand,
  messageCommands.handleJoinMessageBaseCommand, messageCommands.handleNodeManagementCommand, messageCommands.handleConferenceMaintenanceCommand,
  infoCommands.handleVersionCommand, infoCommands.handleWhoCommand, infoCommands.handleWhoDetailedCommand, infoCommands.handleWriteUserParamsCommand,
  utilityCommands.handleRelogonCommand, utilityCommands.handleZoomCommand, utilityCommands.handleHelpFilesCommand,
  sysopCommands.handleRemoteShellCommand, sysopCommands.handleAccountEditingCommand, sysopCommands.handleCallersLogCommand,
  sysopCommands.handleEditDirectoryFilesCommand, sysopCommands.handleEditAnyFileCommand, sysopCommands.handleChangeDirectoryCommand,
  transferMisc.handleZmodemUploadCommand, transferMisc.handleSysopUploadCommand, transferMisc.handleNodeUptimeCommand,
  transferMisc.handleVotingBoothCommand, transferMisc.handleDownloadWithStatusCommand,
  messaging.handleReadMessagesFullCommand, messaging.handleEnterMessageFullCommand,
  pageSysop.handlePageSysopCommand,
  doorHandler.displayDoorMenu,
] as unknown as jest.Mock[];

/**
 * The command a caller types, and the handler that owns it - read off the
 * live switch in command.handler.ts, with its express.e line in the comment
 * the case carries.
 */
const DISPATCH: Array<[string, () => jest.Mock]> = [
  // File transfer
  ['D', () => DownloadHandler.handleDownloadCommand as unknown as jest.Mock],
  ['DS', () => transferMisc.handleDownloadWithStatusCommand as unknown as jest.Mock],
  ['U', () => userCommands.handleUploadCommand as unknown as jest.Mock],
  ['UP', () => transferMisc.handleNodeUptimeCommand as unknown as jest.Mock],
  ['US', () => transferMisc.handleSysopUploadCommand as unknown as jest.Mock],
  ['RZ', () => transferMisc.handleZmodemUploadCommand as unknown as jest.Mock],

  // File listings
  ['F', () => displayFileCommands.handleFileListCommand as unknown as jest.Mock],
  ['FR', () => displayFileCommands.handleFileListRawCommand as unknown as jest.Mock],
  ['FS', () => displayFileCommands.handleFileStatusCommand as unknown as jest.Mock],
  ['FM', () => FileMaintenanceHandler.handleFileMaintenanceCommand as unknown as jest.Mock],
  ['A', () => displayFileCommands.handleAlterFlagsCommand as unknown as jest.Mock],
  ['N', () => navigationCommands.handleNewFilesCommand as unknown as jest.Mock],

  // Messages
  ['R', () => messaging.handleReadMessagesFullCommand as unknown as jest.Mock],
  ['E', () => messaging.handleEnterMessageFullCommand as unknown as jest.Mock],
  ['EALL', () => messaging.handleEnterMessageFullCommand as unknown as jest.Mock],
  ['MS', () => advancedCommands.handleMailScanCommand as unknown as jest.Mock],
  ['OLM', () => olm.handleOlmCommand as unknown as jest.Mock],
  ['B', () => displayFileCommands.handleReadBulletinCommand as unknown as jest.Mock],

  // Navigation
  ['J', () => userCommands.handleJoinConferenceCommand as unknown as jest.Mock],
  ['JM', () => messageCommands.handleJoinMessageBaseCommand as unknown as jest.Mock],
  ['<', () => navigationCommands.handlePreviousConferenceCommand as unknown as jest.Mock],
  ['>', () => navigationCommands.handleNextConferenceCommand as unknown as jest.Mock],
  ['<<', () => navigationCommands.handlePreviousMessageBaseCommand as unknown as jest.Mock],
  ['>>', () => navigationCommands.handleNextMessageBaseCommand as unknown as jest.Mock],

  // The caller's own settings
  ['W', () => infoCommands.handleWriteUserParamsCommand as unknown as jest.Mock],
  ['X', () => preferenceChat.handleExpertModeCommand as unknown as jest.Mock],
  ['M', () => preferenceChat.handleAnsiModeCommand as unknown as jest.Mock],
  ['Q', () => olm.handleQuietCommand as unknown as jest.Mock],
  ['RL', () => utilityCommands.handleRelogonCommand as unknown as jest.Mock],
  ['S', () => userCommands.handleUserStatsCommand as unknown as jest.Mock],
  ['T', () => navigationCommands.handleTimeCommand as unknown as jest.Mock],
  ['H', () => systemCommands.handleHelpCommand as unknown as jest.Mock],
  ['?', () => displayFileCommands.handleQuestionMarkCommand as unknown as jest.Mock],
  ['^', () => utilityCommands.handleHelpFilesCommand as unknown as jest.Mock],
  ['TTX', () => utilityCommands.handleHelpFilesCommand as unknown as jest.Mock],

  // Information
  ['VER', () => infoCommands.handleVersionCommand as unknown as jest.Mock],
  ['V', () => ViewFileHandler.handleViewFileCommand as unknown as jest.Mock],
  ['VS', () => ViewFileHandler.handleViewFileCommand as unknown as jest.Mock],
  ['WHO', () => infoCommands.handleWhoCommand as unknown as jest.Mock],
  ['WHD', () => infoCommands.handleWhoDetailedCommand as unknown as jest.Mock],
  ['GR', () => advancedCommands.handleGreetingsCommand as unknown as jest.Mock],

  // Talking to the sysop, and to the board
  ['O', () => pageSysop.handlePageSysopCommand as unknown as jest.Mock],
  ['C', () => preferenceChat.handleCommentToSysopCommand as unknown as jest.Mock],
  ['VO', () => transferMisc.handleVotingBoothCommand as unknown as jest.Mock],
  ['Z', () => ZippySearchHandler.handleZippySearchCommand as unknown as jest.Mock],
  ['ZOOM', () => utilityCommands.handleZoomCommand as unknown as jest.Mock],
  ['CF', () => advancedCommands.handleConferenceFlagsCommand as unknown as jest.Mock],

  // Sysop
  ['0', () => sysopCommands.handleRemoteShellCommand as unknown as jest.Mock],
  ['1', () => sysopCommands.handleAccountEditingCommand as unknown as jest.Mock],
  ['2', () => sysopCommands.handleCallersLogCommand as unknown as jest.Mock],
  ['3', () => sysopCommands.handleEditDirectoryFilesCommand as unknown as jest.Mock],
  ['4', () => sysopCommands.handleEditAnyFileCommand as unknown as jest.Mock],
  ['5', () => sysopCommands.handleChangeDirectoryCommand as unknown as jest.Mock],
  ['NM', () => messageCommands.handleNodeManagementCommand as unknown as jest.Mock],
  ['CM', () => messageCommands.handleConferenceMaintenanceCommand as unknown as jest.Mock],

  // Web-only
  ['DOORS', () => doorHandler.displayDoorMenu as unknown as jest.Mock],

  // Goodbye
  ['G', () => systemCommands.handleGoodbyeCommand as unknown as jest.Mock],
];

function makeContext(secLevel = 255) {
  const socket = { emit: jest.fn(), disconnect: jest.fn(), server: null };
  // 'T' at every ACS index, so checkSecurity answers from the user record and
  // never reads the board's Access/ directory (acs.util.ts:180-184).
  const user = { id: 1, username: 'SYSOP', secLevel, securityFlags: 'T'.repeat(80) };
  const session: any = {
    state: 'loggedon',
    currentUser: user,
    user,
    currentConf: 1,
    tempData: {},
  };
  return { socket, session };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the dispatcher the board runs', () => {
  test.each(DISPATCH)('%s reaches its handler', async (command, handler) => {
    const { socket, session } = makeContext();

    await processBBSCommand(socket, session, command, '');

    expect(handler()).toHaveBeenCalled();
  });

  it('sends an unknown command to no internal handler at all', async () => {
    const { socket, session } = makeContext();

    await processBBSCommand(socket, session, 'XYZZY', '');

    for (const handler of EVERY_HANDLER()) expect(handler).not.toHaveBeenCalled();
  });

  it('G hangs the caller up', async () => {
    const { socket, session } = makeContext();

    await processBBSCommand(socket, session, 'G', '');

    expect(systemCommands.handleGoodbyeCommand).toHaveBeenCalled();
  });
});

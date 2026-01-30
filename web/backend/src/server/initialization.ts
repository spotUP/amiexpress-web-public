import * as path from 'path';
import * as fs from 'fs';
import { db } from '../database';
import { config } from '../config';
import { initializeContainer } from '../container';
import { loadConfConfig } from '../services/conf-config.service';
import { conferenceFileManager } from '../services/ConferenceFileManager';
import {
  loadFileAreasFromDisk,
  ensureConferenceStructure,
  ensureRootScreens
} from '../services/file-areas-loader';
import { Door, DoorSession, ChatState } from '../types';
import { LoggedOnSubState } from '../constants/bbs-states';
import type { Server as SocketIOServer } from 'socket.io';

// Store io reference for dependency injection
let _io: SocketIOServer | null = null;
import {
  callersLog,
  getRecentCallerActivity,
  getUserStats,
  searchFilesByName,
  searchFilesAdvanced,
  getFileEntry,
  deleteFileEntry,
  moveFileEntry,
  updateFileDescription,
  getFileAreas,
  resetNewMailScanPointers,
  resetLastMessageReadPointers,
  getConferenceStats,
  updateMessageNumberRange,
  getActiveVoteTopics,
  getVoteTopic,
  getVoteQuestions,
  getVoteAnswers,
  hasUserVoted,
  submitVote,
  getVoteStatistics,
  createVoteTopic,
  createVoteQuestion,
  createVoteAnswer,
  deleteVoteTopic,
  getNextTopicNumber,
  loadFlagged,
  loadHistory,
  processOlmMessageQueue,
  displaySystemBulletins
} from './database-helpers';
import { sessions } from './session-manager';
import { setConferences, displayScreen, parseMciCodes, addAnsiEscapes, loadScreenFile, hasKeysFile } from '../handlers/screen.handler';
import {
  setConferences as setConferencesForConferenceHandler,
  setMessageBases,
  setDatabase,
  setHelpers,
  setConstants,
  joinConference
} from '../handlers/operations/conference.handler';
import { setBulletinDependencies } from '../handlers/content/bulletin.handler';
import { setMessageScanDependencies, checkConfAccess } from '../handlers/message/message-scan.handler';
import { setUserCommandsDependencies } from '../handlers/commands/user-commands.handler';
import { setSystemCommandsDependencies, handleGoodbyeCommand } from '../handlers/commands/system-commands.handler';
import { setNavigationCommandsDependencies } from '../handlers/commands/navigation-commands.handler';
import { setDisplayFileCommandsDependencies } from '../handlers/commands/display-file-commands.handler';
import { setPreferenceChatCommandsDependencies } from '../handlers/chat/preference-chat-commands.handler';
import { setAdvancedCommandsDependencies } from '../handlers/commands/advanced-commands.handler';
import { setMessageCommandsDependencies } from '../handlers/message/message-commands.handler';
import { setInfoCommandsDependencies } from '../handlers/commands/info-commands.handler';
import { setUtilityCommandsDependencies } from '../handlers/commands/utility-commands.handler';
import { setSysopCommandsDependencies } from '../handlers/commands/sysop-commands.handler';
import { setTransferMiscCommandsDependencies } from '../handlers/commands/transfer-misc-commands.handler';
import { setMessagingDependencies, setMoveEditDependencies } from '../handlers/message/messaging.handler';
import {
  setFileAreas,
  setFileEntries,
  setDatabase as setDatabaseForFileHandler,
  setCallersLog,
  setGetUserStats,
  setFileMaintenanceDependencies,
  displayUploadInterface,
  displayDownloadInterface,
  displayNewFiles
} from '../handlers/file/file.handler';
import { setMessageEntryDependencies } from '../handlers/message/message-entry.handler';
import { displayAccountEditingMenu, setDatabase as setDatabaseForAccountHandler } from '../handlers/user/account.handler';
import {
  setDoors,
  getDoors,
  setDoorSessions,
  getDoorSessions,
  setDatabase as setDatabaseForDoorHandler,
  setHelpers as setHelpersForDoorHandler,
  setConstants as setConstantsForDoorHandler,
  initializeDoors,
  executeDoor,
  executePagerDoor
} from '../handlers/door.handler';
import { initializeDoorCache } from '../doors/amigaDoorManager';
import {
  setChatState,
  setConstants as setConstantsForChatHandler,
  setHelpers as setHelpersForChatHandler
} from '../handlers/chat/chat.handler';
import {
  setDatabase as setDatabaseForCommandHandler,
  setConfig,
  setConferences as setConferencesForCommandHandler,
  setMessageBases as setMessageBasesForCommandHandler,
  setFileAreas as setFileAreasForCommandHandler,
  setProcessOlmMessageQueue,
  setCheckSecurity,
  setSetEnvStat,
  setGetRecentCallerActivity as setGetRecentCallerActivityForCommandHandler,
  setDoors as setDoorsForCommandHandler,
  setConstants as setConstantsForCommandHandler,
  loadCommands,
  setCommandExecutionDependencies,
  processBBSCommand,
  displayMainMenu
} from '../handlers/command.handler';
import {
  setConstants as setConstantsForMenuDependencies
} from '../handlers/command-handler/dependency-injection';
import { checkSecurity, setEnvStat } from '../utils/security.util';
import { getMailStatFile, loadMsgPointers, validatePointers, updateReadPointer } from '../utils/message-pointers.util';
import { findSecurityScreen } from '../utils/screen-security.util';
import { searchFileDescriptions } from './database-helpers';

const AROS_ROM_FILES = ['aros-rom.bin', 'aros-ext.bin'];

function ensureArosRomsAvailable(): void {
  try {
    const bbsRoot = process.env.BBS_ROOT || process.env.BBS_DATA_DIR || config.get('dataDir');
    const targetDir = path.resolve(bbsRoot, 'data', 'amiga-roms');
    const sourceCandidates = [
      path.resolve(__dirname, '../data/amiga-roms'),
      path.resolve(__dirname, '../../data/amiga-roms'),
      path.resolve(bbsRoot, 'web/backend/data/amiga-roms'),
      path.resolve(process.cwd(), 'web/backend/data/amiga-roms')
    ];

    let sourceDir: string | null = null;
    for (const candidate of sourceCandidates) {
      const hasAll = AROS_ROM_FILES.every((file) => fs.existsSync(path.join(candidate, file)));
      if (hasAll) {
        sourceDir = candidate;
        break;
      }
    }

    if (!sourceDir) {
console.warn('[AROS] AROS ROMs not found in web/backend/data; skipping copy');
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of AROS_ROM_FILES) {
      const src = path.join(sourceDir, file);
      const dest = path.join(targetDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
  } catch (error) {
console.warn('[AROS] Failed to copy AROS ROMs:', error);
  }
}

/**
 * Data Initialization and Dependency Injection
 *
 * This module handles:
 * - Database initialization
 * - Default data creation
 * - Webhook configuration
 * - Dependency injection for all handlers
 */

// Screen name constants (like express.e SCREEN_* constants)
const SCREEN_BULL = 'BULL';
const SCREEN_NODE_BULL = 'NODE_BULL';
const SCREEN_CONF_BULL = 'CONF_BULL';
const SCREEN_MENU = 'MENU';

// Chat system state (mirrors AmiExpress chatFlag, sysopAvail, pagedFlag)
export let chatState: ChatState = {
  sysopAvailable: true, // Like AmiExpress sysopAvail - F7 toggle
  activeSessions: [],
  pagingUsers: [],
  chatToggle: true // Like AmiExpress F7 chat toggle
};

// Global data caches
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let fileEntries: any[] = [];
let messages: any[] = [];

/**
 * Initialize default webhook from environment variables
 */
async function initializeDefaultWebhook() {
  try {
    const webhookUrl = process.env.BBS_WEBHOOK_URL || process.env.DEPLOY_WEBHOOK_URL;

    if (!webhookUrl) {
      return;
    }

    // Check if any webhooks exist
    const existingWebhooks = await db.getWebhooks();

    if (existingWebhooks.length > 0) {
      return;
    }

    // Create default webhook with all triggers
    const allTriggers = [
      'new_upload',
      'new_message',
      'new_user',
      'sysop_paged',
      'user_login',
      'user_logout',
      'file_downloaded',
      'comment_posted',
      'node_full',
      'system_error',
      'conference_joined',
      'security_changed',
      'door_launched',
      'vote_cast',
      'private_message',
      'user_kicked',
      'mail_scan'
    ];

    const webhookType = webhookUrl.includes('discord.com') ? 'discord' : 'slack';

    await db.createWebhook({
      name: 'BBS Discord Notifications',
      url: webhookUrl,
      type: webhookType,
      triggers: allTriggers
    });

  } catch (error) {
console.error('[Webhook Init] Error initializing default webhook:', error);
  }
}

/**
 * Initialize database and inject dependencies into all handlers
 * @param io - Optional Socket.IO server instance for handlers that need socket access
 */
export async function initializeData(io?: SocketIOServer) {
  try {
    if (io) _io = io;
    ensureArosRomsAvailable();

    // Initialize database schema first
    await db.init();

    // Clear door bundle cache in development to prevent stale bundles
    // In production, cache is kept for performance
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { getClientDoorBundler } = require('../doors/client-door-bundler');
        const bundler = getClientDoorBundler();
        bundler.clearCache();
        console.log('[Server] Cleared door bundle cache (development mode)');
      } catch (error) {
        console.warn('[Server] Failed to clear door bundle cache:', error);
      }
    }

    // Initialize default webhook if configured
    await initializeDefaultWebhook();

    // express.e: cmds.numConf and confNames/confDirs are populated from ConfConfig.info (NCONFS, NAME.n, LOCATION.n)
    // The BBS ALWAYS uses disk files, NOT the database, for conference configuration
    const bbsRoot = process.env.BBS_ROOT || config.get('dataDir');
    console.log(`[INIT] bbsRoot=${bbsRoot}`);
    const confConfig = loadConfConfig(bbsRoot);

    if (confConfig && confConfig.confCount > 0) {
      console.log(`[INIT] Found ${confConfig.confCount} conferences in ConfConfig.info`);
      // Create conferences array from ConfConfig.info (express.e:8499-8512 uses cmds.numConf from this file)
      conferences = [];
      for (let i = 0; i < confConfig.confCount; i++) {
        const entry = confConfig.entries[i];
        conferences.push({
          id: i + 1,
          name: entry.name || `Conference ${i + 1}`,
          location: entry.location || `BBS:Conf${i + 1}/`
        });
      }
    } else {
      // Fallback: check for Conf.DB headers (original AmiExpress format)
      const confDbHeaders = conferenceFileManager.getAllConferenceHeaders();
      if (confDbHeaders.length > 0) {
        conferences = confDbHeaders.map((header: any, i: number) => ({
          id: i + 1,
          name: header.name || `Conference ${i + 1}`,
          location: `BBS:Conf${i + 1}/`
        }));
      } else {
        // Last resort: scan for Conf*.info files on disk
        const confFiles = fs.readdirSync(bbsRoot).filter((f: string) => /^Conf\d+\.info$/.test(f));
        const confNumbers = confFiles.map((f: string) => parseInt(f.match(/\d+/)?.[0] || '0')).filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
        if (confNumbers.length > 0) {
          const maxConf = Math.max(...confNumbers);
          conferences = [];
          for (let i = 1; i <= maxConf; i++) {
            conferences.push({
              id: i,
              name: `Conference ${i}`,
              location: `BBS:Conf${i}/`
            });
          }
        } else {
          // Absolute fallback: use database
          conferences = await db.getConferences();
          if (conferences.length === 0) {
            await db.initializeDefaultData();
            conferences = await db.getConferences();
          }
        }
      }
    }

    // Inject conferences into screen handler
    setConferences(conferences);

    // Load message bases from disk (CRITICAL: Disk-based, not database - CLAUDE.md rule #10)
    // express.e:2048-2112 - Reads from {ConfLocation}/MsgBases.info or defaults to 1 base per conference
    const { MessageBaseLoaderService } = await import('../services/message-base-loader.service.js');
    const messageBaseLoader = new MessageBaseLoaderService(bbsRoot);
    messageBases = messageBaseLoader.loadAllMessageBases(conferences);

    // Inject dependencies into conference handler
    setConferencesForConferenceHandler(conferences);
    setMessageBases(messageBases);
    setDatabase(db);
    setHelpers({ callersLog, loadFlagged, loadHistory });
    setConstants({ SCREEN_BULL, SCREEN_NODE_BULL, SCREEN_CONF_BULL, LoggedOnSubState });

    // Load file areas from disk (express.e:5006, 15264 - reads NDIRS, DLPATH.n, ULPATH.n from Conf*.info)
    fileAreas = loadFileAreasFromDisk(bbsRoot, conferences);
    await ensureRootScreens(bbsRoot);
    await ensureConferenceStructure(bbsRoot, conferences, fileAreas);

    // Load file entries for all file areas
    fileEntries = []; // TODO: Load file entries per-area as needed

    // Inject dependencies into file handler
    setFileAreas(fileAreas);
    setFileEntries(fileEntries);
    setDatabaseForFileHandler(db);
    setCallersLog(callersLog);
    setGetUserStats(getUserStats);

    // Inject file maintenance dependencies
    setFileMaintenanceDependencies({
      searchFilesByName,
      searchFilesAdvanced,
      getFileEntry,
      deleteFileEntry,
      moveFileEntry,
      updateFileDescription,
      getFileAreas
    });

    // Inject message entry dependencies
    setMessageEntryDependencies({
      db,
      callersLog
    });

    // Inject messaging (message reader) dependencies
    setMessagingDependencies({
      db,
      callersLog
    });

    // Load some recent messages
    messages = await db.getMessages(1, 1, { limit: 50 });

    // Load Amiga command definitions (.info and .CMD files) FIRST
    // express.e loads commands at startup for SYSCMD and BBSCMD lookup
    // CRITICAL: Must be called before initializeDoors() so BBSCMD commands are available
    const bbsBaseDir = config.get('dataDir');
    loadCommands(bbsBaseDir, 1, 0); // Load for conference 1, node 0

    // Initialize doors (converts CommandDefinition from BBSCMD to Door objects)
    await initializeDoors();

    // Pre-populate door cache for instant DOORS/DOORMAN command response
    await initializeDoorCache();

    // Inject dependencies into door handler
    // Note: initializeDoors() already sets the doors internally, so we use getDoors()
    setDoors(getDoors());
    setDoorSessions(getDoorSessions());
    setDatabaseForDoorHandler(db);
    setHelpersForDoorHandler({ callersLog, getRecentCallerActivity });
    setConstantsForDoorHandler({ LoggedOnSubState });

    // Inject dependencies into chat handler
    setChatState(chatState);
    setConstantsForChatHandler({ LoggedOnSubState });
    setHelpersForChatHandler({ executePagerDoor, displayMainMenu });

    // Inject dependencies into account handler
    setDatabaseForAccountHandler(db);

    // Inject dependencies into bulletin handler
    setBulletinDependencies(db, parseMciCodes, addAnsiEscapes);

    // Inject dependencies into message scan handler
    setMessageScanDependencies(db, displayScreen, parseMciCodes, addAnsiEscapes, loadScreenFile, conferences, messageBases);

    // Inject dependencies into user commands handler
    setUserCommandsDependencies({
      conferences,
      messageBases,
      db,
      joinConference,
      checkConfAccess,
      displayScreen: displayScreen as any,
      displayUploadInterface: displayUploadInterface as any,
      displayDownloadInterface: displayDownloadInterface as any
    });

    // Inject dependencies into system commands handler
    setSystemCommandsDependencies({
      displayScreen: displayScreen as any,
      findSecurityScreen: findSecurityScreen as any
    });

    // Inject dependencies into navigation commands handler
    setNavigationCommandsDependencies({
      conferences,
      messageBases,
      joinConference,
      checkConfAccess,
      displayNewFiles
    });

    // Inject dependencies into display/file commands handler
    setDisplayFileCommandsDependencies({
      displayScreen,
      findSecurityScreen,
      confScreenDir: path.join(config.get('dataDir'), 'Screens'),
      db,
      hasKeysFile
    });

    // Inject dependencies into preference/chat commands handler
    setPreferenceChatCommandsDependencies({
      startSysopPage: require('../handlers/chat/chat.handler').startSysopPage,
      db
    });

    // Inject dependencies into advanced commands handler
    setAdvancedCommandsDependencies({
      conferences,
      messages,
      checkConfAccess
    });

    // Inject dependencies into message commands handler
    setMessageCommandsDependencies({
      messageBases,
      conferences,
      sessions,
      io: _io || undefined,
      joinConference,
      displayScreen: displayScreen as any,
      resetNewMailScanPointers,
      resetLastMessageReadPointers,
      getConferenceStats,
      updateMessageNumberRange,
      getMailStatFile
    });

    // Inject dependencies into info commands handler
    setInfoCommandsDependencies({
      sessions
    });

    // Inject dependencies into utility commands handler
    setUtilityCommandsDependencies({
      handleGoodbyeCommand,
      messages,
      confScreenDir: path.join(config.get('dataDir'), 'Screens'),
      findSecurityScreen,
      displayScreen: displayScreen as any,
      searchFileDescriptions
    });

    // Inject dependencies into sysop commands handler
    setSysopCommandsDependencies({
      getRecentCallerActivity,
      setEnvStat,
      db
    });

    // Inject dependencies into transfer/misc commands handler
    setTransferMiscCommandsDependencies({
      setEnvStat,
      displayUploadInterface,
      displayDownloadInterface,
      fileAreas,
      getActiveVoteTopics,
      getVoteTopic,
      getVoteQuestions,
      getVoteAnswers,
      hasUserVoted,
      submitVote,
      getVoteStatistics,
      createVoteTopic,
      createVoteQuestion,
      createVoteAnswer,
      deleteVoteTopic,
      getNextTopicNumber
    });

    // Inject dependencies into messaging handler
    setMessagingDependencies({
      setEnvStat,
      messages,
      getMailStatFile,
      loadMsgPointers,
      validatePointers,
      updateReadPointer
    });

    // Inject dependencies for sysop message move/edit commands (M/EH)
    setMoveEditDependencies({
      conferences,
      messageBases
    });

    // Initialize DI container (new Clean Architecture approach)
    initializeContainer({
      db,
      config,
      conferences,
      messageBases,
      fileAreas,
      doors: getDoors(),
      processOlmMessageQueue,
      checkSecurity,
      setEnvStat,
      getRecentCallerActivity,
      constants: { SCREEN_MENU }
    });

    // Inject dependencies into command handler (backward compatibility)
    setDatabaseForCommandHandler(db);
    setConfig(config);
    setConferencesForCommandHandler(conferences);
    setMessageBasesForCommandHandler(messageBases);
    setFileAreasForCommandHandler(fileAreas);
    setProcessOlmMessageQueue(processOlmMessageQueue);
    setCheckSecurity(checkSecurity);
    setSetEnvStat(setEnvStat);
    setGetRecentCallerActivityForCommandHandler(getRecentCallerActivity);
    setDoorsForCommandHandler(getDoors());
    setConstantsForCommandHandler({ SCREEN_MENU });
    setConstantsForMenuDependencies({ SCREEN_MENU });

    // Inject dependencies into command execution handler
    setCommandExecutionDependencies(executeDoor, processBBSCommand);

    process.stdout.write(`[initializeData] Loaded ${conferences.length} conferences, ${messageBases.length} bases, ${fileAreas.length} areas, ${getDoors().length} doors\n`);
  } catch (error) {
    // console.error eliminated to prevent terminal pollution
  }
}

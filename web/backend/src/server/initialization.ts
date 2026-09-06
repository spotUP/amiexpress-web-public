import * as path from 'path';
import * as fs from 'fs';
import { db } from '../database';
import { config } from '../config';
import { initializeContainer } from '../container';
import { loadConfConfig } from '../services/conf-config.service';
import { onConferencesChanged } from '../services/conference-change-bus';
import { expandConferenceAccessTo } from '../services/conference-access-expansion';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { setACSConfig, ToggleFlags } from '../utils/acs.util';
import { conferenceFileManager } from '../services/ConferenceFileManager';
import {
  loadFileAreasFromDisk,
  ensureConferenceStructure,
  ensureRootScreens
} from '../services/file-areas-loader';
import { initStorage } from '../storage';
import { setStorageContext } from '../storage/storage-context';
import { remoteAreaFromDisk } from '../storage/remote-areas';
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
import { setMessageScanDependencies, checkConfAccess } from '../handlers/message/message-scan.handler';
import { setUserCommandsDependencies } from '../handlers/commands/user-commands.handler';
import { setSystemCommandsDependencies, handleGoodbyeCommand } from '../handlers/commands/system-commands.handler';
import { setNavigationCommandsDependencies } from '../handlers/commands/navigation-commands.handler';
import { setDisplayFileCommandsDependencies } from '../handlers/commands/display-file-commands.handler';
import { setPreferenceChatCommandsDependencies } from '../handlers/chat/preference-chat-commands.handler';
import { setAdvancedCommandsDependencies } from '../handlers/commands/advanced-commands.handler';
import { setMessageCommandsDependencies } from '../handlers/message/message-commands.handler';
import { logRetentionService, defaultRetentionTargets } from '../services/LogRetentionService';
import { setInfoCommandsDependencies } from '../handlers/commands/info-commands.handler';
import { setUtilityCommandsDependencies } from '../handlers/commands/utility-commands.handler';
import { setSysopCommandsDependencies } from '../handlers/commands/sysop-commands.handler';
import { setTransferMiscCommandsDependencies } from '../handlers/commands/transfer-misc-commands.handler';
import { setMessagingDependencies, setMoveEditDependencies } from '../handlers/message/messaging.handler';
import {
  setFileAreas,
  setDatabase as setDatabaseForFileHandler,
  setCallersLog,
  setGetUserStats,
  setFileSearchDependencies,
  displayUploadInterface,
  displayDownloadInterface,
  displayNewFiles
} from '../handlers/file/file.handler';
// The FM command lives in its OWN module and has its OWN setter (db/config/
// callersLog). It used to share a name with file.handler's search-function
// setter above, so boot called that one, ticked the box, and left every
// sysop's `FM` throwing on `_config.get('dataDir')`. Imported here under the
// name it actually has, from the module that actually serves FM.
import { setFileMaintenanceDependencies } from '../handlers/file/file-maintenance.handler';
import { setMessageEntryDependencies } from '../handlers/message/message-entry.handler';
import { setMessageForwardDependencies } from '../handlers/message/message-forward.handler';
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
import { getBoardConfig } from '../services/bbs-config-file.service';

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
 * Build the conference list from disk and hand it to everyone who holds one.
 *
 * express.e reads ConfConfig.info at startup and this used to do the same and
 * only that - so the list every handler holds was whatever the file said when
 * the container last started. Renaming a conference in the admin wrote NAME.n
 * to the file correctly and the board went on showing the old name until a
 * deploy happened to restart it. The sysop renamed "Lamer Zone" to
 * "Lamer Zonen", saw it on disk, and saw the old name on J.
 *
 * So this is the one implementation, called at startup AND after any admin
 * write that changes what conferences exist or what they are called. Disk
 * stays the source of truth; the SQLite table and the handlers' arrays are
 * caches of it, and a cache with no way to be invalidated is the bug.
 *
 * It rebuilds the message bases and the file areas too, because a created
 * conference has neither until something loads them, and ensureConferenceStructure
 * is idempotent.
 */
/**
 * Grant every account access to the conferences the board has right now.
 *
 * Boot did this and the refresh did not, so a conference created in the
 * admin was everywhere except in anyone's access string until the next
 * restart. Best-effort: the list is already correct, and a failure here is
 * logged rather than allowed to fail a create.
 */
function expandAccessForCurrentConferences(caller: string): void {
  if (!db || conferences.length === 0) return;
  try {
    const sqlite = (db as any).db;
    if (!sqlite) return;
    const result = expandConferenceAccessTo(sqlite, conferences.length);
    if (result.usersExpanded > 0 || result.newUserDefaultExpanded) {
      process.stdout.write(
        `[${caller}] Expanded conference access to ${conferences.length} conferences for ${result.usersExpanded} user(s)` +
        `${result.newUserDefaultExpanded ? ' and the new-user default' : ''}\n`
      );
    }
  } catch (e) {
    process.stderr.write(`[${caller}] confaccess migration warn: ${e}\n`);
  }
}

/**
 * Swap an array's CONTENTS, keeping the array itself.
 *
 * The conference list is handed to eight consumers at boot - the screen
 * handler, the conference handler, the command handler's DI container, the
 * message scan, the file handlers - and every one of them keeps the reference
 * it was given (`_conferences = deps.conferences`). Rebinding the module-level
 * variable therefore updates nothing but the variable: the board went on
 * listing a conference the sysop had deleted, because every handler was still
 * holding the array from boot.
 *
 * Replacing the contents reaches all of them at once, including the ones this
 * function has never heard of.
 */
function replaceInPlace<T>(target: T[], next: T[]): T[] {
  target.splice(0, target.length, ...next);
  return target;
}

export async function refreshConferencesFromDisk(bbsRootOverride?: string): Promise<any[]> {
  const bbsRoot = bbsRootOverride || process.env.BBS_ROOT || config.get('dataDir');

  const confConfig = loadConfConfig(bbsRoot);

  // Built here, then spliced into the module arrays below. See replaceInPlace:
  // reassigning them strands every handler that already holds the old array.
  let next: any[] = [];

  if (confConfig && confConfig.confCount > 0) {
    console.log(`[INIT] Found ${confConfig.confCount} conferences in ConfConfig.info`);
    // Create conferences array from ConfConfig.info (express.e:8499-8512 uses cmds.numConf from this file)
    next = [];
    for (let i = 0; i < confConfig.confCount; i++) {
      const entry = confConfig.entries[i];
      next.push({
        id: i + 1,
        name: entry.name || `Conference ${i + 1}`,
        location: entry.location || `BBS:Conf${i + 1}/`
      });
    }
  } else {
    // Fallback: check for Conf.DB headers (original AmiExpress format)
    const confDbHeaders = conferenceFileManager.getAllConferenceHeaders();
    if (confDbHeaders.length > 0) {
      next = confDbHeaders.map((header: any, i: number) => ({
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
        next = [];
        for (let i = 1; i <= maxConf; i++) {
          next.push({
            id: i,
            name: `Conference ${i}`,
            location: `BBS:Conf${i}/`
          });
        }
      } else {
        // Absolute fallback: use database
        next = await db.getConferences();
        if (next.length === 0) {
          await db.initializeDefaultData();
          next = await db.getConferences();
        }
      }
    }
  }

  replaceInPlace(conferences, next);

  // Mirror disk conferences into the SQLite `conferences` table so
  // web paths that resolve by conf-id (db.getFileAreas,
  // db.getConferenceById, the admin UI) match what's actually
  // declared in ConfConfig.info. Before this, SQLite carried only
  // the 3 default-seeded rows even on sites declaring 14+ confs on
  // disk, which silently broke per-conf lookups (the "still only 4
  // confs visible" cascade). Disk is the source of truth — this is
  // a one-way mirror, not a reverse sync.
  try {
    const syncResult = await db.syncConferencesFromDisk(
      conferences.map((c: any) => ({ id: c.id, name: c.name, location: c.location })),
      // This IS the whole board, read out of ConfConfig.info a few lines up,
      // so a row the list does not mention is a conference that is gone.
      { complete: true }
    );
    if (syncResult && (syncResult.inserted > 0 || syncResult.renamed > 0 || syncResult.pruned > 0)) {
      console.log(
        `[INIT] Synced conferences table from disk: ${syncResult.inserted} inserted, ${syncResult.renamed} renamed, ${syncResult.pruned} pruned`
      );
    }
  } catch (e: any) {
    console.warn('[INIT] Conferences disk sync failed:', e?.message || e);
  }

  // Inject conferences into screen handler
  setConferences(conferences);

  // Load message bases from disk (CRITICAL: Disk-based, not database - CLAUDE.md rule #10)
  // express.e:2048-2112 - Reads from {ConfLocation}/MsgBases.info or defaults to 1 base per conference
  const { MessageBaseLoaderService } = await import('../services/message-base-loader.service.js');
  const messageBaseLoader = new MessageBaseLoaderService(bbsRoot);
  replaceInPlace(messageBases, messageBaseLoader.loadAllMessageBases(conferences));

  // Inject dependencies into conference handler
  setConferencesForConferenceHandler(conferences);
  setMessageBases(messageBases);

  // Load file areas from disk (express.e:5006, 15264 - reads NDIRS, DLPATH.n, ULPATH.n from Conf*.info)
  replaceInPlace(fileAreas, loadFileAreasFromDisk(bbsRoot, conferences));
  await ensureConferenceStructure(bbsRoot, conferences, fileAreas);

  // Inject dependencies into file handler. The live F-command path reads
  // DIR files from disk via FileListingHandler / readDirFile — there is no
  // per-area in-memory file entry cache.
  setFileAreas(fileAreas);

  expandAccessForCurrentConferences('refreshConferencesFromDisk');

  return conferences;
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

    // Load bbsConfig.info tooltypes into ACS config toggles (express.e sopt.toggles)
    // Done once at startup so all handlers see consistent values via getACSConfig()
    const diskBBSConfig = loadBBSConfig(bbsRoot);
    const acsToggles = new Array(20).fill(false);
    // express.e sopt.toggles[TOGGLES_CREDITBYKB=19]
    if (diskBBSConfig.credit_by_kb) acsToggles[ToggleFlags.CREDITBYKB] = true;
    setACSConfig({ toggles: acsToggles });
    console.log(`[INIT] ACS toggles loaded — CREDITBYKB=${acsToggles[ToggleFlags.CREDITBYKB]}`);

    // Conferences, message bases and file areas, from disk - the same
    // path an admin write re-runs, so a rename reaches the board without
    // a restart. See refreshConferencesFromDisk.
    // The listener FIRST. It used to be registered after ensureRootScreens,
    // so any throw in between left the server up with no listener - every
    // admin write then "succeeded" while nothing reached the board until a
    // restart, silently, which is the original rename bug wearing a new hat.
    onConferencesChanged(async () => {
      await refreshConferencesFromDisk(bbsRoot);
    });

    await refreshConferencesFromDisk(bbsRoot);
    await ensureRootScreens(bbsRoot);

    // Task 12: build the pooled-storage subsystem from Drives.info and make
    // every branch Tasks 8, 9 and 11 built reachable. `initStorage` answers
    // null on a board with no `s3` volume - which is every board this
    // feature has not been asked to touch - and `setStorageContext(null)`
    // is exactly the value `getStorageContext()` already defaults to, so a
    // board with no bucket configured is untouched by this block. `areas`
    // is `fileAreas` (just loaded above by refreshConferencesFromDisk, which
    // also called `setFileAreas(fileAreas)`) mapped to the pool's own shape -
    // the SAME list every other handler was just given, not a second,
    // independently-loaded one that could disagree with it.
    try {
      const storage = await initStorage(bbsRoot, {
        areas: fileAreas.map(remoteAreaFromDisk),
      });
      // Replay uploads a previous run of THIS node staged but never
      // finished - a crash or restart between the staged write and the
      // put leaves a marker in `.pending/` that only a flush replays.
      await storage?.cache.flushPending();
      setStorageContext(storage);
      console.log(
        storage
          ? `[Storage] Pool active - ${storage.volumes.states.filter(s => s.volume.kind === 's3').length} bucket(s) configured`
          : '[Storage] No pooled bucket configured (Drives.info has no DRIVE.n=s3://... entry) - local disk only'
      );
    } catch (error) {
      // Same posture as every other subsystem in this function: surfaced
      // loudly, board keeps booting. A board that cannot build its storage
      // pool still needs to serve local files and accept callers.
      setStorageContext(null);
      const detail = error instanceof Error ? (error.stack || error.message) : String(error);
      console.error(`[Storage] Failed to initialize the storage subsystem - running with no pool:\n${detail}`);
    }

    setDatabase(db);
    setHelpers({ callersLog, loadFlagged, loadHistory });
    setConstants({ SCREEN_BULL, SCREEN_NODE_BULL, SCREEN_CONF_BULL, LoggedOnSubState });
    setDatabaseForFileHandler(db);
    setCallersLog(callersLog);
    setGetUserStats(getUserStats);

    // Inject file search dependencies (file.handler.ts)
    setFileSearchDependencies({
      searchFilesByName,
      searchFilesAdvanced,
      getFileEntry,
      deleteFileEntry,
      moveFileEntry,
      updateFileDescription,
      getFileAreas
    });

    // Inject the FM command's own dependencies (file-maintenance.handler.ts).
    // All three dispatchers - command.handler.ts, command-execution.ts and
    // internal-commands.ts - route `FM` to THAT module, and its very first
    // statement after the ACS check is `_config.get('dataDir')`. Without this
    // call it is undefined and FM throws for every sysop on every board.
    setFileMaintenanceDependencies({
      db,
      config,
      callersLog
    });

    // Inject message entry dependencies
    setMessageEntryDependencies({
      db,
      callersLog
    });

    // Forward + reply-delete handlers extracted from message-entry on
    // round-21 split — same _db reference, separate setter.
    setMessageForwardDependencies({ db });

    // #78 Phase 5 — engine selection + boot the native singleton if
    // the sysop has supplied the binaries. Boot is async and runs
    // in the background so a slow ROM load doesn't block other init
    // steps; once start() + runUntilReady() finish, isReady() flips
    // and subsequent executeScript calls dispatch through native.
    try {
      const { selectAREXXEngine, logEngineSelectionAtStartup } = require('../services/arexx/engine-selector');
      logEngineSelectionAtStartup();
      const choice = selectAREXXEngine();
      if (choice.choice === 'native' || choice.reason.startsWith('auto: binaries parsed')) {
        const { rexxMastService } = require('../services/arexx/rexxmast-service');
        // Fire-and-forget: backend keeps initializing while RexxMast
        // boots in the background. start() and runUntilReady() each
        // complete in a few seconds at most; logged via [AREXX] tag.
        (async () => {
          try {
            const started = await rexxMastService.start();
            if (!started) {
              console.warn(`[AREXX] RexxMast service start failed: ${rexxMastService.getStatus().lastError}`);
              return;
            }
            console.log('[AREXX] RexxMast service started, running until ready...');
            const ready = await rexxMastService.runUntilReady();
            if (ready) {
              console.log('[AREXX] RexxMast READY — native dispatch active');
            } else {
              console.warn(`[AREXX] RexxMast not ready: ${rexxMastService.getStatus().lastError}`);
            }
          } catch (err) {
            console.warn('[AREXX] RexxMast boot threw:', err);
          }
        })();
      }
    } catch (err) {
      console.warn('[AREXX] engine selector probe failed:', err);
    }

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

    // Notice doors installed while the BBS is running. On a real AmiExpress
    // node every command is resolved from disk on each invocation
    // (express.e:4630-4647), so a .info dropped into BBSCmd is live at once;
    // this server loads them once, here. The watcher restores that behaviour
    // for the listing paths, and command-execution.handler.ts's mtime check
    // covers the execution path even if the watcher never fires.
    try {
      const { startBbsCmdWatcher } = require('../handlers/bbscmd-watcher');
      const watched = startBbsCmdWatcher(bbsBaseDir, 1, 0);
      console.log(`[BBSCmd watcher] watching ${watched} command director${watched === 1 ? 'y' : 'ies'}`);
    } catch (err: any) {
      console.log(`[BBSCmd watcher] not started: ${err?.message ?? err}`);
    }

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

    // WEB_: GDPR Phase 4 — bound storage of logs (IPs, handles) via the
    // retention service. Runs a boot pass + a daily scheduled pass.
    try {
      const dataDir = config.get('dataDir');
      const sysCfg = (() => {
        try { return getBoardConfig(config.get('dataDir')); } catch { return null; }
      })();
      const retentionDays = (sysCfg?.log_retention_days as number | undefined) ?? 90;
      // 10 MB per file caps size; retentionDays is the spiritual budget but
      // not enforced as a timestamp filter — this is the "good enough" hobby
      // BBS approach documented in the Phase 4 plan.
      logRetentionService.configure({
        filePaths: defaultRetentionTargets(dataDir),
        maxBytes: 10 * 1024 * 1024,
      });
      logRetentionService.start();
      console.log(`[LogRetention] started — 10 MB cap per log file, retention target ~${retentionDays}d`);
    } catch (retentionError) {
      console.warn('[LogRetention] failed to start:', retentionError);
    }

    process.stdout.write(`[initializeData] Loaded ${conferences.length} conferences, ${messageBases.length} bases, ${fileAreas.length} areas, ${getDoors().length} doors\n`);

    // Access to whatever conferences exist now, for every account. Shared
    // with refreshConferencesFromDisk so a conference created in the admin is
    // visible without a restart - see conference-access-expansion.ts.
    expandAccessForCurrentConferences('initializeData');
  } catch (error) {
    // Surfacing this error: it used to be silently swallowed, which left
    // handlers with uninjected dependencies (e.g. messaging.handler _db)
    // and caused cryptic 'Cannot read properties of undefined' crashes
    // deep in the app. Better to boot loudly-broken than silently-broken.
    const stack = error instanceof Error ? (error.stack || error.message) : String(error);
    process.stderr.write(`[initializeData] FAILED mid-init — some handlers will be unwired:\n${stack}\n`);
  }
}

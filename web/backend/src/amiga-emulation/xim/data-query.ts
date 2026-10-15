/**
 * XIM Data Query Handler
 *
 * Handles all DT_* commands for querying and modifying user data.
 * From E sources (express.e:3494-3981)
 */

import { conferenceSubdir } from '../../conferences/conference-paths';
import { DEFAULT_PAUSE_LINES } from '../../screens/screen-rows';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DoorConstants } from '../DoorTypes';
import { XIMMessage, XIMCommand, BBSSessionData, XIMState, ENVStatus } from './types';
import { XIMMessageParser } from './messages';
import { displayModeOf } from './display-mode.util';
import { ExecLibrary } from '../api/ExecLibrary';
import { editorStructFromDoor, editorStructToDoor, EditorState, EditorStringPool } from './editor-struct';
import { setNewPassword } from '../../services/user-settings/w-password';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { userDatabaseManager } from '../../services/UserDatabaseManager';
import { getSystemTime, toAmigaTime, encodeAmigaDate } from '../../utils/date-time.util';
import { ximLogger } from '../../utils/XIMLogger';
import { debugLog } from '../../utils/debug-log';
import * as amigafs from '../../utils/amigafs';
import { checkSecurity, setUserPermission } from '../../utils/acs.util';
import { formatCDateTime } from '../../utils/date-time.util';
import { getTodaysCalls } from '../../utils/time-tracking.util';
import { calcSizeText } from '../../utils/byte-format.util';

/** express.e:3662 ACTIVE_NODES answers 32 characters, one per node 0..31. */
const ACTIVE_NODE_SLOTS = 32;
import { ACSPermission } from '../../constants/acs-permissions';

/*
 * The date a door is handed is express's, from one place.
 *
 * This file used to carry a `formatCDateTime` of its own that produced
 * "Wkd DD-Mmm-YYYY HH:MM:SS" - which is express's OTHER format,
 * formatLongDateTime (MiscFuncs.e:320-341). DT_STAMP_LASTON and
 * DT_STAMP_CTIME (express.e:3769, :3775) call formatCDateTime, which is
 * MiscFuncs.e:343-364 and reads "Mon Jan 07 14:32:00 2026". Two functions of
 * the same name disagreeing about which format they are is how a door comes
 * to parse a date the real board never sends; both are 24 characters, so
 * WarOLM's `%-24.24s` field is satisfied either way and nothing complained.
 */

export class XIMDataQueryHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  /** The board's copies of the editor object's strings (EDITOR_STRUCT). */
  private editorStrings: EditorStringPool = {};
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;
  private state: XIMState;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    messageParser: XIMMessageParser,
    bbsSession: BBSSessionData,
    state: XIMState
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.messageParser = messageParser;
    this.bbsSession = bbsSession;
    this.state = state;
  }

  /**
   * Handle data query commands
   *
   * Protocol (from aedoor.library.asm lines 381-387):
   * - msg.data = direction flag set by setDT/getDT library functions:
   *   - setDT: D1=0 (WRITE mode) - copy msg.string TO user data field
   *   - getDT: D1=1 (READ mode)  - copy user data field TO msg.string
   *
   * Native convention:
   *   - IF msg.data == 0: WRITE mode (setDT)
   *   - IF msg.data != 0: READ mode (getDT)
   *
   * Return values:
   *   - On success: msg.data unchanged or set to result count
   *   - On carrier lost: msg.data = -1 (0xFFFFFFFF)
   *   - Door's getDT() checks if data < 0, returns null if carrier lost
   */
  handleDataQuery(msg: XIMMessage): void {
    if (process.env.DREWALL_TRACE === '1' && msg.command === XIMCommand.DT_NAME) {
      console.log(`[DT_NAME_DEBUG] handleDataQuery ENTRY cmd=${msg.command} data=${msg.data} isRead=${msg.data !== 0}`);
    }
debugLog(`[XIMDataQuery] Door querying data: ${this.messageParser.getCommandName(msg.command)}`);
debugLog(`  msg.data (direction): ${msg.data} (${msg.data !== 0 ? 'READ' : 'WRITE'})`);

    // CRITICAL FIX: string[200] is embedded in jhMessage at offset 20, NOT a pointer
    const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
debugLog(`  String address: 0x${stringAddr.toString(16)} (embedded in message)`);

    const isRead = msg.data !== 0;
    const user = this.bbsSession?.user;
    // express.e preserves msg.data unless a command explicitly overrides it.
    let replyData = typeof msg.data === 'number' ? msg.data : 0;

    switch (msg.command) {
      case XIMCommand.DT_NAME:
        if (isRead) {
          // DEBUG dRE!WAll: diagnose why username comes back empty
          if (process.env.DREWALL_TRACE === '1') {
            const uAny: any = user;
            console.log(`[DT_NAME_DEBUG] isRead=true user=${user ? 'set' : 'UNDEFINED'} username="${uAny?.username ?? '<none>'}" doorCommand="${(this.bbsSession as any).doorCommand}" msgAddr=0x${msg.msgAddr.toString(16)} stringAddr=0x${stringAddr.toString(16)}`);
          }
          // Context-aware handling: For file scanning doors (FR, N, F, CS, etc.),
          // DT_NAME returns number of files in current directory, not username
          const doorCommand = (this.bbsSession as any).doorCommand?.toUpperCase();
          const isFileScanDoor = doorCommand && ['FR', 'N', 'F', 'CS', 'SCAN', 'NSU'].includes(doorCommand);

          if (isFileScanDoor) {
            // Return file count from current conference's NumULs file
            const confNum = (this.bbsSession as any).conferenceNumber || 1;
            const bbsRoot = (this.bbsSession as any).bbsRoot || process.cwd();
            // A conference lives wherever ConfConfig.info's LOCATION.n says,
            // not necessarily in Conf<n> - resolve it, never build the name.
            const numULsPath = conferenceSubdir(bbsRoot, confNum, 'NumULs');

            let fileCount = '0';
            try {
              if (amigafs.existsSync(numULsPath)) {
                fileCount = (amigafs.readFileSync(numULsPath, 'utf8') as string).trim();
              }
            } catch (err) {
console.error(`  [READ] DT_NAME: Failed to read NumULs from ${numULsPath}:`, err);
            }

            this.messageParser.writeString(stringAddr, fileCount, 31);
            const verify = this.messageParser.readString(stringAddr, 31);
debugLog(`  [READ] DT_NAME verify buffer: "${verify}"`);
debugLog(`  [READ] DT_NAME (file scan context): "${fileCount}" files in Conf${confNum}`);
          } else {
            // Normal context: return username
            const username = user?.username || 'Guest';
            // CRITICAL FIX 2026-01-15: Use writeMessageString to update BOTH embedded buffer AND strPtr
            // Some doors (like dRE!WAll) read the username via strPtr, not the embedded buffer.
            // Without this fix, doors get garbage/empty username and fail to save user entries.
            this.messageParser.writeMessageString(msg.msgAddr, username);

            // Also clear the rest of the buffer to avoid garbage data confusing doors
            // that might read fixed-length fields
            for (let i = username.length + 1; i < 32; i++) {
              this.emulator.writeMemory(stringAddr + i, 0);
            }

            const verify = this.messageParser.readString(stringAddr, 31);
            if (process.env.DREWALL_TRACE === '1') {
              console.log(`[DT_NAME_DEBUG] WROTE username="${username}" verify="${verify}" replyData=${replyData}`);
            }
debugLog(`  [READ] DT_NAME verify buffer: "${verify}"`);
debugLog(`  [READ] DT_NAME: "${username}"`);
          }
        } else {
          const newName = this.messageParser.readString(stringAddr, 31);
          if (user) user.username = newName;
debugLog(`  [WRITE] DT_NAME: "${newName}"`);
        }
        break;

      case XIMCommand.DT_PASSWORD:
        if (isRead) {
          // express.e: doors cannot read passwords; return empty
          this.messageParser.writeString(stringAddr, '', 40);
debugLog(`  [READ] DT_PASSWORD: (blocked)`);
        } else {
          const newPwd = this.messageParser.readString(stringAddr, 40);
          // express.e:3508 IF StrLen(tempstring)>0 - an empty string sets nothing.
          if (user && newPwd.length > 0) {
            try {
              setNewPassword(user as never, newPwd);
              // Retain plaintext only if other paths expect it (some importers do)
              user.password = newPwd;
              (user as any).pwdType = 1; // bcrypt
            } catch (err) {
console.error('[XIMDataQuery] Failed to hash password:', err);
              SysopDebugUtil.debug(
                null,
                this.bbsSession,
                'XIM Protocol',
                `Failed to hash user password in DT_PASSWORD handler`,
                {
                  error: err instanceof Error ? err.message : String(err),
                  username: user?.username || 'unknown'
                },
                DebugSeverity.CRITICAL
              );
            }
          }
debugLog(`  [WRITE] DT_PASSWORD set (length=${newPwd.length})`);
        }
        break;

      case XIMCommand.DT_LOCATION:
        if (isRead) {
          const location = user?.location || 'Unknown';
          // CRITICAL FIX 2026-01-15: Use writeMessageString to update BOTH embedded buffer AND strPtr
          // Some doors read the location via strPtr, not the embedded buffer.
          this.messageParser.writeMessageString(msg.msgAddr, location);
          // Also clear the rest of the buffer to avoid garbage data
          for (let i = location.length + 1; i < 32; i++) {
            this.emulator.writeMemory(stringAddr + i, 0);
          }
debugLog(`  [READ] DT_LOCATION: "${location}"`);
        } else {
          const newLocation = this.messageParser.readString(stringAddr, 30);
          if (user) user.location = newLocation;
debugLog(`  [WRITE] DT_LOCATION: "${newLocation}"`);
        }
        break;

      /**
       * This board's own command: the caller's theme, read or written.
       *
       * A 68K door can draw in the board's theme already - the tokens reach
       * it through sdk/c - but had no way to CHANGE one, because express.e
       * has no user-field write for something it never had. A C theme picker
       * could list seven themes and keep none.
       *
       * The write goes through the same resolve-then-store the TypeScript
       * setTheme does (doors/BBSApi.ts): an id this board does not have
       * becomes classic rather than being stored, so a door cannot leave a
       * value in the row that nothing can render.
       */
      case XIMCommand.AEW_THEME:
        if (isRead) {
          const themeId = String((user as any)?.themePreference || 'classic');
          this.messageParser.writeMessageString(msg.msgAddr, themeId);
          for (let i = themeId.length + 1; i < 32; i++) {
            this.emulator.writeMemory(stringAddr + i, 0);
          }
debugLog(`  [READ] AEW_THEME: "${themeId}"`);
        } else {
          const asked = this.messageParser.readString(stringAddr, 30);
          const { themeById } = require('@amiexpress/bbs-door-sdk/engines/ui/theme');
          const resolved = themeById(asked);

          if (user) {
            (user as any).themePreference = resolved.id;
            // Persisted the way every other user change is. A door that set a
            // theme and lost it on hangup would be worse than no door.
            try {
              const { db } = require('../../database');
              void db.updateUser((user as any).id, { themePreference: resolved.id });
            } catch (error) {
              // A door must not die because the row could not be written; the
              // session still has the theme for as long as the caller is on.
console.error('[XIMDataQuery] AEW_THEME: could not persist:', error);
            }
          }
debugLog(`  [WRITE] AEW_THEME: asked "${asked}", stored "${resolved.id}"`);
        }
        break;

      /**
       * This board's own command: the KIND of screen, not its size.
       *
       * Read-only. The caller picked it at the graphics prompt and a door
       * has no business overruling it - unlike AEW_THEME above, which is a
       * preference a door may legitimately set on the caller's behalf.
       */
      case XIMCommand.AEW_DISPLAYMODE: {
        const mode = displayModeOf(this.bbsSession);
        this.messageParser.writeMessageString(msg.msgAddr, mode);
        for (let i = mode.length + 1; i < 32; i++) {
          this.emulator.writeMemory(stringAddr + i, 0);
        }
debugLog(`  [READ] AEW_DISPLAYMODE: "${mode}"`);
        break;
      }

      case XIMCommand.DT_PHONENUMBER:
        if (isRead) {
          const phone = user?.phone || '';
          this.messageParser.writeString(stringAddr, phone, 13);
debugLog(`  [READ] DT_PHONENUMBER: "${phone}"`);
        } else {
          const newPhone = this.messageParser.readString(stringAddr, 13);
          if (user) user.phone = newPhone;
debugLog(`  [WRITE] DT_PHONENUMBER: "${newPhone}"`);
        }
        break;

      case XIMCommand.DT_REALNAME:
        if (isRead) {
          const realname = user?.realname || '';
          this.messageParser.writeString(stringAddr, realname, 26);
debugLog(`  [READ] DT_REALNAME: "${realname}"`);
        } else {
          const newRealname = this.messageParser.readString(stringAddr, 26);
          if (user) user.realname = newRealname;
debugLog(`  [WRITE] DT_REALNAME: "${newRealname}"`);
        }
        break;

      case XIMCommand.DT_SLOTNUMBER:
        // Per doordocs.txt (AmiExpress 2.20): Originally read-only (msg->Data = 1 only)
        // We allow write for extended compatibility with later doors
        if (isRead) {
          const sessionSlot = Number((this.bbsSession as any)?.userSlotNumber);
          const userSlot = Number((user as any)?.slotNumber);
          const slotNum =
            Number.isFinite(sessionSlot) && sessionSlot > 0
              ? sessionSlot
              : Number.isFinite(userSlot) && userSlot > 0
                ? userSlot
                : 0;
          this.messageParser.writeString(stringAddr, slotNum.toString(), 200);
debugLog(`  [READ] DT_SLOTNUMBER: ${slotNum}`);
        } else {
          // Extended: allow write for compatibility with later AmiExpress versions
          const newSlot = parseInt(this.messageParser.readString(stringAddr, 200));
          if (Number.isFinite(newSlot)) {
            if (user) (user as any).slotNumber = newSlot;
            (this.bbsSession as any).userSlotNumber = newSlot;
          }
debugLog(`  [WRITE] DT_SLOTNUMBER: ${newSlot}`);
        }
        break;

      case XIMCommand.DT_SECSTATUS:
        if (isRead) {
          const secLevel = user?.secLevel || 10;
          // CRITICAL FIX 2026-01-15: Use writeMessageString to update BOTH embedded buffer AND strPtr
          // Some doors read security status via strPtr
          this.messageParser.writeMessageString(msg.msgAddr, secLevel.toString());
debugLog(`  [READ] DT_SECSTATUS: ${secLevel}`);
        } else {
          const newLevel = parseInt(this.messageParser.readString(stringAddr, 200));
          if (user) user.secLevel = newLevel;
debugLog(`  [WRITE] DT_SECSTATUS: ${newLevel}`);
        }
        break;

      case XIMCommand.ENVSTAT:
        // Environment status - returns current BBS activity state
        // Used by doors like AquaScan to determine BBS context (files, mail, etc.)
        // Per assembly (aedoor.i): return -1 (ENV_DROPPED) when carrier lost
        if (isRead) {
          if (this.state.carrierDropped) {
            this.messageParser.writeString(stringAddr, ENVStatus.ENV_DROPPED.toString(), 200);
debugLog(`  [READ] ENVSTAT: ${ENVStatus.ENV_DROPPED} (carrier dropped)`);
          } else {
            const envStat = (this.bbsSession as any).currentStat || ENVStatus.ENV_IDLE;
            this.messageParser.writeString(stringAddr, envStat.toString(), 200);
debugLog(`  [READ] ENVSTAT: ${envStat}`);
          }
        } else {
          const newStat = parseInt(this.messageParser.readString(stringAddr, 200)) || ENVStatus.ENV_IDLE;
          (this.bbsSession as any).currentStat = newStat;
debugLog(`  [WRITE] ENVSTAT: ${newStat}`);
        }
        break;

      case XIMCommand.DT_SECBOARD:
        if (isRead) {
          const secBoard = user?.secBoard || 0;
          this.messageParser.writeString(stringAddr, secBoard.toString(), 200);
debugLog(`  [READ] DT_SECBOARD: ${secBoard}`);
        } else {
          const newSec = parseInt(this.messageParser.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secBoard = newSec;
debugLog(`  [WRITE] DT_SECBOARD: ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECLIBRARY:
        if (isRead) {
          const secLibrary = user?.secLibrary || 0;
          this.messageParser.writeString(stringAddr, secLibrary.toString(), 200);
debugLog(`  [READ] DT_SECLIBRARY: ${secLibrary}`);
        } else {
          const newSec = parseInt(this.messageParser.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secLibrary = newSec;
debugLog(`  [WRITE] DT_SECLIBRARY: ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECBULLETIN:
        if (isRead) {
          const secBulletin = user?.secBulletin || 0;
          this.messageParser.writeString(stringAddr, secBulletin.toString(), 200);
debugLog(`  [READ] DT_SECBULLETIN: ${secBulletin}`);
        } else {
          const newSec = parseInt(this.messageParser.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secBulletin = newSec;
debugLog(`  [WRITE] DT_SECBULLETIN: ${newSec}`);
        }
        break;

      case XIMCommand.DT_TIMELIMIT:
        if (isRead) {
          const timeLimit = user?.timeLimit || 60;
          this.messageParser.writeString(stringAddr, timeLimit.toString(), 200);
debugLog(`  [READ] DT_TIMELIMIT: ${timeLimit}`);
        } else {
          const newLimit = parseInt(this.messageParser.readString(stringAddr, 200));
          if (user) user.timeLimit = newLimit;
debugLog(`  [WRITE] DT_TIMELIMIT: ${newLimit}`);
        }
        break;

      case XIMCommand.DT_LINELENGTH:
        // express.e:3653-3660: userLineLen = screen HEIGHT in lines (NOT character width)
        // This controls pagination ("More?" prompts)
        if (isRead) {
          const lineLen = this.state.pauseLines ||
                          (this.bbsSession as any)?.pauseLines ||
                          user?.linesPerScreen ||
                          (user as any)?.pageLength ||
                          DEFAULT_PAUSE_LINES;
          // CRITICAL: Use writeMessageString to update BOTH embedded buffer AND strPtr
          // Some doors (like JoinCnf) read via strPtr, not the embedded buffer
          this.messageParser.writeMessageString(msg.msgAddr, lineLen.toString());
          const verify = this.messageParser.readString(stringAddr, 200);
debugLog(`  [READ] DT_LINELENGTH verify buffer: "${verify}"`);
debugLog(`  [READ] DT_LINELENGTH: ${lineLen} (screen height in lines)`);
        } else {
          const newLen = parseInt(this.messageParser.readString(stringAddr, 200));
          if (user) {
            user.linesPerScreen = newLen;
            (user as any).pageLength = newLen;
          }
          this.state.pauseLines = Number.isFinite(newLen) ? newLen : this.state.pauseLines;
debugLog(`  [WRITE] DT_LINELENGTH: ${newLen}`);
        }
        break;

      case XIMCommand.DT_EXPERT:
        if (isRead) {
          const expert = user?.expert === 'X' ? 'X' : 'N';
          this.messageParser.writeString(stringAddr, expert, 200);
debugLog(`  [READ] DT_EXPERT: ${expert}`);
        } else {
          const expertStr = this.messageParser.readString(stringAddr, 1);
          if (user) user.expert = (expertStr === 'X' || expertStr === 'x') ? 'X' : 'N';
debugLog(`  [WRITE] DT_EXPERT: ${expertStr}`);
        }
        break;

      case XIMCommand.DT_MESSAGESPOSTED:
        {
          // Read from disk (user.data) via diskUserStats, not from session.user (database)
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const msgs = diskStats?.messagesPosted ?? user?.messagesPosted ?? 0;
            this.messageParser.writeString(stringAddr, msgs.toString(), 200);
debugLog(`  [READ] DT_MESSAGESPOSTED: ${msgs} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newMsgs = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newMsgs)) {
              if (user) user.messagesPosted = newMsgs;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'messagesPosted', newMsgs);
            }
debugLog(`  [WRITE] DT_MESSAGESPOSTED: ${newMsgs}`);
          }
        }
        break;

      case XIMCommand.DT_UPLOADS:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const uploads = diskStats?.uploads ?? user?.uploads ?? 0;
            this.messageParser.writeString(stringAddr, uploads.toString(), 200);
debugLog(`  [READ] DT_UPLOADS: ${uploads} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newUploads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newUploads)) {
              if (user) user.uploads = newUploads;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'uploads', newUploads);
            }
debugLog(`  [WRITE] DT_UPLOADS: ${newUploads}`);
          }
        }
        break;

      case XIMCommand.DT_DOWNLOADS:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const downloads = diskStats?.downloads ?? user?.downloads ?? 0;
            this.messageParser.writeString(stringAddr, downloads.toString(), 200);
debugLog(`  [READ] DT_DOWNLOADS: ${downloads} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newDownloads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newDownloads)) {
              if (user) user.downloads = newDownloads;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'downloads', newDownloads);
            }
debugLog(`  [WRITE] DT_DOWNLOADS: ${newDownloads}`);
          }
        }
        break;

      case XIMCommand.DT_TIMESCALLED:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const calls = diskStats?.timesCalled ?? user?.timesCalled ?? 0;
            this.messageParser.writeString(stringAddr, calls.toString(), 200);
debugLog(`  [READ] DT_TIMESCALLED: ${calls} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newCalls = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newCalls)) {
              if (user) user.timesCalled = newCalls;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timesCalled', newCalls);
            }
debugLog(`  [WRITE] DT_TIMESCALLED: ${newCalls}`);
          }
        }
        break;

      case XIMCommand.DT_TIMELASTON:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          // express.e:3588-3593 hands the door `loggedOnUser.timeLastOn` as it
          // is stored - getSystemTime()'s form (MiscFuncs.e:463-469), which
          // the record now holds too (date-time.util.ts toAmigaTime) - and
          // stores what the door sends back the same way. No conversion in
          // either direction: AquaScan runs dateTimeToDateStamp on it itself.
          if (isRead) {
            const rawDisk = diskStats?.timeLastOn ?? 0;
            let cTime: number;
            if (rawDisk > 0) {
              cTime = rawDisk;
            } else if (user?.lastLogin) {
              const raw = (user as any).lastLogin;
              cTime = encodeAmigaDate(typeof raw === 'number' ? raw : new Date(raw));
            } else {
              cTime = toAmigaTime(new Date());
            }
            this.messageParser.writeString(stringAddr, cTime.toString(), 200);
console.log(`[DT_TIMELASTON] rawDisk=${rawDisk} cTime=${cTime} user.lastLogin=${(user as any)?.lastLogin}`);
          } else {
            const cTime = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(cTime)) {
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timeLastOn', Math.max(0, cTime));
            }
debugLog(`  [WRITE] DT_TIMELASTON: cTime=${cTime}`);
          }
        }
        break;

      case XIMCommand.DT_TIMEUSED:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const timeUsed = diskStats?.timeUsed ?? user?.timeUsed ?? 0;
            this.messageParser.writeString(stringAddr, timeUsed.toString(), 200);
debugLog(`  [READ] DT_TIMEUSED: ${timeUsed} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newTimeUsed = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newTimeUsed)) {
              if (user) user.timeUsed = newTimeUsed;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timeUsed', newTimeUsed);
            }
debugLog(`  [WRITE] DT_TIMEUSED: ${newTimeUsed}`);
          }
        }
        break;

      case XIMCommand.DT_TIMETOTAL:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const timeTotal = diskStats?.timeTotal ?? user?.timeTotal ?? 0;
            this.messageParser.writeString(stringAddr, timeTotal.toString(), 200);
debugLog(`  [READ] DT_TIMETOTAL: ${timeTotal} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newTimeTotal = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newTimeTotal)) {
              if (user) user.timeTotal = newTimeTotal;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timeTotal', newTimeTotal);
            }
debugLog(`  [WRITE] DT_TIMETOTAL: ${newTimeTotal}`);
          }
        }
        break;

      case XIMCommand.DT_BYTESUPLOAD:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const bytesUp = diskStats?.bytesUpload ?? user?.bytesUpload ?? 0;
            this.messageParser.writeString(stringAddr, bytesUp.toString(), 200);
debugLog(`  [READ] DT_BYTESUPLOAD: ${bytesUp} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes)) {
              if (user) user.bytesUpload = newBytes;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'bytesUpload', newBytes);
            }
debugLog(`  [WRITE] DT_BYTESUPLOAD: ${newBytes}`);
          }
        }
        break;

      case XIMCommand.DT_BYTEDOWNLOAD:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const bytesDown = diskStats?.bytesDownload ?? user?.bytesDownload ?? 0;
            this.messageParser.writeString(stringAddr, bytesDown.toString(), 200);
debugLog(`  [READ] DT_BYTEDOWNLOAD: ${bytesDown} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes)) {
              if (user) user.bytesDownload = newBytes;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'bytesDownload', newBytes);
            }
debugLog(`  [WRITE] DT_BYTEDOWNLOAD: ${newBytes}`);
          }
        }
        break;

      case XIMCommand.DT_DAILYBYTELIMIT:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const limit = diskStats?.dailyBytesLimit ?? user?.dailyBytesLimit ?? 0;
            this.messageParser.writeString(stringAddr, limit.toString(), 200);
debugLog(`  [READ] DT_DAILYBYTELIMIT: ${limit} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newLimit = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newLimit)) {
              if (user) user.dailyBytesLimit = newLimit;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'dailyBytesLimit', newLimit);
            }
debugLog(`  [WRITE] DT_DAILYBYTELIMIT: ${newLimit}`);
          }
        }
        break;

      case XIMCommand.DT_DAILYBYTEDLD:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          // 0 is not a slot: records are 1-indexed (UserDatabaseManager).
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? 0;
          if (isRead) {
            const dailyDld = diskStats?.dailyBytesDld ?? user?.dailyBytesDld ?? 0;
            this.messageParser.writeString(stringAddr, dailyDld.toString(), 200);
debugLog(`  [READ] DT_DAILYBYTEDLD: ${dailyDld} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newDld = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newDld)) {
              if (user) user.dailyBytesDld = newDld;
              if (userSlot > 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'dailyBytesDld', newDld);
            }
debugLog(`  [WRITE] DT_DAILYBYTEDLD: ${newDld}`);
          }
        }
        break;

      case XIMCommand.DT_HOSTNAME:
        if (isRead) {
          const hostname = this.bbsSession?.hostname || 'localhost';
          this.messageParser.writeString(stringAddr, hostname, 200);
debugLog(`  [READ] DT_HOSTNAME: "${hostname}"`);
        }
        break;

      case XIMCommand.DT_HOSTIP:
        if (isRead) {
          const hostip = this.bbsSession?.hostip || '127.0.0.1';
          this.messageParser.writeString(stringAddr, hostip, 200);
debugLog(`  [READ] DT_HOSTIP: "${hostip}"`);
        }
        break;

      case XIMCommand.DT_STAMP_LASTON:
        if (isRead) {
          // express.e:3769 formatCDateTime(loggedOnUser.timeLastOn,tempstring)
          // 24-char field: WarOLM and other doors embed the result in a
          // %-24.24s slot. Format: "Wkd DD-Mmm-YYYY HH:MM:SS".
          let amigaDate = 'Thu 01-Jan-1970 00:00:00';
          if (user?.lastLogin || user?.timeLastOn) {
            const raw = user.lastLogin || user.timeLastOn;
            // user.lastLogin is Unix SECONDS in our DB; new Date() expects ms
            const d = typeof raw === 'number'
              ? new Date(raw * 1000)
              : new Date(raw as any);
            amigaDate = formatCDateTime(d);
          }
          this.messageParser.writeString(stringAddr, amigaDate, 200);
debugLog(`  [READ] DT_STAMP_LASTON: "${amigaDate}"`);
        }
        break;

      case XIMCommand.DT_STAMP_CTIME:
        if (isRead) {
          // express.e:3775 formatCDateTime(getSystemTime(),tempstring)
          const amigaDate = formatCDateTime(getSystemTime());
          this.messageParser.writeString(stringAddr, amigaDate, 200);
debugLog(`  [READ] DT_STAMP_CTIME: "${amigaDate}"`);
        }
        break;

      case XIMCommand.DT_CURR_TIME:
        if (isRead) {
          // express.e:3772 StringF(tempstring,'\d',getSystemTime()) - the
          // stored-date form, so a door that writes it into a HeaderFile
          // (the SUBS door does) writes what express.e would.
          const currTime = toAmigaTime(new Date());
          this.messageParser.writeString(stringAddr, currTime.toString(), 200);
debugLog(`  [READ] DT_CURR_TIME: ${currTime}`);
        }
        break;

      case XIMCommand.DT_TIMEOUT:
        if (isRead) {
          const timeout = (this.state as any).doorTimeout || (this.state as any).timeoutSeconds || 300;
          this.messageParser.writeString(stringAddr, timeout.toString(), 200);
debugLog(`  [READ] DT_TIMEOUT: ${timeout}`);
        } else {
          const newTimeout = parseInt(this.messageParser.readString(stringAddr, 200));
          (this.state as any).doorTimeout = newTimeout;
debugLog(`  [WRITE] DT_TIMEOUT: ${newTimeout}`);
        }
        break;

      case XIMCommand.DT_CONFACCESS:
        // express.e:3777-3778: Uses up to 10 bytes for conferences 1-10
        // For 25 conferences (1-25), use DT_CONFACCESS2 instead!
        //
        // WEB_*: AquaScan v1.0 (1994) uses DT_CONFACCESS as the user's ACCESS AREA NAME
        // (e.g. "Sysop", "Elite", "Lamer") to look up BBS:ACCESS/AREA.<name>.info.
        // express.e:3778 stores X-flag strings in loggedOnUser.conferenceAccess, but
        // older AmiExpress / reference-boardBBS versions stored the named area there instead.
        // We return areaName when set (and derive it from secLevel when not), so that
        // AquaScan CS can load the correct conference list from ACCESS/AREA.<name>.info.
        // Doors that actually need X-flags (DT_CONFACCESS2 covers 25 conferences anyway)
        // should use DT_CONFACCESS2 instead.
        if (isRead) {
          // WEB_*: Return area name if available — AquaScan CS uses this as a path component
          const sessionAny = this.bbsSession as any;
          const areaName: string = sessionAny?.user?.areaName || sessionAny?.areaName || '';
          const secLevel: number = sessionAny?.user?.secLevel ?? sessionAny?.secLevel ?? 0;

          if (areaName && areaName.trim().length > 0) {
            // Named area is set — return it directly (AquaScan CS path component)
            const trimmed = areaName.trim().slice(0, 10);
            this.messageParser.writeMessageString(msg.msgAddr, trimmed);
debugLog(`  [READ] DT_CONFACCESS (areaName): "${trimmed}"`);
          } else {
            // Derive area name from security level as a fallback
            // WEB_*: thresholds match the ACCESS/ACS.*.info files present in ACCESS/
            let derived: string;
            if (secLevel >= 255) derived = 'Sysop';
            else if (secLevel >= 100) derived = 'Elite';
            else if (secLevel >= 20) derived = 'Lamer';
            else if (secLevel > 0) derived = 'Disabled';
            else {
              // No sec level — fall back to X-flag string (express.e behavior)
              let confAccess = sessionAny?.confAccess || this.state.confAccess || '';
              if (confAccess.length === 0) confAccess = 'XX';
              derived = confAccess.slice(0, 10);
            }
            this.messageParser.writeMessageString(msg.msgAddr, derived);
debugLog(`  [READ] DT_CONFACCESS (derived from secLevel=${secLevel}): "${derived}"`);
          }
        } else {
          // Write operation - accept up to 10 characters (express.e semantics)
          const newAccess = this.messageParser.readString(stringAddr, 10);
          this.state.confAccess = newAccess;
          (this.bbsSession as any).confAccess = newAccess;
debugLog(`  [WRITE] DT_CONFACCESS: "${newAccess}" (${newAccess.length} chars)`);
        }
        break;

      case XIMCommand.DT_LANGUAGE:
        if (isRead) {
          const language = this.state.language || 'txt';
          this.messageParser.writeString(stringAddr, language, 200);
debugLog(`  [READ] DT_LANGUAGE: "${language}"`);
        } else {
          const newLang = this.messageParser.readString(stringAddr, 200);
          this.state.language = newLang || 'txt';
          if (user) (user as any).language = newLang;
debugLog(`  [WRITE] DT_LANGUAGE: "${newLang}"`);
        }
        break;

      case XIMCommand.DT_ISANSI:
        {
          // express.e:3907 IF ansiColour THEN msg.data:=1 ELSE msg.data:=0 -
          // the answer is msg.data, and it is the caller's mode (`user?.ansi
          // || true` said ANSI to everyone).
          const session = this.bbsSession as { ansiMode?: boolean } | undefined;
          const isAnsi = (session?.ansiMode ?? user?.ansi) !== false;
          replyData = isAnsi ? 1 : 0;
debugLog(`  [READ] DT_ISANSI: ${replyData}`);
        }
        break;

      case XIMCommand.DT_ANSICOLOR:
        {
          // express.e:3904-3906: the door switches this call's colour -
          // ansiColour := data<>0, and data=2 is RIP. The session only; M is
          // what saves a caller's choice.
          const session = this.bbsSession as { ansiMode?: boolean; ripMode?: boolean } | undefined;
          const on = msg.data !== 0;
          if (session) {
            session.ansiMode = on;
            if (msg.data === 2) session.ripMode = true;
          }
          if (user) user.ansi = on;
debugLog(`  [WRITE] DT_ANSICOLOR: ${msg.data}`);
        }
        break;

      case XIMCommand.DT_MSGCODE:
        replyData = 0;
debugLog('  DT_MSGCODE: 0');
        break;

      case XIMCommand.DT_FILECODE:
        replyData = 0;
debugLog('  DT_FILECODE: 0');
        break;

      case XIMCommand.DT_QUICKFLAG:
      case XIMCommand.DT_GOODFILE:
      case XIMCommand.DT_GOODFILE_FLAG:
        if (isRead) {
          const val = (this.state as any)[msg.command] ?? 0;
          this.messageParser.writeString(stringAddr, String(val), 200);
debugLog(`  [READ] ${this.messageParser.getCommandName(msg.command)}: ${val}`);
        } else {
          const newVal = parseInt(this.messageParser.readString(stringAddr, 200)) || 0;
          (this.state as any)[msg.command] = newVal;
debugLog(`  [WRITE] ${this.messageParser.getCommandName(msg.command)}: ${newVal}`);
        }
        break;

      case XIMCommand.DT_DUMP:
        // express.e:3667-3668: WRITE-ONLY - saves user data to file specified in msg.string
        {
          const filename = this.messageParser.readString(stringAddr, 200);
          if (filename && filename.trim().length > 0) {
            try {
              const path = require('path');
              const bbsRoot = (this.bbsSession as any)?.bbsRoot || process.cwd();
              // The door names this file. writeFileSync only case-resolves the
              // PARENT, so an existing "DUMP.TXT" would get a lowercase twin;
              // resolve the whole path first and overwrite the real file.
              const fullPath = amigafs.resolveExistingAncestors(
                path.resolve(bbsRoot, filename)
              );
              const userData = JSON.stringify(user || {}, null, 2);
              amigafs.writeFileSync(fullPath, userData, 'utf8');
debugLog(`  [WRITE] DT_DUMP: Saved user data to ${fullPath}`);
            } catch (err) {
console.error(`  [WRITE] DT_DUMP: Failed to save to ${filename}:`, err);
            }
          }
        }
        break;

      case XIMCommand.ACTIVE_NODES:
        // express.e:3661-3666: 32 spaces, then 'X' at index i for every
        // node i whose AmiExpress_Node.i port exists (i = 0..MAXNODES-1).
        // Node n is character n - the old 10-byte '_' string put node 1 at
        // index 0 and stopped at node 9.
        if (isRead) {
          const { nodeFileManager } = require('../../services/NodeFileManager');
          const nodes = Array.from({ length: ACTIVE_NODE_SLOTS }, (_unused, node) =>
            nodeFileManager.nodeUserFilesExist(node) ? 'X' : ' ');
          const nodesStatus = nodes.join('');
          this.messageParser.writeString(stringAddr, nodesStatus, ACTIVE_NODE_SLOTS + 1);
debugLog(`  [READ] ACTIVE_NODES: "${nodesStatus}"`);
        }
        break;

      case XIMCommand.DT_ADDBIT:
      case XIMCommand.DT_REMBIT:
      case XIMCommand.DT_QUERYBIT:
        {
          // msg.data is an ACS index for all three, never a bitmask.
          const bitMask = msg.data;

          if (msg.command === XIMCommand.DT_ADDBIT || msg.command === XIMCommand.DT_REMBIT) {
            // express.e:3853-3856, 8430-8442 setTempSecurityFlags /
            // clearTempSecurityFlags: securityFlags[n] := "T" / "F" for this
            // call, which checkSecurity reads first. ORing n into userFlags
            // granted nothing and flipped unrelated user-flag bits.
            if (user) setUserPermission(user, bitMask as ACSPermission, msg.command === XIMCommand.DT_ADDBIT);
debugLog(`  [WRITE] ${msg.command === XIMCommand.DT_ADDBIT ? 'DT_ADDBIT' : 'DT_REMBIT'}: ACS ${bitMask} (${ACSPermission[bitMask] ?? '?'})`);
          } else {
            // express.e:3857-3858: msg.command:=checkSecurity(msg.data)
            // msg.data is an ACS permission index, not a bitmask.
            // CRITICAL: Result goes in msg.command field, NOT msg.data!
            const result = checkSecurity(user ?? null, bitMask as ACSPermission) ? 1 : 0;
            this.messageParser.writeCommand(msg.msgAddr, result);
debugLog(
              `  [READ] DT_QUERYBIT: permIndex=${bitMask} (${ACSPermission[bitMask] ?? '?'}), result=${result} (in msg.command)`
            );
            // Don't set replyData - result already written to msg.command
            return;
          }
        }
        break;

      case XIMCommand.MOD_TYPE:
        // Module type indicator - return 0 for standard
        if (isRead) {
          this.messageParser.writeString(stringAddr, '0', 200);
debugLog(`  [READ] MOD_TYPE: 0`);
        } else {
          const modType = this.messageParser.readString(stringAddr, 200);
          (this.state as any).modType = parseInt(modType) || 0;
debugLog(`  [WRITE] MOD_TYPE: ${modType}`);
        }
        break;

      case XIMCommand.EDITOR_STRUCT:
        // express.e:3929-3934 - msg.data set: the door's object at filler1
        // becomes the board's; clear: the board's is copied to filler1.
        if (msg.data !== 0) {
          const fromDoor = editorStructFromDoor(this.emulator, msg.filler1 ?? 0);
          if (fromDoor && this.bbsSession) (this.bbsSession as { editor?: EditorState }).editor = fromDoor;
        } else {
          editorStructToDoor(this.emulator, this.execLibrary,
            (this.bbsSession as { editor?: EditorState } | undefined)?.editor, msg.filler1 ?? 0, this.editorStrings);
        }
debugLog(`  EDITOR_STRUCT: ${msg.data !== 0 ? 'from door' : 'to door'} at ${msg.filler1}`);
        break;

      case XIMCommand.BYPASS_CSI_CHECK:
        // Bypass CSI (ANSI) check flag
        if (isRead) {
          const bypass = (this.state as any).bypassCSICheck || 0;
          this.messageParser.writeString(stringAddr, bypass.toString(), 200);
debugLog(`  [READ] BYPASS_CSI_CHECK: ${bypass}`);
        } else {
          const newBypass = parseInt(this.messageParser.readString(stringAddr, 200)) || 0;
          (this.state as any).bypassCSICheck = newBypass;
debugLog(`  [WRITE] BYPASS_CSI_CHECK: ${newBypass}`);
        }
        break;

      case XIMCommand.SENTBY:
        // Sent by indicator (for messages)
        if (isRead) {
          const sentBy = (this.state as any).sentBy || '';
          this.messageParser.writeString(stringAddr, sentBy, 200);
debugLog(`  [READ] SENTBY: "${sentBy}"`);
        } else {
          const newSentBy = this.messageParser.readString(stringAddr, 200);
          (this.state as any).sentBy = newSentBy;
debugLog(`  [WRITE] SENTBY: "${newSentBy}"`);
        }
        break;

      // === NEW COMMANDS: DT_INTERNETNAME through DT_CALLEDTODAY ===
      // express.e:4088-4195

      case XIMCommand.DT_INTERNETNAME:
        // express.e:4088-4093: Internet/email name
        if (isRead) {
          const internetName = (user as any)?.internetName || user?.email || '';
          this.messageParser.writeString(stringAddr, internetName, 10);
debugLog(`  [READ] DT_INTERNETNAME: "${internetName}"`);
        } else {
          const newName = this.messageParser.readString(stringAddr, 10);
          if (user) (user as any).internetName = newName;
debugLog(`  [WRITE] DT_INTERNETNAME: "${newName}"`);
        }
        break;

      case XIMCommand.DT_TRANSLATOR:
        // express.e:4094-4100: Translation setting (userLanguage)
        if (isRead) {
          const translator = (this.state as any).userLanguage || '';
          this.messageParser.writeString(stringAddr, translator, 200);
debugLog(`  [READ] DT_TRANSLATOR: "${translator}"`);
        } else {
          const newTranslator = this.messageParser.readString(stringAddr, 200);
          (this.state as any).userLanguage = newTranslator;
debugLog(`  [WRITE] DT_TRANSLATOR: "${newTranslator}"`);
        }
        break;

      case XIMCommand.DT_HOST_LANGUAGE:
        // express.e:4101-4106: Host language setting
        if (isRead) {
          const hostLang = (this.state as any).hostLanguage || 'English';
          this.messageParser.writeString(stringAddr, hostLang, 200);
debugLog(`  [READ] DT_HOST_LANGUAGE: "${hostLang}"`);
        } else {
          const newLang = this.messageParser.readString(stringAddr, 200);
          (this.state as any).hostLanguage = newLang;
debugLog(`  [WRITE] DT_HOST_LANGUAGE: "${newLang}"`);
        }
        break;

      case XIMCommand.DT_GEOGRAPHIC:
        // express.e:4113-4114: BBS geographic location (mybbsLoc)
        if (isRead) {
          const geo = (this.bbsSession as any)?.bbsLocation || 'The Internet';
          this.messageParser.writeString(stringAddr, geo, 200);
debugLog(`  [READ] DT_GEOGRAPHIC: "${geo}"`);
        }
        break;

      case XIMCommand.DT_SIZEUPLOAD:
        // express.e:4115-4117: Human-readable upload size (calcSizeText)
        if (isRead) {
          const bytesUp = user?.bytesUpload || 0;
          const sizeText = calcSizeText(bytesUp);
          this.messageParser.writeString(stringAddr, sizeText, 200);
debugLog(`  [READ] DT_SIZEUPLOAD: "${sizeText}"`);
        }
        break;

      case XIMCommand.DT_SIZEDOWNLOAD:
        // express.e:4118-4120: Human-readable download size (calcSizeText)
        if (isRead) {
          const bytesDown = user?.bytesDownload || 0;
          const sizeText = calcSizeText(bytesDown);
          this.messageParser.writeString(stringAddr, sizeText, 200);
debugLog(`  [READ] DT_SIZEDOWNLOAD: "${sizeText}"`);
        }
        break;

      case XIMCommand.DT_CONFACCESS2:
        // express.e:4141-4150: Extended 25-character conference access string
        if (isRead) {
          let confAccess2 = '';
          const numConfs = (this.bbsSession as any)?.numConfs || 25;
          const baseAccess = this.state.confAccess || (this.bbsSession as any)?.confAccess || '';
          for (let i = 1; i <= Math.min(25, numConfs); i++) {
            const hasAccess = i <= baseAccess.length && baseAccess[i - 1].toUpperCase() === 'X';
            confAccess2 += hasAccess ? 'X' : '_';
          }
          this.messageParser.writeString(stringAddr, confAccess2, 200);
debugLog(`  [READ] DT_CONFACCESS2: "${confAccess2}"`);
        } else {
          const newAccess = this.messageParser.readString(stringAddr, 25);
          // Update the first 10 chars to main confAccess, store full in confAccess2
          this.state.confAccess = newAccess.slice(0, 10);
          (this.state as any).confAccess2 = newAccess;
debugLog(`  [WRITE] DT_CONFACCESS2: "${newAccess}"`);
        }
        break;

      case XIMCommand.DT_CBYTESUPLOAD:
        // express.e:4151-4159: Conference-specific bytes uploaded (same as DT_BYTESUPLOAD in web)
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          if (isRead) {
            const bytesUp = diskStats?.bytesUpload ?? user?.bytesUpload ?? 0;
            this.messageParser.writeString(stringAddr, bytesUp.toString(), 200);
debugLog(`  [READ] DT_CBYTESUPLOAD: ${bytesUp}`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes) && user) user.bytesUpload = newBytes;
debugLog(`  [WRITE] DT_CBYTESUPLOAD: ${newBytes}`);
          }
        }
        break;

      case XIMCommand.DT_CBYTESDOWNLOAD:
        // express.e:4160-4168: Conference-specific bytes downloaded
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          if (isRead) {
            const bytesDown = diskStats?.bytesDownload ?? user?.bytesDownload ?? 0;
            this.messageParser.writeString(stringAddr, bytesDown.toString(), 200);
debugLog(`  [READ] DT_CBYTESDOWNLOAD: ${bytesDown}`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes) && user) user.bytesDownload = newBytes;
debugLog(`  [WRITE] DT_CBYTESDOWNLOAD: ${newBytes}`);
          }
        }
        break;

      case XIMCommand.DT_CFILESUPLOAD:
        // express.e:4169-4175: Conference-specific files uploaded
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          if (isRead) {
            const uploads = diskStats?.uploads ?? user?.uploads ?? 0;
            this.messageParser.writeString(stringAddr, uploads.toString(), 200);
debugLog(`  [READ] DT_CFILESUPLOAD: ${uploads}`);
          } else {
            const newUploads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newUploads) && user) user.uploads = newUploads;
debugLog(`  [WRITE] DT_CFILESUPLOAD: ${newUploads}`);
          }
        }
        break;

      case XIMCommand.DT_CFILESDOWNLOAD:
        // express.e:4176-4182: Conference-specific files downloaded
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          if (isRead) {
            const downloads = diskStats?.downloads ?? user?.downloads ?? 0;
            this.messageParser.writeString(stringAddr, downloads.toString(), 200);
debugLog(`  [READ] DT_CFILESDOWNLOAD: ${downloads}`);
          } else {
            const newDownloads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newDownloads) && user) user.downloads = newDownloads;
debugLog(`  [WRITE] DT_CFILESDOWNLOAD: ${newDownloads}`);
          }
        }
        break;

      case XIMCommand.DT_CALLEDTODAY:
        // express.e:4189-4195: read answers getTodaysCalls (28425-28432),
        // write is `timesOnToday:=Val(msg.string)` - the record's callsToday.
        if (isRead) {
          const timesOnToday = user ? getTodaysCalls(user) : 0;
          this.messageParser.writeString(stringAddr, timesOnToday.toString(), 200);
debugLog(`  [READ] DT_CALLEDTODAY: ${timesOnToday}`);
        } else if (user) {
          user.callsToday = parseInt(this.messageParser.readString(stringAddr), 10) || 0;
debugLog(`  [WRITE] DT_CALLEDTODAY: ${user.callsToday}`);
        }
        break;

      default:
debugLog(`  [UNHANDLED] ${this.messageParser.getCommandName(msg.command)}`);
    }

    this.reply(msg, replyData);
  }

  /**
   * Send reply to door
   */
  private reply(msg: XIMMessage, data: number): void {
    // DEBUG dRE!WAll: snapshot the string at 0x14 right before sending reply
    if (process.env.DREWALL_TRACE === '1' && msg.command === XIMCommand.DT_NAME) {
      const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
      const snap = this.messageParser.readString(stringAddr, 31);
      const strPtr = this.emulator.readMemory32(msg.msgAddr + 16);
      console.log(`[DT_NAME_DEBUG] reply() entry: embedded@0x${stringAddr.toString(16)}="${snap}" strPtr=0x${strPtr.toString(16)} replyData=${data}`);
    }
    // Mark reply as handled so callers (XIMProcessor / polling loop) skip their
    // fallback replyMsg and we avoid double-delivering the same msg to the
    // door's reply port queue.
    this.state.replyHandled = true;
    // express.e replies only set msg.string/msg.data; do not modify strptr/fillers.
    this.messageParser.writeData(msg.msgAddr, data);

    // Log outgoing reply to XIM structured logger
    const humanName = this.messageParser.getCommandName(msg.command);
    ximLogger.log('debug', 'send', this.state.doorCommand || 'UNKNOWN', this.bbsSession?.nodeId || 1, {
      type: `${humanName}_REPLY`,
      typeCode: msg.command,
      param: data,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      message: 'Reply to door data query',
    });

    // CRITICAL FIX 2026-01-15: Detect which reply method to use based on msg.replyPort
    // - AEDoor.library-based doors (TurboLister) set mn_ReplyPort and poll THAT port
    // - Native XIM doors poll the AEDoorPort bidirectionally (replyPort often 0)
    // If message has valid replyPort, use ReplyMsg to send there (AEDoor.library mode)
    // Otherwise use bidirectional PutMsg to XIM port (native XIM mode)
    const msgReplyPort = msg.replyPort || 0;

    if (msgReplyPort !== 0) {
      // AEDoor.library mode: door polls its own reply port
      if (process.env.DREWALL_TRACE === '1' && msg.command === XIMCommand.DT_NAME) {
        const sa = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
        console.log(`[DT_NAME_DEBUG] pre-replyMsg embedded@0x${sa.toString(16)}="${this.messageParser.readString(sa, 31)}"`);
      }
      this.execLibrary.replyMsg(msg.msgAddr);
      if (process.env.DREWALL_TRACE === '1' && msg.command === XIMCommand.DT_NAME) {
        const sa = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
        console.log(`[DT_NAME_DEBUG] post-replyMsg embedded@0x${sa.toString(16)}="${this.messageParser.readString(sa, 31)}"`);
      }
      debugLog(`[XIMDataQuery] Reply sent via ReplyMsg to msg.replyPort=0x${msgReplyPort.toString(16)} (AEDoor.library mode)`);
    } else {
      // Native XIM mode: door polls AEDoorPort bidirectionally
      const ximPortAddr = this.state.ximPortAddr;
      const doorPortAddr = (this.state as any).doorPortAddr;
      const targetPort = ximPortAddr || doorPortAddr;

      if (targetPort && targetPort !== 0) {
        const NT_REPLYMSG = 6;
        this.emulator.writeMemory(msg.msgAddr + 8, NT_REPLYMSG);
        this.execLibrary.putMsg(targetPort, msg.msgAddr, { suppressDoorCallback: true });
        debugLog(`[XIMDataQuery] Reply sent via PutMsg to port=0x${targetPort.toString(16)} (bidirectional XIM)`);
      } else {
        this.execLibrary.replyMsg(msg.msgAddr);
        debugLog(`[XIMDataQuery] Reply sent via ReplyMsg (fallback)`);
      }
    }
  }
}

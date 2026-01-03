/**
 * XIM Data Query Handler
 *
 * Handles all DT_* commands for querying and modifying user data.
 * From E sources (express.e:3494-3981)
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DoorConstants } from '../DoorTypes';
import { XIMMessage, XIMCommand, BBSSessionData, XIMState, ENVStatus } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import * as bcrypt from 'bcryptjs';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { userDatabaseManager } from '../../services/UserDatabaseManager';
import { ximLogger } from '../../utils/XIMLogger';

export class XIMDataQueryHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
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
   * Protocol:
   * - msg.data = direction flag:
   *   - IF msg.data != 0: READ mode - copy user data TO msg.string
   *   - IF msg.data == 0: WRITE mode - copy msg.string TO user data
   */
  handleDataQuery(msg: XIMMessage): void {
    console.log(`[XIMDataQuery] Door querying data: ${this.messageParser.getCommandName(msg.command)}`);
    console.log(`  msg.data (direction): ${msg.data} (${msg.data !== 0 ? 'READ' : 'WRITE'})`);

    // CRITICAL FIX: string[200] is embedded in jhMessage at offset 20, NOT a pointer
    const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    console.log(`  String address: 0x${stringAddr.toString(16)} (embedded in message)`);

    const isRead = msg.data !== 0;
    const user = this.bbsSession?.user;
    // express.e preserves msg.data unless a command explicitly overrides it.
    let replyData = typeof msg.data === 'number' ? msg.data : 0;

    switch (msg.command) {
      case XIMCommand.DT_NAME:
        if (isRead) {
          // Context-aware handling: For file scanning doors (FR, N, F, CS, etc.),
          // DT_NAME returns number of files in current directory, not username
          const doorCommand = (this.bbsSession as any).doorCommand?.toUpperCase();
          const isFileScanDoor = doorCommand && ['FR', 'N', 'F', 'CS', 'SCAN', 'NSU'].includes(doorCommand);

          if (isFileScanDoor) {
            // Return file count from current conference's NumULs file
            const confNum = (this.bbsSession as any).conferenceNumber || 1;
            const bbsRoot = (this.bbsSession as any).bbsRoot || process.cwd();
            const numULsPath = require('path').join(bbsRoot, `Conf${confNum}`, 'NumULs');

            let fileCount = '0';
            try {
              const fs = require('fs');
              if (fs.existsSync(numULsPath)) {
                fileCount = fs.readFileSync(numULsPath, 'utf8').trim();
              }
            } catch (err) {
              console.error(`  [READ] DT_NAME: Failed to read NumULs from ${numULsPath}:`, err);
            }

            this.messageParser.writeString(stringAddr, fileCount, 31);
            const verify = this.messageParser.readString(stringAddr, 31);
            console.log(`  [READ] DT_NAME verify buffer: "${verify}"`);
            console.log(`  [READ] DT_NAME (file scan context): "${fileCount}" files in Conf${confNum}`);
          } else {
            // Normal context: return username
            const username = user?.username || 'Guest';
            this.messageParser.writeString(stringAddr, username, 31);
            const verify = this.messageParser.readString(stringAddr, 31);
            console.log(`  [READ] DT_NAME verify buffer: "${verify}"`);
            console.log(`  [READ] DT_NAME: "${username}"`);
          }
        } else {
          const newName = this.messageParser.readString(stringAddr, 31);
          if (user) user.username = newName;
          console.log(`  [WRITE] DT_NAME: "${newName}"`);
        }
        break;

      case XIMCommand.DT_PASSWORD:
        if (isRead) {
          // express.e: doors cannot read passwords; return empty
          this.messageParser.writeString(stringAddr, '', 40);
          console.log(`  [READ] DT_PASSWORD: (blocked)`);
        } else {
          const newPwd = this.messageParser.readString(stringAddr, 40);
          if (user) {
            try {
              const hash = bcrypt.hashSync(newPwd, 10);
              user.passwordHash = hash;
              // Retain plaintext only if other paths expect it (some importers do)
              user.password = newPwd;
              (user as any).pwdLastUpdated = Date.now();
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
          console.log(`  [WRITE] DT_PASSWORD set (length=${newPwd.length})`);
        }
        break;

      case XIMCommand.DT_LOCATION:
        if (isRead) {
          const location = user?.location || 'Unknown';
          this.messageParser.writeString(stringAddr, location, 30);
          console.log(`  [READ] DT_LOCATION: "${location}"`);
        } else {
          const newLocation = this.messageParser.readString(stringAddr, 30);
          if (user) user.location = newLocation;
          console.log(`  [WRITE] DT_LOCATION: "${newLocation}"`);
        }
        break;

      case XIMCommand.DT_PHONENUMBER:
        if (isRead) {
          const phone = user?.phone || '';
          this.messageParser.writeString(stringAddr, phone, 13);
          console.log(`  [READ] DT_PHONENUMBER: "${phone}"`);
        } else {
          const newPhone = this.messageParser.readString(stringAddr, 13);
          if (user) user.phone = newPhone;
          console.log(`  [WRITE] DT_PHONENUMBER: "${newPhone}"`);
        }
        break;

      case XIMCommand.DT_REALNAME:
        if (isRead) {
          const realname = user?.realname || '';
          this.messageParser.writeString(stringAddr, realname, 26);
          console.log(`  [READ] DT_REALNAME: "${realname}"`);
        } else {
          const newRealname = this.messageParser.readString(stringAddr, 26);
          if (user) user.realname = newRealname;
          console.log(`  [WRITE] DT_REALNAME: "${newRealname}"`);
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
          console.log(`  [READ] DT_SLOTNUMBER: ${slotNum}`);
        } else {
          // Extended: allow write for compatibility with later AmiExpress versions
          const newSlot = parseInt(this.messageParser.readString(stringAddr, 200));
          if (Number.isFinite(newSlot)) {
            if (user) (user as any).slotNumber = newSlot;
            (this.bbsSession as any).userSlotNumber = newSlot;
          }
          console.log(`  [WRITE] DT_SLOTNUMBER: ${newSlot}`);
        }
        break;

      case XIMCommand.DT_SECSTATUS:
        if (isRead) {
          const secLevel = user?.secLevel || 10;
          this.messageParser.writeString(stringAddr, secLevel.toString(), 200);
          console.log(`  [READ] DT_SECSTATUS: ${secLevel}`);
        } else {
          const newLevel = parseInt(this.messageParser.readString(stringAddr, 200));
          if (user) user.secLevel = newLevel;
          console.log(`  [WRITE] DT_SECSTATUS: ${newLevel}`);
        }
        break;

      case XIMCommand.ENVSTAT:
        // Environment status - returns current BBS activity state
        // Used by doors like AquaScan to determine BBS context (files, mail, etc.)
        // Per assembly (aedoor.i): return -1 (ENV_DROPPED) when carrier lost
        if (isRead) {
          if (this.state.carrierDropped) {
            this.messageParser.writeString(stringAddr, ENVStatus.ENV_DROPPED.toString(), 200);
            console.log(`  [READ] ENVSTAT: ${ENVStatus.ENV_DROPPED} (carrier dropped)`);
          } else {
            const envStat = (this.bbsSession as any).currentStat || ENVStatus.ENV_IDLE;
            this.messageParser.writeString(stringAddr, envStat.toString(), 200);
            console.log(`  [READ] ENVSTAT: ${envStat}`);
          }
        } else {
          const newStat = parseInt(this.messageParser.readString(stringAddr, 200)) || ENVStatus.ENV_IDLE;
          (this.bbsSession as any).currentStat = newStat;
          console.log(`  [WRITE] ENVSTAT: ${newStat}`);
        }
        break;

      case XIMCommand.DT_SECBOARD:
        if (isRead) {
          const secBoard = user?.secBoard || 0;
          this.messageParser.writeString(stringAddr, secBoard.toString(), 200);
          console.log(`  [READ] DT_SECBOARD: ${secBoard}`);
        } else {
          const newSec = parseInt(this.messageParser.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secBoard = newSec;
          console.log(`  [WRITE] DT_SECBOARD: ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECLIBRARY:
        if (isRead) {
          const secLibrary = user?.secLibrary || 0;
          this.messageParser.writeString(stringAddr, secLibrary.toString(), 200);
          console.log(`  [READ] DT_SECLIBRARY: ${secLibrary}`);
        } else {
          const newSec = parseInt(this.messageParser.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secLibrary = newSec;
          console.log(`  [WRITE] DT_SECLIBRARY: ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECBULLETIN:
        if (isRead) {
          const secBulletin = user?.secBulletin || 0;
          this.messageParser.writeString(stringAddr, secBulletin.toString(), 200);
          console.log(`  [READ] DT_SECBULLETIN: ${secBulletin}`);
        } else {
          const newSec = parseInt(this.messageParser.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secBulletin = newSec;
          console.log(`  [WRITE] DT_SECBULLETIN: ${newSec}`);
        }
        break;

      case XIMCommand.DT_TIMELIMIT:
        if (isRead) {
          const timeLimit = user?.timeLimit || 60;
          this.messageParser.writeString(stringAddr, timeLimit.toString(), 200);
          console.log(`  [READ] DT_TIMELIMIT: ${timeLimit}`);
        } else {
          const newLimit = parseInt(this.messageParser.readString(stringAddr, 200));
          if (user) user.timeLimit = newLimit;
          console.log(`  [WRITE] DT_TIMELIMIT: ${newLimit}`);
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
                          24;
          this.messageParser.writeString(stringAddr, lineLen.toString(), 200);
          const verify = this.messageParser.readString(stringAddr, 200);
          console.log(`  [READ] DT_LINELENGTH verify buffer: "${verify}"`);
          console.log(`  [READ] DT_LINELENGTH: ${lineLen} (screen height in lines)`);
        } else {
          const newLen = parseInt(this.messageParser.readString(stringAddr, 200));
          if (user) {
            user.linesPerScreen = newLen;
            (user as any).pageLength = newLen;
          }
          this.state.pauseLines = Number.isFinite(newLen) ? newLen : this.state.pauseLines;
          console.log(`  [WRITE] DT_LINELENGTH: ${newLen}`);
        }
        break;

      case XIMCommand.DT_EXPERT:
        if (isRead) {
          const expert = user?.expert === 'X' ? 'X' : 'N';
          this.messageParser.writeString(stringAddr, expert, 200);
          console.log(`  [READ] DT_EXPERT: ${expert}`);
        } else {
          const expertStr = this.messageParser.readString(stringAddr, 1);
          if (user) user.expert = (expertStr === 'X' || expertStr === 'x') ? 'X' : 'N';
          console.log(`  [WRITE] DT_EXPERT: ${expertStr}`);
        }
        break;

      case XIMCommand.DT_MESSAGESPOSTED:
        {
          // Read from disk (user.data) via diskUserStats, not from session.user (database)
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const msgs = diskStats?.messagesPosted ?? user?.messagesPosted ?? 0;
            this.messageParser.writeString(stringAddr, msgs.toString(), 200);
            console.log(`  [READ] DT_MESSAGESPOSTED: ${msgs} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newMsgs = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newMsgs)) {
              if (user) user.messagesPosted = newMsgs;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'messagesPosted', newMsgs);
            }
            console.log(`  [WRITE] DT_MESSAGESPOSTED: ${newMsgs}`);
          }
        }
        break;

      case XIMCommand.DT_UPLOADS:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const uploads = diskStats?.uploads ?? user?.uploads ?? 0;
            this.messageParser.writeString(stringAddr, uploads.toString(), 200);
            console.log(`  [READ] DT_UPLOADS: ${uploads} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newUploads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newUploads)) {
              if (user) user.uploads = newUploads;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'uploads', newUploads);
            }
            console.log(`  [WRITE] DT_UPLOADS: ${newUploads}`);
          }
        }
        break;

      case XIMCommand.DT_DOWNLOADS:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const downloads = diskStats?.downloads ?? user?.downloads ?? 0;
            this.messageParser.writeString(stringAddr, downloads.toString(), 200);
            console.log(`  [READ] DT_DOWNLOADS: ${downloads} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newDownloads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newDownloads)) {
              if (user) user.downloads = newDownloads;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'downloads', newDownloads);
            }
            console.log(`  [WRITE] DT_DOWNLOADS: ${newDownloads}`);
          }
        }
        break;

      case XIMCommand.DT_TIMESCALLED:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const calls = diskStats?.timesCalled ?? user?.timesCalled ?? 0;
            this.messageParser.writeString(stringAddr, calls.toString(), 200);
            console.log(`  [READ] DT_TIMESCALLED: ${calls} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newCalls = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newCalls)) {
              if (user) user.timesCalled = newCalls;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timesCalled', newCalls);
            }
            console.log(`  [WRITE] DT_TIMESCALLED: ${newCalls}`);
          }
        }
        break;

      case XIMCommand.DT_TIMELASTON:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const lastOn = diskStats?.timeLastOn ?? (user?.lastLoginAt ? Math.floor(new Date(user.lastLoginAt).getTime() / 1000) : 0);
            this.messageParser.writeString(stringAddr, lastOn.toString(), 200);
            console.log(`  [READ] DT_TIMELASTON: ${lastOn} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newLastOn = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newLastOn)) {
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timeLastOn', newLastOn);
            }
            console.log(`  [WRITE] DT_TIMELASTON: ${newLastOn}`);
          }
        }
        break;

      case XIMCommand.DT_TIMEUSED:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const timeUsed = diskStats?.timeUsed ?? user?.timeUsed ?? 0;
            this.messageParser.writeString(stringAddr, timeUsed.toString(), 200);
            console.log(`  [READ] DT_TIMEUSED: ${timeUsed} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newTimeUsed = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newTimeUsed)) {
              if (user) user.timeUsed = newTimeUsed;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timeUsed', newTimeUsed);
            }
            console.log(`  [WRITE] DT_TIMEUSED: ${newTimeUsed}`);
          }
        }
        break;

      case XIMCommand.DT_TIMETOTAL:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const timeTotal = diskStats?.timeTotal ?? user?.timeTotal ?? 0;
            this.messageParser.writeString(stringAddr, timeTotal.toString(), 200);
            console.log(`  [READ] DT_TIMETOTAL: ${timeTotal} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newTimeTotal = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newTimeTotal)) {
              if (user) user.timeTotal = newTimeTotal;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'timeTotal', newTimeTotal);
            }
            console.log(`  [WRITE] DT_TIMETOTAL: ${newTimeTotal}`);
          }
        }
        break;

      case XIMCommand.DT_BYTESUPLOAD:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const bytesUp = diskStats?.bytesUpload ?? user?.bytesUpload ?? 0;
            this.messageParser.writeString(stringAddr, bytesUp.toString(), 200);
            console.log(`  [READ] DT_BYTESUPLOAD: ${bytesUp} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes)) {
              if (user) user.bytesUpload = newBytes;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'bytesUpload', newBytes);
            }
            console.log(`  [WRITE] DT_BYTESUPLOAD: ${newBytes}`);
          }
        }
        break;

      case XIMCommand.DT_BYTEDOWNLOAD:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const bytesDown = diskStats?.bytesDownload ?? user?.bytesDownload ?? 0;
            this.messageParser.writeString(stringAddr, bytesDown.toString(), 200);
            console.log(`  [READ] DT_BYTEDOWNLOAD: ${bytesDown} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes)) {
              if (user) user.bytesDownload = newBytes;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'bytesDownload', newBytes);
            }
            console.log(`  [WRITE] DT_BYTEDOWNLOAD: ${newBytes}`);
          }
        }
        break;

      case XIMCommand.DT_DAILYBYTELIMIT:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const limit = diskStats?.dailyBytesLimit ?? user?.dailyBytesLimit ?? 0;
            this.messageParser.writeString(stringAddr, limit.toString(), 200);
            console.log(`  [READ] DT_DAILYBYTELIMIT: ${limit} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newLimit = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newLimit)) {
              if (user) user.dailyBytesLimit = newLimit;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'dailyBytesLimit', newLimit);
            }
            console.log(`  [WRITE] DT_DAILYBYTELIMIT: ${newLimit}`);
          }
        }
        break;

      case XIMCommand.DT_DAILYBYTEDLD:
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          const userSlot = (this.bbsSession as any)?.userSlotNumber ?? -1;
          if (isRead) {
            const dailyDld = diskStats?.dailyBytesDld ?? user?.dailyBytesDld ?? 0;
            this.messageParser.writeString(stringAddr, dailyDld.toString(), 200);
            console.log(`  [READ] DT_DAILYBYTEDLD: ${dailyDld} (from ${diskStats ? 'disk' : 'session'})`);
          } else {
            const newDld = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newDld)) {
              if (user) user.dailyBytesDld = newDld;
              if (userSlot >= 0) userDatabaseManager.writeUserStatToDisk(userSlot, 'dailyBytesDld', newDld);
            }
            console.log(`  [WRITE] DT_DAILYBYTEDLD: ${newDld}`);
          }
        }
        break;

      case XIMCommand.DT_HOSTNAME:
        if (isRead) {
          const hostname = this.bbsSession?.hostname || 'localhost';
          this.messageParser.writeString(stringAddr, hostname, 200);
          console.log(`  [READ] DT_HOSTNAME: "${hostname}"`);
        }
        break;

      case XIMCommand.DT_HOSTIP:
        if (isRead) {
          const hostip = this.bbsSession?.hostip || '127.0.0.1';
          this.messageParser.writeString(stringAddr, hostip, 200);
          console.log(`  [READ] DT_HOSTIP: "${hostip}"`);
        }
        break;

      case XIMCommand.DT_STAMP_LASTON:
        if (isRead) {
          // Format as Amiga-style date: "DD-MMM-YY HH:MM:SS"
          // Based on express.e:3769 formatCDateTime(loggedOnUser.timeLastOn,tempstring)
          if (user?.lastLogin || user?.timeLastOn) {
            const lastOn = new Date(user.lastLogin || user.timeLastOn!);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const day = lastOn.getDate().toString().padStart(2, '0');
            const month = months[lastOn.getMonth()];
            const year = lastOn.getFullYear().toString().slice(-2);
            const hours = lastOn.getHours().toString().padStart(2, '0');
            const minutes = lastOn.getMinutes().toString().padStart(2, '0');
            const seconds = lastOn.getSeconds().toString().padStart(2, '0');
            const amigaDate = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
            this.messageParser.writeString(stringAddr, amigaDate, 200);
            console.log(`  [READ] DT_STAMP_LASTON: "${amigaDate}"`);
          } else {
            this.messageParser.writeString(stringAddr, '01-Jan-70 00:00:00', 200);
            console.log(`  [READ] DT_STAMP_LASTON: "01-Jan-70 00:00:00" (never logged in)`);
          }
        }
        break;

      case XIMCommand.DT_STAMP_CTIME:
        if (isRead) {
          // Format as Amiga-style date: "DD-MMM-YY HH:MM:SS"
          // Based on express.e:3775 formatCDateTime(getSystemTime(),tempstring)
          const now = new Date();
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const day = now.getDate().toString().padStart(2, '0');
          const month = months[now.getMonth()];
          const year = now.getFullYear().toString().slice(-2);
          const hours = now.getHours().toString().padStart(2, '0');
          const minutes = now.getMinutes().toString().padStart(2, '0');
          const seconds = now.getSeconds().toString().padStart(2, '0');
          const amigaDate = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
          this.messageParser.writeString(stringAddr, amigaDate, 200);
          console.log(`  [READ] DT_STAMP_CTIME: "${amigaDate}"`);
        }
        break;

      case XIMCommand.DT_CURR_TIME:
        if (isRead) {
          const currTime = Math.floor(Date.now() / 1000);
          this.messageParser.writeString(stringAddr, currTime.toString(), 200);
          console.log(`  [READ] DT_CURR_TIME: ${currTime}`);
        }
        break;

      case XIMCommand.DT_TIMEOUT:
        if (isRead) {
          const timeout = (this.state as any).doorTimeout || (this.state as any).timeoutSeconds || 300;
          this.messageParser.writeString(stringAddr, timeout.toString(), 200);
          console.log(`  [READ] DT_TIMEOUT: ${timeout}`);
        } else {
          const newTimeout = parseInt(this.messageParser.readString(stringAddr, 200));
          (this.state as any).doorTimeout = newTimeout;
          console.log(`  [WRITE] DT_TIMEOUT: ${newTimeout}`);
        }
        break;

      case XIMCommand.DT_CONFACCESS:
        if (isRead) {
          // express.e:3777-3778 uses 10-char conference access string from disk
          let confAccess =
            (this.bbsSession as any)?.confAccess ||
            this.state.confAccess ||
            '';
          if (confAccess.length < 10) {
            confAccess = confAccess.padEnd(10, '_');
          } else if (confAccess.length > 10) {
            confAccess = confAccess.slice(0, 10);
          }
          this.messageParser.writeString(stringAddr, confAccess, 10);
          console.log(`  [READ] DT_CONFACCESS: "${confAccess}" (from disk)`);
        } else {
          // Write operation - update state (will need to sync to disk separately)
          const newAccess = this.messageParser.readString(stringAddr, 10);
          this.state.confAccess = newAccess;
          (this.bbsSession as any).confAccess = newAccess;
          console.log(`  [WRITE] DT_CONFACCESS: "${newAccess}"`);
        }
        break;

      case XIMCommand.DT_LANGUAGE:
        if (isRead) {
          const language = this.state.language || 'txt';
          this.messageParser.writeString(stringAddr, language, 200);
          console.log(`  [READ] DT_LANGUAGE: "${language}"`);
        } else {
          const newLang = this.messageParser.readString(stringAddr, 200);
          this.state.language = newLang || 'txt';
          if (user) (user as any).language = newLang;
          console.log(`  [WRITE] DT_LANGUAGE: "${newLang}"`);
        }
        break;

      case XIMCommand.DT_ANSICOLOR:
      case XIMCommand.DT_ISANSI:
        if (isRead) {
          const isAnsi = user?.ansi || true;
          this.messageParser.writeString(stringAddr, isAnsi ? '1' : '0', 200);
          console.log(`  [READ] ${this.messageParser.getCommandName(msg.command)}: ${isAnsi}`);
        }
        break;

      case XIMCommand.DT_MSGCODE:
        replyData = 0;
        console.log('  DT_MSGCODE: 0');
        break;

      case XIMCommand.DT_FILECODE:
        replyData = 0;
        console.log('  DT_FILECODE: 0');
        break;

      case XIMCommand.DT_QUICKFLAG:
      case XIMCommand.DT_GOODFILE:
      case XIMCommand.DT_ANSICOLOR:
      case XIMCommand.DT_GOODFILE_FLAG:
        if (isRead) {
          const val = (this.state as any)[msg.command] ?? 0;
          this.messageParser.writeString(stringAddr, String(val), 200);
          console.log(`  [READ] ${this.messageParser.getCommandName(msg.command)}: ${val}`);
        } else {
          const newVal = parseInt(this.messageParser.readString(stringAddr, 200)) || 0;
          (this.state as any)[msg.command] = newVal;
          console.log(`  [WRITE] ${this.messageParser.getCommandName(msg.command)}: ${newVal}`);
        }
        break;

      case XIMCommand.DT_DUMP:
        if (isRead) {
          const dumpData = JSON.stringify(user || {}, null, 2);
          this.messageParser.writeString(stringAddr, dumpData, 200);
          console.log(`  [READ] DT_DUMP: User data dumped`);
        }
        break;

      case XIMCommand.ACTIVE_NODES:
        // Per doordocs.txt: "string 10 bytes in length, with 'X's marking active nodes"
        // NOTE: Original limit was 9 nodes, docs say "will surely be changing"
        // Using underscore for inactive to match DT_CONFACCESS convention
        if (isRead) {
          const { nodeFileManager } = require('../../services/NodeFileManager');
          let nodesStatus = '';
          // Check first 9 nodes (1-9) per original spec, padded to 10 bytes
          for (let i = 1; i <= 9; i++) {
            const isActive = nodeFileManager.nodeUserFilesExist(i);
            nodesStatus += isActive ? 'X' : '_';
          }
          // Pad to 10 bytes total
          nodesStatus += '_';
          this.messageParser.writeString(stringAddr, nodesStatus, 10);
          console.log(`  [READ] ACTIVE_NODES: "${nodesStatus}" (10 bytes)`);
        }
        break;

      case XIMCommand.DT_ADDBIT:
      case XIMCommand.DT_REMBIT:
      case XIMCommand.DT_QUERYBIT:
        {
          const bitMask = msg.data;
          const currentFlags = user?.userFlags ?? 0;
          let updated = currentFlags;

          if (msg.command === XIMCommand.DT_ADDBIT) {
            updated = currentFlags | bitMask;
            if (user) user.userFlags = updated;
            replyData = updated;
            console.log(
              `  [WRITE] DT_ADDBIT: mask=0x${bitMask.toString(
                16
              )}, flags=0x${updated.toString(16)}`
            );
          } else if (msg.command === XIMCommand.DT_REMBIT) {
            updated = currentFlags & ~bitMask;
            if (user) user.userFlags = updated;
            replyData = updated;
            console.log(
              `  [WRITE] DT_REMBIT: mask=0x${bitMask.toString(
                16
              )}, flags=0x${updated.toString(16)}`
            );
          } else {
            replyData = (currentFlags & bitMask) !== 0 ? 1 : 0;
            console.log(
              `  [READ] DT_QUERYBIT: mask=0x${bitMask.toString(
                16
              )}, result=${replyData}`
            );
          }
        }
        break;

      case XIMCommand.MOD_TYPE:
        // Module type indicator - return 0 for standard
        if (isRead) {
          this.messageParser.writeString(stringAddr, '0', 200);
          console.log(`  [READ] MOD_TYPE: 0`);
        } else {
          const modType = this.messageParser.readString(stringAddr, 200);
          (this.state as any).modType = parseInt(modType) || 0;
          console.log(`  [WRITE] MOD_TYPE: ${modType}`);
        }
        break;

      case XIMCommand.EDITOR_STRUCT:
        // Editor structure pointer - return 0 (no editor struct)
        replyData = 0;
        console.log(`  EDITOR_STRUCT: 0 (no editor struct)`);
        break;

      case XIMCommand.BYPASS_CSI_CHECK:
        // Bypass CSI (ANSI) check flag
        if (isRead) {
          const bypass = (this.state as any).bypassCSICheck || 0;
          this.messageParser.writeString(stringAddr, bypass.toString(), 200);
          console.log(`  [READ] BYPASS_CSI_CHECK: ${bypass}`);
        } else {
          const newBypass = parseInt(this.messageParser.readString(stringAddr, 200)) || 0;
          (this.state as any).bypassCSICheck = newBypass;
          console.log(`  [WRITE] BYPASS_CSI_CHECK: ${newBypass}`);
        }
        break;

      case XIMCommand.SENTBY:
        // Sent by indicator (for messages)
        if (isRead) {
          const sentBy = (this.state as any).sentBy || '';
          this.messageParser.writeString(stringAddr, sentBy, 200);
          console.log(`  [READ] SENTBY: "${sentBy}"`);
        } else {
          const newSentBy = this.messageParser.readString(stringAddr, 200);
          (this.state as any).sentBy = newSentBy;
          console.log(`  [WRITE] SENTBY: "${newSentBy}"`);
        }
        break;

      // === NEW COMMANDS: DT_INTERNETNAME through DT_CALLEDTODAY ===
      // express.e:4088-4195

      case XIMCommand.DT_INTERNETNAME:
        // express.e:4088-4093: Internet/email name
        if (isRead) {
          const internetName = (user as any)?.internetName || user?.email || '';
          this.messageParser.writeString(stringAddr, internetName, 10);
          console.log(`  [READ] DT_INTERNETNAME: "${internetName}"`);
        } else {
          const newName = this.messageParser.readString(stringAddr, 10);
          if (user) (user as any).internetName = newName;
          console.log(`  [WRITE] DT_INTERNETNAME: "${newName}"`);
        }
        break;

      case XIMCommand.DT_TRANSLATOR:
        // express.e:4094-4100: Translation setting (userLanguage)
        if (isRead) {
          const translator = (this.state as any).userLanguage || '';
          this.messageParser.writeString(stringAddr, translator, 200);
          console.log(`  [READ] DT_TRANSLATOR: "${translator}"`);
        } else {
          const newTranslator = this.messageParser.readString(stringAddr, 200);
          (this.state as any).userLanguage = newTranslator;
          console.log(`  [WRITE] DT_TRANSLATOR: "${newTranslator}"`);
        }
        break;

      case XIMCommand.DT_HOST_LANGUAGE:
        // express.e:4101-4106: Host language setting
        if (isRead) {
          const hostLang = (this.state as any).hostLanguage || 'English';
          this.messageParser.writeString(stringAddr, hostLang, 200);
          console.log(`  [READ] DT_HOST_LANGUAGE: "${hostLang}"`);
        } else {
          const newLang = this.messageParser.readString(stringAddr, 200);
          (this.state as any).hostLanguage = newLang;
          console.log(`  [WRITE] DT_HOST_LANGUAGE: "${newLang}"`);
        }
        break;

      case XIMCommand.DT_GEOGRAPHIC:
        // express.e:4113-4114: BBS geographic location (mybbsLoc)
        if (isRead) {
          const geo = (this.bbsSession as any)?.bbsLocation || 'The Internet';
          this.messageParser.writeString(stringAddr, geo, 200);
          console.log(`  [READ] DT_GEOGRAPHIC: "${geo}"`);
        }
        break;

      case XIMCommand.DT_SIZEUPLOAD:
        // express.e:4115-4117: Human-readable upload size (e.g., "1.5 MB")
        if (isRead) {
          const bytesUp = user?.bytesUpload || 0;
          const sizeText = this.formatSizeText(bytesUp);
          this.messageParser.writeString(stringAddr, sizeText, 200);
          console.log(`  [READ] DT_SIZEUPLOAD: "${sizeText}"`);
        }
        break;

      case XIMCommand.DT_SIZEDOWNLOAD:
        // express.e:4118-4120: Human-readable download size (e.g., "2.3 GB")
        if (isRead) {
          const bytesDown = user?.bytesDownload || 0;
          const sizeText = this.formatSizeText(bytesDown);
          this.messageParser.writeString(stringAddr, sizeText, 200);
          console.log(`  [READ] DT_SIZEDOWNLOAD: "${sizeText}"`);
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
          console.log(`  [READ] DT_CONFACCESS2: "${confAccess2}"`);
        } else {
          const newAccess = this.messageParser.readString(stringAddr, 25);
          // Update the first 10 chars to main confAccess, store full in confAccess2
          this.state.confAccess = newAccess.slice(0, 10);
          (this.state as any).confAccess2 = newAccess;
          console.log(`  [WRITE] DT_CONFACCESS2: "${newAccess}"`);
        }
        break;

      case XIMCommand.DT_CBYTESUPLOAD:
        // express.e:4151-4159: Conference-specific bytes uploaded (same as DT_BYTESUPLOAD in web)
        {
          const diskStats = (this.bbsSession as any)?.diskUserStats;
          if (isRead) {
            const bytesUp = diskStats?.bytesUpload ?? user?.bytesUpload ?? 0;
            this.messageParser.writeString(stringAddr, bytesUp.toString(), 200);
            console.log(`  [READ] DT_CBYTESUPLOAD: ${bytesUp}`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes) && user) user.bytesUpload = newBytes;
            console.log(`  [WRITE] DT_CBYTESUPLOAD: ${newBytes}`);
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
            console.log(`  [READ] DT_CBYTESDOWNLOAD: ${bytesDown}`);
          } else {
            const newBytes = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newBytes) && user) user.bytesDownload = newBytes;
            console.log(`  [WRITE] DT_CBYTESDOWNLOAD: ${newBytes}`);
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
            console.log(`  [READ] DT_CFILESUPLOAD: ${uploads}`);
          } else {
            const newUploads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newUploads) && user) user.uploads = newUploads;
            console.log(`  [WRITE] DT_CFILESUPLOAD: ${newUploads}`);
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
            console.log(`  [READ] DT_CFILESDOWNLOAD: ${downloads}`);
          } else {
            const newDownloads = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newDownloads) && user) user.downloads = newDownloads;
            console.log(`  [WRITE] DT_CFILESDOWNLOAD: ${newDownloads}`);
          }
        }
        break;

      case XIMCommand.DT_CALLEDTODAY:
        // express.e:4189-4195: Times called today
        {
          if (isRead) {
            const timesOnToday = (user as any)?.timesOnToday ?? 1;
            this.messageParser.writeString(stringAddr, timesOnToday.toString(), 200);
            console.log(`  [READ] DT_CALLEDTODAY: ${timesOnToday}`);
          } else {
            const newCount = parseInt(this.messageParser.readString(stringAddr));
            if (!isNaN(newCount) && user) (user as any).timesOnToday = newCount;
            console.log(`  [WRITE] DT_CALLEDTODAY: ${newCount}`);
          }
        }
        break;

      default:
        console.log(`  [UNHANDLED] ${this.messageParser.getCommandName(msg.command)}`);
    }

    this.reply(msg, replyData);
  }

  /**
   * Format bytes as human-readable size text (e.g., "1.5 MB", "2.3 GB")
   * express.e uses calcSizeText() for DT_SIZEUPLOAD/DT_SIZEDOWNLOAD
   */
  private formatSizeText(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(1)} ${units[i]}`;
  }

  /**
   * Send reply to door
   */
  private reply(msg: XIMMessage, data: number): void {
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

    this.execLibrary.replyMsg(msg.msgAddr);
  }
}

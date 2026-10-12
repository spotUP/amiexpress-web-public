/**
 * File Status Handler
 * Port from express.e:24141-24250 (fileStatus function)
 *
 * Displays upload/download statistics per conference
 *
 * Clean Architecture:
 * - Uses FileStatisticsUseCase for business logic
 * - Dependency injection via tsyringe
 * - Handler focuses on presentation/routing only
 */

import { RESULT_NOT_ALLOWED, type InternalCommandResult } from '../../constants/command-results';
import { injectable, inject } from 'tsyringe';
import { isNarrow, narrowRule } from '../../utils/table-format.util';
import { Socket } from 'socket.io';
import { config } from '../../config';
import { todaysBytesLimitOf } from '../../utils/download-ratios.util';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity, getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { db } from '../../database';
import { checkConfAccess } from '../message/message-scan.handler';
import { finalizeCommand } from '../../utils/command-response.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { DI_TOKENS } from '../../container';
import { FileStatisticsUseCase } from '../../services/use-cases/file-statistics.use-case';
import { formatBCD as formatBCDUtil } from '../../utils/bcd-math.util';
import { messagePointerFileManager, accountedBytes, type ConfBaseRecord } from '../../services/MessagePointerFileManager';
import { saveConferenceAccount, loadConferenceAccount } from '../../utils/message-pointers.util';

/**
 * FS Command - File Status
 * Port from express.e:24872-24875 (internalCommandFS)
 * Port from express.e:24141-24250 (fileStatus)
 */
@injectable()
export class FileStatusHandler {
  constructor(
    @inject(DI_TOKENS.Database) private database: any,
    private fileStatsUseCase: FileStatisticsUseCase
  ) {
console.log('[FileStatusHandler] Initialized with DI');
  }

  /**
   * Handle FS command - Display file statistics
   * express.e:24872-24875
   */
  async handleFileStatusCommand(
    socket: Socket,
    session: BBSSession
  ): Promise<InternalCommandResult> {
    // express.e:24873 - the dispatcher says "higher access", not this command.
    if (!checkSecurity(session.user, ACSPermission.CONFERENCE_ACCOUNTING)) {
      return RESULT_NOT_ALLOWED;
    }

    // express.e:24874 fileStatus(0); the main loop's menuPause follows.
    await this.displayFileStatus(socket, session, false);
    session.menuPause = true;
    session.paginatedScreen = undefined;
    session.lastScreenHadPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /** fileStatus for this board's conference count (cmds.numConf). */
  async displayFileStatus(socket: Socket, session: BBSSession, currentOnly: boolean): Promise<void> {
    const conferences = await this.database.getConferences();
    await fileStatus(socket, session, currentOnly, conferences.length || 0);
  }
}

/**
 * Display file status - Port from express.e:24141-24250
 *
 * @param socket - Socket connection
 * @param session - User session
 * @param currentOnly - If true, show only current conference (opt=1 in express.e)
 * @param numConf - cmds.numConf, the board's conference count
 */
export async function fileStatus(
  socket: Socket,
  session: BBSSession,
  currentOnly: boolean,
  numConf: number,
): Promise<void> {
  const user = session.user;
  if (!user) return;

  // Get system configuration
  const totalConferences = numConf;
  const currentConf = session.currentConf || 1;

  // Check if user has conference accounting access
  const hasConfAccounting = checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING);

  // Display header - express.e:24151-24157
  // C64/40-col Task 5d: the seven-column table cannot be narrowed by
  // clipping - it becomes a stacked per-conference block instead.
  // WEB_: the 40-column stacked layout (and its "File Statistics" heading)
  // is this port's; express.e has the wide table only.
  const narrow = isNarrow(session);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', narrow
    ? '\x1b[32mFile Statistics\x1b[0m\r\n'
    : '\x1b[32m              Uploads                 Downloads\r\n');
  socket.emit('ansi-output', '\r\n');

  // express.e:24154-24158: CREDITBYKB changes the header only - the
  // values stay formatBCD bytes (24170-24171).
  const creditByKB = getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true;

  if (narrow) {
    socket.emit('ansi-output', `\x1b[0m${narrowRule()}\x1b[0m\r\n`);
  } else {
    if (creditByKB) {
      socket.emit('ansi-output', '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail Ratio\r\n');
    } else {
      socket.emit('ansi-output', '\x1b[32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\r\n');
    }
    socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\r\n');
  }

  // express.e:24162 saveMsgPointers(currentConf,currentMsgBase): the
  // current conference's record takes the caller's live counters, so its
  // row below is what he has now.
  saveConferenceAccount(session, currentConf);

  // Determine which conferences to show - express.e:24161
  const startConf = currentOnly ? currentConf : 1;
  const endConf = currentOnly ? currentConf : totalConferences;

  // Loop through conferences - express.e:24163-24190
  for (let confNum = startConf; confNum <= endConf; confNum++) {
    // Skip if not current conference and no accounting access
    if (!currentOnly && confNum !== currentConf && !hasConfAccounting) {
      continue;
    }

    if (!checkConfAccess(user, confNum)) {
      continue;
    }

    // express.e:24166-24172: under ACS_CONFERENCE_ACCOUNTING, loadMsgPointers(i,1)
    // puts the caller's OWN record for conference i (his Conf.DB slot) into
    // loggedOnUser (4893-4905), and the row prints those figures. Without it
    // - or in a CONFDB_SHARED conference, where 4895 skips the copy - the row
    // is the account's own totals.
    const record = hasConfAccounting ? callersRecord(user, confNum) : null;

    // Format uploads
    const uploadsCount = record ? record.upload : (user.uploads || 0);
    const uploadBytes = record
      ? Number(accountedBytes(record.bytesUpload, record.uploadBytesBCD))
      : (user.bytesUpload || 0);
    const uploadBytesStr = formatBytes(uploadBytes);

    // Format downloads
    const downloadsCount = record ? record.downloads : (user.downloads || 0);
    const downloadBytes = record
      ? Number(accountedBytes(record.bytesDownload, record.downloadBytesBCD))
      : (user.bytesDownload || 0);
    const downloadBytesStr = formatBytes(downloadBytes);

    // Calculate available bytes - express.e:24172-24176: today's limit, which
    // carries the sysop's and the uploads' extra bytes (21537-21544, 19531)
    // over the daily one. An account with no record value falls back to the
    // daily limit, which is what the logon sets it to (28518).
    const todaysBytesLimit = todaysBytesLimitOf(user);
    const dailyBytesDld = user.dailyBytesDld || 0;
    let bytesAvailStr: string;

    if (todaysBytesLimit === 0) {
      bytesAvailStr = 'Infinite';
    } else {
      const bytesAvail = Math.max(0, todaysBytesLimit - dailyBytesDld);
      bytesAvailStr = formatBytes(bytesAvail);
    }

    // Get ratio - express.e:24181-24187
    // express.e:24180 loggedOnUser.secLibrary - the record's ratio under accounting (4903).
    const ratio = record ? (record.ratio & 0xffff) : (user.ratio || (user as any).secLibrary || 0);
    const secLibrary = ratio;

    // express.e:24165: yellow pen for the current conference, cyan otherwise.
    const n = confNum === currentConf ? 3 : 6;
    const { relConf } = require('../commands/user-commands.handler');
    const confDisplay = String(relConf(confNum, user)).padStart(4, ' ');
    const uploadsDisplay = String(uploadsCount & 0xFFFF).padEnd(7, ' ');
    const uploadBytesDisplay = uploadBytesStr.padStart(14, ' ');
    const downloadsDisplay = String(downloadsCount & 0xFFFF).padEnd(7, ' ');
    const downloadBytesDisplay = downloadBytesStr.padStart(14, ' ');
    const bytesAvailDisplay = bytesAvailStr.padStart(9, ' ');

    if (narrow) {
      const color = confNum === currentConf ? '33' : '0';
      const indicator = confNum === currentConf ? '>' : ' ';
      socket.emit('ansi-output', `\x1b[${color}m${confDisplay}${indicator}\x1b[0m\r\n`);
      socket.emit('ansi-output', ` UL ${uploadsDisplay} ${uploadBytesDisplay.trim().padStart(14)}\r\n`);
      socket.emit('ansi-output', ` DL ${downloadsDisplay} ${downloadBytesDisplay.trim().padStart(14)}\r\n`);
      socket.emit('ansi-output', ` Avail ${bytesAvailDisplay.trim()}  ${secLibrary > 0 ? `${ratio}:1` : 'DSBLD'}\r\n`);
      continue;
    }
    // express.e:24179 / 24181.
    const head = `\x1b[33m    ${confDisplay}\x1b[0m> \x1b[3${n}m`
      + `${uploadsDisplay}  ${uploadBytesDisplay} ${downloadsDisplay}  ${downloadBytesDisplay}   ${bytesAvailDisplay}`;
    socket.emit('ansi-output', secLibrary > 0
      ? `${head}   ${secLibrary}\x1b[0m:\x1b[3${n}m1\r\n`
      : `${head}  \x1b[31mDSBLD\r\n`);
  }

  socket.emit('ansi-output', '\x1b[0m\r\n');
  // express.e:24189 loadMsgPointers(currentConf,currentMsgBase).
  loadConferenceAccount(session, currentConf);
}

/**
 * The caller's Conf.DB record for a conference, as FS reads it under
 * conference accounting - or null where express.e shows the account's own
 * totals instead: no slot (4887), or a CONFDB_SHARED conference (4895).
 */
function callersRecord(user: NonNullable<BBSSession['user']>, confNum: number): ConfBaseRecord | null {
  const slot = Number(user.slotNumber) || 0;
  if (slot < 1) return null;
  if (messagePointerFileManager.isShared(confNum)) return null;
  return messagePointerFileManager.readRecordOrZero(confNum, slot);
}

/** formatBCD's output: bare decimal digits (bcd.e:23-40). */
function formatBytes(bytes: number): string {
  if (bytes < 0) return '0';
  return String(bytes);
}

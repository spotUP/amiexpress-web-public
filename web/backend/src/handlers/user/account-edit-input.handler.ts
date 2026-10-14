/**
 * Account Edit Input Handler
 * Handles keyboard input during account editing
 * 1:1 port from express.e:21211-21650 editInfo() command handling
 */

import { messagePointerFileManager, accountedBytes, type ConfBaseRecord } from '../../services/MessagePointerFileManager';
import { writePackedBCD } from '../../utils/bcd-math.util';
import { BBSSession, LoggedOnSubState } from '../../index';
import type { User } from '../../database/types';
import { displayAccount, displayAccountInfo } from './account.handler';
import { formatLongDate, formatLongTime } from '../../utils/date-time.util';
import { TRACK_UPLOADS_BIT, TRACK_DOWNLOADS_BIT } from '../../utils/download-ratios.util';
import { checkSecurity, getACSConfig, LevelFlags } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { config } from '../../config';
import { setNewPassword } from '../../services/user-settings/w-password';
import { findUserAnswersFile } from '../../utils/user-answers.util';
import { readUserNotes, saveUserNotes } from '../../utils/user-notes.util';
import * as amigafs from '../../utils/amigafs';
import { emitText, clearTheScreen } from '../../utils/output.util';
import * as path from 'path';
import {
  readChar, lineInput, yesNo, numberInput, longNumberInput, uucpNumberInput, rJoinInput, bcdNumberInput,
} from '../../utils/await-input';
import { getTodaysCalls } from '../../utils/time-tracking.util';
import { readPreset, applyPreset } from '../../utils/new-user-preset';
import { applyConfPresets } from '../../services/apply-conf-presets';
import { boardRoot } from '../../utils/board-root.util';
import { nodeTooltype } from '../../utils/node-tooltypes.util';
import { writeToCallersLog } from '../../utils/download-logging.util';

/** The account being edited: the record merged over its row (load-account). */
type EditedAccount = User;

/**
 * The account as displayAccount draws it, for the sysop at the keys:
 * `D> Pass` depends on his own slot (express.e:23000-23009).
 */
function redraw(socket: any, session: BBSSession): void {
  const t = session.tempData;
  displayAccount(socket, t.editingUser, t.editingSlot, t.page || 0, session.user?.slotNumber);
}

/** displayAccountInfo (express.e:23188): the values only, over the screen. */
function redrawValues(socket: any, session: BBSSession): void {
  const t = session.tempData;
  displayAccountInfo(socket, t.editingUser, t.editingSlot, t.page || 0, session.user?.slotNumber);
}

/**
 * checkChanges (express.e:21200-21209): with nothing changed, go on; else ask,
 * take one key, erase the question, and go on only on Y. The port asked
 * "Save before exiting? (Y/N)" and nothing read the answer - the next key was
 * taken as an editor command and the caller could not leave.
 */
async function checkChanges(socket: any, session: BBSSession, changes: unknown): Promise<boolean> {
  if (!changes) return true;
  socket.emit('ansi-output', 'You have unsaved changes. Do you wish to lose them (Y/N)? ');
  const ch = await readChar(socket, session);
  socket.emit('ansi-output', '\x1b[F\x1b[E\x1b[K');
  return ch === 'Y' || ch === 'y';
}

/**
 * Run one pass of an express.e key loop that reads more keys - a field's
 * lineInput, checkChanges' answer. Started, not awaited: those keys come in
 * through handleCommand one at a time (the waiting input takes them first),
 * and awaiting here would hold the queue they must come through.
 */
function startPass(label: string, pass: () => Promise<void>): void {
  void pass().catch((err) => console.error(`[account editor] ${label} failed:`, err));
}

function afterCheckChanges(socket: any, session: BBSSession, then: () => Promise<void>): void {
  startPass('checkChanges', async () => {
    if (await checkChanges(socket, session, session.tempData?.changes)) await then();
  });
}

/**
 * Out of the account editor: back to whoever opened it - the message reader's
 * U (express.e 12196-12211, editInfo then displayMessage), the sysop's 1
 * (editAccounts / listNewAccounts, user-editor.handler) - or the menu.
 * `flag` is editInfo's return (21647): 1 after X, 2 after TAB.
 */
function leaveAccountEditor(session: BBSSession, flag: number): void {
  const done = session.accountEditDone;
  session.accountEditDone = undefined;
  session.tempData = undefined;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  if (done) done(flag);
}

/**
 * checkLock (express.e:21224 checkLockAccounts, 21156-21173): taken once when
 * the editor opens. Every field edit, the presets, DELETE and RE-ACTIVATE
 * are under it (21328-21643); a sysop the LockAccounts list leaves out may
 * look, walk, save and leave.
 */
function checkLock(session: BBSSession): boolean {
  if (session.tempData.checkLock === undefined) session.tempData.checkLock = accountsUnlocked(session);
  return session.tempData.checkLock;
}

/**
 * Handle account edit input - one pass of editInfo's REPEAT loop
 * (express.e:21227-21647).
 */
export async function handleAccountEditInput(socket: any, session: BBSSession, key: string): Promise<void> {
  if (!session.tempData?.accountEditing) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const user: EditedAccount = session.tempData.editingUser;
  const command = key.toUpperCase();

  // express.e:21249-21327 - the commands every sysop has.
  switch (command) {
    // TAB - Exit (21250-21253)
    case '\t':
      afterCheckChanges(socket, session, async () => leaveAccountEditor(session, 2));
      return;

    // X - No-Save Exit (21254-21258)
    case 'X':
      afterCheckChanges(socket, session, async () => {
        socket.emit('ansi-output', '\x1b[JNo-Save\r\n');
        leaveAccountEditor(session, 1);
      });
      return;

    // SPACE - the other page (21259-21262)
    case ' ':
      session.tempData.page = session.tempData.page === 0 ? 1 : 0;
      redraw(socket, session);
      break;

    // + / - (21263-21286): the next / previous slot, when not editing online.
    case '+':
    case '-':
      if (!session.tempData.onlineEdit) {
        const direction = command === '+' ? 1 : -1;
        afterCheckChanges(socket, session, async () => {
          session.tempData.changes = false;
          await loadNextUser(socket, session, direction);
          socket.emit('ansi-output', '\x1b[18;1H');
        });
        return;
      }
      break;

    // ~ - Save (21287-21309)
    case '~':
      await saveAccount(socket, session);
      break;

    // ! - Credit Maintenance (21310-21312 -> creditMaintenance 21884)
    case '!':
      // 21892-21894: a remote caller without ACS_CREDIT_ACCESS gets nothing
      // (`RETURN 0`) and editInfo draws the account again (21312). Every web
      // caller is remote; there is no f6 console.
      if (!checkSecurity(session.user, ACSPermission.CREDIT_ACCESS)) {
        redraw(socket, session);
        break;
      }
      openCreditMaintenance(socket, session);
      return;

    // * - User Notes (21313-21315)
    case '*':
      session.subState = LoggedOnSubState.USER_NOTES_VIEW;
      displayUserNotes(socket, session);
      return;

    // @ - Conference Accounting (21316-21318)
    case '@':
      session.subState = LoggedOnSubState.CONF_ACCOUNTING_VIEW;
      // express.e:22104 `checkLock:=checkLockAccounts(f6)`, once on entry.
      session.tempData.confAcctEditable = accountsUnlocked(session);
      session.tempData.confAcctConf = user.confRJoin || 1;
      session.tempData.confAcctMsgBase = user.msgBaseRJoin || 1;
      await displayConferenceAccounting(socket, session);
      return;

    // ? - User Answers (21319-21326): this account's new-user questionnaire.
    case '?':
      if (displayUserAnswers(socket, session)) {
        session.subState = LoggedOnSubState.USER_ANSWERS_VIEW;
        return;
      }
      break;
  }

  if (checkLock(session)) {
    // 1-8 - Presets (21329-21360).
    if (command >= '1' && command <= '8') {
      startPass('preset', async () => {
        await applyPresetKey(socket, session, Number(command));
        socket.emit('ansi-output', '\x1b[18;1H');
      });
      return;
    }

    // DELETE (21362-21373)
    //
    //   hoozer.slotNumber:=0; hoozer2.number:=0
    //   saveAccount(hoozer,hoozer2,hoozer3,which,1)   -> at the SAME position
    //   deleteConfAccess(...)
    //
    // The record keeps its place in user.data; its own slotNumber field becomes
    // 0, which is what the logon refuses (29701). The sysop stays in the
    // editor (`flag:=0`), on the INACTIVE account.
    if (key === '\x7f' || command === 'DELETE') {
      socket.emit('ansi-output', '\x1b[JDelete\r\n');
      user.accountDeleted = true;
      session.tempData.changes = true;
      if (!(await writeAccount(user))) socket.emit('ansi-output', 'Can\'t Save account\r\n');
      if (user.slotNumber && user.slotNumber > 0) {
        try {
          const { deleteConfAccess } = require('../../services/delete-conf-access');
          deleteConfAccess(boardRoot(), user.slotNumber, nodeTooltype(session.nodeId ?? 0, 'CONF_DB') || 'Conf.DB');
        } catch (err) {
          console.error('[ACCOUNT EDIT] deleteConfAccess failed:', err);
        }
      }
      redrawValues(socket, session);
    }

    // 9 - RE-ACTIVATE (21374-21378): `hoozer.slotNumber:=which`, the record's
    // field back to its own position; saved with the next save.
    if (command === '9') {
      socket.emit('ansi-output', '\x1b[JRe-Activate\r\n');
      session.tempData.changes = true;
      user.accountDeleted = false;
    }

    // The page's fields (21381-21643). Each reads its own keys.
    if (isFieldKey(session.tempData.page, command)) {
      startPass(`field ${command}`, async () => {
        await editField(socket, session, command);
        socket.emit('ansi-output', '\x1b[18;1H');
      });
      return;
    }
  }

  // 21645: the end of every pass.
  socket.emit('ansi-output', '\x1b[18;1H');
}

const PAGE0_KEYS = 'ABCDEFGHIJKLMN#%OPQRSTUVWYZ';
const PAGE1_KEYS = 'ABCD';

function isFieldKey(page: number, command: string): boolean {
  return command.length === 1 && (page === 1 ? PAGE1_KEYS : PAGE0_KEYS).includes(command);
}

/** E's `Mul(numberInput(Div(x,60)),60)`: a minutes field held in seconds. */
async function minutesInput(socket: any, session: BBSSession, seconds: number): Promise<number> {
  return (await numberInput(socket, session, Math.trunc((Number(seconds) || 0) / 60))) * 60;
}

/**
 * R and U (21547-21585): Time_Total never below Time_Limit, and back to it
 * unless the level keeps upload credit (`acLvl[LVL_KEEP_UPLOAD_CREDIT]<2`).
 */
function settleTimeTotal(user: EditedAccount): void {
  if (user.timeTotal < user.timeLimit) {
    user.timeTotal = user.timeLimit;
  } else if ((getACSConfig().acLvl[LevelFlags.KEEP_UPLOAD_CREDIT] ?? 0) < 2) {
    user.timeTotal = user.timeLimit;
  }
}

/**
 * One field (express.e:21381-21643), on the account record's own fields -
 * the names the record's writer saves (load-account RECORD_FIELDS) and
 * displayAccount draws. The port read and wrote `conferenceAccess`,
 * `dailyBytesLimit`, `upCPS`, `dnCPS`, `uucpa` and `chatRemain`, and set
 * nothing at all: the value went to a `waitingForFieldInput` nobody read, so
 * no edit ever reached the account.
 */
async function editField(socket: any, session: BBSSession, command: string): Promise<void> {
  const user: EditedAccount = session.tempData.editingUser;
  const out = (s: string) => socket.emit('ansi-output', s);
  const changed = () => { session.tempData.changes = true; };
  // `IF((logonType>=LOGON_TYPE_REMOTE) AND (f6=FALSE)) IF(loggedOnUser.slotNumber=1)`:
  // every web caller is remote and the reader's U is not the f6 console.
  const slotOne = session.user?.slotNumber === 1;

  if (command === 'A') { // NAME (21383-21391, page 1 21616-21624)
    out('\x1b[2;10H');
    user.username = (await lineInput(socket, session, 30, user.username || '')).slice(0, 30);
    changed();
    return;
  }

  if (session.tempData.page === 1) {
    switch (command) {
      case 'B': // Password reset (21625-21630)
        out('\x1b[3;21H   \x1b[3;21H');
        user.forcePwdReset = (await yesNo(socket, session, 0)) ? 1 : 0;
        changed();
        return;
      case 'C': // account locked (21631-21636)
        out('\x1b[3;56H   \x1b[3;56H');
        user.accountLocked = (await yesNo(socket, session, 0)) ? 1 : 0;
        changed();
        return;
      case 'D': // invalid attempts (21637-21641)
        out('\x1b[4;21H');
        user.invalidAttempts = await numberInput(socket, session, user.invalidAttempts ?? 0);
        changed();
        return;
    }
    return;
  }

  switch (command) {
    case 'B': // Real Name (21392-21398)
      out('\x1b[2;56H');
      user.realname = (await lineInput(socket, session, 25, user.realname || '')).slice(0, 25);
      changed();
      return;
    case 'C': // Location (21399-21405)
      out('\x1b[3;10H');
      user.location = (await lineInput(socket, session, 29, user.location || '')).slice(0, 29);
      changed();
      return;
    case 'D': { // PASS (21406-21438): slot 1 only, an empty line changes nothing.
      if (!slotOne) return;
      out('\x1b[3;56H' + ' '.repeat(9) + '\b'.repeat(9));
      const pass = await lineInput(socket, session, 50);
      if (pass.length > 0) {
        // setNewPassword (935) under the board's own hash - see database.hashPassword.
        setNewPassword(user, pass);
        changed();
      }
      return;
    }
    case 'E': // Phone number (21439-21445)
      out('\x1b[4;21H');
      user.phone = (await lineInput(socket, session, 12, user.phone || '')).slice(0, 12);
      changed();
      return;
    case 'F': // conference access (21446-21452)
      out('\x1b[4;56H');
      user.confAccess = (await lineInput(socket, session, 9, user.confAccess || '')).slice(0, 9);
      changed();
      return;
    case 'G': // RATIO (21453-21457)
      out('\x1b[5;21H');
      user.ratio = await numberInput(socket, session, user.ratio);
      changed();
      return;
    case 'H': // SEC_Level (21458-21469): slot 1 only, but `changes:=TRUE` either way.
      if (slotOne) {
        out('\x1b[5;56H');
        user.secLevel = await numberInput(socket, session, user.secLevel);
      }
      changed();
      return;
    case 'I': // Ratio Type (21470-21483)
      out('\x1b[6;21H');
      user.ratioType = await numberInput(socket, session, user.ratioType);
      if (user.ratioType < 0 || user.ratioType > 2) {
        out('\x07');
        user.ratioType = 0;
      }
      out(`\x1b[6;1H\x1b[33mI> \x1b[32mRatio Type ....\x1b[36m:\x1b[0m ${String(user.ratioType).padEnd(5)}`);
      if (user.ratioType === 0) out(' \x1b[32m<-\x1b[33mByte\x1b[32m)\x1b[0m');
      if (user.ratioType === 1) out(' \x1b[32m<-\x1b[33mB/F\x1b[32m)\x1b[0m ');
      if (user.ratioType === 2) out(' \x1b[32m<-\x1b[33mFile\x1b[32m)\x1b[0m');
      changed();
      return;
    case 'J': { // conference ReJoin (21484-21490)
      out('\x1b[6;56H');
      const { conf, msgBase } = await rJoinInput(socket, session);
      user.confRJoin = conf;
      user.autoRejoin = conf;
      user.msgBaseRJoin = msgBase;
      changed();
      return;
    }
    case 'K': // UPLOADS (21491-21495)
      out('\x1b[7;21H');
      user.uploads = await numberInput(socket, session, user.uploads);
      changed();
      return;
    case 'L': // MESSAGES_POSTED (21496-21500)
      out('\x1b[7;56H');
      user.messagesPosted = await numberInput(socket, session, user.messagesPosted ?? 0);
      changed();
      return;
    case 'M': // DOWNLOADS (21501-21505)
      out('\x1b[8;21H');
      user.downloads = await numberInput(socket, session, user.downloads);
      changed();
      return;
    case 'N': // New user (21506-21511)
      out('\x1b[8;56H   \x1b[8;56H');
      user.newUser = await yesNo(socket, session, 0);
      changed();
      return;
    case '#': // times called (21512-21516)
      out('\x1b[6;71H');
      user.calls = await numberInput(socket, session, user.calls);
      changed();
      return;
    case '%': // calls today (21517-21521)
      out('\x1b[7;71H');
      user.callsToday = await numberInput(socket, session, getTodaysCalls(user));
      changed();
      return;
    case 'O': // Bytes Uploaded (21522-21528)
      out('\x1b[9;21H');
      user.bytesUpload = Number(await bcdNumberInput(socket, session, BigInt(Math.trunc(Number(user.bytesUpload) || 0))));
      changed();
      return;
    case 'P': // Bytes Downloaded (21529-21534)
      out('\x1b[10;21H');
      user.bytesDownload = Number(await bcdNumberInput(socket, session, BigInt(Math.trunc(Number(user.bytesDownload) || 0))));
      changed();
      return;
    case 'Q': // Daily Bytes Limit (21535-21546)
      out('\x1b[11;21H         \x1b[11;21H');
      {
        // Today's extra bytes ride over the new limit (21537-21544).
        const todays = user.todaysBytesLimit ?? user.byteLimit;
        const extra = todays !== 0 ? todays - user.byteLimit : 0;
        user.byteLimit = await longNumberInput(socket, session, user.byteLimit);
        user.todaysBytesLimit = user.byteLimit !== 0 ? user.byteLimit + extra : 0;
      }
      changed();
      return;
    case 'R': // Time_Total (21547-21558)
      out('\x1b[12;17H');
      user.timeTotal = await minutesInput(socket, session, user.timeTotal);
      settleTimeTotal(user);
      changed();
      return;
    case 'S': // up cps (21559-21564)
      out('\x1b[12;47H');
      user.topUploadCPS = await longNumberInput(socket, session, user.topUploadCPS);
      changed();
      return;
    case 'T': // down cps (21565-21570)
      out('\x1b[12;69H');
      user.topDownloadCPS = await longNumberInput(socket, session, user.topDownloadCPS);
      changed();
      return;
    case 'U': // Time_Limit (21571-21585)
      out('\x1b[13;17H');
      user.timeLimit = await minutesInput(socket, session, user.timeLimit);
      settleTimeTotal(user);
      changed();
      return;
    case 'V': // TIME_USED (21586-21593)
      out('\x1b[13;51H');
      user.timeUsed = await minutesInput(socket, session, user.timeUsed);
      changed();
      return;
    case 'W': // uucpa (21594-21598)
      out('\x1b[13;76H');
      // A CHAR: the number typed, its low byte (21596).
      user.uucpa = (await uucpNumberInput(socket, session, user.uucpa ?? (user.uuCP ? 1 : 0))) & 0xff;
      user.uuCP = user.uucpa !== 0;
      changed();
      return;
    case 'Y': { // chat limit (21599-21606): what was used stays used.
      out('\x1b[14;17H');
      const used = Number(user.chatUsed) || 0;
      user.chatLimit = await minutesInput(socket, session, user.chatLimit);
      // chatRemain:=chatLimit-temp, never below 0; the port keeps chatUsed.
      user.chatUsed = user.chatLimit - Math.max(0, user.chatLimit - used);
      changed();
      return;
    }
    case 'Z': { // chat used (21607-21612)
      out('\x1b[14;51H');
      const used = await minutesInput(socket, session, user.chatUsed);
      user.chatUsed = user.chatLimit - Math.max(0, user.chatLimit - used);
      changed();
      return;
    }
  }
}

/**
 * applyPreset (express.e:29358-29370): what the preset sets, onto the account.
 * The editor's 1-8 and the bulk editor's preset apply (23796+) both use it.
 */
export function presetOntoAccount(user: EditedAccount, values: NonNullable<ReturnType<typeof applyPreset>>): void {
  user.confAccess = values.confAccess;
  user.secLevel = values.secLevel;
  user.ratioType = values.ratioType;
  user.ratio = values.ratio;
  user.timeLimit = values.timeLimit;
  user.confRJoin = values.confRJoin;
  user.autoRejoin = values.confRJoin;
  user.msgBaseRJoin = values.msgBaseRJoin;
  user.byteLimit = values.byteLimit;
}

/**
 * 1-8 (express.e:21329-21360): the board's preset n (Access/PRESET.n), when
 * it has a PRESET.AREA.
 */
async function applyPresetKey(socket: any, session: BBSSession, preset: number): Promise<void> {
  const user: EditedAccount = session.tempData.editingUser;
  const tooltypes = readPreset(boardRoot(), preset);
  const values = applyPreset(tooltypes);
  if (!tooltypes || !values) return;

  socket.emit('ansi-output', `\x1b[JPreset ${preset}. `);
  session.tempData.changes = true;
  user.newUser = false;
  presetOntoAccount(user, values);
  // 21343-21348
  user.timeUsed = 0;
  user.timeTotal = user.timeLimit;
  user.topUploadCPS = 0;
  user.topDownloadCPS = 0;

  socket.emit('ansi-output', 'Preset All Conferences with Ratios & RatioType ');
  if (await yesNo(socket, session, 1)) {
    applyConfPresets(boardRoot(), Number(user.slotNumber) || 0, tooltypes,
      nodeTooltype(session.nodeId ?? 0, 'CONF_DB') || 'Conf.DB');
  }
  socket.emit('ansi-output', '\x1b[18;1H' + ' '.repeat(68));
  redrawValues(socket, session);
}

// ===== Helper Functions =====

/**
 * express.e loadAccount(which,...): the account in user.data slot `which`, or
 * null past the last record (RESULT_FAILURE). The record is read from disk -
 * it is what the board acts on - and merged over its database row, which the
 * editor's save writes through. A slot's row counts only when it names the
 * same account; otherwise the row is found by the record's name.
 */
export async function loadAccountAt(slot: number): Promise<any | null> {
  if (!Number.isInteger(slot) || slot < 1) return null;
  const { db } = require('../../database');
  const { userFileManager } = require('../../services/UserFileManager');
  const { loadAccount } = require('../../services/load-account');
  const disk = userFileManager.readUserBySlot(slot);
  if (!disk) return null;
  const same = (name: unknown) => String(name ?? '').trim().toLowerCase() === String(disk.username ?? '').trim().toLowerCase();
  const bySlot = await db.getUserBySlotNumber(slot);
  const row = bySlot && same(bySlot.username) ? bySlot : await db.getUserByUsername(disk.username);
  if (!row) return { ...disk, slotNumber: slot };
  return { ...loadAccount({ ...row, slotNumber: slot }).user, slotNumber: slot };
}

/** express.e findLastAccount (21075-21083): user.data's size over SIZEOF user. */
export function lastAccountSlot(): number {
  const { userDatabaseManager } = require('../../services/UserDatabaseManager');
  return Math.max(1, Number(userDatabaseManager.getUserCount()) || 1);
}

/** The account at `slot` becomes the one being edited. */
function editAccountAt(session: BBSSession, account: any, slot: number): void {
  session.tempData.editingUser = account;
  session.tempData.editingSlot = slot;
  session.tempData.originalData = JSON.parse(JSON.stringify(account));
}

/**
 * + and - (express.e:21263-21286): which:=which+1, and past the last record
 * back to slot 1; which:=which-1, and below 1 to findLastAccount(). Then
 * displayAccountInfo - the values over the screen already drawn.
 */
async function loadNextUser(socket: any, session: BBSSession, direction: number): Promise<void> {
  try {
    let slot = Number(session.tempData.editingSlot) + direction;
    if (direction < 0 && slot < 1) slot = lastAccountSlot();
    let account = await loadAccountAt(slot);
    if (!account && direction > 0) {
      slot = 1;
      account = await loadAccountAt(slot);
    }
    // express.e does not look at the second load's result; there is no
    // message of its own. The account on screen stays the one edited.
    if (!account) return;
    editAccountAt(session, account, slot);
    session.tempData.changes = false;
    redrawValues(socket, session);
  } catch (err) {
    console.error('Error loading next user:', err);
  }
}

/**
 * saveAccount for the editor: the record and its row (database.updateUser
 * writes the user.data / user.keys / user.misc record first). False when it
 * failed - express.e's `stat<>RESULT_SUCCESS`.
 */
export async function writeAccount(user: EditedAccount): Promise<boolean> {
  const { db } = require('../../database');
  try {
    await db.updateUser(user.id, user);
    return true;
  } catch (err) {
    console.error('Error saving account:', err);
    return false;
  }
}

/** ~ (express.e:21287-21309). */
async function saveAccount(socket: any, session: BBSSession): Promise<void> {
  const user: EditedAccount = session.tempData.editingUser;
  socket.emit('ansi-output', '\x1b[JSave\r\n');
  user.newUser = false;
  redrawValues(socket, session);
  if (!(await writeAccount(user))) socket.emit('ansi-output', 'Can\'t Save account\r\n');
  // 21303-21307: every web caller is remote.
  await writeToCallersLog(`\tREMOTE Account Maintenance on Account ${user.slotNumber ?? 0}`, session.nodeId ?? 0);
  session.tempData.changes = false;
}

// ===== User Notes Functions - express.e:21679-21739 =====
// (path/read/save moved to utils/user-notes.util.ts - shared with BBSApi.addUserNote)

/**
 * Display user notes screen
 * express.e:21679-21739
 */
export function displayUserNotes(socket: any, session: BBSSession): void {
  const user = session.tempData.editingUser;
  const slot = session.tempData.editingSlot;

  // Clear screen and show header (express.e:21688-21689)
  socket.emit('ansi-output', '\x1b[2J');
  socket.emit('ansi-output', '\x1b[2;1H                          \x1b[33mUSER ACCOUNT NOTES\x1b[0m');

  // Hide cursor (express.e:21691)
  socket.emit('ansi-output', '\x1b[?25l');

  // Show user info (express.e:21695-21696)
  // Format: [0001] Username
  const slotStr = slot.toString().padStart(4, '0');
  const nameStr = (user.username || '').substring(0, 32).padEnd(32);
  socket.emit('ansi-output', `\x1b[4;0H\x1b[0m[${slotStr}] ${nameStr}`);

  // Show notes header (express.e:21703-21704)
  socket.emit('ansi-output', '\x1b[6;0H\x1b[33mUSER NOTES\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[34m------------------------------------------------------------------------------\x1b[0m\r\n');

  // Display notes content (express.e:21705)
  const notes = readUserNotes(slot);
  if (notes) {
    socket.emit('ansi-output', notes + '\r\n');
  } else {
    socket.emit('ansi-output', 'None\r\n');
  }

  // Show footer (express.e:21706-21708)
  socket.emit('ansi-output', '\x1b[34m------------------------------------------------------------------------------\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');

  // express.e:21709 - the one key line. + and - work (when not editing
  // online) without being offered, as in express.e.
  socket.emit('ansi-output', '\x1b[33m<TAB>\x1b[36m=\x1b[0mExit \x1b[33mE\x1b[36m=\x1b[0mEdit\r\n');

  // Show cursor
  socket.emit('ansi-output', '\x1b[?25h');
}

/**
 * Handle user notes input
 * express.e:21710-21736
 */
export async function handleUserNotesInput(socket: any, session: BBSSession, key: string): Promise<void> {
  const command = key.toUpperCase();
  const onlineEdit = session.tempData.onlineEdit || false;

  // TAB - Exit (express.e:21734-21735); editInfo draws the account (21315).
  if (key === '\t') {
    session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
    redraw(socket, session);
    return;
  }

  // E - Edit notes (express.e:21731-21733): `loadMsg(fname)`, the board's
  // message editor, `saveMsg(fname)` when it saves. The port had a line
  // editor of its own ("Editing user notes. Enter text (blank line to
  // finish)", "Notes saved.").
  if (command === 'E') {
    const slot = session.tempData.editingSlot;
    startPass('notes edit', async () => {
      // Required here: the message editor's module loads the mail services.
      const { editLines, loadMsgLines, saveMsgText } = require('../message/door-edit-file') as typeof import('../message/door-edit-file');
      const saved = await editLines(socket, session, loadMsgLines(readUserNotes(slot)));
      if (saved !== null) {
        const text = saveMsgText(saved);
        if (text !== null) saveUserNotes(slot, text);
      }
      displayUserNotes(socket, session);
    });
    return;
  }

  // + - Next user (express.e:21717-21724)
  if (command === '+' && !onlineEdit) {
    await loadNextUserForNotes(socket, session, 1);
    return;
  }

  // - - Previous user (express.e:21725-21730)
  if (command === '-' && !onlineEdit) {
    await loadNextUserForNotes(socket, session, -1);
    return;
  }
}

/**
 * Load next/previous user for notes view
 */
async function loadNextUserForNotes(socket: any, session: BBSSession, direction: number): Promise<void> {
  try {
    // express.e:21717-21730 - the same walk as the editor's +/-.
    let slot = Number(session.tempData.editingSlot) + direction;
    if (direction < 0 && slot < 1) slot = lastAccountSlot();
    let account = await loadAccountAt(slot);
    if (!account && direction > 0) {
      slot = 1;
      account = await loadAccountAt(slot);
    }
    if (account) editAccountAt(session, account, slot);
    displayUserNotes(socket, session);
  } catch (err) {
    console.error('Error loading user for notes:', err);
  }
}

// ===== Conference Accounting Functions - express.e:22045-22250 =====

/**
 * The edited account's record for a conference: his slot in the
 * conference's Conf.DB (express.e:22053-22055 masterLoadPointers(hoozer),
 * then `cb:=confBases.item(getConfIndex(conf,msgbase))` 22196). Null when
 * the account has no slot.
 */
function getConfBaseRecord(user: { slotNumber?: number }, confId: number): ConfBaseRecord | null {
  const slot = Number(user?.slotNumber) || 0;
  if (slot < 1) return null;
  return messagePointerFileManager.readRecordOrZero(confId, slot);
}

/** `~` - express.e:22283-22285 masterSavePointers(hoozer): back into his slot. */
function saveConfBaseRecord(user: { slotNumber?: number }, confId: number, record: ConfBaseRecord): boolean {
  const slot = Number(user?.slotNumber) || 0;
  if (slot < 1) return false;
  try {
    messagePointerFileManager.patchRecord(confId, slot, {
      ratio: record.ratio,
      ratioType: record.ratioType,
      upload: record.upload,
      downloads: record.downloads,
      bytesUpload: record.bytesUpload,
      uploadBytesBCD: record.uploadBytesBCD,
      bytesDownload: record.bytesDownload,
      downloadBytesBCD: record.downloadBytesBCD,
      messagesPosted: record.messagesPosted,
    });
    return true;
  } catch (err) {
    console.error('Error saving the Conf.DB record:', err);
    return false;
  }
}

/**
 * Display Conference Accounting screen
 * express.e:22045-22250
 */
export async function displayConferenceAccounting(socket: any, session: BBSSession): Promise<void> {
  const { db } = require('../../database');
  const user = session.tempData.editingUser;
  const confId = session.tempData.confAcctConf || 1;

  try {
    // Get conference and message base info
    const conferences = await db.getConferences();
    const conf = conferences.find((c: any) => c.id === confId);
    const confName = conf?.name || `Conference ${confId}`;

    // The edited account's own Conf.DB record. Kept across redraws so an
    // unsaved edit is shown, re-read when the conference changes.
    const recordKey = `${user?.slotNumber}:${confId}`;
    let confBase: ConfBaseRecord | null = session.tempData.confBaseRecord;
    if (!confBase || session.tempData.confBaseRecordKey !== recordKey) {
      confBase = getConfBaseRecord(user, confId);
      session.tempData.confBaseRecord = confBase;
      session.tempData.confBaseRecordKey = recordKey;
      session.tempData.confBaseRecordConf = confId;
    }

    // Clear screen
    socket.emit('ansi-output', '\x1b[2J');

    // User info (express.e:22112-22116)
    socket.emit('ansi-output', `\x1b[2;1H \x1b[32mName\x1b[36m:\x1b[0m ${(user.username || '').substring(0, 32).padEnd(32)} `);
    socket.emit('ansi-output', `\x1b[3;1H \x1b[32mLoc.\x1b[36m:\x1b[0m ${(user.location || '').substring(0, 29).padEnd(29)}\r\n`);
    socket.emit('ansi-output', `\x1b[4;1H \x1b[32mConf\x1b[36m:\x1b[0m ${confName.substring(0, 60).padEnd(60)}\r\n`);

    // Per-conference stats (express.e:22128-22160)
    const ratio = (confBase?.ratio || 0) & 0xFFFF;
    const ratioType = (confBase?.ratioType || 0) & 0xFFFF;
    const uploads = (confBase?.upload || 0) & 0xFFFF;
    const downloads = (confBase?.downloads || 0) & 0xFFFF;
    const bytesUp = confBase ? accountedBytes(confBase.bytesUpload, confBase.uploadBytesBCD).toString() : '0';
    const bytesDn = confBase ? accountedBytes(confBase.bytesDownload, confBase.downloadBytesBCD).toString() : '0';
    const msgPosted = (confBase?.messagesPosted || 0) & 0xFFFF;

    socket.emit('ansi-output', `\x1b[6;2H\x1b[33mG>\x1b[32mRatio .........\x1b[36m:\x1b[0m ${String(ratio).padEnd(7)}\r\n`);

    let ratioTypeStr = '';
    if (ratioType === 0) ratioTypeStr = ' \x1b[32m<-\x1b[33mByte\x1b[32m)\x1b[0m';
    else if (ratioType === 1) ratioTypeStr = ' \x1b[32m<-\x1b[33mB/F\x1b[32m)\x1b[0m ';
    else if (ratioType === 2) ratioTypeStr = ' \x1b[32m<-\x1b[33mFile\x1b[32m)\x1b[0m';
    socket.emit('ansi-output', `\x1b[7;2H\x1b[33mI>\x1b[32mRatio Type ....\x1b[36m:\x1b[0m ${String(ratioType).padEnd(5)}${ratioTypeStr}`);

    socket.emit('ansi-output', `\x1b[8;2H\x1b[33mK>\x1b[32mUploads .......\x1b[36m:\x1b[0m ${String(uploads).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[9;2H\x1b[33mM>\x1b[32mDownloads .....\x1b[36m:\x1b[0m ${String(downloads).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[10;2H\x1b[33mO>\x1b[32mBytes Uled ....\x1b[36m:\x1b[0m ${String(bytesUp).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[11;2H\x1b[33mP>\x1b[32mBytes Dled ....\x1b[36m:\x1b[0m ${String(bytesDn).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[12;2H\x1b[33mL>\x1b[32mMessages Posted\x1b[36m:\x1b[0m ${String(msgPosted).padEnd(10)}`);

    // Accumulated totals (express.e:22162-22187)
    socket.emit('ansi-output', '\x1b[6;40H\x1b[33mAccumulated Total\x1b[0m');
    socket.emit('ansi-output', `\x1b[8;40H\x1b[32mUploads .......\x1b[36m:\x1b[0m ${String(user.uploads || 0).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[9;40H\x1b[32mDownloads .....\x1b[36m:\x1b[0m ${String(user.downloads || 0).padEnd(10)}\r\n`);
    socket.emit('ansi-output', `\x1b[10;40H\x1b[32mBytes Uled ....\x1b[36m:\x1b[0m ${String(user.bytesUpload || 0).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[11;40H\x1b[32mBytes Dled ....\x1b[36m:\x1b[0m ${String(user.bytesDownload || 0).padEnd(16)}\r\n`);
    socket.emit('ansi-output', `\x1b[12;40H\x1b[32mMessages_Posted\x1b[36m:\x1b[0m ${String(user.messagesPosted || 0).padEnd(10)}`);

    // Commands (express.e:22189-22191)
    socket.emit('ansi-output', '\x1b[14;1H  \x1b[33m-/+\x1b[36m=\x1b[0mPrev/Next Conference      \x1b[33m~\x1b[36m=\x1b[0mSAVE\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[15;1H  \x1b[33m<TAB>\x1b[36m=\x1b[0mEXIT Conference Accounting\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[16;1H');

  } catch (err) {
    console.error('Error displaying conference accounting:', err);
  }
}

/**
 * Handle Conference Accounting input
 * express.e:22197-22250
 */
export async function handleConferenceAccountingInput(socket: any, session: BBSSession, key: string): Promise<void> {
  const { db } = require('../../database');
  const command = key.toUpperCase();
  const user = session.tempData.editingUser;

  // TAB - Exit (express.e:22222-22225): checkChanges, as the editor's.
  if (key === '\t') {
    startPass('conference accounting exit', async () => {
      if (await checkChanges(socket, session, session.tempData.confAcctChanges)) exitConferenceAccounting(socket, session);
    });
    return;
  }

  // Handle field editing if waiting for input
  if (session.tempData.confAcctFieldEdit) {
    if (key === '\r' || key === '\n') {
      const field = session.tempData.confAcctFieldEdit;
      const value = parseInt(session.inputBuffer || '0', 10) || 0;
      session.inputBuffer = '';

      const confBase = session.tempData.confBaseRecord;
      if (confBase) {
        // express.e:22231-22281
        switch (field) {
          case 'G': confBase.ratio = value & 0xffff; break;
          case 'I':
            // 22239-22242: a type outside 0-2 rings the bell and becomes 0.
            confBase.ratioType = (value < 0 || value > 2) ? 0 : value;
            if (value < 0 || value > 2) socket.emit('ansi-output', '\x07');
            break;
          case 'K': confBase.upload = value & 0xffff; break;
          case 'M': confBase.downloads = value & 0xffff; break;
          case 'O':
            // 22254-22256 bcdNumberInput, then bytesUpload from the BCD.
            confBase.uploadBytesBCD = writePackedBCD(BigInt(value));
            confBase.bytesUpload = value > 0x7fffffff ? -1 : value;
            break;
          case 'P':
            confBase.downloadBytesBCD = writePackedBCD(BigInt(value));
            confBase.bytesDownload = value > 0x7fffffff ? -1 : value;
            break;
          case 'L': confBase.messagesPosted = value & 0xffff; break;
        }
        session.tempData.confAcctChanges = true;
      }

      session.tempData.confAcctFieldEdit = undefined;
      await displayConferenceAccounting(socket, session);
    } else if (key === '\x7f' || key === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b');
      }
    } else if (key >= '0' && key <= '9') {
      session.inputBuffer = (session.inputBuffer || '') + key;
      socket.emit('ansi-output', key);
    }
    return;
  }

  // + - Next conference (express.e:22203-22211)
  if (command === '+') {
    const conferences = await db.getConferences();
    let confId = session.tempData.confAcctConf || 1;
    confId++;
    if (confId > conferences.length) confId = 1;
    session.tempData.confAcctConf = confId;
    session.tempData.confAcctMsgBase = 1;
    await displayConferenceAccounting(socket, session);
    return;
  }

  // - - Previous conference (express.e:22212-22220)
  if (command === '-') {
    const conferences = await db.getConferences();
    let confId = session.tempData.confAcctConf || 1;
    confId--;
    if (confId < 1) confId = conferences.length;
    session.tempData.confAcctConf = confId;
    session.tempData.confAcctMsgBase = 1;
    await displayConferenceAccounting(socket, session);
    return;
  }

  // express.e:22227 - G I K M O P L and ~ live inside `IF checkLock`. A
  // sysop the LockAccounts list leaves out may walk and leave; those keys do
  // nothing and print nothing.
  if (!session.tempData.confAcctEditable) return;

  // ~ - Save (express.e:22282)
  if (command === '~') {
    await saveConferenceAccountingChanges(socket, session);
    await displayConferenceAccounting(socket, session);
    return;
  }

  // Field editing commands (express.e:22229-22281)
  if (['G', 'I', 'K', 'M', 'O', 'P', 'L'].includes(command)) {
    const lineNum: { [key: string]: number } = { G: 6, I: 7, K: 8, M: 9, O: 10, P: 11, L: 12 };
    socket.emit('ansi-output', `\x1b[${lineNum[command]};21H`);
    session.tempData.confAcctFieldEdit = command;
    session.inputBuffer = '';
    return;
  }
}

/**
 * `~` (express.e:22282-22293): `[JSave`, masterSavePointers, no changes left.
 * masterSavePointers says nothing either way; a failed write is logged.
 */
async function saveConferenceAccountingChanges(socket: any, session: BBSSession): Promise<void> {
  socket.emit('ansi-output', '\x1b[JSave\r\n');
  const confBase = session.tempData.confBaseRecord;
  if (confBase) saveConfBaseRecord(session.tempData.editingUser, session.tempData.confBaseRecordConf || 1, confBase);
  session.tempData.confAcctChanges = false;
}

/**
 * Exit conference accounting and return to account editor
 */
function exitConferenceAccounting(socket: any, session: BBSSession): void {
  // Clean up temp data
  session.tempData.confAcctConf = undefined;
  session.tempData.confAcctMsgBase = undefined;
  session.tempData.confBaseRecord = undefined;
  session.tempData.confAcctChanges = undefined;
  session.tempData.confAcctFieldEdit = undefined;

  // editInfo draws the account (express.e:21318).
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
  redraw(socket, session);
}

// ===== Credit Maintenance - express.e:21884-22042 creditMaintenance() =====

/** Seconds since the Unix epoch, as express.e getSystemDate() returns. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** A credit date field (unix seconds) as a display string; 0 is blank. */
function creditDateStr(seconds: number): string {
  if (!seconds) return '';
  return formatLongDate(new Date(seconds * 1000));
}

/**
 * Display the Credit Maintenance screen.
 * 1:1 port of express.e:21898-21953.
 *
 * checkLockAccounts gates the edits and the save (creditEditable, 21896), and
 * the save writes the CreditLog (writeCreditLog, 22013-22021).
 */
export function displayCreditMaintenance(socket: any, session: BBSSession): void {
  const user = session.tempData.editingUser;

  const days = user.creditDays || 0;
  const amount = user.creditAmount || 0;
  const totalToDate = user.creditTotalToDate || 0;
  const totalDate = user.creditTotalDate || 0;
  const startDate = user.creditStartDate || 0;
  const tracking = user.creditTracking || 0;

  // Days remaining (express.e:21942-21947).
  let remain = 0;
  if (startDate !== 0 && days !== 0) {
    remain = Math.floor(startDate / 86400) + days - Math.floor(nowSeconds() / 86400);
  }
  // Ending date = start + days (express.e:21937).
  const endDate = startDate === 0 ? 0 : startDate + days * 86400;

  const upYesNo = (tracking & TRACK_UPLOADS_BIT) ? 'Yes' : 'No ';
  const dnYesNo = (tracking & TRACK_DOWNLOADS_BIT) ? 'Yes' : 'No ';

  // `\d[7]` is left-justified, of the INT (`AND $FFFF`).
  const d7 = (n: number) => String((Number(n) || 0) & 0xffff).padEnd(7);

  socket.emit('ansi-output', '\x1b[2J');
  socket.emit('ansi-output', '\x1b[2;1H                      \x1b[33mACCOUNT CREDIT MAINTENANCE\x1b[0m');
  socket.emit('ansi-output', `\x1b[4;2H\x1b[0m[${String(user.slotNumber ?? 0).padStart(4, '0')}] ${(user.username || '').substring(0, 32).padEnd(32)}`);

  socket.emit('ansi-output', '\x1b[6;2H\x1b[33mCREDIT STATUS \x1b[0m');
  socket.emit('ansi-output', days === 0 ? '\x1b[37mINACTIVE      \x1b[0m' : '\x1b[32mACTIVE        \x1b[0m');

  socket.emit('ansi-output', `\x1b[8;2H\x1b[33m1.>\x1b[32m Days Credited  \x1b[33m[\x1b[0m${d7(days)}\x1b[33m]\x1b[0m`);
  socket.emit('ansi-output', `\x1b[9;2H\x1b[33m2.>\x1b[32m Amount Paid    \x1b[33m[\x1b[0m${d7(amount)}\x1b[33m]\x1b[0m`);
  socket.emit('ansi-output', `\x1b[10;2H\x1b[33m3.>\x1b[32m Amount Paid to Date \x1b[33m[\x1b[0m${d7(totalToDate)}\x1b[33m]\x1b[32m as of \x1b[0m${creditDateStr(totalDate)}`);
  socket.emit('ansi-output', `\x1b[11;2H\x1b[33m4.> \x1b[32mTrack Uploads   \x1b[0m${upYesNo} \x1b[32m Beginning Date \x1b[0m${creditDateStr(startDate)}`);
  socket.emit('ansi-output', `\x1b[12;2H\x1b[33m5.> \x1b[32mTrack Downloads \x1b[0m${dnYesNo} \x1b[32m Ending Date    \x1b[0m${creditDateStr(endDate)}`);
  socket.emit('ansi-output', `\x1b[13;2H\x1b[33m   \x1b[32m Days Remaining. \x1b[0m${String(remain).padEnd(7)}`);

  // express.e:21949-21952
  socket.emit('ansi-output', '\x1b[15;2H\x1b[33mX\x1b[36m=\x1b[0mEXIT \x1b[33mR\x1b[36m=\x1b[0mRESET/SET BEGINNING DATE \x1b[0m');
  socket.emit('ansi-output', '\x1b[33mT\x1b[36m=\x1b[0mTERMINATE CREDIT ACCOUNT \x1b[0m');
  socket.emit('ansi-output', '\x1b[16;2H\x1b[33mU\x1b[36m=\x1b[0mUPDATE CREDIT TOTAL \x1b[33m~\x1b[36m=\x1b[0mSAVE ACCOUNT \x1b[0m');
  socket.emit('ansi-output', '\x1b[33m<TAB>\x1b[36m=\x1b[0mCONT\x1b[0m');
  socket.emit('ansi-output', '\x1b[17;2H');
}

/**
 * Handle Credit Maintenance input.
 * 1:1 port of express.e:21965-22010.
 */
export async function handleCreditMaintenanceInput(socket: any, session: BBSSession, key: string): Promise<void> {
  const user = session.tempData.editingUser;
  const command = key.toUpperCase();

  // Field-edit mode (1/2/3): buffer digits, commit on ENTER (express.e numberInput).
  if (session.tempData.creditFieldEdit) {
    if (key === '\r' || key === '\n') {
      const field = session.tempData.creditFieldEdit;
      const value = parseInt(session.inputBuffer || '0', 10) || 0;
      session.inputBuffer = '';
      if (field === '1') user.creditDays = value;
      else if (field === '2') user.creditAmount = value;
      else if (field === '3') { user.creditTotalToDate = value; user.creditTotalDate = nowSeconds(); }
      session.tempData.creditFieldEdit = undefined;
      session.tempData.creditChanges = true;
      displayCreditMaintenance(socket, session);
    } else if (key === '\x7f' || key === '\b') {
      if (session.inputBuffer?.length) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        socket.emit('ansi-output', '\b \b');
      }
    } else if (key >= '0' && key <= '9') {
      session.inputBuffer = (session.inputBuffer || '') + key;
      socket.emit('ansi-output', key);
    }
    return;
  }

  // TAB / X - exit through checkChanges (express.e:21966-21969): flag 2 / 1.
  if (key === '\t' || command === 'X') {
    const flag = key === '\t' ? 2 : 1;
    startPass('credit maintenance exit', async () => {
      if (await checkChanges(socket, session, session.tempData.creditChanges)) exitCreditMaintenance(socket, session, flag);
    });
    return;
  }

  // express.e:21972 - every edit and the save live inside `IF checkLock`. A
  // remote sysop the LockAccounts allow-list does not name may view and exit,
  // but changes and ~ save do nothing.
  if (!session.tempData.creditEditable) return;

  switch (command) {
    // 1/2/3 - numeric field edits (express.e:21974-21986).
    case '1': socket.emit('ansi-output', '\x1b[8;22H'); session.tempData.creditFieldEdit = '1'; session.inputBuffer = ''; return;
    case '2': socket.emit('ansi-output', '\x1b[9;22H'); session.tempData.creditFieldEdit = '2'; session.inputBuffer = ''; return;
    case '3': socket.emit('ansi-output', '\x1b[10;27H'); session.tempData.creditFieldEdit = '3'; session.inputBuffer = ''; return;
    // 4/5 - toggle tracking bits (express.e:21987-21992).
    case '4': user.creditTracking = (user.creditTracking || 0) ^ TRACK_UPLOADS_BIT; session.tempData.creditChanges = true; displayCreditMaintenance(socket, session); return;
    case '5': user.creditTracking = (user.creditTracking || 0) ^ TRACK_DOWNLOADS_BIT; session.tempData.creditChanges = true; displayCreditMaintenance(socket, session); return;
    // U - roll the amount paid into the running total (express.e:21993-21996).
    case 'U': user.creditTotalToDate = (user.creditTotalToDate || 0) + (user.creditAmount || 0); user.creditTotalDate = nowSeconds(); session.tempData.creditChanges = true; displayCreditMaintenance(socket, session); return;
    // R - reset/set the beginning date to now (express.e:21997-21999).
    case 'R': user.creditStartDate = nowSeconds(); session.tempData.creditChanges = true; displayCreditMaintenance(socket, session); return;
    // T - terminate: zero the days (express.e:22000-22002).
    case 'T': user.creditDays = 0; session.tempData.creditChanges = true; displayCreditMaintenance(socket, session); return;
    // ~ - save the account (express.e:22003-22036).
    // WEB_: express.e:22004 saves only `IF (logonType<LOGON_TYPE_REMOTE) OR (f6=TRUE)` - a local console sysop. This board has no local console and every caller is remote, so E's rule would make credit maintenance unsaveable here; the sysop chose to keep the remote save (2026-10-12).
    case '~': await saveCreditMaintenance(socket, session); displayCreditMaintenance(socket, session); return;
  }
}

/**
 * Persist credit changes (express.e:22003-22036 save arm).
 * express.e:22005 - a credited-but-unstarted account gets its start date now.
 */
async function saveCreditMaintenance(socket: any, session: BBSSession): Promise<void> {
  const { db } = require('../../database');
  const user = session.tempData.editingUser;
  if ((user.creditDays || 0) > 0 && (user.creditStartDate || 0) === 0) {
    user.creditStartDate = nowSeconds();
  }
  try {
    socket.emit('ansi-output', '\x1b[17;2HSaving Account...');
    await db.updateUser(user.id, user);
    writeCreditLog(user);
    session.tempData.creditChanges = false;
    session.tempData.changes = false;
  } catch (err) {
    console.error('Error saving credit maintenance:', err);
    socket.emit('ansi-output', 'Can\'t Save account\r\n');
  }
}

/**
 * Whether the LockAccounts allow-list lets this sysop EDIT (not just view).
 * 1:1 port of express.e:21156 checkLockAccounts. Web callers are all remote,
 * so the list always applies: absent file = anyone may edit; present file =
 * only the sysop names (one name per line) may. An unreadable list locks,
 * matching express.e's res=FALSE default.
 */
function accountsUnlocked(session: BBSSession): boolean {
  // `\sLockAccounts` with cmds.bbsLoc (21161): the board's own directory.
  const lockFile = path.join(boardRoot(), 'LockAccounts');
  if (!amigafs.existsSync(lockFile)) return true;
  try {
    const raw = amigafs.readFileSync(lockFile, 'utf8');
    const content = typeof raw === 'string' ? raw : raw.toString('utf8');
    const me = (session.user?.username || '').trim().toLowerCase();
    return content
      .split(/\r?\n/)
      .map((l) => l.trim().toLowerCase())
      .some((n) => n.length > 0 && n === me);
  } catch {
    return false;
  }
}

/**
 * Append a credit change to the BBS CreditLog.
 * 1:1 port of express.e:22013-22021 (the save-arm creditLog calls) + the
 * creditLog() writer at express.e:9437 (append, create if absent).
 * express.e:9441 `StringF(fn,'\sCreditLog',cmds.bbsLoc)`: the board's root,
 * which is boardRoot() here, not the config's snapshot of it.
 */
export function writeCreditLog(user: any): void {
  const now = new Date();
  const date = formatLongDate(now);
  const time = formatLongTime(now);
  const slot = user.slotNumber ?? 0;
  const name = user.username || '';

  let line: string;
  if ((user.creditDays || 0) === 0) {
    line = `${date} ${time} ${name} [${slot}] CREDIT ACCOUNT INACTIVATED\n`;
  } else {
    const startStr = user.creditStartDate ? formatLongDate(new Date(user.creditStartDate * 1000)) : '';
    const endStr = user.creditStartDate
      ? formatLongDate(new Date((user.creditStartDate + (user.creditDays || 0) * 86400) * 1000))
      : '';
    const totalStr = user.creditTotalDate ? formatLongDate(new Date(user.creditTotalDate * 1000)) : '';
    line =
      `${date} ${time} ${name} [${slot}]\n` +
      `\tDAYS ${user.creditDays || 0} AMOUNT ${user.creditAmount || 0} STARTDATE ${startStr} ENDDATE ${endStr}\n` +
      `\tAMOUNT PAID TO DATE ${user.creditTotalToDate || 0} AS OF ${totalStr}\n`;
  }

  try {
    amigafs.appendFileSync(path.join(boardRoot(), 'CreditLog'), line);
  } catch (err) {
    console.error('Error writing CreditLog:', err);
  }
}

/**
 * Exit Credit Maintenance (`ENDPROC flag`, express.e:22042): back to the
 * account editor (21312 displayAccount), or to listCreditAccounts (21869),
 * which reads the flag.
 */
function exitCreditMaintenance(socket: any, session: BBSSession, flag: number): void {
  session.tempData.creditFieldEdit = undefined;
  session.tempData.creditChanges = undefined;
  session.inputBuffer = '';

  const done = session.tempData.creditDone as ((flag: number) => void) | undefined;
  if (done) {
    done(flag);
    return;
  }
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
  redraw(socket, session);
}

/** express.e:21896 - checkLockAccounts gates the field edits, computed once; then the screen. */
function openCreditMaintenance(socket: any, session: BBSSession): void {
  session.tempData.creditEditable = accountsUnlocked(session);
  session.subState = LoggedOnSubState.CREDIT_MAINTENANCE_VIEW;
  displayCreditMaintenance(socket, session);
}

/**
 * creditMaintenance(which,hoozer,...) (express.e:21884-22042) on its own, for
 * listCreditAccounts (21869): resolves with its flag - 0 when a remote
 * caller lacks ACS_CREDIT_ACCESS (21892-21894), 1 after X, 2 after TAB. The
 * caller's sub-state is restored before it resolves.
 */
export function creditMaintenance(socket: any, session: BBSSession, account: EditedAccount, slot: number): Promise<number> {
  if (!checkSecurity(session.user, ACSPermission.CREDIT_ACCESS)) return Promise.resolve(0);
  const callerSubState = session.subState;
  return new Promise<number>((resolve) => {
    session.tempData = {
      editingUser: account,
      editingSlot: slot,
      originalData: JSON.parse(JSON.stringify(account)),
      creditDone: (flag: number) => {
        session.tempData = undefined;
        session.subState = callerSubState;
        resolve(flag);
      },
    };
    openCreditMaintenance(socket, session);
  });
}

// ===== User Answers - express.e:21319-21326 =====

/**
 * `?` - express.e:21319-21326: findUserAnswers for this account's slot; when
 * there is a file, the screen is cleared, the file shown and the caller
 * paused, then the account is drawn again. With no file, nothing happens.
 * The port's own viewer searched every Node<n>/Answers for blocks naming the
 * user (sysop decision 2026-10-05: express.e's, with CENTRAL_ANSWERS on).
 */
export function displayUserAnswers(socket: any, session: BBSSession): boolean {
  const slot = Number(session.tempData.editingSlot) || 0;
  const file = slot > 0 ? findUserAnswersFile(boardRoot(), slot) : null;
  if (!file) return false;
  let text = '';
  try {
    text = amigafs.readFileSync(file, 'latin1').toString();
  } catch {
    return false;
  }
  emitText(socket, clearTheScreen(socket));
  emitText(socket, text.replace(/\r?\n/g, '\r\n'));
  const { doPause } = require('../screen.handler');
  doPause(socket, session, () => handleUserAnswersInput(socket, session, ''));
  return true;
}

/** Any key returns to the account editor (express.e:21326 displayAccount). */
export function handleUserAnswersInput(socket: any, session: BBSSession, _key: string): void {
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
  redraw(socket, session);
}

/**
 * The sysop's account editor screen: express.e editInfo's entry and
 * displayAccount (express.e:21211-21222, 22952-23186).
 *
 * The keys are read by account-edit-input.handler.ts; this file opens the
 * editor on an account and draws its two pages.
 *
 * Removed 2026-10-12 (tier-5 invented-text audit,
 * thoughts/spot/notes/2026-10-12_tier5-account-handler.md): a seven-option
 * "Account Editing Menu" and its user list, statistics, security-level,
 * flag, delete and search screens. Nothing called the menu - the sysop's `1`
 * command opens user-editor.handler.ts - so none of them could be reached.
 */

import * as path from 'path';
import { BBSSession, LoggedOnSubState } from '../../index';
import { getTodaysCalls } from '../../utils/time-tracking.util';
import { formatLongDateTime } from '../../utils/date-time.util';
import { clearTheScreen } from '../../utils/output.util';
import { getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { boardScreenTypes, screenTypeIndex } from '../../screens/screen-metadata';
import { boardRoot } from '../../utils/board-root.util';
import { conferenceDir } from '../../conferences/conference-paths';
import { MessageBaseLoaderService } from '../../services/message-base-loader.service';
import { findUserAnswersFile } from '../../utils/user-answers.util';
import { config } from '../../config';
import { loadAccount } from '../../services/load-account';

// Dependencies (injected)
let db: any;

export function setDatabase(database: any) {
  db = database;
}

// ===== editInfo's entry =====

/**
 * The editor returns to whoever opened it. Same exit as account-edit-input's
 * leaveAccountEditor, for an account that never opened: the message reader
 * (read-msg editUser) is waiting on accountEditDone and redraws the message.
 */
function editorNeverOpened(session: BBSSession): void {
  const done = session.accountEditDone;
  session.accountEditDone = undefined;
  session.tempData = undefined;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  if (done) done(0);
}

/**
 * editInfo's opening (express.e:21220-21224): the account at `slot` becomes
 * the one edited, page 0 is drawn, and account-edit-input reads the keys.
 * `onlineEdit` is express's global of that name (listNewAccounts sets it,
 * 21747): + and - do not walk the slots then (21263, 21275).
 */
function openEditor(socket: any, session: BBSSession, user: any, slot: number, onlineEdit: boolean): void {
  // The opener's sub-state is back before it hears the editor closed: the
  // reader (MSG_READER_NAV) and editAccounts drop a key that arrives between
  // their prompts, where DISPLAY_MENU would take it to the main menu.
  const callerSubState = session.subState;
  const done = session.accountEditDone;
  if (done) {
    session.accountEditDone = (flag: number) => {
      session.subState = callerSubState;
      done(flag);
    };
  }
  session.tempData = {
    accountEditing: true,
    editingUser: user,
    // express.e editInfo(which,...): `which` is the account's SLOT in
    // user.data - what +/- walk (21263-21286) and the header shows.
    editingSlot: slot,
    page: 0,
    changes: false,
    onlineEdit,
    originalData: JSON.parse(JSON.stringify(user))
  };
  displayAccount(socket, user, slot, 0, session.user?.slotNumber);
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_EDIT;
}

/**
 * editInfo(which,hoozer,...) (express.e:21211-21647) for a caller that waits
 * on it - the sysop's 1 (checkNEdit 22397, listNewAccounts 21764). Resolves
 * with editInfo's flag, 1 after X and 2 after TAB, once the editor is left;
 * the caller's sub-state is back by then.
 */
export function editInfo(socket: any, session: BBSSession, user: any, slot: number, onlineEdit = false): Promise<number> {
  return new Promise<number>((resolve) => {
    session.accountEditDone = resolve;
    openEditor(socket, session, user, slot, onlineEdit);
  });
}

/**
 * express.e:21211-21222 editInfo(which,hoozer,...): the account is drawn and
 * its keys are read. The reader has already found and loaded the account
 * (12198-12204) and said so when it could not; editInfo prints nothing of its
 * own before the screen. The port printed "User not found." / "Error loading
 * user data." and a press-any-key, and then left the reader waiting for an
 * editor that never opened.
 */
export function handleEditUserAccount(socket: any, session: BBSSession, username: string) {
  db.getUserByUsername(username).then((row: any) => {
    if (!row) {
      editorNeverOpened(session);
      return;
    }
    // express.e:12201 loadAccount: the record off the disk, merged over its
    // row - what the board acts on, and what the editor's save writes back.
    // The row alone put its own stale copy of every record field (time used,
    // post count, ...) over the disk at the next save.
    const user = loadAccount(row).user;
    openEditor(socket, session, user, Number(user.slotNumber) || 0, false);
  }).catch((error: any) => {
    console.error('Error fetching user:', error);
    editorNeverOpened(session);
  });
}

// ===== displayAccount (express.e:22952-23186) =====

/** `\l\s[n]`: left-justified in n columns, cut at n. */
function ls(value: unknown, width: number): string {
  return String(value ?? '').substring(0, width).padEnd(width);
}

/** `\l\d[n]`: a number left-justified in n columns. */
function ld(value: unknown, width: number): string {
  return ls(Math.trunc(Number(value) || 0), width);
}

/** formatUnsignedLong (MiscFuncs.e:267): `%lu`. */
function unsignedLong(value: unknown): string {
  return String((Number(value) || 0) >>> 0);
}

/** E's `Div(x,60)`: whole minutes from seconds. */
function minutes(seconds: unknown): number {
  return Math.trunc((Number(seconds) || 0) / 60);
}

/** formatLongDateTime of a date field; an unset date prints nothing. */
function longDateTime(value: unknown): string {
  if (value === undefined || value === null || value === '' || value === 0) return '';
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isFinite(date.getTime()) ? formatLongDateTime(date) : '';
}

/** express.e:22960-22981: user.keys' baud is an INT; the fast rates wrapped. */
const WRAPPED_BAUD: Record<number, number> = {
  49664: 115200, 33792: 230400, 17920: 345600, 2048: 460800, 51712: 576000,
  24576: 614400, 35840: 691200, 19968: 806400, 4096: 921600,
};

/** getConfMsgBaseCount (express.e:2048-2052) of the conference a number names. */
function confMsgBaseCount(conf: number): number {
  try {
    const root = boardRoot();
    return new MessageBaseLoaderService(root).getConfMsgBaseCount(path.relative(root, conferenceDir(root, conf)));
  } catch {
    return 1;
  }
}

function creditByKB(): boolean {
  return getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true;
}

/** Screen Type (express.e:23083-23091): the title of the account's entry in ScreenTypes.info. */
function screenTypeTitle(screenType: unknown): string {
  const types = boardScreenTypes(boardRoot());
  if (types.length === 0) return '';
  const index = screenTypeIndex(screenType as string | number | undefined, types);
  return index >= types.length ? 'NOT VALID!' : types[index].title;
}

/** displayAccountActions (express.e:23176-23186): the two key lines at row 16. */
function displayAccountActions(socket: any, slot: number): void {
  socket.emit('ansi-output', '\x1b[16;1H\x1b[33mX  \x1b[36m=\x1b[0mEXIT-NOSAVE \x1b[33m~\x1b[36m=\x1b[0mSAVE  \x1b[33m1-8\x1b[36m=\x1b[0mPRESETS  \x1b[33m9\x1b[36m=\x1b[0mRE-ACTIVATE  \x1b[33m<DEL>\x1b[36m=\x1b[0mDELETE  \x1b[33m*\x1b[36m=\x1b[0mUSER NOTES\r\n');
  let answers = false;
  try {
    answers = slot > 0 && findUserAnswersFile(config.getConfig().dataDir, slot) !== null;
  } catch {
    answers = false;
  }
  socket.emit('ansi-output',
    '\x1b[33m<TAB>\x1b[36m=\x1b[0mCONT \x1b[33m@\x1b[36m=\x1b[0mCONFERENCE ACCOUNTING \x1b[33m!\x1b[36m=\x1b[0mCREDIT ACCOUNT MAINTENANCE ' +
    (answers ? '\x1b[33m?\x1b[36m=\x1b[0mUSER ANSWERS' : '              ') +
    '\r\n');
}

/**
 * express.e:23000-23009 / 23232-23243: `D> Pass` reads ENCRYPTED for slot 1;
 * any other sysop - every web caller is remote, and the reader's U is not
 * the f6 console - reads DISABLED, and D does not change it (21407-21423).
 */
function passwordShown(callerSlot: number | undefined): boolean {
  return callerSlot === 1;
}

/**
 * express.e:22952-23174 displayAccount(who,page,...): clear the screen, the
 * status line, the name, then page 0 (the account) or page 1 (the password
 * record), then the key lines. Every field is placed with a cursor position,
 * as express.e places it. `callerSlot` is the sysop's own slot
 * (loggedOnUser.slotNumber).
 */
export function displayAccount(socket: any, user: any, slot: number, page: number, callerSlot: number | undefined): void {
  const out: string[] = [];
  out.push(clearTheScreen(socket));

  // express.e:22959-22990 - the status line.
  const keysBaud = (Number(user.baud) || 0) & 0xffff;
  const baud = WRAPPED_BAUD[keysBaud] ?? keysBaud;
  // `hoozer.slotNumber=who`: a deleted record's own slotNumber is 0 (21364);
  // this port keeps the position in slotNumber and marks the record deleted.
  const status = user.accountDeleted ? '\x1b[37mINACTIVE' : '\x1b[33m  ACTIVE';
  out.push(`\x1b[0;0H${status}\x1b[0m [${slot}]   \x1b[32mBAUD\x1b[36m:\x1b[0m ${baud}\r\n`);

  out.push(`\x1b[2;1H\x1b[33mA> \x1b[32mName\x1b[36m:\x1b[0m ${ls(user.username, 32)} `);

  if (page === 0) {
    out.push(`\x1b[2;42H\x1b[33mB> \x1b[32mReal Name\x1b[36m:\x1b[0m ${ls(user.realname, 25)}`);
    out.push(`\x1b[3;1H\x1b[33mC> \x1b[32mLoc.\x1b[36m:\x1b[0m ${ls(user.location, 29)}`);
    // express.e:23000-23009: a remote sysop who is not slot 1 reads DISABLED.
    out.push(passwordShown(callerSlot)
      ? '\x1b[3;42H\x1b[33mD> \x1b[32mPass ....\x1b[36m: \x1b[44mENCRYPTED\x1b[0m'
      : '\x1b[3;42H\x1b[33mD> \x1b[32mPass ....\x1b[34m: \x1b[31mDISABLED\x1b[0m');
    out.push(`\x1b[4;1H\x1b[33mE> \x1b[32mPhone Number ..\x1b[36m:\x1b[0m ${ls(user.phone, 13)}`);
    out.push(`\x1b[4;36H\x1b[33mF> \x1b[32mArea Name......\x1b[36m:\x1b[0m ${user.confAccess ?? ''}`);
    out.push(`\x1b[5;1H\x1b[33mG> \x1b[32mRatio .........\x1b[36m:\x1b[0m ${ld(user.ratio, 7)}`);
    out.push(`\x1b[5;36H\x1b[33mH> \x1b[32mSec_Level .....\x1b[36m:\x1b[0m ${ld(user.secLevel, 5)}`);
    out.push(`\x1b[6;1H\x1b[33mI> \x1b[32mRatio Type ....\x1b[36m:\x1b[0m ${ld(user.ratioType, 5)}`);
    if (user.ratioType === 0) out.push(' \x1b[32m<-\x1b[33mByte\x1b[32m)\x1b[0m');
    if (user.ratioType === 1) out.push(' \x1b[32m<-\x1b[33mB/F\x1b[32m)\x1b[0m ');
    if (user.ratioType === 2) out.push(' \x1b[32m<-\x1b[33mFile\x1b[32m)\x1b[0m');

    // express.e:23031-23036 - conf.base when the conference has several bases.
    const confRJoin = Number(user.confRJoin ?? user.autoRejoin) || 0;
    const msgBaseRJoin = Number(user.msgBaseRJoin) || 0;
    const rejoin = confMsgBaseCount(confRJoin) > 1 && msgBaseRJoin > 0 ? `${confRJoin}.${msgBaseRJoin}` : `${confRJoin}`;
    out.push(`\x1b[6;36H\x1b[33mJ> \x1b[32mAutoReJoin ....\x1b[36m:\x1b[0m ${ls(rejoin, 7)}`);

    out.push(`\x1b[7;1H\x1b[33mK> \x1b[32mUploads .......\x1b[36m:\x1b[0m ${ld((Number(user.uploads) || 0) & 0xffff, 10)}`);
    out.push(`\x1b[7;36H\x1b[33mL> \x1b[32mMessages Posted\x1b[36m:\x1b[0m ${ld((Number(user.messagesPosted) || 0) & 0xffff, 7)}`);
    out.push(`\x1b[8;1H\x1b[33mM> \x1b[32mDownloads .....\x1b[36m:\x1b[0m ${ld((Number(user.downloads) || 0) & 0xffff, 10)}\r\n`);
    out.push(`\x1b[8;36H\x1b[33mN> \x1b[32mNew_User ......\x1b[36m:\x1b[0m ${ls(user.newUser ? 'Yes' : 'No', 3)} `);
    out.push(`\x1b[6;63H\x1b[33m#\x1b[32mCalls\x1b[36m: \x1b[0m${ld((Number(user.calls) || 0) & 0xffff, 6)}`);
    out.push(`\x1b[7;63H\x1b[33m%\x1b[32mToday\x1b[36m: \x1b[0m${ld(getTodaysCalls(user), 6)}`);

    const kb = creditByKB();
    // formatBCD (bcd.e:23) prints the digits with no separators.
    out.push(`\x1b[9;1H\x1b[33mO> \x1b[32m${kb ? 'KBytes Uled ...' : 'Bytes Uled ....'}\x1b[36m:\x1b[0m ${ls(Math.trunc(Number(user.bytesUpload) || 0), 14)}`);
    out.push(`\x1b[9;39H\x1b[32mLast Called ...\x1b[36m:\x1b[0m ${longDateTime(user.lastLogin)}`);
    out.push(`\x1b[10;1H\x1b[33mP> \x1b[32m${kb ? 'KBytes Dled ...' : 'Bytes Dled ....'}\x1b[36m:\x1b[0m ${ls(Math.trunc(Number(user.bytesDownload) || 0), 14)}`);
    // express.e:23062-23070 prints computerTypes.item(secBulletin); this
    // port keeps the chosen type's name itself.
    out.push(`\x1b[10;39H\x1b[32mComputer Type .\x1b[36m:\x1b[0m ${ls(user.computer, 16)}`);

    const limit = Number(user.byteLimit) ? unsignedLong(user.byteLimit) : 'Infinite';
    out.push(`\x1b[11;1H\x1b[33mQ> \x1b[32m${kb ? 'KByte Limit ...' : 'Byte Limit ....'}\x1b[36m:\x1b[0m ${ls(limit, 10)}`);
    out.push(`\x1b[11;39H\x1b[32mScreen Type  ..\x1b[36m:\x1b[0m ${screenTypeTitle(user.screenType)}`);

    out.push(`\x1b[12;1H\x1b[33mR> \x1b[32mTime_Total\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m${ld(minutes(user.timeTotal), 8)}\x1b[36m]\x1b[0m mins    `);
    out.push(`\x1b[12;36H\x1b[33mS> \x1b[32mCps UP\x1b[36m:\x1b[0m ${ls(unsignedLong(user.topUploadCPS), 10)}`);
    out.push(`\x1b[12;58H\x1b[33mT> \x1b[32mCps DN\x1b[36m:\x1b[0m ${ls(unsignedLong(user.topDownloadCPS), 10)}`);
    out.push(`\x1b[13;1H\x1b[33mU> \x1b[32mTime_Limit\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m${ld(minutes(user.timeLimit), 8)}\x1b[36m]\x1b[0m mins    `);
    out.push(` \x1b[33mV> \x1b[32mTime_Used\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m${ld(minutes(user.timeUsed), 8)}\x1b[36m]\x1b[0m mins  \x1b[33mW> \x1b[32mUUCP\x1b[36m: \x1b[0m${user.uucpa ?? (user.uuCP ? 1 : 0)}  `);
    out.push(`\x1b[14;1H\x1b[33mY> \x1b[32mChat_Limit\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m${ld(minutes(user.chatLimit), 8)}\x1b[36m]\x1b[0m mins    `);
    // chatLimit-chatRemain: the port's chatUsed (UserFileManager reads it so).
    out.push(` \x1b[33mZ> \x1b[32mChat_Used\x1b[36m:\x1b[0m \x1b[36m[\x1b[0m${ld(minutes(user.chatUsed), 8)}\x1b[36m]\x1b[0m mins    `);
    out.push('\r\n');
  }

  if (page === 1) {
    out.push(`\x1b[3;1H\x1b[33mB> \x1b[32mForce Pwd Reset\x1b[36m:\x1b[0m ${ls(user.forcePwdReset ? 'Yes' : 'No', 3)}`);
    out.push(`\x1b[3;36H\x1b[33mC> \x1b[32mAccount Locked \x1b[36m:\x1b[0m ${user.accountLocked ? 'Yes' : 'No'}`);
    out.push(`\x1b[4;1H\x1b[33mD> \x1b[32mInvalid Pwd Att\x1b[36m:\x1b[0m ${ld(user.invalidAttempts, 3)}`);
    // user.misc pwdLastUpdated, read off the disk as Unix seconds.
    const pwdUpdated = Number(user.pwdLastUpdated) > 0 ? Number(user.pwdLastUpdated) * 1000 : 0;
    out.push(`\x1b[4;39H\x1b[32mLast Pwd Reset \x1b[36m:\x1b[0m ${longDateTime(pwdUpdated)}`);
    // WEB_: express.e:23149-23162 names the record's PWD_ type (LEGACY or a
    // PBKDF2 round count). This board hashes with bcrypt, which no PWD_ value
    // names, so the field says so in the same 13 columns.
    out.push('\x1b[5;4H\x1b[32mPwd Type ......\x1b[36m:\x1b[0m BCRYPT       ');
    // formatIP(lastIP) (MiscFuncs.e:274). The board does not record a
    // caller's address in user.misc (UserFileManager writes 0), and express.e
    // prints that 0 as 0.0.0.0.
    out.push('\x1b[5;39H\x1b[32mLast IP Addr ..\x1b[36m:\x1b[0m 0.0.0.0');
  }

  socket.emit('ansi-output', out.join(''));
  displayAccountActions(socket, slot);
}

/** Page 0 of displayAccount. */
export function displayAccountPage0(socket: any, user: any, slot: number, callerSlot: number | undefined) {
  displayAccount(socket, user, slot, 0, callerSlot);
}

/** Page 1 of displayAccount. */
export function displayAccountPage1(socket: any, user: any, slot: number, callerSlot: number | undefined) {
  displayAccount(socket, user, slot, 1, callerSlot);
}

/**
 * express.e:23188-23397 displayAccountInfo: the VALUES only, over the screen
 * displayAccount drew - after a save, a preset, a delete and the +/- walk.
 * No clear, no labels (but N's and the Cps pair's, which it reprints).
 */
export function displayAccountInfo(socket: any, user: any, slot: number, page: number, callerSlot: number | undefined): void {
  const out: string[] = [];
  const keysBaud = (Number(user.baud) || 0) & 0xffff;
  const baud = WRAPPED_BAUD[keysBaud] ?? keysBaud;
  out.push(user.accountDeleted
    ? `\x1b[0;0H\x1b[37mINACTIVE\x1b[0m [${slot}]   \x1b[32mBAUD\x1b[36m:\x1b[0m ${baud}    \r\n`
    : `\x1b[0;0H\x1b[33m  ACTIVE\x1b[0m [${slot}]   \x1b[32mBAUD\x1b[36m:\x1b[0m ${baud}    \r\n`);
  out.push(`\x1b[2;10H${ls(user.username, 32)}`);

  if (page === 0) {
    out.push(`\x1b[2;56H${ls(user.realname, 25)}`);
    out.push(`\x1b[3;10H${ls(user.location, 29)}`);
    out.push(passwordShown(callerSlot)
      ? '\x1b[3;56H\x1b[36m\x1b[44mENCRYPTED\x1b[0m\x1b[K'
      : '\x1b[3;56H\x1b[36m\x1b[44mDISABLED\x1b[0m\x1b[K\r\n');
    out.push(`\x1b[4;21H${ls(user.phone, 13)}`);
    out.push(`\x1b[4;56H${ls(user.confAccess, 10)}`);
    out.push(`\x1b[5;21H${ld(user.ratio, 7)}`);
    out.push(`\x1b[5;56H${ld(user.secLevel, 5)}`);
    out.push(`\x1b[6;21H${ld(user.ratioType, 5)}`);
    if (user.ratioType === 0) out.push(' \x1b[32m<-\x1b[33mByte\x1b[32m)\x1b[0m');
    if (user.ratioType === 1) out.push(' \x1b[32m<-\x1b[33mB/F\x1b[32m)\x1b[0m ');
    if (user.ratioType === 2) out.push(' \x1b[32m<-\x1b[33mFile\x1b[32m)\x1b[0m');
    const confRJoin = Number(user.confRJoin ?? user.autoRejoin) || 0;
    const msgBaseRJoin = Number(user.msgBaseRJoin) || 0;
    const rejoin = confMsgBaseCount(confRJoin) > 1 && msgBaseRJoin > 0 ? `${confRJoin}.${msgBaseRJoin}` : `${confRJoin}`;
    out.push(`\x1b[6;56H${ls(rejoin, 7)}`);
    out.push(`\x1b[7;21H${ld((Number(user.uploads) || 0) & 0xffff, 10)}`);
    out.push(`\x1b[7;56H${ld((Number(user.messagesPosted) || 0) & 0xffff, 7)}`);
    out.push(`\x1b[8;21H${ld((Number(user.downloads) || 0) & 0xffff, 10)}`);
    out.push(`\x1b[8;36H\x1b[33mN> \x1b[32mNew_User ......\x1b[36m:\x1b[0m ${ls(user.newUser ? 'Yes' : 'No', 3)} `);
    out.push(`\x1b[6;63H\x1b[33m#\x1b[32mCalls\x1b[36m: \x1b[0m${ld((Number(user.calls) || 0) & 0xffff, 6)}`);
    out.push(`\x1b[7;63H\x1b[33m%\x1b[32mToday\x1b[36m: \x1b[0m${ld(getTodaysCalls(user), 6)}`);
    out.push(`\x1b[9;21H${ls(Math.trunc(Number(user.bytesUpload) || 0), 14)}`);
    out.push(`\x1b[9;56H${longDateTime(user.lastLogin)}`);
    out.push(`\x1b[10;21H${ls(Math.trunc(Number(user.bytesDownload) || 0), 14)}`);
    out.push(`\x1b[10;56H${ls(user.computer, 16)}`);
    const limit = Number(user.byteLimit) ? unsignedLong(user.byteLimit) : 'Infinite';
    out.push(`\x1b[11;21H${ls(limit, 10)}`);
    const screenType = screenTypeTitle(user.screenType);
    out.push(`\x1b[11;56H${screenType === 'NOT VALID!' || screenType === '' ? screenType : ls(screenType, 16)}`);
    out.push(`\x1b[12;17H${ld(minutes(user.timeTotal), 6)}`);
    out.push(`\x1b[12;39H\x1b[32mCps UP\x1b[36m:\x1b[0m ${ls(unsignedLong(user.topUploadCPS), 10)}`);
    out.push(`\x1b[12;61H\x1b[32mCps DN\x1b[36m:\x1b[0m ${ls(unsignedLong(user.topDownloadCPS), 10)}`);
    out.push(`\x1b[13;17H${ld(minutes(user.timeLimit), 6)}`);
    out.push(`\x1b[13;51H${ld(minutes(user.timeUsed), 6)}`);
    out.push(`\x1b[13;76H${user.uucpa ?? (user.uuCP ? 1 : 0)}`);
    out.push(`\x1b[14;17H${ld(minutes(user.chatLimit), 6)}`);
    out.push(`\x1b[14;51H${ld(minutes(user.chatUsed), 6)}`);
  }

  if (page === 1) {
    out.push(`\x1b[3;21H${ls(user.forcePwdReset ? 'Yes' : 'No', 3)}`);
    out.push(`\x1b[3;56H${ls(user.accountLocked ? 'Yes' : 'No', 3)}`);
    out.push(`\x1b[4;21H${ld(user.invalidAttempts, 3)}`);
    const pwdUpdated = Number(user.pwdLastUpdated) > 0 ? Number(user.pwdLastUpdated) * 1000 : 0;
    out.push(`\x1b[4;56H${longDateTime(pwdUpdated)}`);
    // WEB_: the PWD_ type name, as displayAccount's Pwd Type row.
    out.push('\x1b[5;21HBCRYPT       ');
    out.push('\x1b[5;56H0.0.0.0');
  }

  socket.emit('ansi-output', out.join(''));
  displayAccountActions(socket, slot);
}

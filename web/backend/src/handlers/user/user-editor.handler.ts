/**
 * The sysop's 1: express.e editAccounts (22400-22457) and what it opens -
 * checkNEdit (22380-22398), listNewAccounts (21741-21813), listCreditAccounts
 * (21848-21882), bulkAccountEditor (23400-23568) with displayBulkScreen
 * (23570-23618), displayBulkSettings (23620-23686), applyBulkChanges
 * (23688-23794), bulkPresets (23796-23915) and its screens and apply
 * (23917-24085), and calcAffected (24087-24138).
 *
 * A procedure ported whole: every prompt is an awaited lineInput / readChar
 * (utils/await-input), as express.e reads it. The account itself is edited by
 * editInfo (account.handler / account-edit-input.handler) and credits by
 * creditMaintenance - one editor, whoever opens it.
 *
 * Rewritten 2026-10-12 (tier-5 invented-text audit,
 * thoughts/spot/notes/2026-10-12_tier5-user-editor.md). The port before this
 * printed the menu and nothing else could be reached: its keys were read
 * through `session.inputCallback`, which nothing calls, so the next key went
 * back to the main menu. Behind it sat an invented editor of its own (row
 * labels, a `Commands:` footer, `Save changes? (Y/N)`), invented new-user and
 * credit lists, and a bulk editor that wrote the wrong fields.
 */

import type { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import type { User } from '../../database/types';
import { emitText, flushOutput, clearTheScreen, send017 } from '../../utils/output.util';
import { lineInput, readChar, eValRead, holdInput, checkInput, purgeLine, takeTypeAhead } from '../../utils/await-input';
import { setEnvStat, getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { EnvStat } from '../../constants/env-codes';
import { RESULT_SUCCESS, RESULT_FAILURE } from '../../constants/command-results';
import { userDatabaseManager } from '../../services/UserDatabaseManager';
import { userFileManager } from '../../services/UserFileManager';
import { fieldsDifferingFrom } from '../../services/load-account';
import { findUserFromName, useWildcards } from '../message/msg-names';
import { conferenceNumbers } from '../../conferences/conference-paths';
import { boardRoot } from '../../utils/board-root.util';
import { nodeTooltype } from '../../utils/node-tooltypes.util';
import { writeToCallersLog } from '../../utils/download-logging.util';
import { readPreset, applyPreset } from '../../utils/new-user-preset';
import { applyConfPresets } from '../../services/apply-conf-presets';
import { editInfo } from './account.handler';
import {
  loadAccountAt,
  lastAccountSlot,
  writeAccount,
  creditMaintenance,
  presetOntoAccount,
} from './account-edit-input.handler';

/** express.e's global includeDeact (22406): the I> toggle, read by every walk below. */
interface EditAccounts {
  includeDeact: boolean;
}

/**
 * internalCommand1 -> editAccounts(FALSE) (express.e:24458), started from the
 * command: it runs until the sysop leaves it, then the menu comes back. Keys
 * reach it through the waiting input (handleCommand feeds it first); one that
 * arrives between two prompts is held for its next read (holdInput), as the
 * serial line holds it for express.e.
 */
export function startEditAccounts(socket: any, session: BBSSession): void {
  session.subState = LoggedOnSubState.ACCOUNT_EDITOR_MENU;
  void (async () => {
    try {
      await holdInput(session, LoggedOnSubState.ACCOUNT_EDITOR_MENU, () => editAccounts(socket, session));
    } catch (err) {
      console.error('[editAccounts] failed:', err);
      emitText(socket, '\r\n');
    }
    session.inputWaiter = undefined;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { advanceDisplayFlow } = require('../command.handler');
    await advanceDisplayFlow(socket, session);
  })();
}

/** express.e:22400-22457 editAccounts(f6). */
export async function editAccounts(socket: any, session: BBSSession): Promise<void> {
  const ctx: EditAccounts = { includeDeact: false };

  setEnvStat(session, EnvStat.ACCOUNT); // 22408
  // 22409: SysCmd ACCOUNTS replaces the whole editor when it runs.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { hasSysCommand, runSysCommandInFlow } = require('../command-execution.handler');
  if (hasSysCommand('ACCOUNTS') && (await runSysCommandInFlow(socket, session, 'ACCOUNTS', '')) === RESULT_SUCCESS) return;

  for (;;) {
    emitText(socket, ctx.includeDeact ? '\r\nI>nactive accounts: Include' : '\r\nI>nactive accounts: Exclude');
    emitText(socket, '  S>earch by name  N>ew account editing\r\nC>redit Accounts  B>ulk editing\r\nEdit which account? ');
    const str = await lineInput(socket, session, 5);
    const c = str.charAt(0).toUpperCase();
    if (c === 'N') {
      await listNewAccounts(socket, session, ctx);
    } else if (c === 'B') {
      await bulkAccountEditor(socket, session, ctx);
    } else if (c === 'C') {
      await listCreditAccounts(socket, session, ctx);
    } else if (c === 'I') {
      ctx.includeDeact = !ctx.includeDeact;
    } else if (c === 'S') {
      // 22427-22443: each account of that name in turn; TAB (editInfo's 2)
      // goes on to the next one.
      emitText(socket, '\r\nUserName: ');
      const name = await lineInput(socket, session, 30);
      if (name.length) {
        let lw = 0;
        let which: number;
        let stat = 0;
        do {
          lw++;
          which = findUserFromName(lw, 'username', name, useWildcards(session), ctx.includeDeact);
          if (which <= 0) {
            emitText(socket, '\r\nSorry no user under that name.\r\n');
          } else {
            lw = which;
            stat = await checkNEdit(socket, session, which);
            if (stat < 0) break;
          }
        } while (which > 0 && stat === 2);
        if (which > 0 && stat < 0) break;
      }
    } else {
      // 22445-22448: a number edits that slot; anything else leaves. checkNEdit's
      // RESULT_FAILURE (past the last account) leaves too (`stat<0`).
      const which = eValRead(str).value;
      if (which <= 0) break;
      if ((await checkNEdit(socket, session, which)) < 0) break;
    }
  }
  emitText(socket, '\r\n'); // returnf, 22454
}

/**
 * express.e:22380-22398 checkNEdit(which,f6). RESULT_FAILURE past the last
 * account or when the record will not load; else editInfo's flag.
 */
async function checkNEdit(socket: any, session: BBSSession, which: number): Promise<number> {
  if (which > lastAccountSlot()) {
    emitText(socket, 'Higher Than Maximum Account\r\n');
    return RESULT_FAILURE;
  }
  emitText(socket, clearTheScreen(socket));
  const account = await loadAccountAt(which);
  if (!account) {
    emitText(socket, 'Warning, error while loading account\r\n');
    return RESULT_FAILURE;
  }
  emitText(socket, send017(socket)); // 22395
  emitText(socket, clearTheScreen(socket));
  return openEditInfo(socket, session, account, which, false);
}

/**
 * editInfo after this procedure's buffered output is on the wire (the editor
 * writes directly). The editor reads its keys through its sub-state, so what
 * the sysop typed ahead - while an account was loading - is handed to it in
 * order: in express.e editInfo's readChar takes those keys off the line.
 */
function openEditInfo(socket: any, session: BBSSession, account: User, slot: number, onlineEdit: boolean): Promise<number> {
  flushOutput(socket);
  const done = editInfo(socket, session, account, slot, onlineEdit);
  const held = takeTypeAhead(session);
  if (held.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handleCommand } = require('../command.handler');
    void (async () => {
      for (const key of held) await handleCommand(socket, session, key);
    })();
  }
  return done;
}

/**
 * The account at `slot` off the disk (user.data / user.keys), as express.e's
 * walks read it record by record. null is a short read.
 */
function diskRecord(slot: number) {
  return userDatabaseManager.readUserFromDisk(slot);
}

/**
 * express.e:21741-21813 listNewAccounts(f6): every account whose user.keys
 * newUser is 1 (and active, or I> includes the inactive), each through
 * editInfo with onlineEdit set; X (editInfo's 1) stops the walk.
 */
async function listNewAccounts(socket: any, session: BBSSession, ctx: EditAccounts): Promise<void> {
  let foflag = false;
  emitText(socket, send017(socket)); // 21749
  emitText(socket, clearTheScreen(socket)); // sendCLS, 21750
  emitText(socket, 'Searching...');
  const maximum = lastAccountSlot();
  for (let x = 1; x <= maximum; x++) {
    const rec = diskRecord(x);
    if (!rec) {
      emitText(socket, `FILE-FAULT[${x}], `);
      continue;
    }
    if (rec.keys.newUser === 1 && (ctx.includeDeact || rec.keys.number !== 0)) {
      foflag = true;
      const account = await loadAccountAt(x);
      if (account) {
        const stat = await openEditInfo(socket, session, account, x, true);
        if (stat === 1) {
          emitText(socket, '\r\nAbort');
          break;
        }
        emitText(socket, 'Searching...');
      }
    }
    // 21777-21805: a key typed during the walk. ^W (23) pauses on 'Any key..'
    // and wipes it; ^C (3) says Abort and jumps to acctMark1 (21807); any
    // other key is thrown away with whatever was typed after it.
    if (await checkInput(session)) {
      const typed = await readChar(socket, session);
      if (typed === '\x17') {
        purgeLine(session); // 21781
        emitText(socket, 'Any key..');
        await readChar(socket, session);
        emitText(socket, '\b'.repeat(9) + ' '.repeat(9) + '\b'.repeat(9));
      } else if (typed === '\x03') {
        emitText(socket, '\r\nAbort\r\n');
        break;
      } else {
        purgeLine(session); // 21803
      }
    }
  }
  if (!foflag) emitText(socket, '\x1b[0mNo new users.'); // acctMark1, 21808
  emitText(socket, '\r\n\r\n');
}

/**
 * express.e:21848-21882 listCreditAccounts(f6): every account with credit
 * days (and active, or I> includes the inactive), each through
 * creditMaintenance; X (its 1) stops the walk.
 */
async function listCreditAccounts(socket: any, session: BBSSession, ctx: EditAccounts): Promise<void> {
  const maximum = lastAccountSlot();
  for (let x = 1; x <= maximum; x++) {
    const rec = diskRecord(x);
    if (!rec) {
      emitText(socket, `FILE-FAULT[${x}], `);
      continue;
    }
    if (rec.user.creditDays > 0 && (ctx.includeDeact || rec.user.slotNumber !== 0)) {
      const account = await loadAccountAt(x);
      if (!account) continue;
      flushOutput(socket);
      if ((await creditMaintenance(socket, session, account, x)) === 1) break;
    }
  }
  emitText(socket, '\r\n\r\n');
}

// ===== Bulk account maintenance (express.e:23400-24138) =====

/** user.data's conferenceAccess, as StriCmp reads it (up to its NUL). */
function conferenceAccessOf(rec: NonNullable<ReturnType<typeof diskRecord>>): string {
  return rec.user.conferenceAccess.toString('latin1').replace(/\0[\s\S]*$/, '');
}

/**
 * The filter applyBulkChanges, applyBulkPresetChanges and calcAffected share
 * (23729-23742): the area OR the level matches - every account when neither
 * is set - and an inactive account only with includeDeact.
 */
function bulkMatch(rec: NonNullable<ReturnType<typeof diskRecord>>, areaName: string, secLevel: string, includeDeact: boolean): boolean {
  let match = false;
  if (areaName.length > 0 && conferenceAccessOf(rec).toLowerCase() === areaName.toLowerCase()) match = true;
  if (secLevel.length > 0 && eValRead(secLevel).value === rec.user.secStatus) match = true;
  if (areaName.length === 0 && secLevel.length === 0) match = true;
  if (!includeDeact && rec.keys.number === 0) match = false;
  return match;
}

/** express.e:24087-24138 calcAffected: [matching, all] over the account files. */
function calcAffected(areaName: string, secLevel: string, includeDeact: boolean): [number, number] {
  let tot = 0;
  let all = 0;
  const maximum = userDatabaseManager.getUserCount();
  for (let slot = 1; slot <= maximum; slot++) {
    const rec = diskRecord(slot);
    if (!rec) break;
    all++;
    if (bulkMatch(rec, areaName, secLevel, includeDeact)) tot++;
  }
  return [tot, all];
}

/** The account at `slot`, written where express.e writes it (and its row, when it has one). */
async function writeBulkAccount(user: User, slot: number): Promise<void> {
  if (user.id) {
    await writeAccount(user);
  } else {
    // The fields this edit changed, against the record as it stands.
    const onDisk = userFileManager.readUserBySlot(slot);
    userFileManager.updateUserDataFile(onDisk ? fieldsDifferingFrom(user, onDisk) : user, slot);
  }
}

function creditByKB(): boolean {
  return getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true;
}

/** express.e:23570-23618 displayBulkScreen. */
function displayBulkScreen(socket: any): void {
  const kb = creditByKB();
  emitText(socket, '\x1b[2;1H                     \x1b[33mBULK ACCOUNT MAINTENANCE\x1b[0m');
  emitText(socket, '\x1b[4;1H Updates to apply:');
  emitText(socket, '\x1b[6;1H\x1b[33mF> \x1b[32mArea Name .....\x1b[36m:');
  emitText(socket, '\x1b[6;39H\x1b[33mG> \x1b[32mRatio .........\x1b[36m:');
  emitText(socket, '\x1b[7;1H\x1b[33mH> \x1b[32mSec_Level .....\x1b[36m:');
  emitText(socket, '\x1b[7;39H\x1b[33mI> \x1b[32mRatio Type ....\x1b[36m:');
  emitText(socket, '\x1b[8;1H\x1b[33mJ> \x1b[32mAutoRejoin ....\x1b[36m:');
  emitText(socket, '\x1b[9;1H\x1b[33mK> \x1b[32mUploads .......\x1b[36m:');
  emitText(socket, '\x1b[9;39H\x1b[33mL> \x1b[32mMessages Posted\x1b[36m:');
  emitText(socket, '\x1b[10;1H\x1b[33mM> \x1b[32mDownloads .....\x1b[36m:');
  emitText(socket, kb ? '\x1b[11;1H\x1b[33mO> \x1b[32mKBytes Uled ...\x1b[36m:' : '\x1b[11;1H\x1b[33mO> \x1b[32mBytes Uled ....\x1b[36m:');
  emitText(socket, kb ? '\x1b[11;39H\x1b[33mP> \x1b[32mKBytes Dled ...\x1b[36m:' : '\x1b[11;39H\x1b[33mP> \x1b[32mBytes Dled ....\x1b[36m:');
  emitText(socket, kb ? '\x1b[12;1H\x1b[33mQ> \x1b[32mKByte Limit ...\x1b[36m:' : '\x1b[12;1H\x1b[33mQ> \x1b[32mByte Limit ....\x1b[36m:');
  emitText(socket, '\x1b[13;1H\x1b[33mR> \x1b[32mTime Total ....\x1b[36m:');
  emitText(socket, '\x1b[13;39H\x1b[33mU> \x1b[32mTime Limit ....\x1b[36m:');
  emitText(socket, '\x1b[15;39H\x1b[33m*> \x1b[32mActive ........\x1b[36m:');
  emitText(socket, '\x1b[14;1H\x1b[33mY> \x1b[32mChat Limit ....\x1b[36m:');
  emitText(socket, '\x1b[15;1H\x1b[33m#> \x1b[32mTimes Called ..\x1b[36m:');
  emitText(socket, '\x1b[16;1H\x1b[33m!> \x1b[32mForce Pwd Reset\x1b[36m:');
  emitText(socket, '\x1b[16;39H\x1b[33m&> \x1b[32mAccnt Locked ..\x1b[36m:');
  emitText(socket, '\x1b[18;2H\x1b[0mFilter Settings:');
  emitText(socket, '\x1b[20;1H\x1b[33m1> \x1b[32mSelect Area Name \x1b[36m:');
  emitText(socket, '\x1b[20;39H\x1b[33m2> \x1b[32mSelect Sec Level \x1b[36m:');
  emitText(socket, '\x1b[21;1H\x1b[33m3> \x1b[32mInclude deactivated \x1b[36m:');
  emitText(socket, '\x1b[23;1H\x1b[33m~\x1b[36m=\x1b[0mApply Changes \x1b[33m@\x1b[36m=\x1b[0mPresets \x1b[33m<TAB>\x1b[36m=\x1b[0mExit\r\n');
}

const LEAVE_UNCHANGED = 'Leave Unchanged';

/** `IF StrLen(s)=0 THEN 'Leave Unchanged' ELSE s`. */
function orUnchanged(s: string): string {
  return s.length === 0 ? LEAVE_UNCHANGED : s;
}

/** express.e:23620-23686 displayBulkSettings. */
function displayBulkSettings(socket: any, settings: string[], areaName: string, secLevel: string, includeDeact: boolean): void {
  emitText(socket, `\x1b[6;58H\x1b[0m ${orUnchanged(settings[0])}`);
  if (settings[1].length === 0) {
    emitText(socket, '\x1b[7;58H\x1b[0m Leave Unchanged');
  } else {
    const v = eValRead(settings[1]).value;
    const kind = v === 0 ? 'Byte' : v === 1 ? 'B/F' : 'File';
    emitText(socket, `\x1b[7;58H\x1b[0m ${v} \x1b[32m<-\x1b[33m${kind}\x1b[32m)\x1b[0m`);
  }
  emitText(socket, `\x1b[8;20H\x1b[0m ${orUnchanged(settings[2])}`);
  emitText(socket, `\x1b[9;20H\x1b[0m ${orUnchanged(settings[3])}`);
  emitText(socket, `\x1b[9;58H\x1b[0m ${orUnchanged(settings[4])}`);
  emitText(socket, `\x1b[10;20H\x1b[0m ${orUnchanged(settings[5])}`);
  emitText(socket, `\x1b[11;20H\x1b[0m ${orUnchanged(settings[6])}`);
  emitText(socket, `\x1b[11;58H\x1b[0m ${orUnchanged(settings[7])}`);
  emitText(socket, `\x1b[12;20H\x1b[0m ${orUnchanged(settings[8])}`);
  emitText(socket, `\x1b[13;20H\x1b[0m ${orUnchanged(settings[9])}`);
  emitText(socket, `\x1b[13;58H\x1b[0m ${orUnchanged(settings[10])}`);
  emitText(socket, `\x1b[14;20H\x1b[0m ${orUnchanged(settings[11])}`);
  emitText(socket, `\x1b[15;20H\x1b[0m ${orUnchanged(settings[12])}`);
  emitText(socket, `\x1b[6;20H\x1b[0m ${orUnchanged(settings[13])}`);
  emitText(socket, `\x1b[7;20H\x1b[0m ${orUnchanged(settings[14])}`);
  emitText(socket, `\x1b[15;58H\x1b[0m ${settings[15].length === 0 ? LEAVE_UNCHANGED : eValRead(settings[15]).value === 0 ? 'Deactivate     ' : 'Activate       '}`);
  emitText(socket, `\x1b[16;20H\x1b[0m ${settings[16].length === 0 ? LEAVE_UNCHANGED : eValRead(settings[16]).value === 1 ? 'Yes            ' : 'No             '}`);
  emitText(socket, `\x1b[16;58H\x1b[0m ${settings[17].length === 0 ? LEAVE_UNCHANGED : eValRead(settings[17]).value === 1 ? 'Yes            ' : 'No             '}`);

  const [i, tot] = calcAffected(areaName, secLevel, includeDeact);
  emitText(socket, `\x1b[18;19H\x1b[34m[\x1b[0m${i}/${tot}\x1b[34m]\x1b[0m Users will be updated.     `);
  emitText(socket, `\x1b[20;26H${areaName.length === 0 ? 'N/A' : areaName}`);
  emitText(socket, `\x1b[20;64H${secLevel.length === 0 ? 'N/A' : secLevel}`);
  emitText(socket, `\x1b[21;26H${includeDeact ? 'Yes' : 'No '}`);
  emitText(socket, '\x1b[24;1H');
}

/**
 * The numeric fields (23437-23518): the field's cursor, its input with the
 * setting as the default, then `v,r:=Val(s)`: kept as `\d` of v, or cleared
 * when it did not start with a number.
 */
const BULK_NUMBER_FIELDS: Record<string, { index: number; at: string; maxLen: number }> = {
  G: { index: 0, at: '6;59', maxLen: 15 },
  H: { index: 14, at: '7;21', maxLen: 3 },
  K: { index: 3, at: '9;21', maxLen: 15 },
  L: { index: 4, at: '9;59', maxLen: 15 },
  M: { index: 5, at: '10;21', maxLen: 15 },
  O: { index: 6, at: '11;21', maxLen: 15 },
  P: { index: 7, at: '11;59', maxLen: 15 },
  Q: { index: 8, at: '12;21', maxLen: 15 },
  R: { index: 9, at: '13;21', maxLen: 15 },
  U: { index: 10, at: '13;59', maxLen: 15 },
  Y: { index: 11, at: '14;21', maxLen: 15 },
  '#': { index: 12, at: '15;21', maxLen: 15 },
};

/** `*`, `!`, `&` (23519-23542): '' -> '1' -> '0' -> ''. */
function cycleToggle(s: string): string {
  if (s.length === 0) return '1';
  if (s === '1') return '0';
  return '';
}

/** express.e:23400-23568 bulkAccountEditor. */
async function bulkAccountEditor(socket: any, session: BBSSession, ctx: EditAccounts): Promise<void> {
  emitText(socket, clearTheScreen(socket));
  displayBulkScreen(socket);
  const settings: string[] = Array.from({ length: 18 }, () => '');
  let areaName = '';
  let secLevel = '';

  for (;;) {
    displayBulkSettings(socket, settings, areaName, secLevel, ctx.includeDeact);
    const command = (await readChar(socket, session)).toUpperCase();

    const numeric = BULK_NUMBER_FIELDS[command];
    if (numeric) {
      emitText(socket, `\x1b[${numeric.at}H               \x1b[${numeric.at}H`);
      const typed = await lineInput(socket, session, numeric.maxLen, settings[numeric.index]);
      const { value, read } = eValRead(typed);
      settings[numeric.index] = read === 0 ? '' : String(value);
      continue;
    }

    switch (command) {
      case '@':
        if ((await bulkPresets(socket, session, ctx)) === 'abort') return;
        emitText(socket, clearTheScreen(socket));
        displayBulkScreen(socket);
        break;
      case 'F':
        emitText(socket, '\x1b[6;21H               \x1b[6;21H');
        settings[13] = await lineInput(socket, session, 15, settings[13]);
        break;
      case 'I': {
        emitText(socket, '\x1b[7;59H               \x1b[7;59H');
        const { value, read } = eValRead(await lineInput(socket, session, 15, settings[1]));
        settings[1] = read === 0 || value < 0 || value > 2 ? '' : String(value);
        break;
      }
      case 'J': {
        emitText(socket, '\x1b[8;21H               \x1b[8;21H');
        const typed = await lineInput(socket, session, 15, settings[2]);
        const { value, read } = eValRead(typed);
        if (read === 0 || value < 1 || value > conferenceNumbers(boardRoot()).length) {
          settings[2] = '';
        } else {
          const p = typed.indexOf('.');
          settings[2] = p >= 0 ? `${value}.${eValRead(typed.slice(p + 1)).value}` : String(value);
        }
        break;
      }
      case '*': settings[15] = cycleToggle(settings[15]); break;
      case '!': settings[16] = cycleToggle(settings[16]); break;
      case '&': settings[17] = cycleToggle(settings[17]); break;
      case '1':
        emitText(socket, '\x1b[20;26H          \x1b[20;26H');
        areaName = await lineInput(socket, session, 10, areaName);
        break;
      case '2': {
        emitText(socket, '\x1b[20;64H   \x1b[20;64H');
        secLevel = await lineInput(socket, session, 3, secLevel);
        if (eValRead(secLevel).read === 0) secLevel = '';
        break;
      }
      case '3':
        ctx.includeDeact = !ctx.includeDeact;
        break;
      case '~': {
        emitText(socket, '\x1b[0mUpdating users...');
        const v = await applyBulkChanges(settings, areaName, secLevel, ctx.includeDeact);
        await writeToCallersLog(`\tREMOTE Bulk User Update, Area=${areaName}, SecLevel=${secLevel}, RecordsAffected=${v}`, session.nodeId ?? 0);
        emitText(socket, '\x1b[24;1H                                     ');
        break;
      }
      case '\t':
        return;
    }
  }
}

/**
 * express.e:23688-23794 applyBulkChanges: every matching account gets each
 * setting that is not blank, and is written back.
 *
 * Returns what express.e's returns: RESULT_FAILURE when the account files
 * will not open, otherwise nothing - the ENDPROC carries no value, so the
 * CallersLog line's RecordsAffected reads 0 (see the note's open decisions).
 */
async function applyBulkChanges(settings: string[], areaName: string, secLevel: string, includeDeact: boolean): Promise<number> {
  const maximum = userDatabaseManager.getUserCount();
  if (maximum === 0) return RESULT_FAILURE;
  const num = (s: string) => eValRead(s).value;
  for (let slot = 1; slot <= maximum; slot++) {
    const rec = diskRecord(slot);
    if (!rec) return RESULT_FAILURE;
    if (!bulkMatch(rec, areaName, secLevel, includeDeact)) continue;
    const user: User | null = await loadAccountAt(slot);
    if (!user) return RESULT_FAILURE;

    if (settings[0]) user.ratio = num(settings[0]); // secLibrary
    if (settings[1]) user.ratioType = num(settings[1]); // secBoard
    if (settings[2]) {
      const p = settings[2].indexOf('.');
      user.confRJoin = num(settings[2]);
      user.autoRejoin = user.confRJoin;
      user.msgBaseRJoin = p >= 0 ? num(settings[2].slice(p + 1)) : 0;
    }
    if (settings[3]) user.uploads = num(settings[3]);
    if (settings[4]) user.messagesPosted = num(settings[4]);
    if (settings[5]) user.downloads = num(settings[5]);
    // 23761-23768: bcdVal into the BCD counter, then the LONG from it. The
    // setting is already Val's digits.
    if (settings[6]) user.bytesUpload = num(settings[6]);
    if (settings[7]) user.bytesDownload = num(settings[7]);
    if (settings[8]) {
      // 23770-23779: today's limit keeps today's extra bytes.
      const todays = Number(user.todaysBytesLimit ?? 0);
      const extraBytes = todays !== 0 ? todays - Number(user.byteLimit || 0) : 0;
      user.byteLimit = num(settings[8]);
      user.todaysBytesLimit = user.byteLimit !== 0 ? user.byteLimit + extraBytes : 0;
    }
    if (settings[9]) user.timeTotal = num(settings[9]) * 60;
    if (settings[10]) user.timeLimit = num(settings[10]) * 60;
    if (settings[11]) user.chatLimit = num(settings[11]) * 60;
    if (settings[12]) user.calls = num(settings[12]);
    if (settings[13]) user.confAccess = settings[13].slice(0, 9); // AstrCopy(...,10)
    if (settings[14]) user.secLevel = num(settings[14]); // secStatus
    // 23784-23787: slotNumber 0 (inactive) or the record's own position.
    if (settings[15]) user.accountDeleted = num(settings[15]) === 0;
    if (settings[16]) user.forcePwdReset = num(settings[16]) === 0 ? 0 : 1;
    if (settings[17]) user.accountLocked = num(settings[17]) === 0 ? 0 : 1;

    await writeBulkAccount(user, slot);
  }
  return RESULT_SUCCESS;
}

/** checkToolTypeExists(TOOLTYPE_PRESET,n,'PRESET.AREA'). */
function presetHasArea(n: number): boolean {
  return readPreset(boardRoot(), n)?.has('PRESET.AREA') === true;
}

/** express.e:23917-23939 displayBulkPresetScreen. */
function displayBulkPresetScreen(socket: any): void {
  emitText(socket, '\x1b[2;1H                     \x1b[33mBULK ACCOUNT MAINTENANCE\x1b[0m');
  emitText(socket, '\x1b[4;1H Preset to apply:');
  for (let n = 1; n <= 8; n++) {
    if (presetHasArea(n)) emitText(socket, `\x1b[${n + 5};1H\x1b[33m${n}> \x1b[32mApply Preset ${n}...\x1b[36m:`);
  }
  emitText(socket, '\x1b[15;1H\x1b[33m9> \x1b[32mApply All Conf Ratio Presets...\x1b[36m:');
  emitText(socket, '\x1b[17;2H\x1b[0mFilter Settings:');
  emitText(socket, '\x1b[19;1H\x1b[33mA> \x1b[32mSelect Area Name \x1b[36m:');
  emitText(socket, '\x1b[20;1H\x1b[33mB> \x1b[32mSelect Sec Level \x1b[36m:');
  emitText(socket, '\x1b[21;1H\x1b[33mC> \x1b[32mInclude deactivated \x1b[36m:');
  emitText(socket, '\x1b[23;1H\x1b[33m~\x1b[36m=\x1b[0mApply Changes \x1b[33m@\x1b[36m=\x1b[0mUpdates \x1b[33m<TAB>\x1b[36m=\x1b[0mExit\r\n');
}

/** express.e:23941-23996 displayBulkPresetSettings. */
function displayBulkPresetSettings(socket: any, preset: number, allConfs: boolean, areaName: string, secLevel: string, includeDeact: boolean): void {
  for (let n = 1; n <= 8; n++) {
    if (presetHasArea(n)) emitText(socket, `\x1b[${n + 5};22H\x1b[0m ${preset === n ? 'Yes' : 'No '}`);
  }
  emitText(socket, `\x1b[15;36H\x1b[0m ${allConfs ? 'Yes' : 'No '}`);
  const [i, tot] = calcAffected(areaName, secLevel, includeDeact);
  emitText(socket, `\x1b[17;19H\x1b[34m[\x1b[0m${i}/${tot}\x1b[34m]\x1b[0m Users will be updated.     `);
  emitText(socket, `\x1b[19;26H${areaName.length === 0 ? 'N/A' : areaName}`);
  emitText(socket, `\x1b[20;26H${secLevel.length === 0 ? 'N/A' : secLevel}`);
  emitText(socket, `\x1b[21;26H${includeDeact ? 'Yes' : 'No '}`);
  emitText(socket, '\x1b[24;1H');
}

/**
 * express.e:23796-23915 bulkPresets: 'abort' after TAB (RESULT_ABORT, which
 * leaves the bulk editor too), 'success' after @ (back to the updates).
 */
async function bulkPresets(socket: any, session: BBSSession, ctx: EditAccounts): Promise<'abort' | 'success'> {
  emitText(socket, clearTheScreen(socket));
  displayBulkPresetScreen(socket);
  let preset = -1;
  let allConf = false;
  let areaName = '';
  let secLevel = '';

  for (;;) {
    displayBulkPresetSettings(socket, preset, allConf, areaName, secLevel, ctx.includeDeact);
    const command = (await readChar(socket, session)).toUpperCase();
    if (command >= '1' && command <= '8' && command.length === 1) {
      const n = Number(command);
      if (presetHasArea(n)) preset = preset === n ? -1 : n;
      continue;
    }
    switch (command) {
      case '9':
        allConf = !allConf;
        break;
      case 'A':
        emitText(socket, '\x1b[19;26H          \x1b[19;26H');
        areaName = await lineInput(socket, session, 10, areaName);
        break;
      case 'B':
        emitText(socket, '\x1b[20;26H   \x1b[20;26H');
        secLevel = await lineInput(socket, session, 3, secLevel);
        if (eValRead(secLevel).read === 0) secLevel = '';
        break;
      case 'C':
        ctx.includeDeact = !ctx.includeDeact;
        break;
      case '@':
        return 'success';
      case '~':
        if (preset !== -1) {
          emitText(socket, '\x1b[0mUpdating users...');
          const v = await applyBulkPresetChanges(session, preset, allConf, areaName, secLevel, ctx.includeDeact);
          await writeToCallersLog(
            `\tREMOTE Bulk Preset Apply, Area=${areaName}, SecLevel=${secLevel}, Preset=${preset}, AllConfs=${allConf ? 'Yes' : 'No'}, RecordsAffected=${v}`,
            session.nodeId ?? 0,
          );
          emitText(socket, '\x1b[24;1H                                     ');
        }
        break;
      case '\t':
        return 'abort';
    }
  }
}

/**
 * express.e:23998-24085 applyBulkPresetChanges: every matching account gets
 * the preset (applyPreset, newUser off, time total := time limit) and, with
 * 9, the preset's ratios in every conference (applyConfPresets). Returns as
 * applyBulkChanges does.
 */
async function applyBulkPresetChanges(
  session: BBSSession, preset: number, allConf: boolean, areaName: string, secLevel: string, includeDeact: boolean,
): Promise<number> {
  const maximum = userDatabaseManager.getUserCount();
  if (maximum === 0) return RESULT_FAILURE;
  const tooltypes = readPreset(boardRoot(), preset);
  const values = applyPreset(tooltypes);
  for (let slot = 1; slot <= maximum; slot++) {
    const rec = diskRecord(slot);
    if (!rec) return RESULT_FAILURE;
    if (!bulkMatch(rec, areaName, secLevel, includeDeact)) continue;
    const user: User | null = await loadAccountAt(slot);
    if (!user) return RESULT_FAILURE;
    if (tooltypes && values) {
      user.newUser = false;
      presetOntoAccount(user, values);
      user.timeTotal = user.timeLimit;
      if (allConf) applyConfPresets(boardRoot(), slot, tooltypes, nodeTooltype(session.nodeId ?? 0, 'CONF_DB') || 'Conf.DB');
    }
    await writeBulkAccount(user, slot);
  }
  return RESULT_SUCCESS;
}

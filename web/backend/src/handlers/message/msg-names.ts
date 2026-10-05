/**
 * express.e's message-name procedures, ported whole:
 *
 *   stringCompare           MiscFuncs.e:126-153
 *   nameCompare             express.e:11218-11224
 *   checkForAst             express.e:11226-11232
 *   findUserFromName        express.e:11474-11524
 *   chooseAName             express.e:11526-11555
 *   getAValidName           express.e:11557-11600
 *   checkToForward          express.e:9909-9950
 *   captureRealAndInternetNames  express.e:28151-28226
 *
 * plus sysopNameForConf, the `loadAccount(1,...)` + `SELECT confNameType`
 * copy that enterMSG (10818-10836) and commentToSYSOP (8765-8776) both do.
 *
 * AmiExpress finds a user by walking user.keys / user.misc on disk, slot by
 * slot, and so does this: the board's accounts live in those files, not in
 * the SQLite database. The prompts inside these procedures (yesNo in
 * chooseAName, lineInput in captureRealAndInternetNames) are the awaitable
 * express.e calls in utils/await-input; a caller that starts one of these
 * from a keystroke handler must not await it there (`void`), because the
 * procedure waits for keystrokes that handleCommand has yet to deliver.
 */
import type { BBSSession } from '../../index';
import { emitText } from '../../utils/output.util';
import { lineInput, yesNo } from '../../utils/await-input';
import { getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { userDatabaseManager } from '../../services/UserDatabaseManager';
import type { UserStruct, UserKeysStruct, UserMiscStruct } from '../../services/UserDatabaseManager';
import { getConfNameType, type ConfNameType } from './conf-mail-name';
import { joinedConf } from '../../utils/joined-conf.util';

/** express.e RESULT_SUCCESS / RESULT_FAILURE (axenums.e:23). */
export const RESULT_SUCCESS = 0;
export const RESULT_FAILURE = -1;

/** One account as loadAccount(slot, tempUser, tempUserKeys, tempUserMisc) fills it. */
export interface DiskAccount {
  slot: number;
  user: UserStruct;
  keys: UserKeysStruct;
  misc: UserMiscStruct;
}

/** express.e:7977 loadAccount - the slot's user.data, user.keys and user.misc records. */
export function loadAccount(slot: number): DiskAccount | null {
  const rec = userDatabaseManager.readUserFromDisk(slot);
  return rec ? { slot, ...rec } : null;
}

/**
 * sopt.toggles[TOGGLES_USEWILDCARDS] - the board's toggle, read directly as
 * express.e reads it (11219), not through a caller's ACS flags.
 */
function useWildcards(_session: BBSSession): boolean {
  return getACSConfig().toggles[ToggleFlags.USEWILDCARDS] === true;
}

/** express.e ansiColour, as the M command keeps it. */
function ansiColour(session: BBSSession): boolean {
  return (session.user as any)?.ansi ?? (session as any).ansiMode ?? true;
}

/** The session's confNameType (set on join, express.e:5017-5024). */
export function confNameTypeOf(session: BBSSession): ConfNameType {
  const { conf, msgBase } = joinedConf(session);
  return getConfNameType(conf, msgBase);
}

/**
 * MiscFuncs.e:126 stringCompare(nam, pat): case-insensitive, `?` matches one
 * character, `*` any run. True where express.e returns RESULT_SUCCESS.
 */
export function stringCompare(nam: string, pat: string): boolean {
  const at = (s: string, i: number) => (i < s.length ? s[i]! : '\0');
  const lower = (c: string) => c.toLowerCase();
  let n = 0;
  let p = 0;
  for (;;) {
    const a = at(nam, n);
    const b = at(pat, p);
    if (lower(a) === lower(b)) {
      if (a === '\0') return true;
      n++;
      p++;
    } else if (b === '?' && a !== '\0') {
      n++;
      p++;
    } else {
      break;
    }
  }
  if (at(pat, p) !== '*') return false;
  while (at(pat, p) === '*') {
    p++;
    if (at(pat, p) === '\0') return true;
  }
  const rest = nam.slice(n);
  const tail = pat.slice(p);
  for (let k = rest.length - 1; k >= 0; k--) {
    if (lower(rest[k]!) === lower(tail[0]!)) {
      if (stringCompare(rest.slice(k), tail)) return true;
    }
  }
  return false;
}

/**
 * express.e:11218 nameCompare(s,t) - stringCompare with the USEWILDCARDS
 * toggle on, else StriCmp (case-insensitive equality).
 */
export function nameCompare(s: string, t: string, wildcards: boolean): boolean {
  if (wildcards) return stringCompare(s, t);
  return s.toLowerCase() === t.toLowerCase();
}

/** express.e:11226 checkForAst - 1-based position of the first `*`, 0 when none or wildcards are off. */
export function checkForAst(s: string, wildcards: boolean): number {
  if (!wildcards) return 0;
  const i = s.indexOf('*');
  return i < 0 ? 0 : i + 1;
}

/**
 * express.e:11474 findUserFromName(start, nameType, name) - the first slot
 * from `start` on whose name of that type matches, or 0. A deactivated
 * account (userKeys.number = 0) only counts with includeDeact (the account
 * editor's toggle, FALSE everywhere else).
 */
export function findUserFromName(
  start: number,
  nameType: ConfNameType,
  name: string,
  wildcards: boolean,
  includeDeact = false,
): number {
  // StrCopy(tempStr,name,31); UpperStr(tempStr)
  const pattern = name.slice(0, 31).toUpperCase();
  const count = userDatabaseManager.getUserCount();
  for (let slot = Math.max(1, start); slot <= count; slot++) {
    const rec = userDatabaseManager.readUserFromDisk(slot);
    if (!rec) return 0; // a short read ends the walk (Throw(ERR_EXCEPT,0))
    const candidate =
      nameType === 'username' ? rec.keys.userName : nameType === 'realname' ? rec.misc.realName : rec.misc.internetName;
    if (nameCompare(candidate, pattern, wildcards) && (includeDeact || rec.keys.number !== 0)) return slot;
  }
  return 0;
}

/**
 * The `SELECT confNameType` copy that follows every lookup (10828-10836,
 * 11587-11594, 8768-8775): userName (31), realName (26) or internetName (10).
 */
export function accountName(acct: DiskAccount, nameType: ConfNameType): string {
  if (nameType === 'realname') return acct.misc.realName.slice(0, 25);
  if (nameType === 'internetname') return acct.misc.internetName.slice(0, 9);
  return acct.keys.userName.slice(0, 30);
}

/** express.e:8499 checkConfAccess(confNum, user) for an account read off disk. */
export function accountHasConfAccess(acct: DiskAccount, confNum: number): boolean {
  const confAccess = acct.user.conferenceAccess.toString('latin1').replace(/\0[\s\S]*$/, '');
  // Lazy: message-scan.handler pulls in most of the message system.
  const { checkConfAccess } = require('./message-scan.handler');
  return checkConfAccess({ confAccess }, confNum);
}

/**
 * express.e:11526 chooseAName(s, ..., lflag). The account `s` names, or null
 * (RESULT_FAILURE). With wildcards on, a name with `*` at the fourth
 * character or later offers each match - ` Expand: <name> Correct (Y/n)?` -
 * and a No moves on to the next match, erasing the line when colour is on.
 */
export async function chooseAName(
  socket: any,
  session: BBSSession,
  s: string,
  lflag: boolean,
): Promise<DiskAccount | null> {
  const wildcards = useWildcards(session);
  const nameType = confNameTypeOf(session);
  let i = 1;
  let found: DiskAccount | null = null;
  for (;;) {
    const slot = findUserFromName(i, nameType, s, wildcards);
    if (slot === 0) {
      // express.e:11533 IF(lflag) THEN aePuts('\b\nUser does not exist!!\b\n\b\n')
      if (lflag) emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
      return null;
    }
    found = loadAccount(slot);
    if (!found) return null;
    const ast = checkForAst(s, wildcards);
    if (!ast) break;
    // express.e:11537 IF((stat<4) OR (USEWILDCARDS=FALSE)) THEN RETURN RESULT_FAILURE
    if (ast < 4) return null;
    emitText(socket, ' Expand: ');
    emitText(socket, found.keys.userName);
    emitText(socket, ' Correct ');
    if (await yesNo(socket, session, 1)) break;
    if (ansiColour(session)) emitText(socket, '\x1b[A\x1b[K');
    i = found.keys.number + 1;
  }
  // express.e:11554 loadAccount(hoozer2.number, ...)
  return loadAccount(found.keys.number) ?? found;
}

/**
 * express.e:11557 getAValidName(name, default, str). `flag` is its return
 * (1 for ALL / EALL); `name` is str - empty when the name was refused;
 * `account` is the tempUser it loaded, when it loaded one.
 */
export async function getAValidName(
  socket: any,
  session: BBSSession,
  name: string,
  def: string,
): Promise<{ flag: 0 | 1; name: string; account: DiskAccount | null }> {
  if (name.length === 0) return { flag: 0, name: def.slice(0, 30), account: null };

  const str = name.slice(0, 30).toLowerCase();
  if (str === 'all') return { flag: 1, name: 'ALL', account: null };
  if (str === 'eall') return { flag: 1, name: 'EALL', account: null };

  let acct: DiskAccount | null;
  if (str === 'sysop') {
    acct = loadAccount(1);
  } else {
    acct = await chooseAName(socket, session, name, true);
  }
  if (!acct) return { flag: 0, name: '', account: null };

  const result = accountName(acct, confNameTypeOf(session));
  if (!accountHasConfAccess(acct, session.currentConf || 1)) {
    emitText(socket, '\r\nUser does not have access to this conference, try another!\r\n\r\n');
    return { flag: 0, name: '', account: null };
  }
  return { flag: 0, name: result, account: acct };
}

/**
 * express.e:9909 checkToForward(str, name, check). The conference's
 * FORWARDMAIL tooltype names who gets the mail; with check set, only mail
 * addressed to the sysop (slot 1) is redirected. Prints
 * `    Forwarding mail To: <name>` and returns the new recipient - always
 * the forward account's userName (9929 AstrCopy(name,tempUserKeys.userName,31)).
 * Returns `name` unchanged (account null) when nothing forwards.
 */
export function checkToForward(
  socket: any,
  session: BBSSession,
  name: string,
  check: boolean,
): { name: string; account: DiskAccount | null } {
  const unchanged = { name, account: null };
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const fwd: string = String(getConferenceToolFlags(session.currentConf || 1)?.forwardMail || '').replace(/\n$/, '');
  if (!fwd) return unchanged;
  if (check) {
    const sysop = loadAccount(1);
    if (!sysop || !stringCompare(name, sysop.user.name)) return unchanged;
  }
  const nameType = confNameTypeOf(session);
  const slot = findUserFromName(1, nameType, fwd, useWildcards(session));
  const acct = slot ? loadAccount(slot) : null;
  if (!acct) return unchanged;
  emitText(socket, `    \x1b[36mForwarding mail To\x1b[33m:\x1b[0m ${accountName(acct, nameType)}\r\n`);
  return { name: acct.keys.userName.slice(0, 30), account: acct };
}

/**
 * The sysop's name as this conference addresses mail: loadAccount(1,...) and
 * the confNameType copy (enterMSG 10818-10836, commentToSYSOP 8765-8776).
 */
export function sysopNameForConf(session: BBSSession): string {
  const acct = loadAccount(1);
  return acct ? accountName(acct, confNameTypeOf(session)) : '';
}

/**
 * express.e:28151 captureRealAndInternetNames(conf, msgbase). When the
 * conference or message base wants real / internet names and the caller has
 * none, ask for it here. RESULT_SUCCESS, or RESULT_FAILURE when the caller
 * gave up with an empty line.
 */
export async function captureRealAndInternetNames(
  socket: any,
  session: BBSSession,
  conf: number,
  msgbase: number,
): Promise<number> {
  if (conf < 1 || msgbase < 1) return RESULT_SUCCESS;

  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(conf);
  const realNamesUsed = !!(flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgbase));
  const internetNamesUsed = !!(flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgbase));
  const misc: any = session.user || {};
  const wildcards = useWildcards(session);

  const ask = async (
    screen: string,
    sentence: string,
    prompt: string,
    maxLen: number,
    nameType: ConfNameType,
    current: string,
  ): Promise<string | null> => {
    emitText(socket, '\r\n');
    if (!(await showNameScreen(socket, session, screen))) emitText(socket, sentence);
    emitText(socket, '\r\n');
    for (;;) {
      emitText(socket, prompt);
      const tempstr = await lineInput(socket, session, maxLen);
      if (tempstr.length === 0) return null;
      // express.e:28179 IF (StrLen(tempstr)<>1) AND (StriCmp(tempstr,current)=FALSE)
      if (tempstr.length !== 1 && tempstr.toLowerCase() !== current.toLowerCase()) {
        emitText(socket, '\r\nChecking for duplicate name...');
        if (checkForAst(tempstr, wildcards)) {
          emitText(socket, 'No wildcards allowed in a name.\r\n');
        } else if (findUserFromName(1, nameType, tempstr, wildcards)) {
          emitText(socket, 'Already in use!, try another.\r\n\r\n');
        } else {
          emitText(socket, 'Ok!\r\n');
          return tempstr;
        }
      }
    }
  };

  const realName = String(misc.realName || misc.realname || '');
  if (realNamesUsed && realName.length === 0) {
    const got = await ask(
      'REALNAMES',
      'Real Names are required for messages in this conference/msgbase \r\n',
      'Real Name (Alpha Numeric): ',
      25,
      'realname',
      realName,
    );
    if (got === null) return RESULT_FAILURE;
    // AstrCopy(loggedOnUserMisc.realName,tempstr,26)
    if (session.user) (session.user as any).realName = got.slice(0, 25);
  }

  const internetName = String(misc.internetName || misc.internetname || '');
  if (internetNamesUsed && internetName.length === 0) {
    const got = await ask(
      'INTERNETNAMES',
      'Internet Names are required for messages in this conference/msgbase\r\n',
      'Internet Name (Alpha Numeric No Spaces): ',
      9,
      'internetname',
      internetName,
    );
    if (got === null) return RESULT_FAILURE;
    if (session.user) (session.user as any).internetName = got.slice(0, 9);
  }
  return RESULT_SUCCESS;
}

/**
 * displayScreen(SCREEN_REALNAMES / SCREEN_INTERNETNAMES): the board's screen
 * when it has one. express.e prints its own sentence only when it has not.
 */
async function showNameScreen(socket: any, session: BBSSession, screen: string): Promise<boolean> {
  try {
    const { displayScreen } = require('../screen.handler');
    return await displayScreen(socket, session, screen, true, true);
  } catch {
    return false;
  }
}

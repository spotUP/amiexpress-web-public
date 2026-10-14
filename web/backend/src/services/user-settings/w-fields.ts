/**
 * THE SEVENTEEN W FIELDS, ONCE - express.e:25712-26092 internalCommandW.
 *
 * Both callers ask here: the internal W menu (handlers/commands/
 * info-commands.handler.ts) for its stores, and the W door through the
 * AEW_USERFIELD command (amiga-emulation/xim/userfield.ts). The prompts and
 * the screen belong to each caller; whether a field may change, what it may
 * become and what it reads as belong here.
 *
 * Nothing here saves the account except row 0, which express.e saves at once
 * (25928) because the name is how the account is found again.
 */
import type { BBSSession } from '../../index';
import { ACSPermission } from '../../constants/acs-permissions';
import { UserFlag } from '../../constants/express-flags';
import { checkSecurity } from '../../utils/acs.util';
import { checkIfNameAllowed } from '../../utils/name-allowed.util';
import { autoLinesFor } from '../../utils/auto-lines.util';
import { computerTypeChoices } from '../../utils/computer-types.util';
import { checkForAst, findUserFromName, useWildcards } from '../../handlers/message/msg-names';
import { userMayToggleBackgroundFileCheck } from '../background-file-check.service';
import { changeAccount, saveAccount } from '../account.service';
import { translationService } from '../TranslationService';
import { db } from '../../database';
import { PROTOCOL_DISPLAY_NAMES } from '../../types';

export type WFieldNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export const W_FIELD_NUMBERS: readonly WFieldNumber[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export function isWFieldNumber(n: number): n is WFieldNumber {
  return Number.isInteger(n) && n >= 0 && n <= 16;
}

export type WFieldKind = 'text' | 'password' | 'lines' | 'choice' | 'cycle' | 'translator';
export interface WFieldSpec { label: string; kind: WFieldKind; maxLen: number; prompt: string }

/** maxLen is what lineInput takes (the table in the plan, "Input limit"). */
export const W_FIELDS: Readonly<Record<WFieldNumber, WFieldSpec>> = {
  0: { label: 'Login name', kind: 'text', maxLen: 30, prompt: 'Name: ' },
  1: { label: 'Email address', kind: 'text', maxLen: 100, prompt: 'Email Address: ' },
  2: { label: 'Real name', kind: 'text', maxLen: 25, prompt: 'Real Name: (Alpha Numeric) ' },
  3: { label: 'Internet name', kind: 'text', maxLen: 9, prompt: 'Internet Name: (Alpha Numeric No Spaces) ' },
  // WEB_: express.e:25981 'From: ' and LOCATION - this board asks for the
  // caller's group (the menu's row 4 says the same).
  4: { label: 'Group', kind: 'text', maxLen: 29, prompt: 'Group: ' },
  5: { label: 'Phone number', kind: 'text', maxLen: 12, prompt: 'Phone: ' },
  6: { label: 'Password', kind: 'password', maxLen: 50, prompt: 'Enter New Password: ' },
  7: { label: 'Lines per screen', kind: 'lines', maxLen: 3, prompt: 'Enter the number you see at the top of your screen (or 0 for Auto): ' },
  8: { label: 'Computer', kind: 'choice', maxLen: 3, prompt: 'Choose computer type: ' },
  9: { label: 'Screen type', kind: 'choice', maxLen: 3, prompt: 'Choose screen type: ' },
  10: { label: 'Screen clear', kind: 'cycle', maxLen: 0, prompt: '' },
  11: { label: 'Transfer protocol', kind: 'choice', maxLen: 5, prompt: 'Choose protocol: ' },
  12: { label: 'Editor type', kind: 'cycle', maxLen: 0, prompt: '' },
  13: { label: 'Zoom type', kind: 'cycle', maxLen: 0, prompt: '' },
  14: { label: 'Available for chat', kind: 'cycle', maxLen: 0, prompt: '' },
  15: { label: 'Translator', kind: 'translator', maxLen: 5, prompt: 'Language (num) >: ' },
  16: { label: 'Background file check', kind: 'cycle', maxLen: 0, prompt: '' },
};

/** The three editors, in the order W cycles them (express.e:26059-26060). */
export const EDITOR_ORDER: readonly string[] = ['Prompt', 'Line', 'Full'];
export const EDITOR_DISPLAY: Readonly<Record<string, string>> = {
  Prompt: 'PROMPT',
  Line: 'LINE EDITOR',
  Full: 'FULLSCREEN EDITOR',
};
export function editorValue(user: { editor?: string; editorType?: number }): string {
  if (user.editor && EDITOR_ORDER.includes(user.editor)) return user.editor;
  return EDITOR_ORDER[user.editorType ?? 0] ?? EDITOR_ORDER[0];
}

/** W 11's choices, in the order they are numbered (xprTitle). */
export const PROTOCOL_CHOICES = ['zmodem', 'ymodem', 'xmodem-1k', 'xmodem-crc', 'xmodem', 'punter', 'websocket'] as const;

/** The ACS each row asks (express.e:25735-25871). Rows 7-10 have none. */
const FIELD_ACS: Partial<Record<WFieldNumber, readonly ACSPermission[]>> = {
  0: [ACSPermission.EDIT_USER_NAME],
  1: [ACSPermission.EDIT_EMAIL],
  2: [ACSPermission.EDIT_REAL_NAME],
  3: [ACSPermission.EDIT_INTERNET_NAME],
  4: [ACSPermission.EDIT_USER_LOCATION],
  5: [ACSPermission.EDIT_PHONE_NUMBER],
  6: [ACSPermission.EDIT_PASSWORD],
  11: [ACSPermission.XPR_SEND, ACSPermission.XPR_RECEIVE],
  12: [ACSPermission.FULL_EDIT],
  13: [ACSPermission.ZOOM_MAIL],
  14: [ACSPermission.OLM],
  15: [ACSPermission.TRANSLATION],
};

export type WFieldState = 'editable' | 'disabled' | 'hidden';

export function wFieldState(session: BBSSession, n: WFieldNumber): WFieldState {
  if (n === 16) {
    // express.e:25876 BGFILECHECK and not FORCE_BGFILECHECK on this node.
    return userMayToggleBackgroundFileCheck(Number(session.nodeId) || 1) ? 'editable' : 'disabled';
  }
  const acs = FIELD_ACS[n];
  if (!acs) return 'editable';
  if (acs.some(a => checkSecurity(session.user, a))) return 'editable';
  // express.e:25871-25874 prints no row at all for the translator.
  return n === 15 ? 'hidden' : 'disabled';
}

const yesNo = (on: boolean): string => (on ? 'YES' : 'NO');

/** What the row reads as - the same strings the internal W menu paints. */
export function wFieldValue(session: BBSSession, n: WFieldNumber): string {
  const u = session.user;
  switch (n) {
    case 0: return String(u.username ?? '');
    case 1: return String(u.email ?? '');
    case 2: return String(u.realname ?? '');
    case 3: return String(u.internetName ?? '');
    case 4: return String(u.location ?? '');
    case 5: return String(u.phone ?? '');
    case 6: return 'ENCRYPTED';
    case 7: return u.linesPerScreen ? String(u.linesPerScreen) : 'Auto';
    case 8: return String(u.computer ?? '');
    case 9: return String(u.screenType ?? '');
    case 10: return yesNo(((u.userFlags ?? 0) & UserFlag.SCRNCLR) !== 0);
    case 11: {
      const p = String(u.protocol || 'zmodem');
      return (PROTOCOL_DISPLAY_NAMES as Record<string, string>)[p] || p.toUpperCase();
    }
    case 12: return EDITOR_DISPLAY[editorValue(u)] ?? 'PROMPT';
    case 13: return (u.zoomType ?? 0) === 1 ? 'ASCII' : 'QWK';
    case 14: return yesNo(!!u.availableForChat);
    case 15: return translationService.getUserLanguage(Number(u.id));
    case 16: return yesNo(((u.userFlags ?? 0) & UserFlag.BGFILECHECK) !== 0);
  }
}

/** chooseScreenType's titles (express.e:11348): the board's table, else its defaults. */
export async function screenTypeChoices(): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ScreenConfigService } = require('../config-services/screen-config.service');
    const records = await new ScreenConfigService(db).getAllScreenTypes();
    if (Array.isArray(records) && records.length > 0) {
      return records
        .filter((c: { enabled?: boolean }) => c.enabled !== false)
        .sort((a: { screen_number: number }, b: { screen_number: number }) => a.screen_number - b.screen_number)
        .map((c: { screen_title?: string; screen_type: string }) => c.screen_title || c.screen_type);
    }
  } catch { /* the defaults below */ }
  return ['ANSI', 'ASCII', 'Amiga ANSI', 'VT100', 'RIP'];
}

/** The pick list a choice row opens (chooseComputer / chooseScreenType / chooseProtocol). */
export async function wFieldChoices(n: WFieldNumber): Promise<string[]> {
  if (n === 8) return computerTypeChoices(db);
  if (n === 9) return screenTypeChoices();
  if (n === 11) {
    return PROTOCOL_CHOICES.map(p => PROTOCOL_DISPLAY_NAMES[p]);
  }
  return [];
}

export type WFieldOutcome =
  | { kind: 'stored'; value: string }
  | { kind: 'unchanged' }
  | { kind: 'denied' }
  | { kind: 'refused'; refusal: string; retry: boolean }
  | { kind: 'again' };

export interface ApplyWFieldOptions {
  /** express.e prints "Checking for duplicate name..." here (25914, 25947, 25969). */
  onChecking?: () => void;
}

const NAME_ROWS = {
  0: { field: 'username', type: 'username' },
  2: { field: 'realname', type: 'realname' },
  3: { field: 'internetName', type: 'internetname' },
} as const;

async function applyName(session: BBSSession, n: 0 | 2 | 3, input: string, opts: ApplyWFieldOptions): Promise<WFieldOutcome> {
  const row = NAME_ROWS[n];
  const str = input.slice(0, W_FIELDS[n].maxLen);
  // 25910 compares the keys' name; 25945 and 25966 BOTH compare the real name.
  const same = n === 0 ? session.user.username : session.user.realname;
  if (str.toLowerCase() === String(same ?? '').toLowerCase()) return { kind: 'unchanged' };
  if (n === 0) {
    const refused = checkIfNameAllowed(str);
    if (refused) return { kind: 'refused', refusal: refused, retry: true };
  }
  opts.onChecking?.();
  const wildcards = useWildcards(session);
  if (checkForAst(str, wildcards)) return { kind: 'refused', refusal: 'No wildcards allowed in a name.', retry: true };
  if (findUserFromName(1, row.type, str, wildcards) !== 0) {
    return { kind: 'refused', refusal: 'Already in use!, try another.', retry: true };
  }
  await changeAccount(session, { [row.field]: str });
  if (n === 0) await saveAccount(session.user);
  return { kind: 'stored', value: str };
}

/** AstrCopy(dest, str, size): size - 1 characters reach the record. */
async function storeText(session: BBSSession, field: 'email' | 'location' | 'phone', input: string, keep: number): Promise<WFieldOutcome> {
  if (input.length === 0) return { kind: 'unchanged' };
  const value = input.slice(0, keep);
  await changeAccount(session, { [field]: value });
  return { kind: 'stored', value };
}

async function pick(session: BBSSession, n: 8 | 9, input: string): Promise<WFieldOutcome> {
  if (input.length === 0) return { kind: 'unchanged' };
  const choices = await wFieldChoices(n);
  if (choices.length === 0) return { kind: 'unchanged' }; // 26033 / 26040: count()>0
  const num = parseInt(input, 10);
  if (isNaN(num) || num < 1 || num > choices.length) return { kind: 'again' };
  const name = choices[num - 1];
  if (n === 8) await changeAccount(session, { computer: name, computerIndex: num - 1 });
  else await changeAccount(session, { screenType: name });
  return { kind: 'stored', value: name };
}

export async function applyWField(
  session: BBSSession,
  n: WFieldNumber,
  input: string,
  opts: ApplyWFieldOptions = {},
): Promise<WFieldOutcome> {
  if (wFieldState(session, n) !== 'editable') return { kind: 'denied' };
  const u = session.user;
  switch (n) {
    case 0: case 2: case 3: return applyName(session, n, input, opts);
    case 1: return storeText(session, 'email', input, 49);
    case 4: return storeText(session, 'location', input, 29);
    case 5: return storeText(session, 'phone', input, 12);
    case 6: return { kind: 'denied' }; // the password is changeWPassword's (w-password.ts)
    case 7: {
      if (input.length === 0) return { kind: 'unchanged' };
      const lines = parseInt(input, 10) || 0; // Val()
      if (lines < 0 || lines > 255) return { kind: 'again' };
      await changeAccount(session, { linesPerScreen: lines > 0 ? lines : autoLinesFor(session) });
      return { kind: 'stored', value: wFieldValue(session, 7) };
    }
    case 8: case 9: return pick(session, n, input);
    case 10:
      await changeAccount(session, { userFlags: (u.userFlags ?? 0) ^ UserFlag.SCRNCLR });
      return { kind: 'stored', value: wFieldValue(session, 10) };
    case 11: {
      if (input.length === 0) return { kind: 'unchanged' };
      const choice = PROTOCOL_CHOICES[(parseInt(input, 10) || 0) - 1];
      if (!choice) return { kind: 'again' };
      await changeAccount(session, { protocol: choice });
      return { kind: 'stored', value: wFieldValue(session, 11) };
    }
    case 12: {
      const next = EDITOR_ORDER[(EDITOR_ORDER.indexOf(editorValue(u)) + 1) % EDITOR_ORDER.length];
      u.editorType = EDITOR_ORDER.indexOf(next);
      await changeAccount(session, { editor: next });
      return { kind: 'stored', value: wFieldValue(session, 12) };
    }
    case 13:
      // WEB_: the menu has always stored 0/1 here while User.zoomType is declared
      // string ('QWK'); the number is kept so the menu reads back as before.
      await changeAccount(session, { zoomType: (((u.zoomType ?? 0) + 1) & 1) as unknown as string });
      return { kind: 'stored', value: wFieldValue(session, 13) };
    case 14:
      await changeAccount(session, { availableForChat: !u.availableForChat });
      return { kind: 'stored', value: wFieldValue(session, 14) };
    case 15:
      // WEB_: express.e:11391 chooseTranslator reads TR_*.library languages;
      // this board has none, so a choice changes nothing (the menu's case 15).
      return { kind: 'unchanged' };
    case 16:
      await changeAccount(session, { userFlags: (u.userFlags ?? 0) ^ UserFlag.BGFILECHECK });
      return { kind: 'stored', value: wFieldValue(session, 16) };
  }
}

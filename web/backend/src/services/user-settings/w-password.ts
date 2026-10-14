/**
 * W row 6 - express.e:25995-26026 - and setNewPassword (express.e:935), once.
 *
 * Three places set a caller's password and each did it its own way: the DT
 * write (xim/data-query.ts), the W menu (it never set pwdLastUpdated, which
 * express.e:26026 does) and the sysop's account editor. They all call
 * setNewPassword now; the W menu and the W door both call changeWPassword.
 */
import * as bcrypt from 'bcryptjs';
import type { BBSSession } from '../../index';
import { checkPasswordStrength } from '../../utils/password-strength.util';
import { getBoardConfig } from '../bbs-config-file.service';
import { config as appConfig } from '../../config';
import { changeAccount } from '../account.service';
import { wFieldState, type WFieldOutcome } from './w-fields';

/** setNewPassword under this board's hash (database.ts hashPassword is bcrypt, 10 rounds). */
export function setNewPassword(user: { passwordHash?: string; pwdLastUpdated?: number }, plain: string): void {
  user.passwordHash = bcrypt.hashSync(plain, 10);
  // Unix seconds, like every User date; user.misc gets express.e's form
  // from UserFileManager (encodeAmigaDate).
  user.pwdLastUpdated = Math.floor(Date.now() / 1000);
}

export const PASSWORDS_DIFFER = '\r\nPasswords do not match, changes not saved';
export function passwordTooShort(min: number): string {
  return `\r\nPassword length must be at least ${min} chars, changes not saved`;
}
export function passwordTooWeak(min: number): string {
  return `\r\nPassword must have at least ${min} of these:\r\n  upper case,lower case, numeric and symbols - changes not saved`;
}

function rules(): { minLen: number; minStrength: number } {
  try {
    const conf = getBoardConfig(appConfig.get('dataDir'));
    return { minLen: conf.min_password_length ?? 0, minStrength: conf.min_password_strength ?? 0 };
  } catch {
    return { minLen: 0, minStrength: 0 };
  }
}

/** Both entries, as getPass2 took them (50 each). Every refusal returns to the menu: retry false. */
export async function changeWPassword(session: BBSSession, first: string, second: string): Promise<WFieldOutcome> {
  if (wFieldState(session, 6) !== 'editable') return { kind: 'denied' };
  if (first.length === 0 || second.length === 0) return { kind: 'unchanged' };
  const a = first.slice(0, 50);
  const b = second.slice(0, 50);
  if (a !== b) return { kind: 'refused', refusal: PASSWORDS_DIFFER, retry: false };
  const { minLen, minStrength } = rules();
  const strength = checkPasswordStrength(a, minLen, minStrength);
  if (strength === 1) return { kind: 'refused', refusal: passwordTooShort(minLen), retry: false };
  if (strength === 2) return { kind: 'refused', refusal: passwordTooWeak(minStrength), retry: false };
  setNewPassword(session.user, a);
  await changeAccount(session, { passwordHash: session.user.passwordHash, pwdLastUpdated: session.user.pwdLastUpdated });
  return { kind: 'stored', value: 'ENCRYPTED' };
}

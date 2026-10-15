/**
 * The chat logins' password check, once.
 *
 * Chat has three ways to log on without the BBS logon: the HTTP login
 * (/api/chat/login), the socket modal (chat-only-login-submit) and the
 * livechat door's own blessed modal. Each carried its own copy of the check,
 * and the door's copy asked only the password - a deleted, locked or level-0
 * account logged into chat from the door, and a wrong password there was
 * never counted toward MAX_PASSWORD_FAILS.
 *
 * So all three ask this, and it asks what the BBS logon and FTP ask:
 *   express.e:1008-1018  a wrong password counts, a right one zeroes the count
 *                        (services/password-failures)
 *   express.e:29701-29795 the account gates (services/logon-gates); a password
 *                        that must be changed cannot be changed in chat, so it
 *                        refuses here as it does on FTP.
 */
import { loadAccount } from './load-account';
import { accountRefusal } from './logon-gates';
import { countWrongPassword, clearWrongPasswords } from './password-failures';
import type { User } from '../database/types';

export interface ChatLoginDb {
  getUserByUsername(username: string): Promise<User | null | undefined> | User | null | undefined;
  verifyPassword(password: string, hash: string): Promise<boolean>;
}

export type ChatLoginResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; message: string };

/** The same words for an unknown name and a wrong password: a different
 * answer told any visitor which names have accounts. */
export const CHAT_LOGIN_BAD_CREDENTIALS = 'Invalid username or password';
export const CHAT_LOGIN_REFUSED = 'That account cannot log on. Call the board to find out why.';

export async function chatLogin(db: ChatLoginDb, username: string, password: string): Promise<ChatLoginResult> {
  const user = await db.getUserByUsername(username);
  if (!user) return { ok: false, status: 401, message: CHAT_LOGIN_BAD_CREDENTIALS };

  if (!(await db.verifyPassword(password, user.passwordHash))) {
    countWrongPassword(user, 'CHAT');
    return { ok: false, status: 401, message: CHAT_LOGIN_BAD_CREDENTIALS };
  }

  clearWrongPasswords(user, 'CHAT');

  if (accountRefusal(loadAccount(user).user) !== null) {
    return { ok: false, status: 403, message: CHAT_LOGIN_REFUSED };
  }
  return { ok: true, user };
}

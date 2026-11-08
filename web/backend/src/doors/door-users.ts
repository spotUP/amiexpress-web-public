/**
 * The caller's and other users' records a door reads or changes through BBSApi.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';
import type { BBSUser } from './bbs-api-types';
import { db } from '../database';
import { changeAccount } from '../services/account.service';
import {
  refuseErasureConfirm, refuseErasurePassword, refuseErasureUsername, performErasure,
} from '../handlers/user/gdpr.handler';


const MAX_ERASE_PASSWORD_REFUSALS = 5;

/**
 * Get current user information
 * Equivalent to AEDoor GetDT() function with DT_NAME, DT_LOCATION, etc.
 */
export function doorGetUser(session: BBSSession): BBSUser | null {
  if (!session.user) return null;

  return {
    id: session.user.id,
    username: session.user.username,
    realname: session.user.realname,
    location: session.user.location,
    phone: session.user.phone,
    email: session.user.email,
    secLevel: session.user.secLevel || 0,
    downloads: session.user.downloads || 0,
    uploads: session.user.uploads || 0,
    timeToday: session.user.timeToday || 0,
    lastCall: session.user.lastCall,
    numCalls: session.user.numCalls || 0,
    birthday: session.user.birthday,
    gender: session.user.gender
  };
}

/**
 * Get list of users (for autocomplete / directory UIs)
 */
export async function doorGetUserList(limit: number = 1000): Promise<BBSUser[]> {
  const users = await db.getUsers({ limit });
  return users.map((user: any) => ({
    id: user.id,
    username: user.username,
    realname: user.realname,
    location: user.location,
    phone: user.phone,
    email: user.email,
    secLevel: user.secLevel || 0,
    downloads: user.downloads || 0,
    uploads: user.uploads || 0,
    timeToday: user.timeToday || 0,
    lastCall: user.lastCall,
    numCalls: user.numCalls || 0,
    birthday: user.birthday,
    gender: user.gender,
  }));
}

/**
 * The board's three GDPR erasure checks, in the board's order and with its
 * texts. `check: true` answers without erasing, so the door can take its
 * screen down before the board writes its erasure lines and drops the line.
 */
export async function doorEraseMyAccount(socket: Socket, session: BBSSession, 
  answers: { confirm: string; password: string; username: string },
  opts: { check?: boolean } = {},
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const user = session.user;
  if (!user) return { ok: false, reason: 'Session has no user bound. Deletion cancelled.' };
  // A door can ask this as often as it likes, so the password check is an
  // oracle unless it is limited: five refused passwords per session, then no more.
  const counted = session as { erasurePasswordRefusals?: number };
  if ((counted.erasurePasswordRefusals ?? 0) >= MAX_ERASE_PASSWORD_REFUSALS) {
    return { ok: false, reason: 'Too many attempts. Deletion cancelled.' };
  }
  let reason = refuseErasureConfirm(answers.confirm);
  if (!reason) {
    reason = await refuseErasurePassword(user, answers.password);
    if (reason) {
      counted.erasurePasswordRefusals = (counted.erasurePasswordRefusals ?? 0) + 1;
      console.warn(`[gdpr] eraseMyAccount password refused for user ${user.id} (refusal ${counted.erasurePasswordRefusals})`);
    }
  }
  reason = reason ?? refuseErasureUsername(user, answers.username);
  if (reason) return { ok: false, reason };
  if (!opts.check) await performErasure(socket, session);
  return { ok: true };
}

/**
 * Achievements (SP3, S1): a caller with no address is not a player, and
 * the ACHIEVE door is where one is asked for. Changed on the caller's
 * account in memory, so the reporter sees it from now on, and written to
 * the user record with the account at logoff (express.e 8207). Returns
 * false (and changes nothing) for anything that is not shaped like an
 * address.
 */
export async function doorSetUserEmail(session: BBSSession, email: string): Promise<boolean> {
  const trimmed = String(email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254 || !session.user?.id) return false;
  try {
    // The caller's own account, in memory; saved with it (express.e 8207).
    await changeAccount(session, { email: trimmed });
    return true;
  } catch (error) {
    console.warn(`[WARN] achievements: could not store the address: ${(error as Error).message}`);
    return false;
  }
}

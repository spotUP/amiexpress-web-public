/**
 * The token that keeps somebody logged into /chat.
 *
 * /api/chat/login minted one of these; the door's blessed login modal did
 * not, so anybody who signed in through the modal had nothing stored and had
 * to sign in again on every reload. Reported as "I have to log in every time
 * - this should work like Discord".
 *
 * One implementation, used by both, so the two cannot drift into issuing
 * different claims or different lifetimes.
 */

import jwt from 'jsonwebtoken';

export interface ChatTokenUser {
  id: string;
  username: string;
  secLevel: number;
}

/** Signed in for a month if asked to be remembered, a day otherwise. */
export const REMEMBERED_LIFETIME = '30d';
export const SESSION_LIFETIME = '24h';

export function chatTokenSecret(): string {
  return process.env.JWT_SECRET || 'amiexpress-secret-key-change-in-production';
}

/**
 * Mint a chat-only token for a user who has ALREADY been authenticated.
 *
 * The `chatOnly` claim is what the socket auth middleware looks for to build
 * a chat session rather than a full BBS one.
 */
export function mintChatToken(user: ChatTokenUser, rememberMe = false): string {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      secLevel: user.secLevel,
      chatOnly: true,
    },
    chatTokenSecret(),
    { expiresIn: rememberMe ? REMEMBERED_LIFETIME : SESSION_LIFETIME }
  );
}

import { randomBytes } from 'crypto';
import { db } from '../database';

/**
 * Discord link codes (WHIP mirror bot, Phase 0).
 *
 * The BBS side mints a short code for a logged-on user (`LINKDISCORD`);
 * the user hands it to the bot (`/link <code>`), which verifies it here
 * through the backend. Codes live in memory: verification happens in this
 * same process over REST, so there is nothing to share across processes,
 * and a restart simply invalidates outstanding codes.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_BYTES = 4; // 8 hex chars, unambiguous enough for a 10-minute code

interface PendingCode {
  userId: string;
  username: string;
  expiresAt: number;
}

const pending = new Map<string, PendingCode>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [code, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(code);
  }
}

class DiscordLinkService {
  /** Mint a code for a BBS user. Any previous code for them is replaced. */
  issueCode(userId: string, username: string): { code: string; expiresAt: number } {
    pruneExpired();
    for (const [code, entry] of pending) {
      if (entry.userId === userId) pending.delete(code);
    }
    let code = randomBytes(CODE_BYTES).toString('hex').toUpperCase();
    while (pending.has(code)) code = randomBytes(CODE_BYTES).toString('hex').toUpperCase();
    const expiresAt = Date.now() + CODE_TTL_MS;
    pending.set(code, { userId, username, expiresAt });
    return { code, expiresAt };
  }

  /**
   * Verify a code from the bot and consume it. Returns the linked row on
   * success, null when the code is unknown, expired, or already spent.
   * `store` defaults to the live db; tests pass the isolated testDb.
   */
  async redeemCode(
    code: string,
    discordId: string,
    store: { linkDiscord(discordId: string, userId: string): Promise<unknown> } = db
  ): Promise<{ userId: string; username: string } | null> {
    const key = code.trim().toUpperCase();
    const entry = pending.get(key);
    if (!entry) return null;
    pending.delete(key);
    if (entry.expiresAt <= Date.now()) return null;
    await store.linkDiscord(discordId, entry.userId);
    return { userId: entry.userId, username: entry.username };
  }

  /** Test seam: how many codes are outstanding. */
  pendingCount(): number {
    pruneExpired();
    return pending.size;
  }
}

export const discordLinkService = new DiscordLinkService();
export { CODE_TTL_MS };

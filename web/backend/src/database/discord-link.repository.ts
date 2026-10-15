/**
 * Discord Link Repository
 * Maps Discord user IDs to BBS user IDs for the WHIP mirror bot (Phase 0).
 *
 * A row exists only while linked; unlinking deletes it. Either side of the
 * mapping is unique: one Discord account links to one BBS user and back.
 */

import { BaseRepository } from './BaseRepository';

export interface DiscordLink {
  discordId: string;
  userId: string;
  linkedAt: number;
}

export class DiscordLinkRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  async getByDiscordId(discordId: string): Promise<DiscordLink | null> {
    const row = this.prepare('SELECT * FROM user_discord_links WHERE discord_id = ?').get(discordId) as any;
    if (!row) return null;
    return { discordId: row.discord_id, userId: row.user_id, linkedAt: row.linked_at };
  }

  async getByUserId(userId: string): Promise<DiscordLink | null> {
    const row = this.prepare('SELECT * FROM user_discord_links WHERE user_id = ?').get(userId) as any;
    if (!row) return null;
    return { discordId: row.discord_id, userId: row.user_id, linkedAt: row.linked_at };
  }

  /**
   * Link (or re-link) a Discord account. Re-linking either side moves the
   * row: a Discord account takes its new BBS user, a BBS user takes its new
   * Discord account. There is exactly one row per Discord ID and per user.
   */
  async link(discordId: string, userId: string): Promise<DiscordLink> {
    const now = Math.floor(Date.now() / 1000);
    this.prepare('DELETE FROM user_discord_links WHERE discord_id = ? OR user_id = ?').run(discordId, userId);
    this.prepare('INSERT INTO user_discord_links (discord_id, user_id, linked_at) VALUES (?, ?, ?)').run(discordId, userId, now);
    return { discordId, userId, linkedAt: now };
  }

  async unlinkByDiscordId(discordId: string): Promise<boolean> {
    const result = this.prepare('DELETE FROM user_discord_links WHERE discord_id = ?').run(discordId);
    return (result.changes as number) > 0;
  }

  async unlinkByUserId(userId: string): Promise<boolean> {
    const result = this.prepare('DELETE FROM user_discord_links WHERE user_id = ?').run(userId);
    return (result.changes as number) > 0;
  }
}

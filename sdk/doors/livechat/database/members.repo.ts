import type { ChannelMember } from '../types';
import { MemberQueries } from './members-query';

/** Channel members repository */
export class MemberRepository extends MemberQueries {
  async add(channelId: string, userId: number, role = 'member'): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO chat_channel_members
       (channel_id, user_id, role, joined_at) VALUES (?, ?, ?, datetime('now'))`,
      [channelId, userId, role]
    );
  }

  async remove(channelId: string, userId: number): Promise<void> {
    await this.db.run(
      `DELETE FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`,
      [channelId, userId]
    );
  }

  async setRole(channelId: string, userId: number, role: string): Promise<void> {
    await this.db.run(
      `UPDATE chat_channel_members SET role = ? WHERE channel_id = ? AND user_id = ?`,
      [role, channelId, userId]
    );
  }

  async ban(channelId: string, userId: number, reason: string): Promise<void> {
    await this.db.run(
      `UPDATE chat_channel_members SET banned = 1, ban_reason = ?
       WHERE channel_id = ? AND user_id = ?`,
      [reason, channelId, userId]
    );
  }

  async unban(channelId: string, userId: number): Promise<void> {
    await this.db.run(
      `UPDATE chat_channel_members SET banned = 0, ban_reason = NULL
       WHERE channel_id = ? AND user_id = ?`,
      [channelId, userId]
    );
  }
}

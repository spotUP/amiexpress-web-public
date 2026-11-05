import type { ChannelMember } from '../types';

/** Member query operations */
export class MemberQueries {
  protected db: any;

  constructor(db: any) {
    this.db = db;
  }

  async get(channelId: string, userId: number): Promise<ChannelMember | null> {
    return this.db.get(
      `SELECT * FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`,
      [channelId, userId]
    );
  }

  async getByChannel(channelId: string): Promise<ChannelMember[]> {
    return this.db.all(
      `SELECT * FROM chat_channel_members WHERE channel_id = ? AND banned = 0`,
      [channelId]
    );
  }

  async getByUser(userId: number): Promise<ChannelMember[]> {
    return this.db.all(
      `SELECT * FROM chat_channel_members WHERE user_id = ?`,
      [userId]
    );
  }
}

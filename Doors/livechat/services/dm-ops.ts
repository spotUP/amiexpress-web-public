import type { Channel } from '../types';
import { ChannelRepository, MemberRepository } from '../database';

/** DM operations */
export class DMOps {
  private channelRepo: ChannelRepository;
  private memberRepo: MemberRepository;
  private userId: number;

  constructor(channelRepo: ChannelRepository, memberRepo: MemberRepository, userId: number) {
    this.channelRepo = channelRepo;
    this.memberRepo = memberRepo;
    this.userId = userId;
  }

  /** Get or create DM channel with another user */
  async getOrCreate(otherUserId: number, otherUsername: string): Promise<Channel> {
    const dmId = this.getDMId(otherUserId);
    let channel = await this.channelRepo.getById(dmId);
    if (!channel) {
      channel = await this.channelRepo.create({
        id: dmId,
        name: `dm-${this.userId}-${otherUserId}`,
        displayName: otherUsername,
        topic: 'Direct Message',
        type: 'dm',
        createdBy: String(this.userId),
        createdAt: new Date(),
        memberCount: 2
      });
      await this.memberRepo.add(dmId, this.userId, 'owner');
      await this.memberRepo.add(dmId, otherUserId, 'member');
    }
    return channel;
  }

  /** Get all DM channels for user */
  async getAllDMs(): Promise<Channel[]> {
    const memberships = await this.memberRepo.getByUser(this.userId);
    const dms: Channel[] = [];
    for (const m of memberships) {
      const ch = await this.channelRepo.getById((m as any).channel_id);
      if (ch?.type === 'dm') dms.push(ch);
    }
    return dms;
  }

  /** Generate DM channel ID */
  private getDMId(otherUserId: number): string {
    const ids = [this.userId, otherUserId].sort((a, b) => a - b);
    return `dm-${ids[0]}-${ids[1]}`;
  }
}

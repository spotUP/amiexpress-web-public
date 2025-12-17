import type { Channel } from '../types';
import { ChannelRepository } from '../database';

/** Channel operations with DB */
export class ChannelOps {
  private repo: ChannelRepository;
  private socket: any;
  private userId: number;

  constructor(repo: ChannelRepository, socket: any, userId: number) {
    this.repo = repo;
    this.socket = socket;
    this.userId = userId;
  }

  /** Load all accessible channels */
  async loadAll(): Promise<Channel[]> {
    return this.repo.getAll();
  }

  /** Join a channel */
  async join(channelId: string): Promise<void> {
    this.socket?.join?.(`channel:${channelId}`);
    this.socket?.emit?.('chat:user-joined', { channelId, userId: this.userId });
  }

  /** Leave a channel */
  async leave(channelId: string): Promise<void> {
    this.socket?.leave?.(`channel:${channelId}`);
    this.socket?.emit?.('chat:user-left', { channelId, userId: this.userId });
  }

  /** Create a new channel */
  async create(name: string, topic: string): Promise<Channel> {
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return this.repo.create({
      id, name, displayName: name, topic, type: 'public',
      createdBy: String(this.userId), createdAt: new Date(), memberCount: 1
    });
  }

  /** Update channel topic */
  async updateTopic(channelId: string, topic: string): Promise<void> {
    await this.repo.update(channelId, { topic });
    this.socket?.emit?.('chat:channel-updated', { channelId, topic });
  }

  /** Delete (archive) a channel */
  async delete(channelId: string): Promise<void> {
    await this.repo.archive(channelId);
    this.socket?.emit?.('chat:channel-deleted', { channelId });
  }
}

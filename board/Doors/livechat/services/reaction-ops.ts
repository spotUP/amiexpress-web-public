import type { Reaction } from '../types';
import { ReactionRepository } from '../database';

/** Reaction operations with DB */
export class ReactionOps {
  private repo: ReactionRepository;
  private socket: any;
  private userId: number;

  constructor(repo: ReactionRepository, socket: any, userId: number) {
    this.repo = repo;
    this.socket = socket;
    this.userId = userId;
  }

  /** Add reaction to message */
  async add(messageId: string, emoji: string): Promise<void> {
    await this.repo.add(messageId, this.userId, emoji);
    this.socket?.emit?.('chat:reaction-added', {
      messageId, userId: this.userId, emoji
    });
  }

  /** Remove reaction from message */
  async remove(messageId: string, emoji: string): Promise<void> {
    await this.repo.remove(messageId, this.userId, emoji);
    this.socket?.emit?.('chat:reaction-removed', {
      messageId, userId: this.userId, emoji
    });
  }

  /** Toggle reaction (add if not exists, remove if exists) */
  async toggle(messageId: string, emoji: string): Promise<boolean> {
    const toggled = await this.repo.toggle(messageId, this.userId, emoji);
    const event = toggled ? 'chat:reaction-added' : 'chat:reaction-removed';
    this.socket?.emit?.(event, { messageId, userId: this.userId, emoji });
    return toggled;
  }

  /** Get reactions for message */
  async getForMessage(messageId: string): Promise<Reaction[]> {
    return this.repo.getByMessage(messageId);
  }
}

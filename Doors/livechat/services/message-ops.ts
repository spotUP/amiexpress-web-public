import type { Message } from '../types';
import { MessageRepository } from '../database';

/** Message operations */
export class MessageOps {
  private repo: MessageRepository;
  private socket: any;
  private userId: number;
  private name: string;

  constructor(repo: MessageRepository, socket: any, userId: number, name: string) {
    this.repo = repo;
    this.socket = socket;
    this.userId = userId;
    this.name = name;
  }

  /** Load messages */
  async load(chId: string, limit = 50): Promise<Message[]> {
    return this.repo.getByChannel(chId, limit);
  }

  /** Send */
  async send(chId: string, content: string, type: Message['type'] = 'message'): Promise<Message> {
    const msg = await this.repo.create({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId: chId, userId: String(this.userId), username: this.name,
      content, type, createdAt: new Date(), replyCount: 0
    });
    this.socket?.emit?.('chat:message', msg);
    return msg;
  }

  /** Reply */
  async reply(chId: string, tid: string, content: string): Promise<Message> {
    const msg = await this.repo.create({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId: chId, threadId: tid, userId: String(this.userId), username: this.name,
      content, type: 'message', createdAt: new Date(), replyCount: 0
    });
    await this.repo.updateReplyCount(tid);
    this.socket?.emit?.('chat:thread-reply', msg);
    return msg;
  }

  /** Edit */
  async edit(id: string, content: string): Promise<void> {
    const m = await this.repo.getById(id);
    if (!m || m.userId !== String(this.userId)) return;
    this.socket?.emit?.('chat:message-edit', { messageId: id, content });
  }

  /** Delete */
  async delete(id: string): Promise<void> {
    await this.repo.delete(id, this.userId);
    this.socket?.emit?.('chat:message-delete', { messageId: id });
  }
}

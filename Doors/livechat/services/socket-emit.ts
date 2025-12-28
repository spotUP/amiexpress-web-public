import type { Message, Channel } from '../types';

/** Socket event emitter */
export class SocketEmitter {
  private s: any;
  constructor(socket: any) { this.s = socket; }

  keystroke(chId: string, uid: number, char: string): void {
    console.log('[SOCKET EMIT] Emitting chat:keystroke:', { channelId: chId, userId: uid, char, socketExists: !!this.s, emitExists: !!this.s?.emit });
    this.s?.emit?.('chat:keystroke', { channelId: chId, userId: uid, char });
  }
  keystrokeClear(chId: string, uid: number): void {
    this.s?.emit?.('chat:keystroke-clear', { channelId: chId, userId: uid });
  }
  keystrokeSubmit(chId: string, uid: number): void {
    this.s?.emit?.('chat:keystroke-submit', { channelId: chId, userId: uid });
  }
  message(msg: Message): void {
    this.s?.emit?.('chat:message', msg);
  }
  messageEdit(msg: Message): void {
    this.s?.emit?.('chat:message-edit', msg);
  }
  messageDelete(msgId: string, chId: string): void {
    this.s?.emit?.('chat:message-delete', { messageId: msgId, channelId: chId });
  }
  threadReply(msg: Message): void {
    this.s?.emit?.('chat:thread-reply', msg);
  }
  channelCreated(ch: Channel): void {
    this.s?.emit?.('chat:channel-created', { channel: ch });
  }
  channelDeleted(chId: string): void {
    this.s?.emit?.('chat:channel-deleted', { channelId: chId });
  }
  channelUpdated(ch: Channel): void {
    this.s?.emit?.('chat:channel-updated', { channel: ch });
  }
  userJoined(chId: string, uid: number, name: string): void {
    this.s?.emit?.('chat:user-joined', { channelId: chId, userId: uid, username: name });
  }
  userLeft(chId: string, uid: number, name: string): void {
    this.s?.emit?.('chat:user-left', { channelId: chId, userId: uid, username: name });
  }
  presenceUpdate(status: string): void {
    this.s?.emit?.('chat:presence-update', { status });
  }
}

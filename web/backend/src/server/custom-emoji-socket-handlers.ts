/**
 * Custom emoji for LiveChat: chat:emoji:add, chat:emoji:remove (sysop only)
 * and chat:emoji:list (anyone). A change broadcasts the new list to every
 * session as `chat:emoji-list`, so open doors pick it up at once.
 *
 * The functions are exported because the livechat door's emits never reach a
 * socket.on listener; createDoorSocketWrapper (handlers/door.handler.ts)
 * routes them here, like chat:react.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { SYSOP_LEVEL } from './socket-guard';
import { db } from '../database';
import { emitToEveryone } from '../handlers/chat/group-chat.handler';

export interface EmojiAddData { name: string; display: string; ascii: string }
export interface EmojiRemoveData { name: string }

/** Starts with a letter so a clock like 12:30:45 never reads as :30:. */
const NAME = /^[a-z][a-z0-9_+-]{0,23}$/;
const MAX_FORM = 16;
/** Printable ASCII without the braces that carry terminal markup tags. */
const SAFE_ASCII = /^[\x20-\x7a|~]+$/;

const isSysop = (session: BBSSession): boolean =>
  Number((session.user as { secLevel?: unknown } | undefined)?.secLevel ?? 0) >= SYSOP_LEVEL;

function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^:|:$/g, '') : '';
}

async function broadcast(): Promise<void> {
  emitToEveryone('chat:emoji-list', { emojis: await db.listCustomEmojis() });
}

export async function handleEmojiAdd(socket: Socket, session: BBSSession, data: EmojiAddData): Promise<void> {
  try {
    if (!isSysop(session)) {
      socket.emit('chat:error', { error: 'Only the sysop can add custom emoji' });
      return;
    }
    const name = cleanName(data?.name);
    const display = typeof data?.display === 'string' ? data.display.trim() : '';
    const ascii = typeof data?.ascii === 'string' ? data.ascii.trim() : '';
    if (!NAME.test(name) || !display || display.length > MAX_FORM || /[{}]/.test(display)
      || !ascii || ascii.length > MAX_FORM || !SAFE_ASCII.test(ascii)) {
      socket.emit('chat:error', { error: 'Invalid custom emoji' });
      return;
    }
    await db.upsertCustomEmoji(name, display, ascii, String(session.user?.username ?? ''));
    await broadcast();
  } catch (error) {
    console.error('[CustomEmoji] add error:', error);
    socket.emit('chat:error', { error: 'Failed to add custom emoji' });
  }
}

export async function handleEmojiRemove(socket: Socket, session: BBSSession, data: EmojiRemoveData): Promise<void> {
  try {
    if (!isSysop(session)) {
      socket.emit('chat:error', { error: 'Only the sysop can remove custom emoji' });
      return;
    }
    const removed = await db.removeCustomEmoji(cleanName(data?.name));
    if (!removed) {
      socket.emit('chat:error', { error: 'No such custom emoji' });
      return;
    }
    await broadcast();
  } catch (error) {
    console.error('[CustomEmoji] remove error:', error);
    socket.emit('chat:error', { error: 'Failed to remove custom emoji' });
  }
}

export async function handleEmojiList(socket: Socket): Promise<void> {
  try {
    socket.emit('chat:emoji-list', { emojis: await db.listCustomEmojis() });
  } catch (error) {
    console.error('[CustomEmoji] list error:', error);
    socket.emit('chat:error', { error: 'Failed to load custom emoji' });
  }
}

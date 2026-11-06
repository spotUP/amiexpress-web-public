/**
 * One stored room message, when it is live and in the given room.
 *
 * Edit, delete and reply all act on a message by id. Each must refuse an id
 * that is missing, deleted, or in another room, or a caller could reach into
 * a room they are not in. This is the one place that rule lives.
 */
/** The one call this rule needs; callers pass their own db (group chat gets it injected). */
export interface MessageLookup {
  getMessageById(id: number): Promise<unknown>;
}

export interface StoredRoomMessage {
  id: number;
  room_id: string;
  sender_id: string | number;
  sender_username: string;
  message?: string;
  created_at?: number | string;
  deleted?: number | null;
}

/** A positive integer message id, or undefined. */
export function parseMessageId(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function liveMessageInRoom(db: MessageLookup, raw: unknown, roomId: string | undefined): Promise<StoredRoomMessage | undefined> {
  const id = parseMessageId(raw);
  if (id === undefined || !roomId) return undefined;
  const message = (await db.getMessageById(id)) as StoredRoomMessage | undefined;
  if (!message || message.deleted || String(message.room_id) !== String(roomId)) return undefined;
  return message;
}

/**
 * WHO IS IN A CHAT ROOM, AND HOW TO REACH THEM - for every transport.
 *
 * Internode chat and group rooms kept their membership in socket.io rooms
 * (`socket.join(...)`, `io.to(room).emit(...)`). A telnet or SSH caller has
 * no socket.io socket: his connection emitter has no `join`, so accepting a
 * chat threw, and room lines and the end-of-chat screen went to a room he
 * could never be in (web-vs-telnet audit item 3, 2026-09-28).
 *
 * The board already records membership on the SESSION - `chatSessionId` on
 * both ends of an internode chat, `currentRoomId` on a group room member - so
 * a room here is a question asked of the live sessions, not a second store to
 * keep in step, and each member is reached through the one session-emitter
 * registry, whatever transport he came in on.
 */
import type { Server as IOServer } from "socket.io";
import type { BBSSession } from "../index";
import { sessions } from "./session-manager";
import { emitterForSession } from "./session-emitter-registry";

/** Both ends of internode chat `chatSessionId`. */
export function internodeChatMembers(chatSessionId: string | number | null | undefined): BBSSession[] {
  if (chatSessionId === null || chatSessionId === undefined) return [];
  return [...sessions.values()].filter((s) => s.chatSessionId !== undefined && String(s.chatSessionId) === String(chatSessionId));
}

/** Everyone standing in group room `roomId`. */
export function groupRoomMembers(roomId: string | number | null | undefined): BBSSession[] {
  if (roomId === null || roomId === undefined) return [];
  return [...sessions.values()].filter((s) => s.currentRoomId !== undefined && s.currentRoomId !== null && String(s.currentRoomId) === String(roomId));
}

/**
 * Emit to each member through his own emitter.
 *
 * `exceptEmitterId` is the id of the emitter to leave out - the sender's
 * `socket.id`, which is a socket.io id for a web caller and the connection's
 * id for a telnet or SSH caller, so one comparison serves both.
 */
export function emitToMembers(
  members: readonly BBSSession[],
  io: IOServer | null | undefined,
  event: string,
  payload: unknown,
  options: { exceptEmitterId?: string; skip?: (member: BBSSession) => boolean } = {},
): number {
  let reached = 0;
  for (const member of members) {
    if (options.skip?.(member)) continue;
    const emitter = emitterForSession(member, io);
    if (!emitter) continue;
    if (options.exceptEmitterId && (emitter as { id?: string }).id === options.exceptEmitterId) continue;
    emitter.emit(event, payload);
    reached++;
  }
  return reached;
}

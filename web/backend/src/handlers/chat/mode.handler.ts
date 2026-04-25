/**
 * IRC-style /mode handler.
 * Supports channel modes:
 *   +i / -i  invite-only      (data.params: none)
 *   +m / -m  moderated        (data.params: none)
 * And member modes (require username param):
 *   +o / -o  operator         (data.params: [username])
 *   +v / -v  voiced           (data.params: [username])
 *   +b / -b  ban (mute proxy) (data.params: [username])
 */
import type { Socket, Server as IOServer } from 'socket.io';
import type { BBSSession } from '../../index';
import { db } from '../../database';

export interface ModeToken { sign: '+' | '-'; flag: string; param?: string; }

const TAKES_PARAM: Record<string, boolean> = { o: true, v: true, b: true };

/** Parse an IRC mode string + params into ordered tokens. */
export function parseModeString(modeString: string, params: string[]): ModeToken[] {
  const out: ModeToken[] = [];
  let sign: '+' | '-' = '+';
  let p = 0;
  for (const ch of modeString) {
    if (ch === '+' || ch === '-') { sign = ch; continue; }
    if (!/[a-zA-Z]/.test(ch)) continue;
    const token: ModeToken = { sign, flag: ch };
    if (TAKES_PARAM[ch] && p < params.length) token.param = params[p++];
    out.push(token);
  }
  return out;
}

export interface ModeContext {
  io: IOServer;
  socket: Socket;
  session: BBSSession;
  data: { modeString: string; params: string[]; roomId?: string };
}

export async function handleRoomMode(ctx: ModeContext): Promise<void> {
  const { io, socket, session, data } = ctx;
  try {
    if (!session.user?.id) {
      socket.emit('room:error', { error: 'Not logged in' });
      return;
    }
    const roomId = data.roomId || session.currentRoomId;
    if (!roomId) {
      socket.emit('room:error', { error: 'Not in a room' });
      return;
    }
    const room = await db.getChatRoom(roomId);
    if (!room) {
      socket.emit('room:error', { error: 'Room not found' });
      return;
    }
    const isMod = await db.isUserModerator(roomId, session.user.id);
    const isOwner = room.created_by === session.user.id;
    if (!isMod && !isOwner) {
      socket.emit('room:error', { error: 'Only moderators can change modes' });
      return;
    }

    const tokens = parseModeString(data.modeString, data.params);
    const applied: string[] = [];

    for (const t of tokens) {
      const on = t.sign === '+';
      switch (t.flag) {
        case 'i':
          await db.setInviteOnly(roomId, on);
          applied.push(`${t.sign}i`);
          break;
        case 'm':
          await db.setModerated(roomId, on);
          applied.push(`${t.sign}m`);
          break;
        case 'o':
        case 'v':
        case 'b': {
          if (!t.param) {
            socket.emit('room:error', { error: `Mode ${t.sign}${t.flag} requires a username` });
            continue;
          }
          const u = await db.getUserByUsername(t.param);
          if (!u) {
            socket.emit('room:error', { error: `User ${t.param} not found` });
            continue;
          }
          if (t.flag === 'o') {
            await db.updateRoomMember(roomId, String(u.id), { isModerator: on });
          } else if (t.flag === 'v') {
            await db.setVoiced(roomId, String(u.id), on);
          } else if (t.flag === 'b') {
            await db.updateRoomMember(roomId, String(u.id), { isMuted: on });
          }
          applied.push(`${t.sign}${t.flag} ${t.param}`);
          break;
        }
        default:
          socket.emit('room:error', { error: `Unknown mode flag: ${t.flag}` });
      }
    }

    if (applied.length > 0) {
      io.to('room:' + roomId).emit('room:mode', {
        roomId,
        by: session.user.username,
        applied: applied.join(' '),
      });
    }
  } catch (error) {
    console.error('[mode.handler] handleRoomMode error:', error);
    socket.emit('room:error', { error: 'Failed to change mode' });
  }
}

/**
 * Socket-keyed lookups go through getSessionBySocketId.
 *
 * The `sessions` map is keyed by NODE ID. `sessions.get(socket.id)` therefore
 * never finds anything, and it fails SILENTLY - the caller just sees "no
 * session" and takes the not-logged-in path.
 *
 * It has now caused two separate reported bugs:
 *
 *  - Raw room ANSI was painted over a door's screen, because the guard that
 *    should have skipped door sessions never found one.
 *  - Nobody could join a voice channel: voice:join-channel answered "Session
 *    not found" every time, so two people in the same room each saw a video
 *    grid containing only themselves ("I am connected with two users and
 *    still see only one video").
 *
 * Both looked like feature bugs and were the same typo in two places.
 *
 * Driven, not grepped: a caller's session is registered the way login
 * registers it (setSession: socket -> node -> session), and the REAL voice
 * and audio/video handlers are asked for something that needs the session.
 * Whatever spelling the lookup takes, "Session not found" is the failure.
 * (group-chat.handler no longer looks sessions up by socket at all: room
 * members are sessions since src/server/session-rooms.ts, 2026-09-28, and its
 * door guard is driven in tests/chat/group-chat-door-terminal.test.ts.)
 */
process.env.SKIP_DB_INIT = '1';

import { joinVoiceChannel, leaveVoiceChannel } from '../../src/handlers/voice-channel.handler';
import { registerAudioVideoHandlers } from '../../src/handlers/audio-video.handler';
import { setSession, deleteSession, getSessionBySocketId, socketToUser } from '../../src/server/session-manager';

function fakeSocket(id: string) {
  const handlers = new Map<string, (...a: any[]) => any>();
  const socket: any = {
    id,
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: () => ({ emit: jest.fn() }),
    on: (e: string, h: any) => { handlers.set(e, h); return socket; },
  };
  return { socket, handlers };
}

describe('handlers that look a session up by socket', () => {
  const socketId = 'voice-caller-socket';
  // A node id that is NOT the socket id: the map is keyed by node.
  const session: any = { nodeId: 17, user: { id: 'u-17', username: 'spot' }, currentRoomId: 'room-1' };
  beforeEach(() => setSession(socketId, session));
  afterEach(() => deleteSession(socketId));

  it('the voice handler finds the caller and joins him to the channel', () => {
    const { socket } = fakeSocket(socketId);
    const result = joinVoiceChannel(socket, { channelId: 'lobby' });
    expect(result).toMatchObject({ success: true, channelId: 'lobby' });
    expect(session.currentVoiceChannelId).toBe('lobby');
    leaveVoiceChannel(socket, { channelId: 'lobby' });
  });

  it('the audio/video handler finds the caller too', () => {
    const { socket, handlers } = fakeSocket(socketId);
    registerAudioVideoHandlers(socket, {} as any, new Map());
    const callback = jest.fn();
    handlers.get('audio:start-streaming')!({}, callback);
    expect(callback).toHaveBeenCalledWith({ success: true, streamId: `audio-${socketId}` });
  });
});

describe('the lookup itself', () => {
  it('goes socket -> node -> session, so a second tab of the same user cannot take it', () => {
    // Not userSessions first: that map is keyed by userId, and a second tab
    // logging in as the same user overwrites it.
    const tabA: any = { nodeId: 21, user: { id: 'u-tabs', username: 'spot' } };
    const tabB: any = { nodeId: 22, user: { id: 'u-tabs', username: 'spot' } };
    // As login-post registers a web caller: node map AND the user map.
    setSession('tab-a', tabA);
    socketToUser.set('tab-a', 'u-tabs');
    setSession('tab-b', tabB);
    socketToUser.set('tab-b', 'u-tabs');
    try {
      expect(getSessionBySocketId('tab-a')).toBe(tabA);
      expect(getSessionBySocketId('tab-b')).toBe(tabB);
    } finally {
      deleteSession('tab-a');
      deleteSession('tab-b');
    }
  });
});

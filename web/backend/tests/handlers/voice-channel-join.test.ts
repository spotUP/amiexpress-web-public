/**
 * Joining a voice channel actually puts you in it.
 *
 * The sidebar showed `voice (1)` in BOTH browsers - each user alone in a
 * channel they had both joined (screenshot 2026-08-26). The backend had
 * logged no joins at all, because a door's emit travels server->CLIENT: the
 * door's `voice:join-channel` was delivered to the browser, which has no
 * handler for it, and the voice handler never ran.
 *
 * These cover the operations the door now calls directly: two people in one
 * channel see each other, leaving removes you, and every broadcast names
 * the channel it is about (a `voice:left` without one matched nothing in
 * the door's roster, so people who left stayed listed for ever).
 */

import type { Socket } from 'socket.io';

const sessions = new Map<string, any>();

jest.mock('../../src/server/session-manager', () => ({
  getSessionBySocketId: (socketId: string) => sessions.get(socketId),
}));

import { joinVoiceChannel, leaveVoiceChannel } from '../../src/handlers/voice-channel.handler';

interface Broadcast {
  room: string;
  event: string;
  payload: any;
}

/** A socket that records what it broadcast, and to which room. */
function makeSocket(id: string, broadcasts: Broadcast[]): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    to: (room: string) => ({
      emit: (event: string, payload: any) => {
        broadcasts.push({ room, event, payload });
      },
    }),
  } as unknown as Socket;
}

function addSession(socketId: string, userId: number, username: string) {
  sessions.set(socketId, {
    user: { id: userId, username },
    currentRoomId: 'general',
  });
}

describe('voice channel join/leave', () => {
  let broadcasts: Broadcast[];

  beforeEach(() => {
    sessions.clear();
    broadcasts = [];
  });

  afterEach(() => {
    // The participant store is module state; leave it as we found it.
    for (const socketId of Array.from(sessions.keys())) {
      leaveVoiceChannel(makeSocket(socketId, []), { channelId: 'voice' });
    }
  });

  it('reports the people already in the channel to a second joiner', () => {
    addSession('sock-a', 1, 'spot');
    addSession('sock-b', 2, 'guest');

    joinVoiceChannel(makeSocket('sock-a', broadcasts), { channelId: 'voice' });
    const second = joinVoiceChannel(makeSocket('sock-b', broadcasts), { channelId: 'voice' });

    expect(second.success).toBe(true);
    expect(second.participants).toHaveLength(2);
    expect(second.participants!.map(p => p.username).sort()).toEqual(['guest', 'spot']);
  });

  it('tells the people already there that somebody joined', () => {
    addSession('sock-a', 1, 'spot');
    addSession('sock-b', 2, 'guest');

    joinVoiceChannel(makeSocket('sock-a', broadcasts), { channelId: 'voice' });
    broadcasts.length = 0;
    joinVoiceChannel(makeSocket('sock-b', broadcasts), { channelId: 'voice' });

    const joined = broadcasts.find(b => b.event === 'voice:joined');
    expect(joined).toBeDefined();
    expect(joined!.room).toBe('voice:voice');
    expect(joined!.payload.username).toBe('guest');
    // Named channel: the door keys its roster by it.
    expect(joined!.payload.channelId).toBe('voice');
  });

  it('removes somebody who leaves, and names the channel they left', () => {
    addSession('sock-a', 1, 'spot');
    addSession('sock-b', 2, 'guest');
    joinVoiceChannel(makeSocket('sock-a', broadcasts), { channelId: 'voice' });
    joinVoiceChannel(makeSocket('sock-b', broadcasts), { channelId: 'voice' });
    broadcasts.length = 0;

    const result = leaveVoiceChannel(makeSocket('sock-b', broadcasts), { channelId: 'voice' });
    expect(result.success).toBe(true);

    const left = broadcasts.find(b => b.event === 'voice:left');
    expect(left!.payload.channelId).toBe('voice');
    expect(left!.payload.userId).toBe(2);

    // And the channel is down to one.
    addSession('sock-c', 3, 'third');
    const rejoin = joinVoiceChannel(makeSocket('sock-c', broadcasts), { channelId: 'voice' });
    expect(rejoin.participants!.map(p => p.username).sort()).toEqual(['spot', 'third']);
  });

  it('refuses a socket with no session instead of pretending to join', () => {
    const result = joinVoiceChannel(makeSocket('sock-unknown', broadcasts), { channelId: 'voice' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Session not found');
  });

  it('records the channel on the session so leaving needs no argument', () => {
    addSession('sock-a', 1, 'spot');
    joinVoiceChannel(makeSocket('sock-a', broadcasts), { channelId: 'voice' });

    expect(sessions.get('sock-a').currentVoiceChannelId).toBe('voice');

    leaveVoiceChannel(makeSocket('sock-a', broadcasts));
    expect(sessions.get('sock-a').currentVoiceChannelId).toBeUndefined();
  });
});

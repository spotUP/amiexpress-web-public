/**
 * You can see your own camera.
 *
 * Reported 2026-08-26 by !cyke: "my camera would work within firefox but it
 * kept saying WAITING FOR VIDEO". The camera was fine - the live log shows
 * his stream starting over and over. He was simply the only person in the
 * channel, and the relay excludes the sender:
 *
 *   socket.to(`voice:${roomId}`).emit('video:cells', ...)
 *
 * so a lone user sent frames and received nothing, for ever. The video grid
 * is drawn by the server-side door, not the browser, so nothing local can
 * show you yourself - the frame has to come back from the server.
 *
 * Only the compact cells codec is echoed. The legacy ASCII video:frame path
 * still excludes the sender: that one carries a whole rendered screen of
 * text, which is what the original "no frame back to the sender" note was
 * written about.
 */

import type { Socket } from 'socket.io';

const sessions = new Map<string, any>();

jest.mock('../../src/server/session-manager', () => ({
  getSessionBySocketId: (socketId: string) => sessions.get(socketId),
  getSocketIdByUserId: () => null,
}));

import { registerAudioVideoHandlers } from '../../src/handlers/audio-video.handler';

interface Sent { target: string; event: string; payload: any }

/** A socket that records what it sent, and whether to a room or to itself. */
function makeSocket(id: string, sent: Sent[]): Socket {
  const handlers = new Map<string, (...args: any[]) => void>();
  const socket: any = {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    on: (event: string, fn: (...args: any[]) => void) => { handlers.set(event, fn); },
    emit: (event: string, payload: any) => { sent.push({ target: 'self', event, payload }); },
    to: (room: string) => ({
      emit: (event: string, payload: any) => { sent.push({ target: room, event, payload }); },
    }),
    handlers,
  };
  return socket as Socket;
}

function fire(socket: any, event: string, payload: any) {
  const fn = socket.handlers.get(event);
  if (!fn) throw new Error(`no handler registered for ${event}`);
  fn(payload);
}

describe('video:cells self view', () => {
  let sent: Sent[];
  let socket: any;

  beforeEach(() => {
    sessions.clear();
    sent = [];
    socket = makeSocket('socket-cyke', sent);
    sessions.set('socket-cyke', {
      user: { id: 'u-cyke', username: '!cyke' },
      currentVoiceChannelId: 'voice',
    });
    const io: any = { to: () => ({ emit: () => undefined }) };
    registerAudioVideoHandlers(socket, io, new Map());
  });

  it('sends the sender their own frame back', () => {
    fire(socket, 'video:cells', new ArrayBuffer(8));

    const toSelf = sent.filter(s => s.target === 'self' && s.event === 'video:cells');
    expect(toSelf).toHaveLength(1);
    expect(toSelf[0].payload).toMatchObject({ userId: 'u-cyke', username: '!cyke' });
  });

  it('still sends the frame to everyone else in the channel', () => {
    fire(socket, 'video:cells', new ArrayBuffer(8));

    const toRoom = sent.filter(s => s.target === 'voice:voice' && s.event === 'video:cells');
    expect(toRoom).toHaveLength(1);
  });

  it('labels the echo with the sender, so the door tiles it as theirs', () => {
    fire(socket, 'video:cells', new ArrayBuffer(8));

    const toSelf = sent.find(s => s.target === 'self' && s.event === 'video:cells');
    const toRoom = sent.find(s => s.target === 'voice:voice' && s.event === 'video:cells');
    expect(toSelf!.payload.userId).toBe(toRoom!.payload.userId);
  });

  it('sends nothing when the sender is in no room', () => {
    sessions.set('socket-cyke', { user: { id: 'u-cyke', username: '!cyke' } });
    fire(socket, 'video:cells', new ArrayBuffer(8));

    expect(sent.filter(s => s.event === 'video:cells')).toHaveLength(0);
  });

  it('does NOT echo the expensive ASCII frame path back to the sender', () => {
    fire(socket, 'video:frame', { streamId: 'video-x', frame: 'xxxx' });

    const toSelf = sent.filter(s => s.target === 'self' && s.event === 'video:frame');
    expect(toSelf).toHaveLength(0);
  });
});

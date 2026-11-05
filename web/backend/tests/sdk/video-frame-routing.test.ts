/**
 * A video frame goes to whoever sent it.
 *
 * Reported 2026-08-26 with two browsers open: one window's video "frames
 * change size", the other sat on "WAITING FOR VIDEO". The log showed a
 * single session receiving frames of two very different sizes (~1,250 bytes
 * and ~7,000) while reporting participants: 1.
 *
 * The door handed EVERY frame it received to its own tile:
 *
 *     this.ctx.video.onFrame((frame) => {
 *       this.videoGrid.updateParticipantVideo(this.userId, frame);
 *     });
 *
 * ...because the SDK dropped the sender before the door ever saw it. Two
 * people streaming therefore meant two pictures in one tile, flipping
 * between their two sizes, and nothing at all for the person whose frame had
 * just been spent on somebody else's tile.
 *
 * The backend has always sent the sender's userId with the frame. Nothing
 * was missing but the wiring.
 *
 * Each leg is driven for real: the backend relay (audio-video.handler) with a
 * registered session, the SDK's Video with a fake socket, and the LiveChat
 * door's frame handler (EnhancedVoiceChannel, whose constructor builds a
 * blessed UI - so the handler is installed on a bare instance holding only
 * the fields it reads, the way the-w-screen test calls mapUserFromDb). The
 * handler's type signature is tsc's to enforce.
 */
process.env.SKIP_DB_INIT = '1';

import { registerAudioVideoHandlers } from '../../src/handlers/audio-video.handler';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { Video } from '../../../../sdk/media/Video';
import { EnhancedVoiceChannel } from '../../../../board/Doors/livechat/features/voice-channel-ux';

/** A socket that keeps its handlers and records what it sends to a room. */
function fakeSocket(id: string) {
  const handlers = new Map<string, (...a: any[]) => any>();
  const toRoom: Array<{ room: string; event: string; data: any }> = [];
  const socket: any = {
    id,
    emit: jest.fn(),
    on: (e: string, h: any) => { handlers.set(e, h); return socket; },
    to: (room: string) => ({ emit: (event: string, data: any) => { toRoom.push({ room, event, data }); } }),
  };
  return { socket, handlers, toRoom };
}

describe('the frame carries its sender', () => {
  it('is passed on by the SDK', () => {
    const { socket, handlers } = fakeSocket('sdk');
    const video = new Video(socket);
    const received: unknown[][] = [];
    video.onFrame((...args: unknown[]) => { received.push(args); });

    handlers.get('video:frame')!({ frame: 'FRAME', userId: 42, username: 'spot' });

    expect(received).toEqual([['FRAME', 42, 'spot']]);
  });

  it('was already being sent by the backend', () => {
    // The wiring was the only thing missing.
    const socketId = 'video-sender';
    setSession(socketId, { nodeId: 31, currentRoomId: 'lobby', user: { id: 'u-31', username: 'spot' } } as any);
    try {
      const { socket, handlers, toRoom } = fakeSocket(socketId);
      registerAudioVideoHandlers(socket, {} as any, new Map());

      handlers.get('video:frame')!({ streamId: 's1', frame: 'FRAME' });

      expect(toRoom).toEqual([{
        room: 'voice:lobby', event: 'video:frame',
        data: expect.objectContaining({ userId: 'u-31', frame: 'FRAME' }),
      }]);
    } finally {
      deleteSession(socketId);
    }
  });
});

describe('the door', () => {
  /** The door's frame handler on a bare instance, and the grid it draws into. */
  function door(opts: { videoEnabled: boolean }) {
    let onFrame: ((frame: string, senderId?: string | number, senderName?: string) => void) | undefined;
    const tiles: Array<[string, string]> = [];
    const known = new Set<string>(['me']);
    const channel: any = Object.create(EnhancedVoiceChannel.prototype);
    Object.assign(channel, {
      userId: 'me',
      videoEnabled: opts.videoEnabled,
      ctx: { video: { onFrame: (h: typeof onFrame) => { onFrame = h; } } },
      videoGrid: {
        hasParticipant: (id: string) => known.has(id),
        addParticipant: (p: { userId: string }) => { known.add(p.userId); },
        updateParticipantVideo: (id: string, frame: string) => { tiles.push([id, frame]); },
      },
    });
    channel.ensureFrameHandler();
    expect(onFrame).toBeDefined();
    return { frame: onFrame!, tiles };
  }

  it('routes the frame to the sender, not to itself', () => {
    const d = door({ videoEnabled: true });
    d.frame('THEIRS', 'them', 'Them');
    expect(d.tiles).toEqual([['them', 'THEIRS']]);
  });

  it('falls back to itself when no sender is given', () => {
    // An older backend, or a local-only demo, still shows your own camera.
    const d = door({ videoEnabled: true });
    d.frame('MINE');
    expect(d.tiles).toEqual([['me', 'MINE']]);
  });

  it('does not require video to be ON to show someone else', () => {
    // Their camera is not yours to gate: a viewer with no camera must still
    // see everyone who does. OWN frames are gated on the local camera,
    // which is also what makes the self view appear only while your own
    // camera is running.
    const d = door({ videoEnabled: false });
    d.frame('MINE', 'me');
    d.frame('THEIRS', 'them');
    expect(d.tiles).toEqual([['them', 'THEIRS']]);
  });
});

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
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

const FILES = [
  'handlers/voice-channel.handler.ts',
  'handlers/audio-video.handler.ts',
  'handlers/chat/group-chat.handler.ts',
];

describe('handlers that look a session up by socket', () => {
  for (const rel of FILES) {
    it(`${rel} does not index the node-keyed map with a socket id`, () => {
      const source = readFileSync(join(SRC, rel), 'utf8')
        .split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .join('\n');

      expect(source).not.toMatch(/sessions\.get\(socket\.id\)/);
      expect(source).not.toMatch(/sessions\.get\(socketId\)/);
    });
  }

  it('the voice handler uses the socket lookup', () => {
    const source = readFileSync(join(SRC, 'handlers/voice-channel.handler.ts'), 'utf8');

    expect(source).toMatch(/getSessionBySocketId\(socket\.id\)/);
    expect(source).toMatch(/import \{ getSessionBySocketId \}/);
  });

  it('the audio/video handler uses it too', () => {
    const source = readFileSync(join(SRC, 'handlers/audio-video.handler.ts'), 'utf8');

    expect(source).toMatch(/getSessionBySocketId\(socket\.id\)/);
  });
});

describe('the lookup itself', () => {
  it('goes socket -> node -> session', () => {
    // Not userSessions first: that map is keyed by userId, and a second tab
    // logging in as the same user overwrites it.
    // Comments stripped, not a fixed-size slice: the explanation above this
    // lookup is longer than the lookup, so slicing by characters measured
    // the comment rather than the code.
    const manager = readFileSync(join(SRC, 'server', 'session-manager.ts'), 'utf8');
    const fn = manager
      .slice(manager.indexOf('export function getSession('))
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');

    expect(fn.slice(0, 400)).toMatch(/socketToNodeId\.get\(socketId\)/);
    expect(manager).toMatch(/export const getSessionBySocketId = getSession/);
  });
});

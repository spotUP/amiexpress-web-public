/**
 * You can watch without a camera of your own.
 *
 * Reported 2026-08-26: one window played video fine, the other sat on
 * "WAITING FOR VIDEO". The door's log named it exactly -
 *
 *     [sdk/Video] video:frame received, has handler: false frame len: 6976
 *
 * The frames were arriving. That session had no handler registered, so it
 * dropped every one.
 *
 * onFrame was registered when the LOCAL camera started and torn down again
 * with `onFrame(() => {})` when it stopped, which ties being able to SEE
 * video to being willing to SEND it. A viewer with no camera could never see
 * anybody.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const voiceUx = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat', 'features', 'voice-channel-ux.ts'),
  'utf8'
);

describe('the frame handler', () => {
  it('is registered when the grid is created', () => {
    const create = voiceUx.slice(voiceUx.indexOf('onLayoutChanged:'));

    expect(create.slice(0, 900)).toMatch(/this\.ensureFrameHandler\(\)/);
  });

  it('is not torn down when the local camera stops', () => {
    // `onFrame(() => {})` was the teardown: an empty handler that swallowed
    // everybody else's frames.
    expect(voiceUx).not.toMatch(/onFrame\(\(\) => \{\}\)/);
  });

  it('is registered in one place, not copied inline', () => {
    const registrations = voiceUx.split('this.ctx.video.onFrame(').length - 1;

    expect(registrations).toBe(1);
  });
});

describe('what it does with a frame', () => {
  const fn = voiceUx.slice(voiceUx.indexOf('private ensureFrameHandler'));

  it('routes it to the sender', () => {
    expect(fn.slice(0, 1200)).toMatch(/updateParticipantVideo\(owner, frame\)/);
  });

  it('shows other people even when your own camera is off', () => {
    // The gate applies to your OWN frames only.
    expect(fn.slice(0, 1200)).toMatch(/String\(owner\) === String\(this\.userId\) && !this\.videoEnabled/);
  });

  it('falls back to this user when no sender is given', () => {
    expect(fn.slice(0, 1200)).toMatch(/senderId === undefined \|\| senderId === null \? this\.userId/);
  });
});

describe('the standalone chat page', () => {
  const chat = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'web', 'frontend', 'src', 'chat', 'ChatTerminal.tsx'),
    'utf8'
  );

  it('tears a door down before loading another', () => {
    // It has its own loader, separate from BBSTerminal's - so it needs its
    // own teardown, or /chat keeps every door instance it ever loaded and
    // runs out of media players.
    const load = chat.slice(chat.indexOf("socket.on('door:load-client'"));

    expect(load.slice(0, 700)).toMatch(/bbs:door-unload/);
  });

  it('tears it down on an explicit unload too', () => {
    const unload = chat.slice(chat.indexOf("socket.on('door:unload-client'"));

    expect(unload.slice(0, 500)).toMatch(/bbs:door-unload/);
  });
});

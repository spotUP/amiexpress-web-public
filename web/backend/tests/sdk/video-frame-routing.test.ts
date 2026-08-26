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
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const types = readFileSync(join(ROOT, 'sdk', 'core', 'types.ts'), 'utf8');
const video = readFileSync(join(ROOT, 'sdk', 'media', 'Video.ts'), 'utf8');
const voiceUx = readFileSync(join(ROOT, 'Doors', 'livechat', 'features', 'voice-channel-ux.ts'), 'utf8');
const backend = readFileSync(
  join(ROOT, 'web', 'backend', 'src', 'handlers', 'audio-video.handler.ts'),
  'utf8'
);

describe('the frame carries its sender', () => {
  it('is in the handler signature', () => {
    // The sender's NAME was added after this test was written; what matters
    // is that the frame still carries who sent it.
    expect(types).toMatch(/VideoFrameHandler = \(frame: string, userId\?: string \| number/);
  });

  it('is passed on by the SDK', () => {
    expect(video).toMatch(/this\.frameHandler\(data\.frame, data\.userId/);
  });

  it('was already being sent by the backend', () => {
    // The wiring was the only thing missing.
    const relay = backend.slice(backend.indexOf("socket.on('video:frame'"));

    // Whole relay, not a fixed 500-character window - comments and the
    // self-view echo pushed the field past it.
    expect(relay).toMatch(/userId: session\.user\?\.id/);
  });
});

describe('the door', () => {
  const handler = voiceUx.slice(
    voiceUx.indexOf('this.ctx.video.onFrame('),
    voiceUx.indexOf('this.ctx.video.onFrame(') + 1200
  );

  it('routes the frame to the sender, not to itself', () => {
    expect(handler).toMatch(/senderId/);
    expect(handler).not.toMatch(/updateParticipantVideo\(this\.userId, frame\)/);
  });

  it('falls back to itself when no sender is given', () => {
    // An older backend, or a local-only demo, still shows your own camera.
    expect(handler).toMatch(/senderId === undefined \|\| senderId === null \? this\.userId/);
  });

  it('does not require video to be ON to show someone else', () => {
    // Their camera is not yours to gate: a viewer with no camera must still
    // see everyone who does.
    // `isSelf` became an inline comparison against the frame's owner. The
    // behaviour is the point: OWN frames are gated on the local camera,
    // everyone else's are not - which is also what makes the self view
    // appear only while your own camera is running.
    expect(handler).toMatch(/=== String\(this\.userId\) && !this\.videoEnabled/);
  });
});

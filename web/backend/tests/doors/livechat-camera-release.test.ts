/**
 * The camera light goes out when you leave.
 *
 * Reported: "the camera doesn't turn off if I close or leave the LiveChat."
 *
 * Two separate teardown paths each released half the hardware. The client's
 * disconnect handler called stopCapture(), which is the MICROPHONE; nothing
 * stopped the webcam, so closing the tab or leaving the door left the camera
 * streaming with its light on. And leaveVoiceChannel() awaited
 * audio.stopStreaming() and never touched video.stopStream().
 *
 * A camera left running is not a cosmetic bug, so this is asserted at both
 * doors rather than trusting one of them.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DOOR = join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat');
const client = readFileSync(join(DOOR, 'client.ts'), 'utf8');
const voiceUx = readFileSync(join(DOOR, 'features', 'voice-channel-ux.ts'), 'utf8');

/** Body of a method, from its signature to the next one. */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\n  private ', start + signature.length);
  const alt = source.indexOf('\n  public ', start + signature.length);
  const end = Math.min(next === -1 ? Infinity : next, alt === -1 ? Infinity : alt);
  return source.slice(start, end === Infinity ? undefined : end);
}

describe('closing the door', () => {
  it('releases every capture device from one place', () => {
    const release = methodBody(client, 'private releaseLocalMedia(): void {');

    expect(release).toMatch(/this\.stopCapture\(\)/);
    expect(release).toMatch(/this\.stopVideoCapture\(\)/);
  });

  it('releases them on disconnect', () => {
    // This handler used to call stopCapture() - the microphone - alone.
    expect(client).toMatch(/on\('disconnect'[\s\S]{0,320}?this\.releaseLocalMedia\(\)/);
    expect(client).not.toMatch(/on\('disconnect'[\s\S]{0,200}?this\.stopCapture\(\);\s*\}\)/);
  });

  it('releases them on shutdown', () => {
    // beforeunload reaches the door as shutdown; a closed tab must not keep
    // the camera.
    expect(client).toMatch(/on\('shutdown'[\s\S]{0,200}?this\.releaseLocalMedia\(\)/);
  });

  it('actually stops the camera tracks', () => {
    // Dropping the reference is not enough - a MediaStream keeps running,
    // and its light stays on, until every track is stopped.
    const stop = methodBody(client, 'private stopVideoCapture(): void {');

    expect(stop).toMatch(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
  });
});

describe('leaving the voice channel', () => {
  const leave = methodBody(voiceUx, 'public async leaveVoiceChannel() {');

  it('stops the video stream, not just the audio one', () => {
    expect(leave).toMatch(/audio\.stopStreaming\(\)/);
    expect(leave).toMatch(/video\.stopStream\(/);
  });

  it('does not let a dead camera block the exit', () => {
    // stopStream on a camera that has already gone away must not strand the
    // user in a channel they asked to leave.
    expect(leave).toMatch(/video\.stopStream\([\s\S]{0,80}?\}\s*catch\s*\{/);
  });

  it('tells everyone the video is off', () => {
    // Otherwise other people keep a tile waiting for frames that will never
    // arrive.
    expect(leave).toMatch(/voice:video-toggle', \{ hasVideo: false \}/);
    expect(leave).toMatch(/this\.videoEnabled = false/);
  });
});

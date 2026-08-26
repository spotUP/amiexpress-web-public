/**
 * Somebody joining a call must not blink everybody's camera.
 *
 * Reported by !cyke: "my camera would blink on and off" - while he could hear
 * people, so the channel was not empty. The live log measures it exactly:
 *
 *   [Voice Channel] User !cyke left voice channel: voice
 *   [voice-channel-ux] resize stream 67x18 -> 67x37
 *   [DoorSocket] Intercepting video:stop-stream
 *   [DoorSocket] Intercepting video:start-stream {width:67, height:37}
 *
 * and the oscillation it caused, over and over:
 *
 *   67x18 -> 67x37
 *   67x37 -> 67x18
 *   67x18 -> 67x37
 *
 * A tile is full height with one person in it and half height with two, so
 * every join and every leave changed the tile and the door tore the camera
 * down to restart it at the new size. Worse, the stop told everyone ELSE
 * that the stream had ended, changing their layouts too - so one person
 * joining rippled out as a blink for the whole room.
 *
 * The browser client already resizes a running capture in place
 * (client.ts:509 - "Already running? Re-size the capture rather than starting
 * a SECOND one"), reading the frame shape per tick. Sending the new size is
 * enough; the stop is what put the camera light out.
 */

import { needsReshape, reshapeStream } from '../../../../Doors/livechat/features/stream-resize';

interface Call { method: string; args: any[] }

function makeVideo(calls: Call[]) {
  return {
    startStream: async (...args: any[]) => { calls.push({ method: 'startStream', args }); return 'video-sock-1'; },
    // Present on the real API. If a reshape ever reaches for it, the test
    // sees it - and that is the bug this file exists for.
    stopStream: async (...args: any[]) => { calls.push({ method: 'stopStream', args }); },
  };
}

describe('needsReshape', () => {
  it('reshapes when a tile halves, which is what a second person does', () => {
    expect(needsReshape({ width: 67, height: 37 }, { width: 67, height: 18 })).toBe(true);
  });

  it('ignores a change too small to see', () => {
    expect(needsReshape({ width: 100, height: 40 }, { width: 102, height: 41 })).toBe(false);
  });

  it('reshapes on width alone', () => {
    expect(needsReshape({ width: 100, height: 40 }, { width: 80, height: 40 })).toBe(true);
  });

  it('does not divide by zero on a degenerate tile', () => {
    expect(() => needsReshape({ width: 0, height: 0 }, { width: 10, height: 10 })).not.toThrow();
  });
});

describe('reshapeStream', () => {
  it('does NOT stop the camera to change size', async () => {
    const calls: Call[] = [];

    await reshapeStream(makeVideo(calls), { width: 67, height: 37 }, { fps: 10, colored: true, mode: 'color' });

    expect(calls.map(c => c.method)).not.toContain('stopStream');
  });

  it('sends the new size so the running capture reshapes in place', async () => {
    const calls: Call[] = [];

    await reshapeStream(makeVideo(calls), { width: 67, height: 37 }, { fps: 10, colored: true, mode: 'color' });

    const start = calls.find(c => c.method === 'startStream');
    expect(start).toBeDefined();
    expect(start!.args[1]).toMatchObject({ width: 67, height: 37, fps: 10, mode: 'color' });
  });

  it('asks for the camera, not some other source', async () => {
    const calls: Call[] = [];

    await reshapeStream(makeVideo(calls), { width: 40, height: 20 }, { fps: 5, colored: false, mode: 'ascii' });

    expect(calls[0].args[0]).toEqual({ type: 'webcam' });
  });
});

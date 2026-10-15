/**
 * One camera capture at a time (Doors/livechat/client.ts).
 *
 * Reported as "every second frame in some render modes in the video mode in
 * LiveChat is broken", and narrowed by the reporter to the 80x25 view only.
 *
 * A probe in the video tile settled it. Frames arrived alternating between
 * two SIZES:
 *
 *   rows=15 widths=[54]      <- one capture
 *   rows=8  widths=[27]      <- another capture, half the size
 *
 * Each frame was internally perfect, which is why the encoders - tested
 * separately and rectangular in every mode - were never the cause. TWO
 * capture loops were running, each sized for a different tile, taking turns
 * writing into the same box.
 *
 * The guard against a second capture tested `this.videoStream`, which is not
 * assigned until AFTER `await getUserMedia` resolves, so two starts in quick
 * succession both sailed past it. And the timer handle lives in a single
 * field, so the second start orphaned the first timer, which then sent
 * frames at the old size for ever.
 *
 * Asserted against the source: the door is a browser bundle whose start path
 * needs a camera, so importing it to test this would prove less than reading
 * the guards.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const client = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat', 'client.ts'),
  'utf8'
);

/** The body of startVideoCapture. */
function startVideoCapture(): string {
  const start = client.indexOf('private async startVideoCapture(');
  expect(start).toBeGreaterThanOrEqual(0);
  return client.slice(start, client.indexOf('\n  private ', start + 10));
}

describe('starting the camera', () => {
  it('refuses a second start while the first is still awaiting the camera', () => {
    const body = startVideoCapture();

    expect(body).toMatch(/if \(this\.videoStarting\)/);
    expect(body).toMatch(/this\.videoStarting = true/);
  });

  it('always clears the in-flight flag, even when the camera refuses', () => {
    // Without the finally, one denied permission prompt would block video
    // for the rest of the session.
    const body = startVideoCapture();

    expect(body).toMatch(/finally\s*\{[^}]*videoStarting = false/s);
  });

  it('resizes an existing capture rather than starting another', () => {
    const body = startVideoCapture();

    expect(body).toMatch(/if \(this\.videoStream\)\s*\{\s*(\/\/[^\n]*\n\s*)*this\.resizeVideoCapture/);
  });

  it('never leaves a previous frame timer running', () => {
    // The handle lives in one field; overwriting it orphans the old timer.
    const body = startVideoCapture();

    // Pacing moved from setInterval to a self-scheduling setTimeout, so the
    // clear call is clearTimeout now. What matters is that the previous timer
    // is cleared before a new one is started, whichever timer API is used.
    expect(body).toMatch(/if \(this\.videoFrameInterval\)\s*\{\s*clear(Interval|Timeout)/);
  });

  it('reads the frame shape fresh on every tick', () => {
    // So a resize takes effect without touching the timer or the camera.
    const body = startVideoCapture();

    expect(body).toMatch(/const shape = this\.videoShape/);
    expect(body).toMatch(/this\.sendVideoFrame\(shape\.mode, shape\.charW, shape\.charH\)/);
  });
});

describe('resizing the camera', () => {
  function resizeVideoCapture(): string {
    const start = client.indexOf('private resizeVideoCapture(');
    expect(start).toBeGreaterThanOrEqual(0);
    return client.slice(start, client.indexOf('\n  private ', start + 10));
  }

  it('does nothing when the shape has not changed', () => {
    const body = resizeVideoCapture();

    expect(body).toMatch(/charW === this\.videoShape\.charW/);
    expect(body).toMatch(/return;/);
  });

  it('resizes the capture canvas to match the new shape', () => {
    // The canvas is the source the encoders read; leaving it at the old size
    // would feed a full-size buffer to a half-size frame.
    const body = resizeVideoCapture();

    expect(body).toMatch(/videoCanvas\.width = charW \* px/);
    expect(body).toMatch(/videoCanvas\.height = charH \* py/);
  });
});

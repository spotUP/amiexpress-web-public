import { ANSI } from './terminal-utils';
import type { WipeFrame } from './screen-wipe.util';
import { PRE_PACED, pacedFromCharset } from './output-pacing';

const HIDE_CURSOR = ANSI.HIDE_CURSOR;
const SHOW_CURSOR = ANSI.SHOW_CURSOR;

export interface WipePlaybackOptions {
  eventName: string;
  sourceEncoding?: 'cp437' | 'iso-8859-1';
  emit?: (event: string, data: string, attrs: unknown) => void;
}

/**
 * Play wipe frames to a caller with their own timing. Moved out of
 * displayScreen so the board's screens and the door-driven wipes (a menu door
 * opening, leaving to a command) share ONE playback.
 */
export async function playWipeFrames(socket: any, wipeFrames: WipeFrame[], opts: WipePlaybackOptions): Promise<void> {
  const { eventName, sourceEncoding } = opts;

  // Get direct socket emit (bypasses modem emulator wrapper if installed)
  // This ensures wipe animation controls its own timing without modem interference
  const directSocketEmit = opts.emit || socket._directEmit || socket.emit.bind(socket);
  // As above: a direct write must not overtake the throttle queue.
  const pendingPacer = socket._modemEmulator;
  if (pendingPacer?.hasPendingData?.()) await pendingPacer.drain();

  // Play each frame with timing
  // IMPORTANT: We emit directly to socket (bypass modem emulator) and use
  // setImmediate to yield to event loop, allowing socket buffer to flush
  for (let i = 0; i < wipeFrames.length; i++) {
    const frame = wipeFrames[i];
    const isLastFrame = i === wipeFrames.length - 1;

    // Build frame buffer with cursor control
    const frameContent =
      HIDE_CURSOR +      // Hide cursor during animation
      frame.content +    // Wipe frame content (includes clear/positioning)
      (isLastFrame ? '\x1b[0m' + SHOW_CURSOR : ''); // Reset and show cursor on last frame

    // ONE emit per frame: the wipe's own chunking is the animation, so
    // it must not be re-cut by the server-side modem throttle or merged
    // by the 16 ms AnsiBuffer (utils/ansi-buffer.util.ts) - neither is on
    // this path, and `_directEmit` is the seam that keeps it that way.
    //
    // PRE_PACED (utils/output-pacing.ts) says the same thing to the
    // CLIENT pacer, which `_directEmit` cannot reach: this animation is
    // already paced, in frame delays, so do not meter its bytes at the
    // caller's baud. Without the marker the client re-cut every frame at
    // 1440 B/s (14400) or 240 B/s (2400) and this 625 ms sweep took
    // 2.9 s / 17.4 s, drip-feeding each frame. The attribute rides as a
    // second `ansi-output` argument, which every emit wrapper on this
    // board forwards untouched and the telnet/SSH emitter ignores (no
    // client-side pacer there).
    directSocketEmit(
      eventName,
      frameContent,
      // TP-5: the same object PRE_PACED always was when the screen's
      // charset is unknown, and the paced+charset singleton when it is.
      sourceEncoding ? pacedFromCharset(sourceEncoding) : PRE_PACED,
    );

    // Yield to event loop to flush socket buffer before waiting
    await new Promise(resolve => setImmediate(resolve));

    // The builder's own pacing, floored at one 60 Hz tick.
    //
    // This floor used to be 50 ms, which overrode EVERY builder delay
    // (25-40 ms) and made a 25-frame sweep a 1.25 s slideshow while the
    // builders' numbers did nothing. 16 ms is the shortest wait a
    // terminal can actually show as a separate paint; the builders own
    // the pacing above it.
    if (!isLastFrame) {
      const delayMs = Math.max(16, frame.delay);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

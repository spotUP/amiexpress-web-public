"use strict";
/**
 * Changing the size of an outgoing video stream.
 *
 * A tile is full height with one person in the call and half height with two,
 * so every join and every leave changes the size the camera should send. The
 * door used to stop the stream and start a new one at the new size, which
 * put the camera light out and back on - reported as "my camera would blink
 * on and off" - and, because a stop tells everyone ELSE that the stream has
 * ended, changed their layouts too and blinked their cameras in turn. The
 * live log caught the result oscillating:
 *
 *   67x18 -> 67x37
 *   67x37 -> 67x18
 *   67x18 -> 67x37
 *
 * The browser client already reshapes a RUNNING capture in place (client.ts:
 * "Already running? Re-size the capture rather than starting a SECOND one"),
 * reading the frame shape on every tick. Sending the new size is enough.
 *
 * Kept free of blessed and of the SDK so the rule can be tested directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.needsReshape = needsReshape;
exports.reshapeStream = reshapeStream;
/**
 * Is the new tile different enough to be worth reshaping for?
 *
 * 5%: the browser waits for a window resize to settle before announcing it,
 * so this is not called per drag frame and can afford to track the tile
 * closely. A wider threshold left the picture visibly the wrong shape.
 */
function needsReshape(current, target, threshold = 0.05) {
    const wDelta = Math.abs(target.width - current.width) / Math.max(1, current.width);
    const hDelta = Math.abs(target.height - current.height) / Math.max(1, current.height);
    return wDelta >= threshold || hDelta >= threshold;
}
/**
 * Point the running capture at a new size.
 *
 * Deliberately no stopStream: that is what blinked the camera and told the
 * room the stream had ended.
 */
async function reshapeStream(video, dims, options) {
    await video.startStream({ type: 'webcam' }, {
        width: dims.width,
        height: dims.height,
        fps: options.fps,
        colored: options.colored,
        mode: options.mode,
    });
}

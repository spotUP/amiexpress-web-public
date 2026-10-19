"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPlayer = startPlayer;
/**
 * Plays one video in the fullscreen viewer (plan 2026-10-19-mag-linked-media-ascii, M10b).
 *
 * The backend's conversion service (found through getMagazineVideoService, never
 * imported) converts the clip live on first view and caches it; this tails the
 * clip file and hands each frame to `onFrame` on a wall clock. Plays once, then
 * `onEnd`. With no service, or a failed clip, `onEnd` fires and the viewer keeps
 * showing the poster. The one interval is cleared by stop(), by the end of the
 * clip and by a failure, so a door that exits leaves nothing running.
 */
const magazine_video_1 = require("@amiexpress/bbs-door-sdk/formats/magazine-video");
function startPlayer(req, hooks) {
    const svc = (0, magazine_video_1.getMagazineVideoService)();
    if (!svc)
        return null;
    let stopped = false;
    let timer = null;
    const stop = () => {
        stopped = true;
        if (timer)
            clearInterval(timer);
        timer = null;
    };
    const end = () => {
        if (stopped)
            return;
        stop();
        hooks.onEnd();
    };
    let handle;
    try {
        handle = svc.requestClip({ url: req.url, kind: req.kind, cols: req.cols, rows: req.rows, palette: req.palette });
    }
    catch {
        return null;
    }
    let finished = false;
    let failed = false;
    handle.done.then((o) => { finished = true; failed = o !== 'complete'; }, () => { finished = true; failed = true; });
    let cursor = (0, magazine_video_1.newFrameCursor)();
    let queue = [];
    let complete = false;
    let lastTick = Date.now();
    const period = 1000 / req.fps;
    const tick = () => {
        if (stopped)
            return;
        try {
            if (!complete) {
                const r = (0, magazine_video_1.readFrames)(handle.path, cursor);
                cursor = r.cursor;
                queue.push(...r.frames);
                complete = r.complete;
            }
        }
        catch {
            failed = true;
            finished = true;
        }
        const now = Date.now();
        // Late by whole periods (a slow tick, or output backed up): skip those frames, show the newest due.
        let due = Math.max(1, Math.floor((now - lastTick) / period + 0.5));
        if (hooks.backedUp?.())
            due = Math.max(due, 2);
        lastTick = now;
        if (queue.length > 0) {
            const frame = queue[Math.min(due, queue.length) - 1];
            queue = queue.slice(Math.min(due, queue.length));
            const info = cursor.info;
            hooks.onFrame((0, magazine_video_1.richFrameToCells)(frame, info?.cols ?? req.cols, info?.rows ?? req.rows));
            return;
        }
        if (complete || (finished && failed))
            end();
    };
    timer = setInterval(tick, period);
    timer.unref?.();
    return { stop };
}
//# sourceMappingURL=player.js.map
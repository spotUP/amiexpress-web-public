"use strict";
/**
 * System notices from the BBS itself (currently: an imminent restart).
 *
 * The server cannot write these as raw ANSI while this door is running - that
 * paints over the blessed screen - so it sends a structured 'system:notice'
 * event instead and the door renders it through its own message log.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSystemNoticeHandler = setupSystemNoticeHandler;
function setupSystemNoticeHandler(sock, addSystemMessage, audio) {
    sock.on('system:notice', (notice) => {
        if (!notice || !notice.message)
            return;
        const colour = notice.kind === 'restart' ? 'yellow' : 'cyan';
        addSystemMessage(`{${colour}-fg}${notice.message}{/${colour}-fg}`);
        // Only the first announcement makes a sound. A countdown that beeps four
        // times is an alarm, not a notice.
        if (notice.kind === 'restart' && (notice.seconds ?? 0) >= 60) {
            try {
                audio?.playSound?.('notification');
            }
            catch {
                // A missing sound must never take the notice down with it.
            }
        }
    });
}

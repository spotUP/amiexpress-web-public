/**
 * System notices from the BBS itself (currently: an imminent restart).
 *
 * The server cannot write these as raw ANSI while this door is running - that
 * paints over the blessed screen - so it sends a structured 'system:notice'
 * event instead and the door renders it through its own message log.
 */

export interface SystemNotice {
  kind: string;
  seconds?: number;
  message?: string;
}

export function setupSystemNoticeHandler(
  sock: any,
  addSystemMessage: (msg: string) => void,
  audio?: { playSound?: (name: string) => void },
): void {
  sock.on('system:notice', (notice: SystemNotice) => {
    if (!notice || !notice.message) return;

    const colour = notice.kind === 'restart' ? 'yellow' : 'cyan';
    addSystemMessage(`{${colour}-fg}${notice.message}{/${colour}-fg}`);

    // Only the first announcement makes a sound. A countdown that beeps four
    // times is an alarm, not a notice.
    if (notice.kind === 'restart' && (notice.seconds ?? 0) >= 60) {
      try {
        audio?.playSound?.('notification');
      } catch {
        // A missing sound must never take the notice down with it.
      }
    }
  });
}

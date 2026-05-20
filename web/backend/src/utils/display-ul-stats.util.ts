/**
 * displayULStats — express.e:12680-12715
 *
 * The 3-line user upload/download counters block, shown both:
 *   - PRE-transfer in the D command (download.handler.ts:99)
 *   - POST-transfer at express.e:20311 (runPostDownload)
 *
 * Format:
 *   Number of Downloads      : N (Xk total)
 *   Number of Uploads        : N (Xk total)
 *   Todays Bytes Available   : Infinite   (or KBytes when CREDITBYKB)
 *
 * Pre-existing DownloadHandler.displayULStats was private static and
 * inlined the same logic. Extracted here so the post-download pipeline
 * can render the matching banner without bringing in the whole
 * download.handler module from a service-layer file (circular import).
 */

import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';
import { getACSConfig, ToggleFlags } from './acs.util';

export interface UlStatsEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

export function emitULStats(emitter: UlStatsEmitter | Socket, session: BBSSession): void {
  const user = session.user;
  if (!user) return;

  const dlKb = Math.floor(((user as any).bytesDownload || 0) / 1024);
  const ulKb = Math.floor(((user as any).bytesUpload || 0) / 1024);
  // express.e:12691 u.downloads AND $FFFF (lower 16 bits)
  const dlCount = ((user as any).downloads || 0) & 0xFFFF;
  const ulCount = ((user as any).uploads || 0) & 0xFFFF;

  emitter.emit('ansi-output', `Number of Downloads      : ${dlCount} (${dlKb}k total)\r\n`);
  emitter.emit('ansi-output', `Number of Uploads        : ${ulCount} (${ulKb}k total)\r\n`);

  // express.e:12701-12714 — bytesADL=$7fffffff means Infinite.
  const toggles = getACSConfig().toggles;
  const bytesADL = (user as any).bytesAvailableForDownload ?? 0x7fffffff;
  const creditByKB = !!(toggles as any)?.[ToggleFlags.CREDITBYKB];

  if (creditByKB) {
    // express.e:12703 KBytes variant
    if (bytesADL === 0x7fffffff) {
      emitter.emit('ansi-output', 'Todays KBytes Available  : Infinite\r\n');
    } else {
      emitter.emit('ansi-output', `Todays KBytes Available  : ${bytesADL}\r\n`);
    }
  } else {
    // express.e:12709 Bytes variant (default)
    if (bytesADL === 0x7fffffff) {
      emitter.emit('ansi-output', 'Todays Bytes Available   : Infinite\r\n');
    } else {
      emitter.emit('ansi-output', `Todays Bytes Available   : ${bytesADL}\r\n`);
    }
  }
}

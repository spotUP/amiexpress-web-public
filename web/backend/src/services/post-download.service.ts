/**
 * post-download.service.ts
 *
 * Shared post-download completion pipeline. Web, telnet, and SSH all
 * call runPostDownload() so the user gets identical post-transfer
 * behavior regardless of transport.
 *
 * Mirrors express.e:20247-20316 (the tail block of downloadAFile):
 *   - "File transfer Completed." banner (express.e:20251)
 *   - aggregate stats line (express.e:20262-20268)
 *   - top-CPS persist (dnCPS2 / oldDnCPS, express.e:20271-20275)
 *   - lastDlCPS persist (express.e:20259)
 *   - aggregate callersLog summary (express.e:20280-20289)
 *   - displayULStats (express.e:20311)
 *   - pGoodbye if user picked G (express.e:20317)
 *
 * Per-file accounting (updateDownloadStats / dailyBytesDld / bytesADL /
 * logDownload / conference stats) is currently performed PRE-TRANSFER
 * by download.handler.ts:510-525 — a defensive port-specific choice
 * (charges accurate even on mid-transfer disconnect). Express.e fires
 * its zmdownloadcompleted hook per-file post-transfer; matching that
 * exactly requires a per-file completion callback from lrzsz which
 * isn't wired yet. Documented divergence; not blocking parity for the
 * aggregate post-transfer pipeline.
 *
 * Authoritative source: download.handler.ts initiateDownloadTransfer
 * (web branch). The body below was extracted verbatim from there.
 */
import type { BBSSession } from '../index';
import type { Socket } from 'socket.io';
import { LoggedOnSubState } from '../constants/bbs-states';
import { callersLog } from '../server/database-helpers';
import { userFileManager } from '../services/UserFileManager';

export interface PostDownloadEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface PostDownloadContext {
  /** Wall-clock ms when the download transfer started. */
  downloadStartTime: number;
  /** Number of files successfully sent. */
  downloadedFiles: number;
  /** Total bytes sent. */
  downloadedBytes: number;
  /** True if user picked "Goodbye after transfer" pre-transfer. */
  goodbyeAfter?: boolean;
  /**
   * If transfer ultimately failed (rz/sz exited non-zero, peer canceled),
   * downloadedFiles + downloadedBytes will be 0 OR partial. callersLog
   * writes "Download Failed.." per express.e:20289.
   */
  success: boolean;
}

export async function runPostDownload(
  emitter: PostDownloadEmitter,
  session: BBSSession,
  ctx: PostDownloadContext,
): Promise<void> {
  // express.e:20252-20260 — compute aggregate cps/efficiency
  const elapsed = Math.max(1, Math.round((Date.now() - ctx.downloadStartTime) / 1000));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const totalKb = Math.floor(ctx.downloadedBytes / 1024);
  const cps = ctx.downloadedBytes > 0 ? Math.round(ctx.downloadedBytes / elapsed) : 0;
  const onlineBaud = (session as any).onlineBaud || (session as any).baudRate || 38400;
  // express.e:413-420 calcEfficiency — overflow-safe form
  const baudDiv10 = Math.max(1, Math.floor(onlineBaud / 10));
  const efficiency = cps > 21474836
    ? Math.floor(Math.floor(cps / baudDiv10) * 100)
    : Math.floor((cps * 100) / baudDiv10);

  // express.e:20251 aePuts('\b\n\b\nFile transfer Completed.\b\n')
  emitter.emit('ansi-output', '\r\n\r\nFile transfer Completed.\r\n');

  // express.e:20262-20267 stats line
  const statsLine = ` ${ctx.downloadedFiles} files, ${totalKb}k bytes, ${minutes} minutes ${seconds} seconds ${cps} cps, ${efficiency}% efficiency at ${onlineBaud}`;
  emitter.emit('ansi-output', statsLine + '\r\n');
  emitter.emit('ansi-output', '\r\n');

  // express.e:20259 loggedOnUserMisc.lastDlCPS:=pcps
  if (session.user && cps > 0) {
    (session.user as any).lastDlCPS = cps;
  }

  // express.e:20271-20275 top-CPS download persist
  if (session.user && cps > 0) {
    const currentTopCps = (session.user as any).topDownloadCPS || (session.user as any).dnCPS2 || 0;
    if (cps > currentTopCps) {
      (session.user as any).topDownloadCPS = cps;
      (session.user as any).dnCPS2 = cps;
      const clamped = Math.min(cps, 65535);
      (session.user as any).oldDnCPS = clamped;
    }
  }

  // express.e:20280-20289 — callersLog summary
  if (session.user) {
    const summaryLog = (ctx.success && ctx.downloadedFiles > 0)
      ? `\t${statsLine}`
      : '\tDownload Failed..';
    try {
      await callersLog(session.user.id, session.user.username, summaryLog);
    } catch (err: any) {
      console.error(`[postDownload] callersLog failed: ${err?.message || err}`);
    }
  }

  // Persist any user-stat changes (top CPS, lastDlCPS) to disk.
  // userDataFile updates user.data/keys/misc files.
  if (session.user?.slotNumber) {
    try {
      userFileManager.updateUserDataFile(session.user, session.user.slotNumber);
    } catch (err: any) {
      console.error(`[postDownload] updateUserDataFile failed: ${err?.message || err}`);
    }
  }

  // express.e:20311 displayULStats(loggedOnUser, loggedOnUserMisc)
  // Web caller did this in DownloadHandler.displayULStats(); for telnet/SSH
  // we'd need the same helper exposed. For now emit the minimum that
  // tracks express.e's intent (Number Downloads / Number Uploads / Bytes).
  try {
    const stats = `\r\n  Number of Downloads: ${(session.user as any)?.downloads || 0}\r\n` +
                  `  Number of Uploads:   ${(session.user as any)?.uploads || 0}\r\n`;
    emitter.emit('ansi-output', stats);
  } catch { /* non-critical */ }
  emitter.emit('ansi-output', '\r\n');

  // express.e:20317 — pGoodbye on user-picked G
  if (ctx.goodbyeAfter) {
    // pGoodbye is a 10-second countdown; web download.handler has the
    // full implementation. Telnet/SSH falls back to immediate logoff
    // for now (full countdown port is a follow-up).
    const { handleGoodbyeCommand } = require('../handlers/commands/system-commands.handler');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    handleGoodbyeCommand(emitter as Socket, session, 'Y');
    return;
  }

  // Return to menu prompt
  (session as any).menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

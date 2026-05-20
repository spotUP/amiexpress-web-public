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

  // express.e:20280-20289 — callersLog + udLog summary. Express writes
  // to BOTH disk logs with the same text. Our DB caller_activity insert
  // is a port-specific addition for the web UI; keep alongside.
  if (session.user) {
    // express.e:20242-20245 — same once-per-session U/D header as the
    // upload pipeline. Whichever transfer fires first this session
    // gets to write the header; subsequent transfers (upload or
    // download) skip via session.beenUDd.
    try {
      const { writeUDSessionHeader } = require('../utils/download-logging.util');
      await writeUDSessionHeader(session);
    } catch (err: any) {
      console.error(`[postDownload] U/D session header failed: ${err?.message || err}`);
    }

    const summaryLog = (ctx.success && ctx.downloadedFiles > 0)
      ? `\t${statsLine}`
      : '\tDownload Failed..';
    try {
      await callersLog(session.user.id, session.user.username, summaryLog);
    } catch (err: any) {
      console.error(`[postDownload] callersLog failed: ${err?.message || err}`);
    }
    try {
      const { writeToCallersLog, writeToUDLog } = require('../utils/download-logging.util');
      await writeToCallersLog(session.user.username, summaryLog, session.nodeId || 1);
      await writeToUDLog(summaryLog, session.nodeId || 1);
    } catch (err: any) {
      console.error(`[postDownload] disk log write failed: ${err?.message || err}`);
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
  // Same emit-shape as the pre-transfer banner in download.handler.ts:99
  // — extracted to display-ul-stats.util.ts so both paths render an
  // identical 3-line block (downloads/uploads counters + Todays Bytes
  // Available, KB variant when CREDITBYKB).
  try {
    const { emitULStats } = require('../utils/display-ul-stats.util');
    emitter.emit('ansi-output', '\r\n');
    emitULStats(emitter, session);
  } catch (err: any) {
    console.error(`[postDownload] emitULStats failed: ${err?.message || err}`);
  }
  emitter.emit('ansi-output', '\r\n');

  // express.e:20317 — pGoodbye on user-picked G. The 10-second countdown
  // ("Last chance! Auto LOGOFF in N SECS. Abort: (Enter)=yes?") works
  // for both web and telnet/SSH because the DOWNLOAD_PGOODBYE substate
  // and its input handler are wired in command.handler.ts for all
  // transports. Web previously called DownloadHandler.startPGoodbye
  // directly after this service returned; now we drive it from here
  // so telnet/SSH gets the same countdown.
  if (ctx.goodbyeAfter) {
    try {
      const { DownloadHandler } = require('../handlers/file/download.handler');
      await DownloadHandler.startPGoodbye(emitter as Socket, session);
    } catch (err: any) {
      console.error(`[postDownload] startPGoodbye failed: ${err?.message || err}`);
      // Fallback to immediate logoff if the countdown can't start
      const { handleGoodbyeCommand } = require('../handlers/commands/system-commands.handler');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      handleGoodbyeCommand(emitter as Socket, session, 'Y');
    }
    return;
  }

  // Return to menu prompt
  (session as any).menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * post-upload.service.ts
 *
 * Shared post-upload completion pipeline. Web, telnet, and SSH all
 * call runPostUpload() with the same stats so the user gets identical
 * post-receive behavior regardless of transport.
 *
 * Mirrors express.e:18944 uploadaFile post-receive block (lines
 * 18850-19130): completion banner, file/byte/cps stats line, callersLog
 * entry, sysop notify, time-credit calculation, "Time increased by N
 * mins" prompt, and goodbye-after-transfer handling.
 *
 * Authoritative reference: the web batch handler at
 * file-socket-handlers.ts (handleUploadBatchComplete). Per user
 * directive: web is the source of truth; do not duplicate this logic
 * in any transport-specific path.
 */
import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { config } from '../config';
import { callersLog } from '../server/database-helpers';
import { doUploadNotify } from '../utils/upload-notify.util';

export interface PostUploadEmitter {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface PostUploadContext {
  /** Wall-clock ms when the upload started (Date.now() at receive start). */
  uploadStartTime: number;
  /** Number of files successfully received. */
  uploadedFiles: number;
  /** Total bytes received across all files. */
  uploadedBytes: number;
  /** True if user picked "Goodbye after transfer" in the picker. */
  goodbyeAfter?: boolean;
  /**
   * Optional final cleanup callback (web uses clearUploadContext to
   * wipe tempData; telnet/SSH have nothing to clean). Runs immediately
   * before the substate transition and goodbye dispatch.
   */
  onCleanup?: () => void;
  /**
   * Efficiency percentage to display (express.e: tTEFF). Web has no
   * direct measure so it passes 100; lrzsz can derive from baud/cps.
   */
  efficiencyPct?: number;
}

/**
 * Run the post-receive pipeline. Idempotent in terms of session state:
 * sets subState/menuPause and (if goodbye) dispatches the goodbye
 * command. Caller should not re-emit stats or re-trigger the menu.
 */
export async function runPostUpload(
  emitter: PostUploadEmitter,
  session: BBSSession,
  ctx: PostUploadContext,
): Promise<void> {
  const ulTTTM = Math.max(0, Math.floor((Date.now() - ctx.uploadStartTime) / 1000));
  const minutes = Math.floor(ulTTTM / 60);
  const seconds = ulTTTM % 60;
  const bytesKB = Math.floor(ctx.uploadedBytes / 1024);
  const cps = ulTTTM > 0 ? Math.floor(ctx.uploadedBytes / ulTTTM) : 0;
  const eff = ctx.efficiencyPct ?? 100;

  // express.e:18850 aePuts('\b\n\b\nFile Uploading Complete...\b\n')
  emitter.emit('ansi-output', '\r\n\r\nFile Uploading Complete...\r\n');
  // express.e:18857 stats line
  const statsLine = ` ${ctx.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps, ${eff}% efficiency.`;
  emitter.emit('ansi-output', statsLine + '\r\n');
  // express.e:18860 trailing blank lines
  emitter.emit('ansi-output', '\r\n\r\n');

  // express.e:18862-18871 callersLog/udLog. express.e:19094 only logs
  // success line when ulFileCount > 0; otherwise logs "Upload Failed".
  if (session.user) {
    const summaryLog = ctx.uploadedFiles > 0
      ? `\t${statsLine}`
      : '\tUpload Failed..';
    try {
      await callersLog(session.user.id, session.user.username, summaryLog);
    } catch (err: any) {
      console.error(`[postUpload] callersLog failed: ${err?.message || err}`);
    }
  }

  // express.e:19098 doUploadNotify — sysop notify + EXECUTE_ON_UPLOAD.
  // Only fires when at least one file was received (matches express.e).
  if (ctx.uploadedFiles > 0 && session.user) {
    try {
      await doUploadNotify(
        session.user.name || session.user.username,
        session.user.location || 'Unknown',
        config.get('bbsName') || 'AmiExpress BBS',
        undefined,
        session.nodeId || 1,
        !!(session.user as any)?.gdprConsentAt,
      );
    } catch (err: any) {
      console.error(`[postUpload] doUploadNotify failed: ${err?.message || err}`);
    }
  }

  // express.e:19109 time credit. peff = (ulTTTM * 3/2) + 60 when files>0 and time>0.
  let peff = 0;
  if (ctx.uploadedFiles > 0 && ulTTTM > 0) {
    peff = Math.floor((ulTTTM * 3) / 2) + 60; // seconds
  }
  const timeIncreasedMins = Math.floor(peff / 60);
  // express.e:19127
  emitter.emit('ansi-output', `Time increased by ${timeIncreasedMins} mins.\r\n\r\n`);

  // express.e:19130 timeLimit:=timeLimit+peff
  const sessAny = session as any;
  if (typeof sessAny.timeLimit === 'number') {
    sessAny.timeLimit += peff;
  }

  // Caller cleanup (e.g. clearUploadContext for web) — must run before
  // we mutate subState so the cleanup sees the pre-transition state.
  try {
    ctx.onCleanup?.();
  } catch (err: any) {
    console.error(`[postUpload] onCleanup threw: ${err?.message || err}`);
  }

  // express.e:25657 — IF stat=RESULT_GOODBYE THEN modemOffHook()
  if (ctx.goodbyeAfter) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    const { handleGoodbyeCommand } = require('../handlers/commands/system-commands.handler');
    handleGoodbyeCommand(emitter, session, 'Y');
    return;
  }

  // Express.e: after uploadaFile() returns RESULT_SUCCESS the main
  // command loop simply re-prompts for the next command — it does NOT
  // re-display the conference bulletin (already shown at join time).
  // Drop straight to DISPLAY_MENU. The earlier code path here used
  // DISPLAY_CONF_BULL which re-rendered the join-conf ASCII + uploaders
  // bull after every upload — wrong UX on every transport.
  emitter.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  (session as any).menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

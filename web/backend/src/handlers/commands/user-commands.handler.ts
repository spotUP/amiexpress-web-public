/**
 * User Commands Handler - User statistics and conference switching
 *
 * Implements common user commands from express.e:
 * - S: Display user statistics (internalCommandS - express.e:25540-25568)
 * - J: Join conference (internalCommandJ - express.e:25113-25183)
 * - U: Upload files (internalCommandU - express.e:25646-25658)
 * - D: Download files (internalCommandD - express.e:24853-24857)
 */

import { isSysopAvailable } from '../../services/sysop-availability';
import * as fs from 'fs';
import { negotiateBinaryForTransfer } from '../file/file-delivery';
import type { TransferResult } from '../../services/transfer-protocol.service';
import { checkSecurity, setEnvStat } from '../../utils/acs.util';
import { EnvStat } from '../../constants/env-codes';
import { ACSPermission } from '../../constants/acs-permissions';
import { AnsiUtil } from '../../utils/ansi.util';
import { joinedConf } from '../../utils/joined-conf.util';
import { sessionWantsPetscii, PETSCII_FONT_IS_FIXED } from '../../utils/petscii-session-model';
import { fontMenuRows, fontForChoice, chooseTerminalFont } from '../../services/terminal-font.service';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { normalizeForComparison } from '../../utils/input-normalizer.util';
import { finalizeCommand } from '../../utils/command-response.util';
import type { BBSSession } from '../../index';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { ZmodemTransferManager, TransferTransport } from '../../services/zmodem-transfer.service';
import { flaggedFilesManager } from '../../services/FlaggedFilesManager';
import { isFileRestricted } from '../../utils/file-restriction.util';
import * as path from 'path';
import { formatLongDateTime, formatLongDate } from '../../utils/date-time.util';
import { loadMsgPointers, saveMsgPointers, saveConferenceAccount } from '../../utils/message-pointers.util';
import { endRawTransfer } from '../../utils/raw-transfer-teardown.util';
import { emitText } from '../../utils/output.util';
import { endUpload, awaitUploadEnd, type UploadStat } from '../../services/upload-end.service';
import { getTodaysCalls } from '../../utils/time-tracking.util';
import { boardRoot } from '../../utils/board-root.util';

interface Conference {
  id: number;
  name: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

interface Database {
  query: (sql: string, params: any[]) => Promise<{ rows: any[] }>;
}

// Injected dependencies
let _conferences: Conference[] = [];
let _messageBases: MessageBase[] = [];
let _db: Database;
let _joinConference: (socket: any, session: BBSSession, confId: number, msgBaseId: number) => Promise<boolean>;
let _checkConfAccess: (user: any, confNum: number) => boolean;
// `runCommands` and `silent` are part of displayScreen's real signature
// (screen.handler.ts:1760); the injected type had dropped them, so a caller
// here could not ask for a screen SILENTLY - and a screen a conference
// legitimately does not have would log and notify the sysop on every use.
let _displayScreen: (
  socket: any,
  session: BBSSession,
  screenName: string,
  runCommands?: boolean,
  silent?: boolean,
) => Promise<boolean>;
let _displayUploadInterface: (socket: any, session: BBSSession, params: string) => void;

// Injection functions
export function setUserCommandsDependencies(deps: {
  conferences: Conference[];
  messageBases: MessageBase[];
  db: Database;
  joinConference: typeof _joinConference;
  checkConfAccess: typeof _checkConfAccess;
  displayScreen: typeof _displayScreen;
  displayUploadInterface: typeof _displayUploadInterface;
}) {
  _conferences = deps.conferences;
  _messageBases = deps.messageBases;
  _db = deps.db;
  _joinConference = deps.joinConference;
  _checkConfAccess = deps.checkConfAccess;
  _displayScreen = deps.displayScreen;
  _displayUploadInterface = deps.displayUploadInterface;
}

function getTransferTransport(session: BBSSession): TransferTransport {
  const transportType: TransferTransport['type'] =
    (session as any).connectionType === 'ssh'
      ? 'ssh'
      : (session as any).connectionType === 'telnet'
        ? 'telnet'
        : 'web';

  const send =
    (session as any).transferRawSend ||
    ((buf: Buffer) => {
      /* socket layer will be provided */
    });

  return { type: transportType, send };
}

/**
 * A way out of the upload: uploadaFile returns (services/upload-end.service.ts)
 * - to the menu, or to the procedure waiting for it.
 */
function uploadReturns(session: BBSSession, stat: UploadStat): void {
  endUpload(session, stat, () => {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = true;
  });
}

/**
 * File what a transfer delivered to the playpen: the DIZ check, the
 * description prompt per file, then the batch's filing and stats.
 *
 * ONE of these for every protocol. It was the body of the ZMODEM completion
 * alone, so an XMODEM upload landed in the playpen, printed its stats, and
 * was never filed - logoff then parked it in PartUpload as "incompleted"
 * (the telnet regression suite, 2026-09-27).
 */
export async function fileReceivedUploads(
  socket: any,
  session: BBSSession,
  received: string[],
  skipped: string[],
  ulStartTime: number,
): Promise<void> {
  // express.e:15101 - every refused name goes to the CallersLog and
  // the UD log, and nowhere else: the caller's own client has already
  // told him the file was skipped.
  for (const skippedName of skipped) {
    try {
      const { writeToUDLog, writeToCallersLog } = require('../../utils/download-logging.util');
      void writeToCallersLog(`\tSkipped ${skippedName}`, session.nodeId || 0);
      void writeToUDLog(`\tSkipped ${skippedName}`, session.nodeId || 0);
    } catch (err) {
      console.error('[UPLOAD] could not log a skipped file:', err);
    }
  }
  const fsSync = require('fs');
  const pathMod = require('path');
  const { db } = require('../../database');
  const { config: appConfig } = require('../../config');
  const { handleDizExtractionAndDescription, handleUploadBatchComplete } =
    require('../../server/file-socket-handlers');

  // express.e:17327-17347 (BG_EXIT, wait) and receivePlayPen 18029-18032: the
  // files the background check filed during the transfer are in the stats
  // already, and are no longer in the playpen the filing loop walks.
  const { finishBackgroundFileCheck } = require('../../services/background-file-check.service');
  const background: { count: number; bytes: number } = await finishBackgroundFileCheck(socket, session);
  if (background.count > 0) received = received.filter((file) => fsSync.existsSync(file));

  // Target file area: prefer what displayUploadInterface already
  // resolved (file.handler.ts:720 sets session.tempData.fileArea
  // = uploadArea via the conference's upload-path Tooltype). Only
  // fall back to db.getFileAreas if tempData was cleared somehow
  // — the express.e flow always commits the area at U-command
  // entry, not at upload completion.
  let fileArea: any = (session.tempData as any)?.fileArea || null;
  if (!fileArea) {
    try {
      const areas = await db.getFileAreas(joinedConf(session).conf);
      fileArea = Array.isArray(areas) && areas.length > 0 ? areas[0] : null;
    } catch (err: any) {
      console.error('[ZMODEM-UL] getFileAreas fallback failed:', err?.message || err);
    }
  }
  if (!fileArea) {
    // express.e:18974-18977 aePuts('\b\n'); myError(5) (8528-8530).
    socket.emit('ansi-output', '\r\nNo files available in this conference.\r\n\r\n');
    uploadReturns(session, 'failure');
    return;
  }

  if (received.length === 0) {
    // No files received — short-circuit to the stats-only banner +
    // runPostUpload so the user still gets the express.e-style
    // completion line and the menu prompt fires. Express.e:19127
    // emits "Time increased" then drops back to the main loop.
    // The batch-complete step reads the upload context; RZ never set one,
    // so without this an empty RZ receive printed nothing at all.
    session.tempData = {
      ...(session.tempData as any),
      uploadStartTime: ulStartTime,
      uploadedFiles: background.count,
      uploadedBytes: background.bytes,
      backgroundChecked: background.count,
    } as any;
    await handleUploadBatchComplete(socket, session);
    return;
  }

  // Synthesize the uploadContext that processFileUpload installs
  // for HTTP uploads. webUploadMode=true routes processBatchFile
  // through handleDizExtractionAndDescription. Multi-file batches
  // queue in pendingZmodemFiles and walk one-at-a-time after each
  // description completes (state machine in command.handler.ts
  // advances on Enter-Enter, see UPLOAD_DESC_INPUT branch).
  // What the caller described before the transfer (XMODEM's batch), kept
  // across the context reset below so those files are not asked about twice.
  const describedBefore: Record<string, string[]> = {};
  for (const entry of ((session.tempData as any)?.uploadBatch ?? []) as Array<{ filename?: string; description?: string }>) {
    if (entry?.filename && entry.description) {
      describedBefore[entry.filename.toUpperCase()] = entry.description.split('\n');
    }
  }

  session.tempData = {
    uploadMode: true,
    fileArea,
    uploadSessionId: `u-zmodem-${Date.now()}`,
    uploadBatch: [],
    uploadCount: received.length,
    uploadStartTime: ulStartTime,
    webUploadMode: true,
    describedBefore,
    batchUpload: false,
    currentUploadIndex: 0,
    filesProcessedCount: 0,
    uploadedFiles: background.count,
    uploadedBytes: background.bytes,
    backgroundChecked: background.count,
    skipDizExtraction: false,
    pendingZmodemFiles: received.slice(1).map((fp: string) => ({
      path: fp,
      name: pathMod.basename(fp),
    })),
  } as any;

  const firstPath = received[0];
  let firstSize = 0;
  try { firstSize = fsSync.statSync(firstPath).size; } catch (_) { /* ignore */ }
  const firstName = pathMod.basename(firstPath);
  try {
    await handleDizExtractionAndDescription(socket, session, {
      filename: firstName,
      originalname: firstName,
      size: firstSize,
      path: firstPath,
    }, appConfig);
    // Only set UPLOAD_DESC_INPUT if the batch is still active.
    // When all files have FILE_ID.DIZ the recursive chain clears
    // tempData and sets subState=DISPLAY_MENU before returning here.
    if (session.tempData) {
      session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
    }
  } catch (err: any) {
    console.error('[ZMODEM-UL] handleDizExtractionAndDescription failed:', err?.message || err);
    // WEB_: a JS exception in the port's filing; express.e has no counterpart.
    socket.emit('ansi-output', '\r\nUpload pipeline failed.\r\n\r\n');
    uploadReturns(session, 'failure');
  }
}

export function startZmodemUpload(socket: any, session: BBSSession): void {
  const bbsRoot =
    (session as any).bbsPath ||
    boardRoot();
  const paths = new BBSPaths(bbsRoot);
  const playpen = paths.node(session.nodeId || 0).playpen();

  try {
    const fs = require('fs');
    fs.mkdirSync(playpen, { recursive: true });
  } catch (err) {
console.error('[ZMODEM] Failed to ensure playpen:', err);
  }

  /**
   * express.e:19018 - `zresume := resumeStuff()`, before the receive.
   *
   * This is the U command, which is express's uLFType=0 path and the one
   * resumeStuff was written for; the RZ handler already calls it, having noted
   * that as a deliberate divergence. So the two entry points were exactly
   * INVERTED from express: RZ offered the caller his partials and U, the
   * command express actually offers them from, did not.
   *
   * It matters now in a way it did not before today: cleanPlayPen had no
   * callers, so `<conf>/PartUpload/` was always empty and resumeStuff had
   * nothing to offer whoever asked. With aborted uploads filed there, a caller
   * who reconnects and types U is offered the rest of his transfer.
   */
  {
    const { startResumeStuff } = require('../../services/resume-stuff.service');
    const { config: appConfigForResume } = require('../../config');
    startResumeStuff(socket, session, playpen, appConfigForResume, (resumeResult: any) => {
      // express.e resumeStuff (18119-18257) prints no count of restored files.
      continueUpload();
    });
    return;
  }

  /** The receive itself, once any partials have been offered. */
  function continueUpload(): void {
    // Web sessions don't have `transferRawSend` populated on the session —
    // that's a telnet/SSH-only field installed by setupTelnetSSHHandler.
    // For web, lrzsz output must bridge over the `transfer-raw:data`
    // socket channel directly. `getTransferTransport` falls back to a
    // no-op placeholder when `transferRawSend` is missing; the
    // `if (!transport.send)` check below is dead because functions are
    // truthy. So we explicitly install the socket-emit sender for web
    // here, regardless of what the helper returned.
    // (RZ command at transfer-misc-commands.handler.ts:126-128 builds its
    // own real sender for the same reason — this was the U-command bug
    // that made browser Sentry never see the ZRINIT and time out at 30s.)
    const transport = getTransferTransport(session);
    if (transport.type === 'web') {
      transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    } else if (!transport.send) {
      transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    }

    const ulStartTime = Date.now();

    /**
     * Which protocol did the caller actually ask for?
     *
     * The menu at info-commands.handler.ts:600-628 offers ZMODEM, YMODEM, three
     * XMODEMs and Punter, and records the answer in `user.protocol` - and every
     * transfer went to lrzsz regardless, so the choice had no effect on anything.
     * For a real Commodore that was not a cosmetic problem: a C64 cannot speak
     * ZMODEM at all, and Punter is the only protocol it has.
     *
     * ZMODEM stays on lrzsz, which is the canonical implementation and carries
     * the browser bridge. Everything else goes through TransferProtocolManager,
     * which already knew how to run all four and had simply never been called.
     */
    const { getDefaultProtocol, readyToTransferLine } = require('../../services/transfer-protocol.service');
    const chosenProtocol = getDefaultProtocol(session);
    // express.e:17977-17998 - fileReceive names the protocol before the
    // receive starts (uLFType FALSE: U, not RZ).
    socket.emit('ansi-output', readyToTransferLine(chosenProtocol, 'upload'));
    if (chosenProtocol !== 'zmodem') {
      /*
       * XMODEM CARRIES NO FILENAME, so it is received into the name the
       * caller typed at `FileName 1:`. It was handed the playpen DIRECTORY
       * as its file and failed at EOT on every upload - writeFileSync of a
       * directory, EISDIR, thrown before the transfer could finish. YMODEM
       * and Punter name their own files and keep the directory.
       */
      let target = playpen;
      if (String(chosenProtocol).startsWith('xmodem')) {
        const named = (session.tempData?.uploadBatch ?? [])[0]?.filename as string | undefined;
        if (!named) {
          // express.e cannot name an XMODEM receive; it fails into the
          // ordinary post-receive block (19053-19101), as here.
          void fileReceivedUploads(socket, session, [], [], ulStartTime);
          return;
        }
        target = path.join(playpen, path.basename(named));
      }
      const { TransferProtocolManager } = require('../../services/transfer-protocol.service');
      // express.e:17279-17283 fileReceive starts the thread for every protocol
      // (xpr library, xymodem, hydra, zmodem) and each posts a finished file
      // to it (xprfclose 13921, zmuploadcompleted 16825).
      const { startBackgroundFileCheck: startBgCheck } = require('../../services/background-file-check.service');
      const protocolBackground = startBgCheck(session);
      const protocolManager = new TransferProtocolManager(
        session,
        { type: transport.type, send: transport.send },
        { direction: 'upload', files: [target], protocol: chosenProtocol, onFileReceived: protocolBackground?.onFileReceived },
      );
      // express.e:15891-15896 - BINARY before any transfer, not only ZMODEM:
      // XMODEM blocks carry 0x0D and 0xFF as freely as ZMODEM frames do.
      negotiateBinaryForTransfer(session);
      protocolManager.on('complete', async (result: TransferResult) => {
        endRawTransfer(session);
        // The post-upload pipeline is the same one lrzsz's onComplete runs;
        // a Punter upload must be filed exactly like a ZMODEM one.
        //
        // TYPED, because `any` hid the field name: this read
        // `filesTransferred`, which TransferResult has never had, so every
        // XMODEM/YMODEM/Punter upload reported "0 file(s)" and was filed as
        // incomplete in PartUpload (the telnet regression suite, 2026-09-27).
        // express.e:19051-19053 - see the lrzsz completion below.
        await fileReceivedUploads(socket, session, result.success ? result.files : [], [], ulStartTime);
      });
      // These callers are not async; the transfer runs on its own and reports
      // through the 'complete' event above.
      void protocolManager.start().catch((err: any) => {
        console.error('[TRANSFER] protocol transfer failed to start:', err);
        socket.emit('ansi-output', '\r\nUnable to open the xpr library\r\n'); // express.e:17116 / 15750
        uploadReturns(session, 'failure');
      });
      return;
    }

    // All transports go through lrzsz when available — web bridges
    // lrzsz output via the existing `transfer-raw:data` socket channel
    // to the browser-side zmodem.js Sentry.
    {
      const { isLrzszAvailable, LrzszTransferManager } = require('../../services/lrzsz-transfer.service');
      if (isLrzszAvailable()) {
        // express.e:17279-17283 fileReceive: the background check starts with the receive.
        const { startBackgroundFileCheck } = require('../../services/background-file-check.service');
        const background = startBackgroundFileCheck(session);
        const lrzManager = new LrzszTransferManager({
          session,
          onFileReceived: background?.onFileReceived,
          transport: { type: transport.type, send: transport.send },
          direction: 'upload',
          paths: [playpen],
        // express.e:16831 zmdupecheck - asked at the ZFILE header, so a file
        // the board already has is answered with ZSKIP instead of being
        // received and then rejected. A rule that cannot answer takes the
        // file: the post-transfer filing still catches it.
        isDuplicate: (name: string) => {
          // express.e:16833 - a message's files (rzmsg) are not checked.
          if (session.rzmsg) return false;
          const { uploadIsDuplicate } = require('../../services/upload-duplicate.service');
          const { config: appCfg } = require('../../config');
          return uploadIsDuplicate({
            filename: name,
            conferenceId: joinedConf(session).conf,
            bbsRoot: appCfg.get('dataDir'),
            nodeId: session.nodeId || 0,
          });
        },
          onComplete: async (ok: boolean, detail: any) => {
            endRawTransfer(session);
            // express.e:19051-19053: whatever fileReceive delivered, "File Uploading
            // Complete..." and the stats follow; a failed receive only logs "Upload
            // Failed.." (19093-19096). runPostUpload does both for an empty list.
            // Route through the SAME post-upload pipeline as the RZ command
            // (transfer-misc-commands.handler.ts:177-279). Previously this
            // handler only emitted the stats banner and stopped — files
            // landed in playpen but never got DIZ-extracted, given a
            // description, moved to FILES/LCFILES, appended to DIRn /
            // FILES.BBS, or logged. Express.e:19053+ runs the post-upload
            // body unconditionally regardless of how the receive started,
            // so U-command and RZ-command must converge here.
            await fileReceivedUploads(socket, session, detail?.received || [], detail?.skipped || [], ulStartTime);
          },
        });
        (session as any).transferRawActive = true;
        (session as any).transferRawSink = (buf: Buffer) => lrzManager.handleInput(buf);
        (session as any).transferManager = lrzManager;
        // Park in FILES_UPLOAD; see transfer-misc-commands.handler.ts:RZ
        // path comment for rationale.
        session.subState = LoggedOnSubState.FILES_UPLOAD;
        // Divergence 20: this path sent NO IAC BINARY at all, while the
        // download path and the RZ path both did - so an upload started with
        // `U` on telnet ran under NVT rules and CRC-failed on any subpacket
        // carrying 0x0D. Same helper, same bytes, all three sites.
        negotiateBinaryForTransfer(session);
        if (transport.type === 'web') {
          let fired = false;
          const start = () => { if (fired) return; fired = true; lrzManager.start(); };
          socket.once('transfer-raw:start', () => start());
          // WEB_: the browser's file picker - cancelled or never answered - has no
          // express.e counterpart; both texts below are the port's own.
          socket.once('transfer-raw:cancel', () => {
            if (fired) return;
            fired = true;
            socket.emit('ansi-output', '\r\nUpload cancelled.\r\n\r\n');
            uploadReturns(session, 'failure');
          });
          setTimeout(() => {
            if (!fired) {
              fired = true;
              // WEB_: no express.e equivalent. This is the 120 s timeout on the browser file picker.
              socket.emit('ansi-output', '\r\nUpload timed out (no file picked).\r\n\r\n');
              uploadReturns(session, 'failure');
            }
          }, 120000);
          socket.emit('transfer-raw:init', { direction: 'upload', paths: [playpen] });
        } else {
          lrzManager.start();
        }
        return;
      }
      console.warn('[ZMODEM-UL] lrzsz not installed, falling back to zmodem.js (may not interoperate)');
    }

    // express.e:17279-17283 and zmuploadcompleted 16825: the zmodem.js fallback
    // is the same receive, so it starts the thread and posts each file to it.
    const { startBackgroundFileCheck: startFallbackBgCheck } = require('../../services/background-file-check.service');
    const fallbackBackground = startFallbackBgCheck(session);
    const manager = new ZmodemTransferManager({
      session,
      transport,
      direction: 'upload',
      paths: [playpen],
      onFileReceived: fallbackBackground?.onFileReceived,
      // zmodem.js is only the receive; what it received is filed exactly as
      // lrzsz's is (uploadaFile 19400-19500), one path for every protocol.
      onComplete: async (ok, detail) => {
        endRawTransfer(session);
        // express.e:19051-19053: whatever fileReceive delivered, "File Uploading
        // Complete..." and the stats follow; a failed receive only logs "Upload
        // Failed.." (19093-19096). runPostUpload does both for an empty list.
        await fileReceivedUploads(socket, session, detail?.received || [], detail?.skipped || [], ulStartTime);
      },
    });

    (session as any).transferRawActive = true;
    (session as any).transferRawSink = (buf: Buffer) => manager.handleInput(buf);
    (session as any).transferRawSend = transport.send;
    (session as any).transferManager = manager;

    // See the RZ path: only the browser bridge is told, and express prints
    // no banner here at all.
    if (transport.type === 'web') {
      socket.emit('transfer-raw:init', {
        direction: 'upload',
        paths: [playpen],
      });
    }

    manager.start();
  }
}

export function startZmodemDownload(
  socket: any,
  session: BBSSession,
  files: string[],
  /**
   * Called once the transfer ends, with whether it actually succeeded.
   *
   * express books a download in `updateDownloadStats` behind `IF sentsize`
   * (express.e:15429-15465) - nothing sent, nothing counted. This port booked
   * every file BEFORE handing off to sz, so a caller who aborted a batch was
   * charged for files he never received, which on a ratio board is real money.
   *
   * lrzsz tells us only whether the whole batch went (it does not report
   * per-file progress on an abnormal exit), so this is per-batch rather than
   * per-file - the closest fidelity the transport offers.
   */
  onFinished?: (ok: boolean) => Promise<void> | void,
  /**
   * transferOnly: express.e downloadFiles(..,updateDownloadStats=FALSE) for
   * downloadFile (14957) - the transfer alone. Its caller (a message's
   * attached files, checkAttachedFile 9746) carries on where it was when the
   * transfer ends, so nothing here moves the caller to the menu, prints the
   * post-download block or clears the flagged list; the state the caller
   * was in is handed back and onFinished always runs.
   */
  opts: { transferOnly?: boolean } = {},
): void {
  const ctxId = `zd-${session.nodeId || 0}-${Date.now()}`;
  console.log(`[ZMODEM-DL ${ctxId}] startZmodemDownload entry files=${JSON.stringify(files)}`);

  const transferOnly = !!opts.transferOnly;
  const stateBefore = session.subState;
  /** transferOnly: the caller's state back, and its continuation told. */
  const handBack = async (ok: boolean): Promise<void> => {
    session.subState = stateBefore;
    try {
      await onFinished?.(ok);
    } catch (err) {
      console.error(`[ZMODEM-DL ${ctxId}] onFinished failed:`, err);
    }
  };

  if (!files || files.length === 0) {
    console.log(`[ZMODEM-DL ${ctxId}] no files, aborting`);
    // express.e:15597-15599 returns with nothing to say.
    if (transferOnly) { void handBack(false); return; }
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // De-duplicate file list — the F flag command currently emits each
  // file twice (open ticket #14), so a single flagged file shows up
  // as ["x.lha","x.lha"] which makes ZMODEM try to send it twice and
  // the second send fails. Strip duplicates here defensively.
  const seen = new Set<string>();
  files = files.filter((f) => { if (seen.has(f)) return false; seen.add(f); return true; });

  // Verify each file exists before starting the ZMODEM session — otherwise
  // the client opens the dialog, the manager tries to read the missing
  // file, and the session aborts silently.
  const fsSync = require('fs');
  const missing = files.filter((f) => { try { return !fsSync.existsSync(f); } catch { return true; } });
  if (missing.length > 0) {
    console.warn(`[ZMODEM-DL ${ctxId}] missing files: ${JSON.stringify(missing)}`);
    // WEB_: a pooled file evicted between resolve and send; express.e has no pool.
    socket.emit('ansi-output', `\r\nDownload error — files not found: ${missing.map((p) => path.basename(p)).join(', ')}\r\n`);
    if (transferOnly) { void handBack(false); return; }
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const transport = getTransferTransport(session);
  console.log(`[ZMODEM-DL ${ctxId}] transport.type=${transport.type} hasSend=${!!transport.send} transferRawSend=${typeof (session as any).transferRawSend}`);
  // Same trap as startZmodemUpload: getTransferTransport returns a no-op
  // placeholder function when session.transferRawSend isn't set (always
  // true for web — that field is telnet/SSH-only). The `if (!transport.send)`
  // falsy guard never fires because functions are truthy, so sz bytes
  // would silently sink into the no-op. Install the real socket-emit
  // sender explicitly for web.
  if (transport.type === 'web') {
    transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  } else if (!transport.send) {
    transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }

  // Snapshot transfer start time and total expected bytes so the
  // shared runPostDownload service can compute aggregate stats.
  const dlStartTime = Date.now();
  const fs2 = require('fs');
  let totalExpectedBytes = 0;
  for (const fp of files) {
    try { totalExpectedBytes += fs2.statSync(fp).size; } catch (_) {}
  }
  const goodbyeAfter = !!(session as any)._downloadGoodbyeAfter;
  (session as any)._downloadGoodbyeAfter = undefined;

  /**
   * Which protocol did the caller actually ask for?
   *
   * The menu at info-commands.handler.ts:600-628 offers ZMODEM, YMODEM, three
   * XMODEMs and Punter, and records the answer in `user.protocol` - and every
   * transfer went to lrzsz regardless, so the choice had no effect on anything.
   * For a real Commodore that was not a cosmetic problem: a C64 cannot speak
   * ZMODEM at all, and Punter is the only protocol it has.
   *
   * ZMODEM stays on lrzsz, which is the canonical implementation and carries
   * the browser bridge. Everything else goes through TransferProtocolManager,
   * which already knew how to run all four and had simply never been called.
   */
  const { getDefaultProtocol, readyToTransferLine } = require('../../services/transfer-protocol.service');
  const chosenProtocol = getDefaultProtocol(session);
  if (chosenProtocol !== 'zmodem') {
    socket.emit('ansi-output', readyToTransferLine(chosenProtocol, 'download')); // express.e:15731-15740
    const { TransferProtocolManager } = require('../../services/transfer-protocol.service');
    const protocolManager = new TransferProtocolManager(
      session,
      { type: transport.type, send: transport.send },
      { direction: 'download', files: files, protocol: chosenProtocol },
    );
    // express.e:15891-15896 - BINARY before any transfer, not only ZMODEM.
    negotiateBinaryForTransfer(session);
    protocolManager.on('complete', async (result: TransferResult) => {
      endRawTransfer(session);
      if (transferOnly) { await handBack(!!result?.success); return; }
      // The same post-download pipeline ZMODEM runs: stats booked, logs
      // written, the prompt drawn. This branch printed its own line and
      // set DISPLAY_MENU, so an XMODEM or Punter download booked nothing and
      // left the caller without a prompt.
      try {
        await onFinished?.(!!result?.success);
      } catch (err) {
        console.error('[TRANSFER] booking the download failed:', err);
      }
      const { runPostDownload } = require('../../services/post-download.service');
      await runPostDownload(socket, session, {
        downloadStartTime: dlStartTime,
        downloadedFiles: result?.success ? 1 : 0,
        downloadedBytes: result?.bytesTransferred ?? 0,
        goodbyeAfter,
        success: !!result?.success,
      });
    });
    // These callers are not async; the transfer runs on its own and reports
    // through the 'complete' event above.
    void protocolManager.start().catch((err: any) => {
      console.error('[TRANSFER] protocol transfer failed to start:', err);
      socket.emit('ansi-output', '\r\nUnable to open the xpr library\r\n'); // express.e:17116 / 15750
      if (transferOnly) { void handBack(false); return; }
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      (session as any).menuPause = true;
    });
    return;
  }

  // All transports go through lrzsz (canonical Forsberg/Ohse) when
  // available. Web bridges sz output to the browser-side zmodem.js
  // Sentry via `transfer-raw:data` — the two ZMODEM implementations
  // interop over the socket the way lrzsz interops with any other
  // ZMODEM client over a serial wire.
  {
    const { isLrzszAvailable, LrzszTransferManager } = require('../../services/lrzsz-transfer.service');
    if (isLrzszAvailable()) {
      const lrzManager = new LrzszTransferManager({
        session,
        transport: { type: transport.type, send: transport.send },
        direction: 'download',
        paths: files,
        onComplete: async (ok: boolean, detail: any) => {
          endRawTransfer(session);
          console.log(`[ZMODEM-DL ${ctxId}] lrzsz onComplete ok=${ok} exit=${detail.exitCode} signal=${detail.signal}`);
          if (transferOnly) { await handBack(ok); return; }
          // Book the download now that it is known to have happened, not
          // when it was merely intended. express.e:15437's `IF sentsize`.
          try {
            await onFinished?.(ok);
          } catch (err) {
            console.error(`[ZMODEM-DL ${ctxId}] booking the download failed:`, err);
          }
          // express.e:20249 clearFlagItems(flagFilesList) — clear the
          // user's flagged-files queue after a successful batch ZMODEM
          // download so they don't see the same files queued next time.
          // batch-download.handler.ts:228 already clears the web
          // session.flagManager; this is the telnet/SSH counterpart for
          // the flaggedFilesManager singleton used by startZmodemDownload.
          if (ok && session.user?.id) {
            try {
              flaggedFilesManager.clearFiles(Number(session.user.id));
            } catch (_e) { /* non-critical */ }
          }
          // Route through the shared post-download pipeline so stats,
          // callersLog, top-CPS persist, and goodbye-after handling
          // match the web download path and express.e:20247-20316.
          const { runPostDownload } = require('../../services/post-download.service');
          await runPostDownload(socket, session, {
            downloadStartTime: dlStartTime,
            downloadedFiles: ok ? files.length : 0,
            downloadedBytes: ok ? totalExpectedBytes : 0,
            goodbyeAfter,
            success: ok,
          });
        },
      });
      (session as any).transferRawActive = true;
      (session as any).transferRawSink = (buf: Buffer) => lrzManager.handleInput(buf);
      (session as any).transferManager = lrzManager;
      // Park in FILES_DOWNLOAD so the post-command flow doesn't
      // render the menu prompt mid-transfer (would corrupt the wire
      // with text bytes between ZMODEM frames). onComplete restores
      // DISPLAY_MENU when sz exits.
      session.subState = LoggedOnSubState.FILES_DOWNLOAD;
      socket.emit('ansi-output', readyToTransferLine('zmodem', 'download')); // express.e:15731-15740
      // express.e:15891-15896 — negotiate IAC BINARY transmission
      // before the ZMODEM transfer so the client doesn't apply NVT-
      // mode rules (CR→CRLF/CRNUL, NUL strip, etc.) to the binary
      // frames. Without this the receiver gets CRC errors on every
      // subpacket that happens to contain 0x0D in random binary data.
      //   IAC WILL BINARY  = 255 251 0  (we will transmit 8-bit)
      //   IAC DO BINARY    = 255 253 0  (please also transmit 8-bit)
      // CRITICAL: send via transferRawSendUnescaped, NOT transport.send
      // (which is transferRawSend and DOUBLES every 0xFF byte — would
      // turn each IAC into IAC IAC and break the negotiation).
      // One copy of this, in file-delivery.ts - the upload paths need the
      // same bytes and one of them was sending none (divergence 20).
      const negotiated = negotiateBinaryForTransfer(session);
      console.log(`[ZMODEM-DL ${ctxId}] BINARY negotiation: ${negotiated ? 'sent IAC WILL/DO BINARY (6 bytes)' : 'SKIPPED (not telnet, or no raw sender)'}`);
      console.log(`[ZMODEM-DL ${ctxId}] using lrzsz, spawning sz`);
      if (transport.type === 'web') {
        const startLrzsz = (() => {
          let fired = false;
          return () => { if (fired) return; fired = true; lrzManager.start(); };
        })();
        socket.once('transfer-raw:start', () => startLrzsz());
        setTimeout(() => startLrzsz(), 1500);
        socket.emit('transfer-raw:init', { direction: 'download', paths: files });
      } else {
        lrzManager.start();
      }
      return;
    }
    console.warn(`[ZMODEM-DL ${ctxId}] lrzsz not installed, falling back to zmodem.js (may not interoperate)`);
  }

  const manager = new ZmodemTransferManager({
    session,
    transport,
    direction: 'download',
    paths: files,
    onComplete: async (ok, detail) => {
      endRawTransfer(session);
      console.log(`[ZMODEM-DL ${ctxId}] onComplete ok=${ok} sent=${JSON.stringify(detail?.sent || [])}`);
      if (transferOnly) { await handBack(ok); return; }
      // express.e:20249 clearFlagItems — see comment in lrzsz onComplete
      // above; same clear applies to the zmodem.js fallback path.
      if (ok && session.user?.id) {
        try {
          flaggedFilesManager.clearFiles(Number(session.user.id));
        } catch (_e) { /* non-critical */ }
      }
      // Same shared post-download pipeline as the lrzsz path above.
      // zmodem.js (JS fallback) tracks "sent" files in detail.sent;
      // use that count if present, else fall back to full file list.
      const sentFiles = detail?.sent || (ok ? files : []);
      const { runPostDownload } = require('../../services/post-download.service');
      await runPostDownload(socket, session, {
        downloadStartTime: dlStartTime,
        downloadedFiles: sentFiles.length,
        downloadedBytes: ok ? totalExpectedBytes : 0,
        goodbyeAfter,
        success: ok,
      });
    },
  });

  (session as any).transferRawActive = true;
  (session as any).transferRawSink = (buf: Buffer) => manager.handleInput(buf);
  (session as any).transferRawSend = transport.send;
  (session as any).transferManager = manager;

  if (transport.type === 'web') {
    console.log(`[ZMODEM-DL ${ctxId}] emitting transfer-raw:init for web`);
    socket.emit('transfer-raw:init', {
      direction: 'download',
      paths: files,
    });
  } else {
    console.log(`[ZMODEM-DL ${ctxId}] telnet/SSH: emitting Starting ZMODEM banner`);
    socket.emit('ansi-output', readyToTransferLine('zmodem', 'download')); // express.e:15731-15740
  }

  console.log(`[ZMODEM-DL ${ctxId}] manager.start() — sending ZRQINIT next`);
  manager.start();
  console.log(`[ZMODEM-DL ${ctxId}] manager.start() returned, transferRawActive=${(session as any).transferRawActive}`);
}

/**
 * Handle S command - Display user statistics
 * 1:1 port from express.e:25540-25568 internalCommandS()
 */
export async function handleUserStatsCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:25542 - Check ACS_DISPLAY_USER_STATS permission
  if (!checkSecurity(session.user, ACSPermission.DISPLAY_USER_STATS)) {
    ErrorHandler.permissionDenied(socket, 'view user statistics', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25544 - setEnvStat(ENV_STATS)
setEnvStat(session, EnvStat.STATS);

  // express.e:25546 - aePuts('\b\n')
  // express.e:25546 - aePuts('\b\n') - just a newline, NO header
  socket.emit('ansi-output', '\r\n');

  // Display user statistics (express.e:25548-25598)
  // Format: [32mFieldName[33m:[0m value\b\n
  const user = session.user;

  // User Number (express.e:25550-25552) - only if USERNUMBER_LOGIN tooltype
  if (user.slotNumber !== undefined) {
    socket.emit('ansi-output', `\x1b[32mUser Number\x1b[33m:\x1b[0m ${user.slotNumber}\r\n`);
  }

  // Area Name (express.e:25554-25556) - only if TOGGLES_CONFRELATIVE=FALSE.
  // P3-1: this used to show unconditionally; SYS_RELATIVE_CONFS (relative
  // conference numbering) hides the absolute area name because it would
  // give away the caller's true (non-relative) conference position.
  if (user.conferenceAccess && !getConfRelativeToggle(session)) {
    socket.emit('ansi-output', `\x1b[32mArea Name  \x1b[33m:\x1b[0m ${user.conferenceAccess}\r\n`);
  }

  // Caller Number (express.e:25558)
  const callerNum = session.callerNum || 0;
  socket.emit('ansi-output', `\x1b[32mCaller Num.\x1b[33m:\x1b[0m ${callerNum}\r\n`);

  // Last Date On (express.e:25560-25562) — formatLongDateTime like Amiga
  if (user.timeLastOn) {
    const lastDate = formatLongDateTime(new Date(user.timeLastOn));
    socket.emit('ansi-output', `\x1b[32mLst Date On\x1b[33m:\x1b[0m ${lastDate}\r\n`);
  }

  // Security Level (express.e:25563)
  const secLevel = user.secLevel || 0;
  socket.emit('ansi-output', `\x1b[32mSecurity Lv\x1b[33m:\x1b[0m ${secLevel}\r\n`);

  // Times Called (express.e:25565) — timesCalled AND $FFFF
  const timesCalled = (user.timesCalled || 0) & 0xFFFF;
  socket.emit('ansi-output', `\x1b[32m# Times On \x1b[33m:\x1b[0m ${timesCalled}\r\n`);

  // Times Today (express.e:25567)
  // getTodaysCalls: 0 once the last call was on another day. `timesToday`
  // was a field nothing sets, so this always printed 0.
  const timesToday = getTodaysCalls(user);
  socket.emit('ansi-output', `\x1b[32mTimes Today\x1b[33m:\x1b[0m ${timesToday}\r\n`);

  // Messages Posted (express.e:25569) — messagesPosted AND $FFFF
  const msgsPosted = (user.messagesPosted || 0) & 0xFFFF;
  socket.emit('ansi-output', `\x1b[32mMsgs Posted\x1b[33m:\x1b[0m ${msgsPosted}\r\n`);

  // Online Baud (express.e:25571) - web connections use high speed
  const onlineBaud = (session as any).connectionSpeed || 115200;
  socket.emit('ansi-output', `\x1b[32mOnline Baud\x1b[33m:\x1b[0m ${onlineBaud}\r\n`);

  // Rate CPS UP (express.e:25573-25574)
  const upCPS = user.upCPS || 0;
  socket.emit('ansi-output', `\x1b[32mRate CPS UP\x1b[33m:\x1b[0m ${upCPS}\r\n`);

  // Rate CPS DN (express.e:25576-25577)
  const dnCPS = user.dnCPS || 0;
  socket.emit('ansi-output', `\x1b[32mRate CPS DN\x1b[33m:\x1b[0m ${dnCPS}\r\n`);

  // Screen Clear (express.e:25580) — IF loggedOnUserKeys.userFlags AND USER_SCRNCLR (bit 8)
  const screenClr = ((user.userFlags || 0) & 8) ? 'YES' : 'NO';
  socket.emit('ansi-output', `\x1b[32mScreen  Clr\x1b[33m:\x1b[0m ${screenClr}\r\n`);

  /**
   * Protocol (express.e:25583) - `xprTitle.item(loggedOnUser.xferProtocol)`,
   * the title of the protocol the caller chose.
   *
   * `xferProtocol` is the INT field of the on-disk user struct
   * (UserFileManager writes it via protocolToInt); the session's user is the
   * database record, which carries `protocol` as a string. So this read was
   * always undefined and every caller was told "Zmodem" whatever he had
   * picked at the W menu - including a Commodore caller on Punter.
   */
  const { PROTOCOL_DISPLAY_NAMES } = require('../../types');
  const chosenProtocol = (user as any).protocol || 'zmodem';
  const protocol = PROTOCOL_DISPLAY_NAMES[chosenProtocol] || String(chosenProtocol).toUpperCase();
  socket.emit('ansi-output', `\x1b[32mProtocol   \x1b[33m:\x1b[0m ${protocol}\r\n`);

  // Credit Account (express.e:25586-25594)
  // IF (checkSecurity(ACS_SHOW_PAYMENTS)) AND (loggedOnUser.creditDays>0)
  const creditDays = user.creditDays || 0;
  if (checkSecurity(session.user, ACSPermission.SHOW_PAYMENTS) && creditDays > 0) {
    const creditStartDate = user.creditStartDate || 0;
    const expirationTimestamp = creditStartDate + (creditDays * 86400 * 1000); // Convert days to ms
    const now = Date.now();
    if (expirationTimestamp > now) {
      // express.e:25588-25590: formatLongDate(creditStartDate + creditDays*86400)
      const expiresStr = formatLongDate(new Date(expirationTimestamp));
      socket.emit('ansi-output', `\x1b[32mCredit Account Expires\x1b[33m:\x1b[0m ${expiresStr}\r\n`);
    } else {
      // express.e:25592 - Credit account has expired
      socket.emit('ansi-output', '\x1b[31mCredit Account has EXPIRED\x1b[0m\r\n');
    }
  }

  // Sysop Here (express.e:25596)
  const sysopHere = isSysopAvailable() ? 'YES' : 'NO';
  socket.emit('ansi-output', `\x1b[32mSysop  Here\x1b[33m:\x1b[0m ${sysopHere}\r\n`);

  // Sysop Pages Remaining (express.e:25599-25601)
  // IF(pagesAllowed<>-1) THEN show pages remaining
  const pagesAllowed = session.pagesAllowed;
  if (pagesAllowed !== undefined && pagesAllowed !== -1) {
    socket.emit('ansi-output', `\x1b[32mSysop Pages Remaining\x1b[33m:\x1b[0m ${pagesAllowed}\r\n`);
  }

  // express.e:25604-25605 fileStatus(1), then a line break.
  const { fileStatus } = require('../file/file-status.handler');
  await fileStatus(socket, session, true, _conferences.length);
  socket.emit('ansi-output', '\r\n');
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Convert a user-relative conference number to an absolute (internal) conference number.
 * 1:1 port from express.e:8568-8581 getInverse()
 *
 * When sopt.toggles[TOGGLES_CONFRELATIVE]=TRUE, conference numbers shown to the user
 * are sequential across only the conferences they have access to. So user types "1"
 * meaning "first accessible conference", not conference ID 1.
 *
 * When CONFRELATIVE=FALSE (default), cn is returned unchanged (absolute numbering).
 *
 * express.e:8568  PROC getInverse(cn,force=FALSE)
 *   IF(cn<1) THEN RETURN 0
 *   IF (force=FALSE) AND (sopt.toggles[TOGGLES_CONFRELATIVE]=FALSE) THEN RETURN cn
 *   WHILE(i<cn)
 *     IF(j<cmds.numConf)
 *       IF(checkConfAccess(j+1)) THEN i++
 *     ELSE
 *       RETURN 0
 *     ENDIF
 *     j++
 *   ENDWHILE
 *   RETURN j
 *
 * @param cn            - User-visible (relative) conference number (1-based)
 * @param user          - User object (for checkConfAccess)
 * @param confRelative  - Value of sopt.toggles[TOGGLES_CONFRELATIVE]
 * @param force         - express.e's force=TRUE: count accessible conferences even when the toggle is off
 * @returns Absolute conference number, or 0 if out of range
 */
export function getInverse(cn: number, user: any, confRelative: boolean, force: boolean = false): number {
  // express.e:8571 - IF(cn<1) THEN RETURN 0
  if (cn < 1) return 0;
  // express.e:8572 - IF (force=FALSE) AND (sopt.toggles[TOGGLES_CONFRELATIVE]=FALSE) THEN RETURN cn
  if (!force && !confRelative) return cn;

  // Relative mode: walk accessible conferences until we've counted cn of them
  let i = 0; // count of accessible conferences visited so far
  let j = 0; // absolute conference index (0-based; j+1 = 1-based conf number)
  while (i < cn) {
    if (j < _conferences.length) {
      // express.e:8575 - IF(checkConfAccess(j+1)) THEN i++
      if (_checkConfAccess(user, j + 1)) {
        i++;
      }
    } else {
      // express.e:8577 - RETURN 0 (ran out of conferences)
      return 0;
    }
    j++;
  }
  // express.e:8581 - ENDPROC j (return absolute 1-based conf number)
  return j;
}

/**
 * The number a caller sees for conference `cn`: express.e relConf
 * (8558-8566). Under TOGGLES_CONFRELATIVE only the conferences he can enter
 * are counted; otherwise it is `cn` itself. getInverse is the other way.
 */
export function relConf(cn: number, user: any, confRelative: boolean = getConfRelativeToggle({} as BBSSession)): number {
  let count = 0;
  for (let i = 0; i < cn; i++) {
    if (!confRelative || _checkConfAccess(user, i + 1)) count++;
  }
  return count;
}

/**
 * sopt.toggles[TOGGLES_CONFRELATIVE]: express.e ACP.e:2693-2703 sets it when
 * the CONFCONFIG icon carries RELATIVE_CONFERENCES (presence = on). Read from
 * ConfConfig.info - where the live board and JoinCnf keep it - through the
 * same memoised reader the conference list comes from.
 * WEB_: ACP reads it once at start; this reads it per call (mtime-memoised),
 * so a sysop's edit applies without a restart.
 */
export function getConfRelativeToggle(session: BBSSession): boolean {
  try {
    const { config } = require('../../config');
    const { loadConfConfig } = require('../../services/conf-config.service');
    const bbsRoot = (session as any).bbsPath || config.get('dataDir') || process.cwd();
    return !!loadConfConfig(bbsRoot)?.relative;
  } catch {
    return false;
  }
}

/**
 * Handle J command - Join conference
 * 1:1 port from express.e:25113-25183 internalCommandJ()
 */
export async function handleJoinConferenceCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): Promise<void> {
  // express.e:25119 - Check ACS_JOIN_CONFERENCE permission
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    ErrorHandler.permissionDenied(socket, 'join conference', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25121 - saveMsgPointers(currentConf, currentMsgBase)
  // Save current conference read pointers BEFORE switching conferences.
  // Must happen here (not inside joinConference) — joinConference only
  // saves pointers for the NEW conference after a mail scan.
  if (session.user && session.currentConf && session.currentMsgBase) {
    try {
      saveConferenceAccount(session, session.currentConf);
      const confBase = await loadMsgPointers(session.user.id, session.currentConf, session.currentMsgBase);
      confBase.lastMsgReadConf = session.lastMsgReadConf || confBase.lastMsgReadConf;
      confBase.lastNewReadConf = session.lastNewReadConf || confBase.lastNewReadConf;
      await saveMsgPointers(confBase);
    } catch (err) {
      console.warn('[handleJoinConferenceCommand] saveMsgPointers error:', err);
    }
  }

  // express.e:25122 - setEnvStat(ENV_JOIN)
setEnvStat(session, EnvStat.JOIN);

  // express.e:25124-25136 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  let newConf = -1;
  let newMsgBase = 1;

  if (parsedParams.length > 0) {
    const param = parsedParams[0];

    // express.e:25129 - Check for "." separator (e.g., "3.2")
    if (param.includes('.')) {
      const parts = param.split('.');
      newConf = parseInt(parts[0], 10);
      newMsgBase = parseInt(parts[1], 10);
    } else {
      newConf = parseInt(param, 10);

      // express.e:25132-25133 - Second parameter is message base
      if (parsedParams.length > 1) {
        newMsgBase = parseInt(parsedParams[1], 10);
      }
    }
  }

  // express.e:25140 - newConf:=getInverse(newConf)
  // Converts user-relative conf number to absolute when CONFRELATIVE toggle is set.
  const confRelative = getConfRelativeToggle(session);
  newConf = getInverse(newConf, session.user, confRelative);

  // express.e:25140-25150 - Prompt for conference number if invalid
  const normalizedNameParam = normalizeForComparison(params);
  if ((newConf < 1 || newConf > _conferences.length) && normalizedNameParam) {
    const matchedConference = _conferences.find(conf => normalizeForComparison(conf.name) === normalizedNameParam);
    if (matchedConference) {
      newConf = matchedConference.id;
    }
  }

  if (newConf < 1 || newConf > _conferences.length) {
    // express.e:25143 displayScreen(SCREEN_JOINCONF): the screen if the
    // board has one, else nothing (6588-6590) - no list of its own.
    if (typeof _displayScreen === 'function') {
      await _displayScreen(socket, session, 'JOINCONF');
    } else {
      console.error('[user-commands] _displayScreen not initialized - dependencies may not be set');
    }

    // Clear any pagination state from displayScreen so the next input goes to
    // the conference number prompt, not a pause handler (express.e:25143-25145)
    session.paginatedScreen = undefined;
    session.lastScreenHadPause = false;

    // express.e:25144: 'Conference Number (1-N): ' — plain text
    socket.emit('ansi-output', `Conference Number (1-${_conferences.length}): `);

    // Set state to wait for conference number input
    // Disable MENU.keys single-key mode so numeric entry is not treated as shortcuts.
    session.cmdShortcuts = false;
    if (session.shortcuts) {
      session.shortcuts.clear();
    }
    session.subState = LoggedOnSubState.JOIN_CONF_INPUT;
    session.inputBuffer = '';
    return;
  }

  // express.e:25154-25160 - Check conference access
  if (!_checkConfAccess(session.user, newConf)) {
    // express.e:25157-25158: '\b\nYou do not have access to the requested conference\b\n\b\n' + RETURN FAILURE
    socket.emit('ansi-output', '\r\nYou do not have access to the requested conference\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:25162-25167 - Get conference message base count
  const confMessageBases = _messageBases.filter(mb => mb.conferenceId === newConf);
  const msgBaseCount = confMessageBases.length;

  // express.e:25169-25179 - Prompt for message base if invalid
  if (newMsgBase < 1 || newMsgBase > msgBaseCount) {
    if (typeof _displayScreen === 'function') {
      await _displayScreen(socket, session, 'CONF_JOINMSGBASE');
    }

    // Clear any pagination state from displayScreen so the next input goes to
    // the message base prompt, not a pause handler (express.e:25169-25179)
    session.paginatedScreen = undefined;
    session.lastScreenHadPause = false;

    // express.e:25173: 'Message Base Number (1-N): ' — plain text
    socket.emit('ansi-output', `Message Base Number (1-${msgBaseCount}): `);

    // Set state to wait for input (express.e:25169-25179)
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.tempData = {
      waitingForJoinMsgBase: true,
      newConf: newConf,
      msgBaseCount: msgBaseCount
    };
    return;
  }

  // express.e:25181 - joinConf(newConf, newMsgBase, FALSE, FALSE)
  const msgBaseId = confMessageBases[newMsgBase - 1].id;
  await _joinConference(socket, session, newConf, msgBaseId);

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle U command - Upload files
 * 1:1 port from express.e:25646-25658 internalCommandU()
 */
export async function handleUploadCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:25648 - Check ACS_UPLOAD permission
  if (!checkSecurity(session.user, ACSPermission.UPLOAD)) {
    ErrorHandler.permissionDenied(socket, 'upload files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25649 - setEnvStat(ENV_UPLOADING)
setEnvStat(session, EnvStat.UPLOADING);

  // express.e:25651-25655 - the node's BGFILECHECK decides whether this
  // upload is checked in the background.
  require('../../services/background-file-check.service').raiseBackgroundFileCheck(session);

  // express.e:25656 - uploadaFile(0, cmdcode, FALSE)
  await startUploadaFile(socket, session, false);
}

/**
 * uploadaFile(0, '', attach) for a procedure that waits for it: saveNewMSG's
 * X (express.e:10728) carries on from the line after the upload, with the
 * upload's result, however the upload ended (services/upload-end.service.ts).
 */
export async function uploadaFileAndWait(socket: any, session: BBSSession, attach: boolean): Promise<UploadStat> {
  const ended = awaitUploadEnd(session);
  await startUploadaFile(socket, session, attach);
  return ended;
}

/**
 * uploadaFile's opening (express.e:18966-19016): the NOUPLOADS refusal (not
 * for an attach), the UPLOAD screen, then the upload interface.
 */
async function startUploadaFile(socket: any, session: BBSSession, attach: boolean): Promise<void> {
  /*
   * NO CLEAR HERE. express.e:18981-19016 is the whole sequence and it clears
   * NOWHERE: NOUPLOADS, then SCREEN_UPLOAD, then the UPLOADING/space/filename
   * lines straight after it.
   *
   * A clear was added here on 2026-09-15 and taken out again the same day.
   * Two things were wrong with it. It is not what AmiExpress does - the sysop
   * asked for 1:1 once he saw the result - and it did not even land where it
   * was written: `emitText` BUFFERS, while `displayScreen` emits straight to
   * the socket, so a clear queued before the art flushed AFTER it. He watched
   * the upload art draw, get wiped, and the text appear on the empty screen.
   *
   * The mess that prompted it is handled where it belongs: each line of the
   * upload block erases the rest of its own row (`eraseRestOfLine`), so
   * nothing inherits the tail of whatever sat behind it, and the art the
   * conference supplies stays on screen exactly as express.e leaves it.
   */

  // express.e:18981 - IF displayScreen(SCREEN_NOUPLOADS) THEN RETURN.
  //
  // The screen EXISTING is the refusal: a conference closes its uploads by
  // having the file at all, and the caller is told why instead of being
  // dropped back at the menu with no explanation. Silent, because a
  // conference without the file is the normal case and not worth a log line.
  // express.e:18980 IF(attach=FALSE) - a message's X is not refused by it.
  const refused = !attach && await _displayScreen(socket, session, 'NOUPLOADS', true, true);
  if (refused) {
    endUpload(session, 'success', () => { session.subState = LoggedOnSubState.DISPLAY_MENU; });
    return;
  }

  // express.e:18986 - IF(uLFType=0) THEN displayScreen(SCREEN_UPLOAD). Both
  // callers are uLFType 0: the U command and a message's X (10728).
  // The command adds no pause of its own (express.e pauses after the DOWNLOAD
  // screen, not this one) - but the screen may carry one: the board's
  // uploadmsg.txt ends in `~SP`, and the interface below clears the screen.
  await _displayScreen(socket, session, 'UPLOADMSG', true, true);

  // express.e:25656 - uploadaFile(0, cmdcode, FALSE), once the screen is done.
  // Held behind the screen's `~SP` rather than drawn over it: run at once, it
  // cleared the art and the pause prompt, and the pause sat waiting unseen.
  const { continueAfterScreen } = require('../screen.handler');
  const deferred = await continueAfterScreen(
    socket, session, () => _displayUploadInterface(socket, session, ''), 'upload-screen',
  );
  // Out of the display flow while the pause is up, as the join does, so the
  // menu is not drawn under it; the interface sets its own state after.
  if (deferred) session.subState = LoggedOnSubState.READ_COMMAND;
}

/**
 * Display font selection menu
 * Web-specific feature
 */
export function displayFontSelectionMenu(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Select Font'));
  socket.emit('ansi-output', '\r\n');
  const rows: string[] = fontMenuRows();
  for (const row of rows) socket.emit('ansi-output', `${row}\r\n`);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize(`Selection (1-${rows.length} or Q to cancel): `, 'yellow'));
  session.subState = LoggedOnSubState.FONT_SELECTION;
}

/**
 * Handle conference join message base number input
 * Called when user is prompted for message base number during conference join
 */
export async function handleJoinMsgBaseInput(socket: any, session: BBSSession, input: string): Promise<void> {
  if (!session.tempData?.waitingForJoinMsgBase) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const { newConf } = session.tempData;

  // Clear waiting flag
  session.tempData.waitingForJoinMsgBase = false;

  // express.e:25177 - an empty answer returns without a word.
  if (input.trim() === '') {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:25178 Val(), then joinConf's clamp (4995): a number that is no
  // base of the conference - or no number at all - is base 1. The port
  // answered with invented "Invalid message base number" / "Message base not
  // found" lines and joined nothing.
  const confMessageBases = _messageBases.filter((mb: MessageBase) => mb.conferenceId === newConf);
  let msgBaseNum = parseInt(input, 10) || 0;
  if (msgBaseNum < 1 || msgBaseNum > confMessageBases.length) msgBaseNum = 1;

  // express.e:25121 - saveMsgPointers before switching (same guard as internalCommandJ)
  if (session.user && session.currentConf && session.currentMsgBase) {
    try {
      saveConferenceAccount(session, session.currentConf);
      const confBase = await loadMsgPointers(session.user.id, session.currentConf, session.currentMsgBase);
      confBase.lastMsgReadConf = session.lastMsgReadConf || confBase.lastMsgReadConf;
      confBase.lastNewReadConf = session.lastNewReadConf || confBase.lastNewReadConf;
      await saveMsgPointers(confBase);
    } catch (err) {
      console.warn('[handleJoinMsgBaseInput] saveMsgPointers error:', err);
    }
  }

  // Join conference with selected message base (express.e:25181)
  const msgBaseId = confMessageBases[msgBaseNum - 1]?.id ?? 1;
  await _joinConference(socket, session, newConf, msgBaseId);

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * COLOURS - which sixteen colours this caller's PETSCII screen is painted with.
 *
 * Only the 80-column screen has a choice: a C64 is a VIC-II by construction,
 * and a C128's 80-column screen has the VDC's own sixteen, which its KERNAL
 * maps the PETSCII colour bytes onto (sdk/petscii/c64-palette.ts). Bare, the
 * command toggles; `COLOURS VIC` / `COLOURS VDC` say which.
 *
 * The same setting is row 21 of `W`, which is where a caller looks for it.
 */
export async function handlePetsciiPaletteCommand(
  socket: any,
  session: BBSSession,
  params?: string,
): Promise<void> {
  const { db } = require('../../database');
  const { petsciiColumnsOf } = require('../../amiga-emulation/xim/screen-width.util');

  const asked = String(params ?? '').trim().toUpperCase();
  const current = session.user?.petsciiPalette === 'vic' ? 'vic' : 'vdc';
  const next = asked.startsWith('VIC') ? 'vic'
    : asked.startsWith('VDC') || asked.startsWith('C128') ? 'vdc'
    : current === 'vic' ? 'vdc' : 'vic';

  if (session.user) {
    try {
      await db.updateUser(session.user.id, { petsciiPalette: next });
      session.user.petsciiPalette = next;
    } catch (error) {
console.error('[COLOURS] could not save the palette preference:', error);
    }
  }

  // The canvas repaints from the machine it already has, so this costs no
  // session state and the change is visible at once.
  socket.emit('petscii-palette', { palette: next });
  socket.emit('ansi-output', `\r\nPETSCII colours: ${next === 'vdc' ? 'C128 (VDC)' : 'C64 (VIC-II)'}\r\n`);
  if (petsciiColumnsOf(session) !== 80) {
    socket.emit('ansi-output', 'Only the 80-column screen has a choice; a C64 is always VIC-II.\r\n');
  }
}

export async function handleFontSelectionInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const choice = input.trim().toUpperCase();

  if (choice === 'Q' || choice === '') {
    // Cancel, return to user stats menu
    await handleUserStatsCommand(socket, session);
    return;
  }

  const selectedFont: string | null = fontForChoice(choice);
  if (!selectedFont) {
    socket.emit('ansi-output', AnsiUtil.errorLine(`Invalid choice. Enter 1-${fontMenuRows().length} or Q to cancel.`));
    socket.emit('ansi-output', AnsiUtil.colorize('Selection: ', 'yellow'));
    return;
  }

  try {
    // The one path W row 18 takes too: saved, and on the screen now.
    const result = await chooseTerminalFont(socket, session, selectedFont);
    socket.emit('ansi-output', result === 'set'
      ? AnsiUtil.successLine(`Font changed to ${selectedFont}!`)
      : `\r\n${PETSCII_FONT_IS_FIXED}\r\n`);
  } catch (error) {
console.error('Error updating font preference:', error);
    socket.emit('ansi-output', AnsiUtil.errorLine('Error saving font preference.'));
  }
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

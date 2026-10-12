/**
 * File Upload/Download Socket Event Handlers
 * Handles file upload completion and download tracking events
 */

import * as fs from "fs";
import * as path from "path";
import { Socket } from "socket.io";
import { BBSSession, UploadSessionContext } from "../index";
import { LoggedOnSubState } from "../constants/bbs-states";
import { db } from "../database";
import { config } from "../config";
import {
  extractAndReadDiz,
  getNodeWorkDir,
  getPlaypenDir,
} from "../utils/file-diz.util";
import { dirListSize, formatUploadDate, descriptionPromptHead } from "../utils/file-upload.util";
import { testFile, TestResult } from "../utils/file-test.util";
import { moveUploadedFile, getConferenceDir } from "../utils/file-hold.util";
import { getStorageContext } from "../storage/storage-context";
import { pooledUploadArea, putUploadIntoPool } from "../storage/remote-upload";
import { storageFailureText } from "../storage/remote-download";
import type { RemoteLocation } from "../storage/remote-areas";
import { writeUploadToDirFile } from "../utils/dir-file.util";
import {
  doUploadNotify,
} from "../utils/upload-notify.util";
import {
  creditAccountTrackUploads,
  creditUploadToToday,
  updateUploadStats,
} from "../utils/download-ratios.util";
import {
  normalizeForComparison,
  sanitizeInput,
} from "../utils/input-normalizer.util";
import { fileUploadedFile } from "../services/upload-filing.service";
import { endUpload } from "../services/upload-end.service";
import { examineUpload } from "../services/upload-examine.service";
import { getSessionBySocketId } from "./session-manager";
import { onCaller } from "./socket-guard";
import { callersLog } from "./database-helpers";
import { SysopDebugUtil } from "../utils/sysop-debug.util";
import { emitUpload } from "../services/bbs-event-emitter";
import { getSystemTime } from '../utils/date-time.util';
import {
  getUploadContextById,
  deleteUploadContextById,
} from "./upload-session-store";
import { reportUpload } from '../achievements/sites';
import { getACSConfig, ToggleFlags } from '../utils/acs.util';


/**
 * Get upload context from single source of truth
 * Priority: session.tempData (current working context)
 */
function getUploadContext(session: BBSSession, socket: Socket): UploadSessionContext | null {
  // Priority 1: session.tempData (current working context)
  if (session.tempData?.uploadMode) {
    return session.tempData;
  }

  // Priority 2: uploadContext (backup reference)
  if (session.uploadContext?.uploadMode) {
    session.tempData = session.uploadContext;
    return session.uploadContext;
  }

  // Priority 3: stored context by socket ID
  const storedContext = getUploadContextById(socket.id);
  if (storedContext) {
    session.tempData = storedContext;
    session.uploadContext = storedContext;
    return storedContext;
  }

  return null;
}

function clearUploadContext(session: BBSSession, socket?: Socket) {
  const uploadId = session.uploadContext?.uploadSessionId || socket?.id;
  if (uploadId) {
    deleteUploadContextById(uploadId);
  }
  session.tempData = undefined;
  session.uploadContext = undefined;
}

/**
 * Handle DIZ extraction and description prompting
 * Shared logic for both file-upload and file-uploaded handlers
 * Returns true if file was processed, false if waiting for description input
 */
export async function handleDizExtractionAndDescription(
  socket: Socket,
  session: BBSSession,
  data: { filename: string; originalname: string; size: number; path?: string },
  config: any
): Promise<boolean> {
  const uploadContext = getUploadContext(session, socket);
  if (!uploadContext) {
    // T17 (2026-09-08): this silent return skips the whole prompt below —
    // a caller whose context went missing sees no rename prompt, no DIZ
    // question, nothing. Log it so the runtime log answers "did the prompt
    // even arm?" instead of leaving a gap.
    console.warn(`[DIZ] no upload context for "${data.originalname || data.filename}" — skipping DIZ/description AND rename prompt`);
    return false;
  }

  // express.e:19192-19256 — long-filename rename prompt.
  // Express prompts the user to rename when filename > 12 chars or
  // contains : / * space # + ? (express.e:19223). Without this the
  // entry written to DIRn has the status marker at the wrong column
  // (Amiga BBS format expects col 13) and AquaScan-class readers
  // silently skip it.
  if (data.path) {
    const { needsRename, startRenamePrompt } = require('../services/rename-prompt.service');
    if (needsRename(data.originalname || data.filename)) {
      // Defer DIZ/description until rename completes
      return await new Promise<boolean>((resolve) => {
        startRenamePrompt(socket, session, data.path!, async (result: any) => {
          if (result.aborted) {
            clearUploadContext(session, socket);
            endUpload(session, 'failure', () => {
              session.subState = LoggedOnSubState.DISPLAY_MENU;
              session.menuPause = true;
            });
            resolve(true);
            return;
          }
          // Update the upload data record to the renamed file then
          // continue with the standard DIZ/description flow.
          data.filename = result.newFilename;
          data.originalname = result.newFilename;
          data.path = result.newPath;
          const cont = await handleDizExtractionAndDescription(socket, session, data, config);
          resolve(cont);
        });
      });
    }
  }

  // Check if we already have a file pending description
  if (!uploadContext.currentUploadedFile) {
    uploadContext.currentUploadedFile = {
      filename: data.originalname,
      path: data.path,
      size: data.size,
    };

    // express.e:19257-19300 examines the file without a word; its only
    // text is the description prompt.

console.log("[DIZ] File selected, checking for DIZ...");

    // Try to extract FILE_ID.DIZ
    if (data.path) {
      try {
        const nodeWorkDir = getNodeWorkDir(0, config.get("dataDir"));
        // express.e:19579 - the board's SysCmd EXAMINE door first (File
        // Description and its kin write the description themselves); the
        // built-in FILE_ID.DIZ reader when there is none.
        const examined = await examineUpload(socket, session, data.path, path.basename(data.path), 10);

        const dizPromise = examined
          ? Promise.resolve(examined)
          : extractAndReadDiz(data.path, nodeWorkDir, [], 10);
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 10000)
        );
        const dizLines = await Promise.race([dizPromise, timeoutPromise]);

        if (dizLines && dizLines.length > 0) {
          // Found FILE_ID.DIZ - use it as description
          uploadContext.hasDiz = true;
          uploadContext.skipDizExtraction = true;
          return fileWithDescription(socket, session, uploadContext, data, dizLines, config);
        } else {
          // No DIZ found (null from timeout or no file).
          /*
           * DESCRIBED BEFORE THE TRANSFER: XMODEM's batch takes the name and
           * the description first (express.e:17666-17720), because the
           * protocol carries no name. Asking again after the transfer threw
           * the first answer away (walked over telnet, 2026-09-27).
           */
          const typed = uploadContext.describedBefore?.[data.originalname.toUpperCase()];
          if (typed && typed.length > 0) {
            return fileWithDescription(socket, session, uploadContext, data, typed, config);
          }
          promptForDescription(socket, uploadContext, data);
          return false; // Waiting for description
        }
      } catch (error: any) {
console.error("[DIZ] Extraction error:", error);
        // A file EXAMINE cannot read is described by the caller, silently.
        promptForDescription(socket, uploadContext, data);
        return false; // Waiting for description
      }
    } else {
      // No path - prompt for description
      promptForDescription(socket, uploadContext, data);
      return false;
    }
  }

  // File already pending description from previous attempt
  // This happens if user tried upload, got error, then tried again
console.log("[DIZ] File already pending from previous attempt, prompting for description");
  promptForDescription(socket, uploadContext, data);
  return false; // Waiting for description (not processed yet)
}

/**
 * File an upload whose description is already known - a FILE_ID.DIZ, or the
 * lines the caller typed before an XMODEM transfer - without asking.
 */
async function fileWithDescription(
  socket: Socket,
  session: BBSSession,
  uploadContext: UploadSessionContext,
  data: { filename: string; originalname: string; size: number; path?: string },
  lines: string[],
  config: any,
): Promise<boolean> {
  uploadContext.currentDescription = lines;
  uploadContext.uploadBatch.push({
    filename: data.originalname,
    description: lines.join("\n"),
    isPrivate: lines[0]?.startsWith("/") ?? false,
  });

  // Use sequential counter instead of array length
  uploadContext.currentUploadIndex = uploadContext.filesProcessedCount || 0;
  uploadContext.filesProcessedCount = (uploadContext.filesProcessedCount || 0) + 1;

  // Process file immediately (with error recovery)
  try {
    await processBatchFile(socket, session, data, config);
    return true; // File processed successfully
  } catch (error: any) {
console.error("[UPLOAD] Error filing an upload with a known description:", error);
    socket.emit("ansi-output", `\r\n\x1b[31mUpload failed: ${error.message}\x1b[0m\r\n`);
    clearUploadContext(session, socket);
    endUpload(session, 'failure', () => {
      // WEB_: the error line above is the port's own (no express.e
      // counterpart); the menu and its pause follow, as after any command.
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    });
    return true; // Handled (with error), don't wait for description
  }
}

/**
 * Prompt user for file description
 * Shared helper to avoid code duplication
 * NOTE: Caller must set session.subState = UPLOAD_DESC_INPUT after calling this
 */
function promptForDescription(
  socket: Socket,
  uploadContext: UploadSessionContext,
  data: { filename: string; originalname: string; size: number; path?: string }
): void {
  const maxDescLines = 10;
  const sizeStr = dirListSize(data.size);
  const dateStr = formatUploadDate(getSystemTime());
  const filename13 = data.originalname.substring(0, 13).padEnd(13);

  // express.e:17720: '\b\nPlease enter a description, you only have \d lines.'
  socket.emit("ansi-output", descriptionPromptHead(maxDescLines));
  socket.emit("ansi-output", `${filename13}${sizeStr}  ${dateStr} :`);

  uploadContext.currentDescription = [];
  uploadContext.maxDescLines = maxDescLines;
  uploadContext.descLineCount = 0;
  uploadContext.currentLineBuffer = ""; // Clear any buffered input

  // Switch to line input mode (disable hotkeys)
  socket.emit("set-input-mode", "line");

  // NOTE: session.subState must be set by CALLER (this function doesn't have access to session)
}

/**
 * Process batch file - handles file testing, database entry, and stats updates
 * Exported for use by command.handler.ts when processing uploads after description entry
 */
export async function processBatchFile(
  socket: Socket,
  session: BBSSession,
  data: { filename: string; originalname: string; size: number; path?: string },
  config: any
) {
  const uploadContext = getUploadContext(session, socket);
  if (!uploadContext) {
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31mError: Upload session lost\x1b[0m\r\n"
    );
    clearUploadContext(session, socket);
    endUpload(session, 'failure', () => {
      // WEB_: the error line above is the port's own (no express.e
      // counterpart); the menu and its pause follow, as after any command.
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    });
    return;
  }

  // Original batch upload mode or processing after description
  const fileArea = uploadContext.fileArea;

  // Use sequential counter instead of array index (fixes off-by-one bugs)
  const currentIndex = uploadContext.currentUploadIndex || 0;
  let currentFile = uploadContext.uploadBatch[currentIndex];

  // Increment files processed counter for tracking
  if (!uploadContext.filesProcessedCount) {
    uploadContext.filesProcessedCount = 0;
  }

  // If batch is empty (user pressed blank line at FileName prompt without naming a file),
  // synthesize an entry from the actual upload data. ZMODEM behaviour: filename comes
  // from the protocol, not from the user's pre-listing.
  if (!currentFile) {
    const actualName = data.originalname || data.filename || `upload_${Date.now()}.dat`;
    currentFile = { filename: actualName, description: '' } as any;
    if (!uploadContext.uploadBatch) uploadContext.uploadBatch = [];
    uploadContext.uploadBatch[currentIndex] = currentFile;
  }

  const currentFilename = sanitizeInput(currentFile.filename);
  currentFile.filename = currentFilename;
  const normalizedFilename = normalizeForComparison(currentFilename);

  try {
    // Track upload stats
    if (!session.tempData.uploadedFiles) session.tempData.uploadedFiles = 0;
    if (!session.tempData.uploadedBytes) session.tempData.uploadedBytes = 0;

    session.tempData.uploadedFiles++;
    session.tempData.uploadedBytes += data.size;

    // Extract FILE_ID.DIZ and test file (express.e:19258-19370)
    let finalDescription = currentFile.description;
    // Achievements (SP2): a description lifted from FILE_ID.DIZ is not one the caller wrote.
    let descriptionFromDiz = false;
    let testStatus = TestResult.NOT_TESTED;
    // express.e rzmsg: a message's X (session.rzmsg) - see upload-filing's
    // fileIntoMessage. A leading `/` makes no private upload of it (19361).
    const rzmsg = session.rzmsg;
    let fileStatus: "active" | "private" | "hold" = currentFile.isPrivate && !rzmsg
      ? "private"
      : "active";

    if (data.path) {
      const nodeWorkDir = getNodeWorkDir(0, config.get("dataDir")); // Node0/Work

      // Extract FILE_ID.DIZ (express.e:19258-19285) - skip if already extracted
      if (!session.tempData.skipDizExtraction) {
console.log(
          `[FILE_ID.DIZ] Attempting extraction for ${currentFile.filename}`
        );
        try {
          // express.e:19579 - SysCmd EXAMINE first, the built-in reader when
          // the board has none. The door is interactive and has its own
          // timeout; the 10 seconds below are the built-in reader's.
          const examined = await examineUpload(socket, session, data.path, path.basename(data.path), 10);
          const dizPromise = examined
            ? Promise.resolve(examined)
            : extractAndReadDiz(data.path, nodeWorkDir, [], 10);
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10000)
          );
          const dizLines = await Promise.race([dizPromise, timeoutPromise]);

          if (dizLines && dizLines.length > 0) {
            finalDescription = dizLines.join("\n");
            descriptionFromDiz = true;
console.log(
              `[FILE_ID.DIZ] Using FILE_ID.DIZ content (${dizLines.length} lines)`
            );
          } else {
console.log(
              `[FILE_ID.DIZ] No FILE_ID.DIZ found or timed out, using batch description`
            );
          }
        } catch (error) {
console.error(`[FILE_ID.DIZ] Extraction error:`, error);
        }
      } else {
console.log(`[FILE_ID.DIZ] Skipping extraction - already done`);
      }

      // Test file integrity (express.e:19348-19354) - not for rzmsg (19350).
      if (!rzmsg) {
        socket.emit(
          "ansi-output",
          `\r\nTesting... ${currentFile.filename}...\r\n`
        );
        try {
          // Add 15 second timeout to prevent hanging on file tests
          const testPromise = testFile(data.path, nodeWorkDir);
          const timeoutPromise = new Promise<TestResult>((resolve) =>
            setTimeout(() => resolve(TestResult.NOT_TESTED), 15000)
          );
          testStatus = await Promise.race([testPromise, timeoutPromise]);
console.log(`[testFile] Result: ${testStatus}`);

          if (
            testStatus === TestResult.SUCCESS ||
            testStatus === TestResult.NOT_TESTED
          ) {
            socket.emit("ansi-output", "\r\nTested Ok...\r\n");
          } else if (testStatus === TestResult.FAILURE) {
            // express.e:19366-19367, one aePuts.
            const { boardSysopName } = require("../utils/sysop-page-text.util");
            socket.emit(
              "ansi-output",
              `Requires review, possibly bad format\r\n\t  Moving to ${boardSysopName()}'s private Directory.\r\n\r\n`
            );
            fileStatus = "hold"; // Mark for HOLD directory (express.e:19364-19369)
          }
        } catch (error) {
console.error(`[testFile] Error:`, error);
          testStatus = TestResult.NOT_TESTED;
          // express.e:19351: a test that did not run is "Tested Ok".
          socket.emit("ansi-output", "\r\nTested Ok...\r\n");
        }
      }
    }

    // Determine file checked status marker (express.e:19410-19419)
    let checkedMarker: "P" | "F" | "N" | "D" = "N";
    if (testStatus === TestResult.SUCCESS) {
      checkedMarker = "P"; // Passed
    } else if (testStatus === TestResult.FAILURE) {
      checkedMarker = "F"; // Failed
    } else {
      checkedMarker = "N"; // Not tested
    }

    // FILED BY THE SHARED SERVICE.
    //
    // The duplicate rule, the pooled put, the HOLD quarantine, the catalogue
    // row, the DIR entry, FILES.BBS and ctop.data all moved to
    // `services/upload-filing.service.ts`, because FTP needs every one of
    // them and none of this front end's socket, upload context or substates.
    // Two implementations of "file an upload" would drift, and the caller who
    // uploaded the other way would get different duplicate handling.
    //
    // What stays here is what is genuinely this front end's: saying on the
    // caller's screen what happened to his file.
    // express.e:19398-19400
    if (rzmsg) socket.emit("ansi-output", "\r\nMoving to message base file directory.\r\n");
    const filing = await fileUploadedFile({
      playpenPath: data.path,
      filename: currentFile.filename,
      size: data.size,
      description: finalDescription,
      fileArea: fileArea as any,
      conferenceId: session.currentConf,
      nodeId: session.nodeId || 1,
      uploader: {
        username: session.user!.username,
        location: (session.user as any).location || '',
        slotNumber: (session.user as any).slotNumber,
      },
      initialStatus: fileStatus,
      marker: checkedMarker as 'P' | 'F' | 'N',
      rzmsg: rzmsg ? { dir: rzmsg.dir } : undefined,
    });

    for (const notice of filing.notices) {
      const colour = notice.kind === 'storage-failure' ? '31' : '33';
      socket.emit('ansi-output', `\r\n\x1b[${colour}m${notice.text}\x1b[0m\r\n`);
    }

    const foundDupe = filing.duplicate;
    const quarantineFailed = filing.orphaned;
    fileStatus = filing.status;
    checkedMarker = filing.marker;

    // The upload is the caller's, in memory (express.e:19380-19382 uploads+1,
    // 19442-19446 the bytes): loggedOnUser, which under ACS_CONFERENCE_
    // ACCOUNTING holds the CURRENT conference's counters (loadMsgPointers
    // 4893-4905) and goes back into that conference's Conf.DB record at the
    // next saveMsgPointers (4929-4939). The record reaches user.data at
    // logoff (8207) - not here, and not from the row.
    //
    // Gated on !quarantineFailed too: when the pooled put AND the fallback
    // HOLD quarantine both failed the file exists nowhere but the playpen,
    // and crediting the caller's ratio/byte count for it would be paying out
    // for a file nobody can ever download.
    // express.e:19524-19532: the bytes received raise today's download
    // limit - every file the protocol brought in (uTBT, 16822), kilobytes
    // under CREDITBYKB. A file lost to a dropped carrier goes to LCFILES
    // (socket-handlers, lcfile) and never reaches here, which is E's
    // `lcfile=FALSE` gate.
    creditUploadToToday(session.user!, getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
      ? Math.floor(data.size / 1024) & 0x003fffff
      : data.size);

    const trackUploads = creditAccountTrackUploads(session.user!);
    if (rzmsg) {
      // A message's file earns the upload count (19377-19380) and nothing
      // else: no bytes (19442 `rzmsg=NIL`), no listing, no announcement.
      if (trackUploads && !foundDupe) {
        session.user!.uploads = (session.user!.uploads || 0) + 1;
      }
    }
    if (trackUploads && !foundDupe && !quarantineFailed && !rzmsg) {
      // Update CPS tracking on user object using real transfer speed from frontend
      const realUploadCPS = session.tempData?.lastUploadCPS || undefined;
      await updateUploadStats(session.user!, data.size, realUploadCPS);

      await db.run(
        "UPDATE user_stats SET bytes_uploaded = bytes_uploaded + $1, files_uploaded = files_uploaded + 1 WHERE user_id = $2",
        [data.size, session.user!.id]
      );

      // express.e:19444 CREDITBYKB books kilobytes.
      const booked = getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
        ? Math.floor(data.size / 1024) & 0x003fffff
        : data.size;
      session.user!.uploads = (session.user!.uploads || 0) + 1;
      session.user!.bytesUpload = (session.user!.bytesUpload || 0) + booked;
    }

    // Log file upload (express.e:9493 callersLog)
    // Express.e: Only log successful uploads (not duplicates)
    // Also skipped when quarantineFailed: the file was never filed anywhere.
    if (!foundDupe && !quarantineFailed && !rzmsg) {
      await callersLog(
        session.user!.id,
        session.user!.username,
        "Uploaded file",
        currentFile.filename
      );
    }

    // Emit BBS event for LiveChat integration
    // Express.e: Only emit events for successful uploads (not duplicates)
    // Also skipped when quarantineFailed: other users must not see an
    // announcement for a file that can never be listed or fetched.
    if (!foundDupe && !quarantineFailed && !rzmsg) {
      try {
        const conference = await db.getConferenceById(session.currentConf);
        emitUpload({
          username: session.user!.username,
          nodeId: session.nodeId || 1,
          fileName: currentFile.filename,
          fileSize: data.size,
          conferenceId: session.currentConf,
          conferenceName: conference?.name,
          timestamp: Date.now(),
        });
      } catch (error) {
console.error("[BBSEvent] Error emitting upload event:", error);
      }
    }

    // Trigger webhook for file upload
    // Express.e: Only trigger webhooks for successful uploads (not duplicates)
    // Also skipped when quarantineFailed: an external webhook consumer must
    // not be told a file exists that does not.
    if (!foundDupe && !quarantineFailed && !rzmsg) {
      try {
        const { webhookService, WebhookTrigger } = await import(
          "../services/webhook.service"
        );
        const conference = await db.getConferenceById(session.currentConf);

        await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, {
          username: session.user!.username,
          userId: session.user!.id,
          gdprConsented: !!(session.user as any)?.gdprConsentAt,
          filename: currentFile.filename,
          filesize: data.size,
          conference: conference?.name || "Unknown",
          description: finalDescription.substring(0, 100),
        });
      } catch (error) {
console.error("[Webhook] Error sending file upload webhook:", error);
      }
    }
    // Achievements (SP2): the upload, the description, the ratio. Non-throwing.
    if (!foundDupe && !quarantineFailed && !rzmsg) reportUpload(session as any, data.size, finalDescription, descriptionFromDiz);

    // Clear currentUploadedFile so next file can be processed
    // This is critical for batch uploads - without this, subsequent files are ignored
    session.tempData.currentUploadedFile = undefined;
    session.tempData.currentDescription = undefined;
    session.tempData.hasDiz = false;
    session.tempData.skipDizExtraction = false;

    // In web upload mode, frontend tracks ALL pending files and signals when batch is complete
    // Backend only knows about files one at a time, so we can't check uploadBatch length
    // Instead, ALWAYS request next file and let frontend emit 'upload-batch-complete' when done

    // Check if this is web upload mode (vs batch upload where backend knows all files upfront)
    const isWebUploadMode = uploadContext.webUploadMode;

    if (!isWebUploadMode) {
      // Batch upload mode - backend knows all files upfront, can check if last
      const currentIndex = uploadContext.currentUploadIndex || 0;
      const totalFiles = uploadContext.uploadBatch?.length || 0;
      const isLastFile = currentIndex >= totalFiles - 1;

      if (isLastFile) {
        // This was the last file in batch - auto-complete
console.log("[Upload] Last file in batch upload, auto-completing");
        await handleUploadBatchComplete(socket, session);
        return;
      }
    }

    // ZMODEM batch continuation: rz already received all files into
    // the playpen and we queued the rest in pendingZmodemFiles. Don't
    // pop the browser file picker — instead pull the next file off the
    // queue and walk it through DIZ/description like the first one.
    if (
      isWebUploadMode &&
      Array.isArray(uploadContext.pendingZmodemFiles) &&
      uploadContext.pendingZmodemFiles.length > 0
    ) {
      const next = uploadContext.pendingZmodemFiles.shift();
      let nextSize = 0;
      try {
        nextSize = require("fs").statSync(next.path).size;
      } catch {
        /* file already moved or missing — handleDiz will surface */
      }
      await handleDizExtractionAndDescription(
        socket,
        session,
        {
          filename: next.name,
          originalname: next.name,
          size: nextSize,
          path: next.path,
        },
        config
      );
      // Only set UPLOAD_DESC_INPUT if the batch is still active.
      // handleDizExtractionAndDescription calls processBatchFile for the last
      // file when FILE_ID.DIZ is found, which clears tempData and sets
      // subState=DISPLAY_MENU via handleUploadBatchComplete→runPostUpload.
      // Overwriting that would put the session in UPLOAD_DESC_INPUT with
      // tempData=undefined → TypeError: Cannot read properties of undefined
      // (reading 'currentLineBuffer') on the next keypress.
      if (session.tempData) {
        session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
      }
      return;
    }

    // End of ZMODEM batch: no queue OR queue exhausted — wrap up.
    if (isWebUploadMode && Array.isArray(uploadContext.pendingZmodemFiles)) {
      await handleUploadBatchComplete(socket, session);
      return;
    }

    // Legacy fall-through (HTTP picker path) — unreachable after the
    // ZMODEM unification (c67e50385). All web uploads now enter via
    // `transfer-raw:init` + pendingZmodemFiles; both branches above
    // handle continuation and end-of-batch. Kept as a defensive
    // assertion so an unintended caller surfaces immediately.
    console.warn(
      "[processBatchFile] unexpected fall-through — no pendingZmodemFiles and not batch-upload. Completing.",
    );
    await handleUploadBatchComplete(socket, session);
    return;
  } catch (error: any) {
console.error("File upload error:", error);

    // Show specific error message to user
    const errorMessage = error.message || "Unknown database error";
    socket.emit(
      "ansi-output",
      `\r\n\x1b[31mUpload failed: ${errorMessage}\x1b[0m\r\n`
    );
    clearUploadContext(session, socket);
    endUpload(session, 'failure', () => {
      // WEB_: the error line above is the port's own (no express.e
      // counterpart); the menu and its pause follow, as after any command.
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    });
  }
}

/**
 * Handle upload batch complete event from frontend
 * This is emitted when the frontend has no more files to upload
 */
export async function handleUploadBatchComplete(
  socket: Socket,
  session: BBSSession
) {
  if (!session.tempData) {
console.log("[Upload] No upload context for batch complete");
    return;
  }

  // Defer all post-receive work to the shared runPostUpload service.
  // See post-upload.service.ts — web/telnet/SSH all funnel through
  // the same pipeline so behaviour stays in sync.
  const goodbyeAfter = !!(session.tempData?.goodbyeAfterTransfer);
  const { runPostUpload } = require('../services/post-upload.service');
  await runPostUpload(socket, session, {
    uploadStartTime: session.tempData.uploadStartTime,
    uploadedFiles: session.tempData.uploadedFiles || 0,
    uploadedBytes: session.tempData.uploadedBytes || 0,
    goodbyeAfter,
    onCleanup: () => clearUploadContext(session, socket),
  });
}

/**
 * Process multipart-HTTP upload completion. After Phase 4 cleanup
 * (c67e50385 + follow-ups) this is reached ONLY via `file-upload-ready`
 * from the TypeScript-doors `BBSApi.requestArchiveUpload()` flow —
 * the BBS-user upload path is now ZMODEM-only. The previous "regular
 * file upload to file area" branches were dead and have been removed.
 */
/** The door-upload completion, for its test: same function the socket event runs. */
export function processDoorUploadForTest(
  session: BBSSession,
  data: { filename: string; size: number; path?: string },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../config');
  return processFileUpload({} as Socket, session, config, { originalname: data.filename, ...data });
}

async function processFileUpload(
  socket: Socket,
  session: BBSSession,
  config: any,
  data: { filename: string; originalname: string; size: number; path?: string }
) {
  // Door archive upload — TypeScript-doors `requestArchiveUpload()` sets
  // pendingDoorUpload before emitting `show-file-upload`; this is the
  // sole live caller of processFileUpload after Phase 4.
  if (session.pendingDoorUpload) {
    // The file the board saved for this session's ticketed upload
    // (routes-setup /api/upload) - never `data.path`: that is whatever the
    // browser says, and copying from it copied any file on the server.
    const savedPath = session.doorUploadSavedPath;
    session.doorUploadSavedPath = undefined;
    if (savedPath && fs.existsSync(savedPath)) {
      const archivesDir = path.join(config.get('dataDir'), 'Doors', 'archives');
      fs.mkdirSync(archivesDir, { recursive: true });
      const archiveName = path.basename(savedPath);
      const destPath = path.join(archivesDir, archiveName);
      fs.copyFileSync(savedPath, destPath);
      session.pendingDoorUploadCallback?.({ path: destPath, filename: archiveName });
    } else {
      session.pendingDoorUploadReject?.(new Error('Upload failed: no file path received'));
    }
    return;
  }

  // DoorManager admin UI uses /api/upload/door + its own socket
  // listener; if processFileUpload runs while inDoorManager, the admin
  // UI's own handler will pick this up — skip silently.
  if (session.inDoorManager) {
    console.log('[processFileUpload] Door Manager active, deferring to its handler');
    return;
  }

  // Anything else is an unexpected caller post-Phase-4. Loudly surface
  // it so a stray emitter or new flow trips a visible error instead of
  // silently dropping the file.
  console.warn(
    '[processFileUpload] unexpected invocation outside pendingDoorUpload / DoorManager. Ignoring.',
    { filename: data.filename, hasPath: !!data.path },
  );
}

/**
 * Register file upload/download socket event handlers
 */
export function registerFileHandlers(socket: Socket) {
  if (!getSessionBySocketId(socket.id)) return;
  // Each event finishes an upload or download FOR a logged-on caller, so each
  // is registered through onCaller (server/socket-guard.ts) and acts on the
  // session that gives it - the caller's own, read when the event arrives.

  // Legacy `file-upload` (socket-body JSON-encoded byte array) and
  // `file-uploaded` (never emitted by any current frontend) socket
  // handlers were removed in the Phase 4 cleanup. BBS user file
  // uploads route through ZMODEM/lrzsz via `transfer-raw:*` now;
  // door-archive uploads (TypeScript-doors `requestArchiveUpload()`)
  // keep using `file-upload-ready` below.

  // Multipart-HTTP completion notification (BBSApi door archive flow).
  //
  // Frontend POSTs the file to /api/upload (multer saves to playpen and
  // returns {filename, path, size}) then emits this small event with
  // just the metadata. No file body on the websocket → no buffer
  // pressure.
  onCaller(
    socket,
    "file-upload-ready",
    async (session: BBSSession, data: {
      filename: string;
      originalname?: string;
      size: number;
      path: string;
      uploadStartTime?: number;
    }) => {
      const receiveTime = Date.now();
console.log(
        "[file-upload-ready] HTTP-uploaded file ready:",
        data.filename,
        data.size,
        "bytes at",
        data.path
      );

      // Same CPS calculation as the legacy path so download-stats parity holds.
      let uploadCPS = 0;
      if (data.uploadStartTime && data.size > 0) {
        const durationMs = receiveTime - data.uploadStartTime;
        const durationSec = durationMs / 1000;
        uploadCPS = durationSec > 0 ? Math.floor(data.size / durationSec) : 0;
console.log(
          `[file-upload-ready] Transfer time: ${durationMs}ms, CPS: ${uploadCPS}`
        );
      }
      if (!session.tempData) {
        session.tempData = {} as any;
      }
      session.tempData.lastUploadCPS = uploadCPS;

      try {
        // `data.path` is the browser's word and is not consulted: the file
        // is the one /api/upload saved for this session's ticket
        // (processFileUpload). Testing it here told any socket whether a
        // path it named existed on the server (open-surface audit).
        await processFileUpload(socket, session, config, {
          filename: data.filename,
          originalname: data.originalname || data.filename,
          size: data.size,
          path: data.path,
        });
      } catch (error: any) {
        SysopDebugUtil.debugFileError(socket, session, "process", data.path, error);
        socket.emit(
          "ansi-output",
          `\r\n\x1b[31mError processing uploaded file: ${error.message}\x1b[0m\r\n`
        );
      }
    }
  );

  // Handle upload batch complete from frontend
  // Frontend emits this when all pending files have been uploaded
  onCaller(socket, "upload-batch-complete", async (session: BBSSession) => {
console.log(
      "[upload-batch-complete] Frontend signaled batch upload complete"
    );
    await handleUploadBatchComplete(socket, session);
  });

  // `file-download-complete` is not heard. It wrote the BROWSER's own CPS
  // figure into the caller's top-download record (topDownloadCPS, user.keys
  // dnCPS2), so any caller could put any number on the CPS top list. In
  // express.e the record is the board's measurement - bytes sent over the
  // transfer time the board itself timed (15946-15953), kept when it beats
  // dnCPS2 (15184-15189) - and this port books exactly that for a browser
  // download in runPostDownload (services/post-download.service.ts,
  // express.e:20271-20275). The browser's report is not the board's figure.

  // `file-uploaded` socket handler removed in Phase 4 — no frontend
  // (web, packages/terminal, or admin) emits this event in current
  // code. DoorManager has its own `file-uploaded` listener for the
  // legacy door-manager UI and is left intact.

  // Handle upload cancellation — reject any pending door archive upload Promise
  onCaller(socket, 'upload-cancelled', (session: BBSSession) => {
    if (session.pendingDoorUpload) {
      session.pendingDoorUploadReject?.(new Error('Upload cancelled by user'));
    }
  });

}

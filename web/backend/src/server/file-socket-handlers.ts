/**
 * File Upload/Download Socket Event Handlers
 * Handles file upload completion and download tracking events
 */

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
import { formatFileSize, formatUploadDate } from "../utils/file-upload.util";
import { testFile, TestResult } from "../utils/file-test.util";
import { moveUploadedFile, getConferenceDir } from "../utils/file-hold.util";
import { writeUploadToDirFile } from "../utils/dir-file.util";
import { getMaxDirs } from "../utils/max-dirs.util";
import {
  updateSysopUploadStats,
  doUploadNotify,
} from "../utils/upload-notify.util";
import {
  creditAccountTrackUploads,
  updateUploadStats,
} from "../utils/download-ratios.util";
import {
  normalizeForComparison,
  sanitizeInput,
} from "../utils/input-normalizer.util";
import { getSessionBySocketId } from "./session-manager";
import { callersLog } from "./database-helpers";
import { SysopDebugUtil } from "../utils/sysop-debug.util";
import { emitUpload } from "../services/bbs-event-emitter";
import { userFileManager } from "../services/UserFileManager";
import { getSystemTime } from '../utils/date-time.util';
import {
  getUploadContextById,
  deleteUploadContextById,
} from "./upload-session-store";

/**
 * Helper function to load conferences for stats tracking
 */
async function loadConferences(session: any, database: any) {
  if (session.conferences && Array.isArray(session.conferences)) {
    return session.conferences;
  }
  try {
    // Use db's delegated method instead of creating new repository
    const confs = await database.getConferences();
    session.conferences = confs;
    return confs;
  } catch (err) {
console.error("[Upload] Failed to load conferences for accounting", err);
    return undefined;
  }
}

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
async function handleDizExtractionAndDescription(
  socket: Socket,
  session: BBSSession,
  data: { filename: string; originalname: string; size: number; path?: string },
  config: any
): Promise<boolean> {
  const uploadContext = getUploadContext(session, socket);
  if (!uploadContext) {
    return false;
  }

  // Check if we already have a file pending description
  if (!uploadContext.currentUploadedFile) {
    uploadContext.currentUploadedFile = {
      filename: data.originalname,
      path: data.path,
      size: data.size,
    };

    socket.emit(
      "ansi-output",
      `\r\n\x1b[32mFile selected: ${data.originalname}\x1b[0m\r\n`
    );
    socket.emit(
      "ansi-output",
      `\x1b[32mSize: ${Math.ceil(data.size / 1024)}KB\x1b[0m\r\n\r\n`
    );

console.log("[DIZ] File selected, checking for DIZ...");

    // Try to extract FILE_ID.DIZ
    if (data.path) {
      try {
        const nodeWorkDir = getNodeWorkDir(0, config.get("dataDir"));
        socket.emit("ansi-output", "Checking for FILE_ID.DIZ...\r\n");

        const dizPromise = extractAndReadDiz(data.path, nodeWorkDir, [], 10);
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 10000)
        );
        const dizLines = await Promise.race([dizPromise, timeoutPromise]);

        if (dizLines && dizLines.length > 0) {
          // Found FILE_ID.DIZ - use it as description
          socket.emit(
            "ansi-output",
            "\x1b[36m[FILE_ID.DIZ found - using as description]\x1b[0m\r\n\r\n"
          );

          uploadContext.currentDescription = dizLines;
          uploadContext.hasDiz = true;
          uploadContext.skipDizExtraction = true;

          // Add to upload batch and process immediately
          uploadContext.uploadBatch.push({
            filename: data.originalname,
            description: dizLines.join("\n"),
            isPrivate: false,
          });

          // Use sequential counter instead of array length
          uploadContext.currentUploadIndex = uploadContext.filesProcessedCount || 0;
          uploadContext.filesProcessedCount = (uploadContext.filesProcessedCount || 0) + 1;

          // Process file immediately (with error recovery)
          try {
            await processBatchFile(socket, session, data, config);
            return true; // File processed successfully
          } catch (error: any) {
console.error("[DIZ] Error processing file after DIZ extraction:", error);
            // Clear context and show error
            socket.emit(
              "ansi-output",
              `\r\n\x1b[31mUpload failed: ${error.message}\x1b[0m\r\n`
            );
            socket.emit(
              "ansi-output",
              "\r\n\x1b[32mPress any key to continue...\x1b[0m"
            );
            session.menuPause = false;
            session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
            clearUploadContext(session, socket);
            return true; // Handled (with error), don't wait for description
          }
        } else {
          // No DIZ found (null from timeout or no file) - prompt for description
          socket.emit("ansi-output", "No FILE_ID.DIZ found.\r\n");
          promptForDescription(socket, uploadContext, data);
          return false; // Waiting for description
        }
      } catch (error: any) {
console.error("[DIZ] Extraction error:", error);
        // On extraction error, show error message then prompt for description
        socket.emit(
          "ansi-output",
          `\x1b[33mError extracting FILE_ID.DIZ: ${error.message}\x1b[0m\r\n`
        );
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
  const sizeStr = formatFileSize(data.size);
  const dateStr = formatUploadDate(getSystemTime());
  const filename13 = data.originalname.substring(0, 13).padEnd(13);

  socket.emit("ansi-output", "\r\n");
  socket.emit(
    "ansi-output",
    `Enter a description, you only have ${maxDescLines} lines.\r\n`
  );
  socket.emit(
    "ansi-output",
    "Press return alone to end.  Begin description with (/) to make upload 'Private'.\r\n"
  );
  socket.emit(
    "ansi-output",
    "                                [--------------------------------------------]\r\n"
  );
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
    socket.emit(
      "ansi-output",
      "\r\n\x1b[32mPress any key to continue...\x1b[0m"
    );
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    clearUploadContext(session, socket);
    return;
  }

  // Original batch upload mode or processing after description
  const fileArea = uploadContext.fileArea;

  // Use sequential counter instead of array index (fixes off-by-one bugs)
  const currentIndex = uploadContext.currentUploadIndex || 0;
  const currentFile = uploadContext.uploadBatch[currentIndex];

  // Increment files processed counter for tracking
  if (!uploadContext.filesProcessedCount) {
    uploadContext.filesProcessedCount = 0;
  }

  if (!currentFile) {
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31mError: No file info for uploaded file\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\r\n\x1b[32mPress any key to continue...\x1b[0m"
    );
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    clearUploadContext(session, socket);
    return;
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
    let testStatus = TestResult.NOT_TESTED;
    let fileStatus: "active" | "private" | "hold" = currentFile.isPrivate
      ? "private"
      : "active";

    if (data.path) {
      const nodeWorkDir = getNodeWorkDir(0, config.get("dataDir")); // Node0/WorkDir

      // Extract FILE_ID.DIZ (express.e:19258-19285) - skip if already extracted
      if (!session.tempData.skipDizExtraction) {
console.log(
          `[FILE_ID.DIZ] Attempting extraction for ${currentFile.filename}`
        );
        try {
          // Add 10 second timeout to prevent hanging
          const dizPromise = extractAndReadDiz(data.path, nodeWorkDir, [], 10);
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10000)
          );
          const dizLines = await Promise.race([dizPromise, timeoutPromise]);

          if (dizLines && dizLines.length > 0) {
            finalDescription = dizLines.join("\n");
console.log(
              `[FILE_ID.DIZ] Using FILE_ID.DIZ content (${dizLines.length} lines)`
            );
            socket.emit(
              "ansi-output",
              `\r\n\x1b[36m[FILE_ID.DIZ found and used for description]\x1b[0m\r\n`
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

      // Test file integrity (express.e:19348-19354)
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
          socket.emit(
            "ansi-output",
            "\r\n\x1b[33mRequires review, possibly bad format\x1b[0m\r\n"
          );
          socket.emit(
            "ansi-output",
            `\r\n\x1b[33mMoving to ${config.get(
              "sysopName"
            )}'s private Directory.\x1b[0m\r\n\r\n`
          );
          fileStatus = "hold"; // Mark for HOLD directory (express.e:19364-19369)
        }
      } catch (error) {
console.error(`[testFile] Error:`, error);
        testStatus = TestResult.NOT_TESTED;
        socket.emit("ansi-output", "\r\nTest skipped (error)...\r\n");
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

    // Move file to appropriate directory (express.e:19403-19415)
    // Use file area's dlPath from Conf.info DLPATH.n tooltype
    let finalFilePath = data.path || "";
    if (data.path) {
      try {
        finalFilePath = await moveUploadedFile(
          data.path,
          currentFile.filename,
          fileStatus,
          session.currentConf,
          config.get("dataDir"),
          fileArea?.dlPath // Pass dlPath from file area config (express.e:15264)
        );
console.log(`[Upload] File moved to: ${finalFilePath}`);
      } catch (error: any) {
console.error(`[Upload] Error moving file: ${error.message}`);
        // Continue with original path on error
      }
    }

    // Check for duplicate file in this area (express.e:19356 checkForFile, 19371-19377)
    const existingFile = await db.query(
      "SELECT id, filename FROM file_entries WHERE LOWER(filename) = $1 AND areaid = $2",
      [normalizedFilename, fileArea.id]
    );

    let foundDupe = false;
    if (existingFile.rows.length > 0) {
      // Express.e:19372-19376 - Move duplicate to HOLD directory, don't abort
      foundDupe = true;
      socket.emit(
        "ansi-output",
        `\r\n\x1b[33mFile already exists, moving to ${config.get("sysopName")}'s private directory\x1b[0m\r\n`
      );
      fileStatus = "hold"; // Move to HOLD directory
      checkedMarker = "D"; // Mark as duplicate (express.e uses 'D' marker)
    }

    // Save file to database (express.e:19356-19377)
    // Skip database insert for duplicates - file already exists in database
    if (!foundDupe) {
      const fileEntry = {
        filename: currentFile.filename,
        description: finalDescription, // Use DIZ if found, otherwise batch description
        size: data.size,
        uploader: session.user!.username,
        uploadDate: getSystemTime(),
        downloads: 0,
        areaId: fileArea.id,
        fileIdDiz: finalDescription, // Store DIZ text if extracted
        rating: undefined,
        votes: undefined,
        status: fileStatus, // active, private, or hold based on test result
        checked: checkedMarker, // P/F/N/D status marker
        comment: undefined, // Optional sysop comment
      };

      await db.createFileEntry(fileEntry as any);
    } else {
      // Duplicate file - skip database insert but still write to DIR file in HOLD
console.log(`[Upload] Skipping database insert for duplicate file: ${currentFile.filename}`);
    }

    // Write to DIR file (express.e:19473-19509)
    // Express.e: Uploads go to DIR{maxDirs} - always numbered, never named
    try {
      const conferencePath = getConferenceDir(
        session.currentConf,
        config.get("dataDir")
      );
      // Get maxDirs for this conference (express.e:19475-19478)
      const maxDirs = await getMaxDirs(
        session.currentConf,
        config.get("dataDir")
      );
      const uploadDirNum = maxDirs > 0 ? maxDirs : 1; // Default to DIR1 if no dirs exist

      // Get SENTBY_FILES setting from node config (express.e:19506)
      // checkToolTypeExists(TOOLTYPE_NODE, node, 'SENTBY_FILES')
      const configRepo = (db as any).getConfigRepository();
      const nodeConfig = configRepo.getNodeConfig(session.nodeId || 1);
      const addSentBy = nodeConfig?.sentby_files ?? true; // Default to true if not configured

      await writeUploadToDirFile(
        currentFile.filename,
        data.size,
        getSystemTime(),
        finalDescription,
        checkedMarker,
        session.user!.username, // express.e:19507 uses loggedOnUser.name which is the BBS handle
        conferencePath,
        fileStatus,
        uploadDirNum, // express.e: uploads go to DIR{maxDirs}
        addSentBy // SENTBY_FILES from node config
      );
console.log(
        `[Upload] Wrote DIR entry for ${currentFile.filename} to DIR${uploadDirNum}`
      );

      // Write to FILES.BBS for third-party door compatibility (e.g., AquaScan)
      // FILES.BBS uses the same format as DIR files but is always in the Upload directory
      // This allows doors like AquaScan to read file listings without parsing DIR files
      if (fileStatus === "active") {
        try {
          const { writeToFilesBBS } = await import("../utils/files-bbs.util");
          await writeToFilesBBS(
            conferencePath,
            currentFile.filename,
            data.size,
            getSystemTime(),
            finalDescription,
            checkedMarker,
            session.user!.username,
            addSentBy,
            "Upload" // Standard upload subdirectory name
          );
        } catch (filesBBSError: any) {
console.error(
            `[Upload] Error writing FILES.BBS: ${filesBBSError.message}`
          );
          // Don't fail upload on FILES.BBS write error - it's supplementary
        }
      }
    } catch (error: any) {
console.error(`[Upload] Error writing DIR file: ${error.message}`);
      // Don't fail upload on DIR write error
    }

    // Update user stats in users table (express.e:19379-19384)
    // Express.e: Stats ONLY updated when status=RESULT_SUCCESS (not for duplicates/failures)
    // Use SQL arithmetic to avoid JavaScript number overflow for bytesUpload (BIGINT)
    const trackUploads = creditAccountTrackUploads(session.user!);
    if (trackUploads && !foundDupe) {
      // Update CPS tracking on user object using real transfer speed from frontend
      const realUploadCPS = session.tempData?.lastUploadCPS || undefined;
      await updateUploadStats(session.user!, data.size, realUploadCPS);

      // Build SET clause conditionally - only update topuploadcps if we have a new high
      const userTopCPS = session.user!.topUploadCPS || 0;
      const updateTopCPS = userTopCPS > 0;

      if (updateTopCPS) {
        // Note: SQLite uses positional ? placeholders, so we need to provide
        // the CPS value twice since it appears twice in the CASE expression
        await db.run(
          `
          UPDATE users
          SET uploads = uploads + 1,
              bytesupload = bytesupload + $1,
              topuploadcps = CASE WHEN topuploadcps < $3 THEN $4 ELSE topuploadcps END,
              updated = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
          [data.size, session.user!.id, userTopCPS, userTopCPS]
        );
      } else {
        await db.run(
          `
          UPDATE users
          SET uploads = uploads + 1,
              bytesupload = bytesupload + $1,
              updated = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
          [data.size, session.user!.id]
        );
      }

      await db.run(
        "UPDATE user_stats SET bytes_uploaded = bytes_uploaded + $1, files_uploaded = files_uploaded + 1 WHERE user_id = $2",
        [data.size, session.user!.id]
      );

      // Update session.user with new values BEFORE writing to disk
      // This ensures User.Data gets the updated stats for mtop/bulletins
      session.user!.uploads = (session.user!.uploads || 0) + 1;
      session.user!.bytesUpload = (session.user!.bytesUpload || 0) + data.size;

      // DISK-BASED: Write updated upload stats to user.data/keys/misc files
      if (session.user!.slotNumber) {
        try {
          userFileManager.updateUserDataFile(
            session.user!,
            session.user!.slotNumber
          );
console.log(
            `[Upload] Updated user ${
              session.user!.username
            } disk files with upload stats (uploads=${
              session.user!.uploads
            }, bytes=${session.user!.bytesUpload}, slot=${
              session.user!.slotNumber
            })`
          );
        } catch (diskErr) {
console.error("[Upload] Error writing user disk files:", diskErr);
          // Continue anyway - database has the stats, sync can happen later
        }
      }
    }

    // Update per-conference upload stats (express.e:19530+)
    // Express.e: Conference stats ONLY updated for successful uploads (not duplicates)
    try {
      const conferences = await loadConferences(session, db);
      const target = conferences?.find(
        (c: any) => c.id === session.currentConf
      );
      if (target && trackUploads && !foundDupe) {
        target.uploads = (target.uploads || 0) + 1;
        target.bytesUpload = (target.bytesUpload || 0) + data.size;
        // Use db's delegated method instead of creating new repository
        await db.updateConference(target.id, {
          uploads: target.uploads,
          bytesUpload: target.bytesUpload,
        });
      }
    } catch (err) {
console.error("[Upload] Failed to persist conference upload stats", err);
    }

    // Log file upload (express.e:9493 callersLog)
    // Express.e: Only log successful uploads (not duplicates)
    if (!foundDupe) {
      await callersLog(
        session.user!.id,
        session.user!.username,
        "Uploaded file",
        currentFile.filename
      );
    }

    // Emit BBS event for LiveChat integration
    // Express.e: Only emit events for successful uploads (not duplicates)
    if (!foundDupe) {
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
    if (!foundDupe) {
      try {
        const { webhookService, WebhookTrigger } = await import(
          "../services/webhook.service"
        );
        const conference = await db.getConferenceById(session.currentConf);

        await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, {
          username: session.user!.username,
          filename: currentFile.filename,
          filesize: data.size,
          conference: conference?.name || "Unknown",
          description: finalDescription.substring(0, 100),
        });
      } catch (error) {
console.error("[Webhook] Error sending file upload webhook:", error);
      }
    }

    // Update sysop upload statistics (express.e:19440)
    try {
      const conferencePath = getConferenceDir(
        session.currentConf,
        config.get("dataDir")
      );
      await updateSysopUploadStats(
        conferencePath,
        session.currentConf,
        config.get("dataDir"),
        fileStatus === "hold" || fileStatus === "private"
      );
    } catch (error: any) {
console.error(`[Upload] Error updating sysop stats: ${error.message}`);
    }

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

    // More files may be pending - emit show-file-upload to request next file
    // Frontend will either:
    // 1. Upload next file from its queue (web mode with multiple files selected)
    // 2. Emit 'upload-batch-complete' if no more files (ends batch)
    socket.emit("show-file-upload", {
      accept: "*/*",
      maxSize: 10 * 1024 * 1024, // 10MB max
      uploadUrl: "/api/upload",
      fieldName: "file",
      batchContinue: true, // Signal that this is part of a batch upload
    });

    session.subState = LoggedOnSubState.FILES_UPLOAD;
    // Note: Frontend will emit 'upload-batch-complete' when all files are uploaded
    // That handler will show the completion statistics
    return;
  } catch (error: any) {
console.error("File upload error:", error);

    // Show specific error message to user
    const errorMessage = error.message || "Unknown database error";
    socket.emit(
      "ansi-output",
      `\r\n\x1b[31mUpload failed: ${errorMessage}\x1b[0m\r\n`
    );
    socket.emit(
      "ansi-output",
      "\r\n\x1b[32mPress any key to continue...\x1b[0m"
    );
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    clearUploadContext(session, socket);
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

  // Show completion statistics (express.e:19059-19083)
  const uploadTime = Math.floor(
    (Date.now() - session.tempData.uploadStartTime) / 1000
  ); // seconds
  const minutes = Math.floor(uploadTime / 60);
  const seconds = uploadTime % 60;
  const bytesKB = Math.floor(session.tempData.uploadedBytes / 1024);
  const cps =
    uploadTime > 0
      ? Math.floor(session.tempData.uploadedBytes / uploadTime)
      : 0;

  socket.emit("ansi-output", "\r\n\r\nFile Uploading Complete...\r\n");
  socket.emit(
    "ansi-output",
    ` ${session.tempData.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps.\r\n`
  );
  socket.emit("ansi-output", "\r\n");

  // Log batch upload summary
  const summaryLog = `\t ${session.tempData.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps.`;
  await callersLog(session.user!.id, session.user!.username, summaryLog);

  // Notify sysop of upload (express.e:19098)
  // EXECUTE_ON_UPLOAD + MAIL_ON_UPLOAD handled by doUploadNotify
  try {
    await doUploadNotify(
      session.user!.name || session.user!.username,
      session.user!.location || "Unknown",
      config.get("bbsName") || "AmiExpress BBS",
      undefined, // webhookService
      session.nodeId || 1 // nodeId for EXECUTE_ON_UPLOAD
    );
  } catch (error: any) {
console.error(
      `[Upload] Error sending upload notification: ${error.message}`
    );
  }

  socket.emit("ansi-output", "\r\n\x1b[32mPress any key to continue...\x1b[0m");
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  clearUploadContext(session, socket);
}

/**
 * Process file upload - shared logic for file-upload and file-uploaded events
 * Now consolidated to avoid code duplication
 */
async function processFileUpload(
  socket: Socket,
  session: BBSSession,
  config: any,
  data: { filename: string; originalname: string; size: number; path?: string }
) {
  const uploadContext = getUploadContext(session, socket);

  if (!uploadContext) {
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31mError: Upload session invalid\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\r\n\x1b[32mPress any key to continue...\x1b[0m"
    );
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    clearUploadContext(session, socket);
    return;
  }

console.log("[processFileUpload] Processing:", data);

  // Check if this is a regular file upload to a file area (has uploadMode and fileArea)
  const isRegularFileUpload = uploadContext.uploadMode && uploadContext.fileArea;

  // Check if Door Manager is active - it has its own file-uploaded handler for door archives
  if (session.inDoorManager && !isRegularFileUpload) {
console.log(
      "[processFileUpload] Door Manager is active (door archive upload), skipping"
    );
    return;
  }

  if (!isRegularFileUpload) {
    socket.emit(
      "ansi-output",
      "\r\n\x1b[31mError: Upload session invalid\x1b[0m\r\n"
    );
    socket.emit(
      "ansi-output",
      "\r\n\x1b[32mPress any key to continue...\x1b[0m"
    );
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    clearUploadContext(session, socket);
    return;
  }

  // Web upload mode: use shared DIZ extraction and description prompting logic
  if (uploadContext.webUploadMode) {
    const wasProcessed = await handleDizExtractionAndDescription(
      socket,
      session,
      data,
      config
    );

    // If file was not processed (waiting for description), return
    if (!wasProcessed) {
      session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
      return;
    }

    // File was processed (had DIZ or already has description)
    return;
  }

  // Non-web upload mode (legacy batch upload) - process directly
  await processBatchFile(socket, session, data, config);
}

/**
 * Register file upload/download socket event handlers
 */
export function registerFileHandlers(socket: Socket) {
  const session = getSessionBySocketId(socket.id);
  if (!session) return;

  // Handle file upload from browser (receives file data directly)
  socket.on(
    "file-upload",
    async (data: {
      filename: string;
      size: number;
      type: string;
      data: number[];
      uploadStartTime?: number;
    }) => {
      const receiveTime = Date.now();
console.log(
        "[file-upload] Received file from browser:",
        data.filename,
        data.size,
        "bytes"
      );

      // Calculate real upload CPS from frontend timing
      let uploadCPS = 0;
      if (data.uploadStartTime && data.size > 0) {
        const durationMs = receiveTime - data.uploadStartTime;
        const durationSec = durationMs / 1000;
        uploadCPS = durationSec > 0 ? Math.floor(data.size / durationSec) : 0;
console.log(
          `[file-upload] Transfer time: ${durationMs}ms, CPS: ${uploadCPS}`
        );
      }

      // Store CPS in session for later use when updating user stats
      if (!session.tempData) {
        session.tempData = {} as any;
      }
      session.tempData.lastUploadCPS = uploadCPS;

      const fs = require("fs");
      const path = require("path");

      // Get playpen directory
      const playpenDir = getPlaypenDir(
        session.nodeId || 0,
        config.get("dataDir")
      );

      try {
        // Ensure playpen exists (handle legacy PlayPen file from Amiga BBS)
        if (fs.existsSync(playpenDir)) {
          const stat = fs.statSync(playpenDir);
          if (stat.isFile()) {
            // Remove old file (legacy empty PlayPen file)
            fs.unlinkSync(playpenDir);
            fs.mkdirSync(playpenDir, { recursive: true });
          }
          // If it's already a directory, we're good
        } else {
          // Create directory if it doesn't exist
          fs.mkdirSync(playpenDir, { recursive: true });
        }

        // Write file to playpen
        const filePath = path.join(playpenDir, data.filename);
        const buffer = Buffer.from(data.data);
        fs.writeFileSync(filePath, buffer);

console.log("[file-upload] Wrote file to:", filePath);

        // Process the upload inline instead of emitting event
        // Call the processing function directly
        await processFileUpload(socket, session, config, {
          filename: data.filename,
          originalname: data.filename,
          size: data.size,
          path: filePath,
        });
      } catch (error: any) {
        const filePath = `${playpenDir || "unknown"}/${data.filename}`;
        SysopDebugUtil.debugFileError(
          socket,
          session,
          "write",
          filePath,
          error
        );
        socket.emit(
          "ansi-output",
          `\r\n\x1b[31mError saving file: ${error.message}\x1b[0m\r\n`
        );
      }
    }
  );

  // Handle upload batch complete from frontend
  // Frontend emits this when all pending files have been uploaded
  socket.on("upload-batch-complete", async () => {
console.log(
      "[upload-batch-complete] Frontend signaled batch upload complete"
    );
    await handleUploadBatchComplete(socket, session);
  });

  // Handle file download completion with real CPS from frontend
  socket.on(
    "file-download-complete",
    async (data: {
      filename: string;
      size: number;
      durationMs: number;
      cps: number;
      path?: string;
    }) => {
console.log(
        `[file-download-complete] ${data.filename}: ${data.size} bytes in ${data.durationMs}ms (${data.cps} CPS)`
      );

      if (!session.user) {
console.log(
          "[file-download-complete] No user in session, skipping CPS update"
        );
        return;
      }

      // Update user's top download CPS if this is a new record
      const currentTopCPS = session.user.topDownloadCPS || 0;
      if (data.cps > currentTopCPS) {
        session.user.topDownloadCPS = data.cps;
console.log(
          `[file-download-complete] New top download CPS for ${session.user.username}: ${data.cps} (was ${currentTopCPS})`
        );

        // Persist to database
        try {
          await db.run(
            `
          UPDATE users
          SET topdownloadcps = CASE WHEN topdownloadcps < $1 THEN $1 ELSE topdownloadcps END,
              updated = CURRENT_TIMESTAMP
          WHERE id = $2
        `,
            [data.cps, session.user.id]
          );

          // DISK-BASED: Write updated CPS to user.keys file for mtop
          if (session.user.slotNumber) {
            try {
              userFileManager.updateUserDataFile(
                session.user,
                session.user.slotNumber
              );
console.log(
                `[file-download-complete] Updated user ${session.user.username} disk files with download CPS`
              );
            } catch (diskErr) {
console.error(
                "[file-download-complete] Error writing user disk files:",
                diskErr
              );
            }
          }
        } catch (err) {
console.error(
            "[file-download-complete] Failed to persist download CPS",
            err
          );
        }
      }
    }
  );

  // Handle file upload completion (express.e:19059-19110)
  // Now uses shared processFileUpload() to avoid code duplication
  socket.on(
    "file-uploaded",
    async (data: {
      filename: string;
      originalname: string;
      size: number;
      path?: string;
    }) => {
console.log("File uploaded event received:", data);

      // Use shared upload processing logic (same as file-upload handler)
      await processFileUpload(socket, session, config, data);
    }
  );

  // Handle file download started - express.e:9475+ (logUDFile for downloads)
  socket.on(
    "file-download-started",
    async (data: { filename: string; fileId?: number }) => {
      const requestedFilename = sanitizeInput(data.filename);
      const normalizedRequestedFilename = normalizeForComparison(data.filename);
console.log("[Download] File download started:", requestedFilename);

      if (!session.user) {
console.error("[Download] No user session for download");
        return;
      }

      try {
        // Get file info from database
        let fileEntry;
        if (data.fileId) {
          fileEntry = await db.getFileEntry(data.fileId);
        } else {
          // Find by filename in current conference
          const conferenceId = session.currentConf || 1;
          const result = await db.query(
            `SELECT fe.* FROM file_entries fe
           JOIN file_areas fa ON fe.areaid = fa.id
           WHERE fa.conferenceid = $1 AND LOWER(fe.filename) = $2
           LIMIT 1`,
            [conferenceId, normalizedRequestedFilename]
          );
          fileEntry = result.rows[0];
        }

        if (!fileEntry) {
console.error(
            "[Download] File not found in database:",
            requestedFilename
          );
          return;
        }

        // Update file download count
        await db.updateFileEntry(fileEntry.id, {
          downloads: (fileEntry.downloads || 0) + 1,
        });

        // Update user download statistics (express.e:9475-9492)
        // Use SQL arithmetic to avoid JavaScript number overflow for bytesDownload (BIGINT)
        await db.run(
          `
        UPDATE users
        SET downloads = downloads + 1,
            bytesdownload = bytesdownload + $1,
            updated = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
          [fileEntry.size, session.user.id]
        );

        // Update user_stats table (for ratio calculations)
        await db.run(
          "UPDATE user_stats SET bytes_downloaded = bytes_downloaded + $1, files_downloaded = files_downloaded + 1 WHERE user_id = $2",
          [fileEntry.size, session.user.id]
        );

        // Update session.user with new download values
        session.user.downloads = (session.user.downloads || 0) + 1;
        session.user.bytesDownload =
          (session.user.bytesDownload || 0) + fileEntry.size;

        // DISK-BASED: Write updated download stats to user.data/keys/misc files
        if (session.user.slotNumber) {
          try {
            userFileManager.updateUserDataFile(
              session.user,
              session.user.slotNumber
            );
console.log(
              `[Download] Updated user ${session.user.username} disk files with download stats (downloads=${session.user.downloads}, bytes=${session.user.bytesDownload}, slot=${session.user.slotNumber})`
            );
          } catch (diskErr) {
console.error("[Download] Error writing user disk files:", diskErr);
            // Continue anyway - database has the stats, sync can happen later
          }
        }

        // Log file download (express.e:9493 callersLog)
        await callersLog(
          session.user.id,
          session.user.username,
          "Downloaded file",
          fileEntry.filename
        );

        // Trigger webhook for file download
        try {
          const { webhookService, WebhookTrigger } = await import(
            "../services/webhook.service"
          );
          const conference = await db.getConferenceById(session.currentConf);

          await webhookService.sendWebhook(WebhookTrigger.FILE_DOWNLOADED, {
            username: session.user.username,
            filename: fileEntry.filename,
            filesize: fileEntry.size,
            conference: conference?.name || "Unknown",
          });
        } catch (error) {
console.error(
            "[Webhook] Error sending file download webhook:",
            error
          );
        }

console.log(
          `[Download] Updated stats for ${session.user.username} - ${fileEntry.filename} (${fileEntry.size} bytes)`
        );
      } catch (error) {
console.error("[Download] Error updating statistics:", error);
      }
    }
  );
}

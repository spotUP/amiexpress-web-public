/**
 * File Upload/Download Socket Event Handlers
 * Handles file upload completion and download tracking events
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { db } from '../database';
import { config } from '../config';
import { extractAndReadDiz, getNodeWorkDir, getPlaypenDir } from '../utils/file-diz.util';
import { testFile, TestResult } from '../utils/file-test.util';
import { moveUploadedFile, getConferenceDir } from '../utils/file-hold.util';
import { writeUploadToDirFile } from '../utils/dir-file.util';
import { updateSysopUploadStats, doUploadNotify } from '../utils/upload-notify.util';
import { normalizeForComparison, sanitizeInput } from '../utils/input-normalizer.util';
import { getSessionBySocketId } from './session-manager';
import { callersLog } from './database-helpers';

/**
 * Register file upload/download socket event handlers
 */
export function registerFileHandlers(socket: Socket) {
  const session = getSessionBySocketId(socket.id);
  if (!session) return;

  // Handle file upload completion (express.e:19059-19110)
  socket.on('file-uploaded', async (data: { filename: string; originalname: string; size: number; path?: string }) => {
    console.log('File uploaded event received:', data);

    // Check if Door Manager is active - it has its own file-uploaded handler
    if (session.inDoorManager) {
      console.log('[file-uploaded] Door Manager is active, skipping normal file upload handler');
      return;
    }

    if (!session.tempData?.uploadMode || !session.tempData?.fileArea) {
      socket.emit('ansi-output', '\r\n\x1b[31mError: Upload session invalid\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Web upload mode: check if we need to prompt for description
    if (session.tempData.webUploadMode) {
      // First time file is uploaded - try to extract FILE_ID.DIZ first
      if (!session.tempData.currentUploadedFile) {
        session.tempData.currentUploadedFile = {
          filename: data.originalname,
          path: data.path,
          size: data.size
        };

        socket.emit('ansi-output', `\r\n\x1b[32mFile selected: ${data.originalname}\x1b[0m\r\n`);
        socket.emit('ansi-output', `\x1b[32mSize: ${Math.ceil(data.size / 1024)}KB\x1b[0m\r\n\r\n`);

        console.log('[file-uploaded] File selected, checking for DIZ...');
        console.log('[file-uploaded] dataDir:', config.get('dataDir'));

        // Try to extract FILE_ID.DIZ (express.e:19258-19285)
        if (data.path) {
          try {
            const nodeWorkDir = getNodeWorkDir(0, config.get('dataDir'));
            console.log('[file-uploaded] nodeWorkDir:', nodeWorkDir);

            socket.emit('ansi-output', 'Checking for FILE_ID.DIZ...\r\n');

            // Add 10 second timeout to prevent hanging
            const dizPromise = extractAndReadDiz(data.path, nodeWorkDir, [], 10);
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
            const dizLines = await Promise.race([dizPromise, timeoutPromise]);

            if (dizLines && dizLines.length > 0) {
              // Found FILE_ID.DIZ - use it as description (express.e:19332+)
              socket.emit('ansi-output', '\x1b[36m[FILE_ID.DIZ found - using as description]\x1b[0m\r\n\r\n');

              // Store DIZ as description
              session.tempData.currentDescription = dizLines;
              session.tempData.hasDiz = true;
              session.tempData.skipDizExtraction = true; // Skip second extraction

              // Process upload immediately - no need to prompt
              session.tempData.uploadBatch.push({
                filename: data.originalname,
                description: dizLines.join('\n'),
                isPrivate: false
              });
              session.tempData.currentUploadIndex = 0;

              // Continue processing (fall through to batch processing below)
            } else {
              // No DIZ found - prompt for description (express.e:17720-17731)
              socket.emit('ansi-output', 'No FILE_ID.DIZ found.\r\n\r\n');
              socket.emit('ansi-output', 'Please enter a description (press Enter alone to finish):\r\n');
              // express.e:17731 - filename (13 chars) + 19 spaces + ':'
              socket.emit('ansi-output', `${data.originalname.substring(0, 13).padEnd(13)}                   :`);

              // Initialize description storage
              session.tempData.currentDescription = [];
              session.tempData.maxDescLines = 10;
              session.tempData.descLineCount = 0;

              // Switch to line input mode (disable hotkeys)
              socket.emit('set-input-mode', 'line');
              session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
              return;
            }
          } catch (error) {
            console.error('[FILE_ID.DIZ] Extraction error:', error);
            // On error, fall back to prompting for description (express.e:17720-17731)
            socket.emit('ansi-output', 'Please enter a description (press Enter alone to finish):\r\n');
            // express.e:17731 - filename (13 chars) + 19 spaces + ':'
            socket.emit('ansi-output', `${data.originalname.substring(0, 13).padEnd(13)}                   :`);

            session.tempData.currentDescription = [];
            session.tempData.maxDescLines = 10;
            session.tempData.descLineCount = 0;

            // Switch to line input mode (disable hotkeys)
            socket.emit('set-input-mode', 'line');
            session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
            return;
          }
        }
      }
      // If currentUploadedFile exists and hasDiz is true, we've collected description - continue to process
    }

    // Original batch upload mode or processing after description
    const fileArea = session.tempData.fileArea;
    const currentIndex = session.tempData.currentUploadIndex || 0;
    const currentFile = session.tempData.uploadBatch[currentIndex];

    if (!currentFile) {
      socket.emit('ansi-output', '\r\n\x1b[31mError: No file info for uploaded file\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
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
      let fileStatus: 'active' | 'private' | 'hold' = currentFile.isPrivate ? 'private' : 'active';

      if (data.path) {
        const nodeWorkDir = getNodeWorkDir(0, config.get('dataDir')); // Node0/WorkDir

        // Extract FILE_ID.DIZ (express.e:19258-19285) - skip if already extracted
        if (!session.tempData.skipDizExtraction) {
          console.log(`[FILE_ID.DIZ] Attempting extraction for ${currentFile.filename}`);
          try {
            // Add 10 second timeout to prevent hanging
            const dizPromise = extractAndReadDiz(data.path, nodeWorkDir, [], 10);
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
            const dizLines = await Promise.race([dizPromise, timeoutPromise]);

            if (dizLines && dizLines.length > 0) {
              finalDescription = dizLines.join('\n');
              console.log(`[FILE_ID.DIZ] Using FILE_ID.DIZ content (${dizLines.length} lines)`);
              socket.emit('ansi-output', `\r\n\x1b[36m[FILE_ID.DIZ found and used for description]\x1b[0m\r\n`);
            } else {
              console.log(`[FILE_ID.DIZ] No FILE_ID.DIZ found or timed out, using batch description`);
            }
          } catch (error) {
            console.error(`[FILE_ID.DIZ] Extraction error:`, error);
          }
        } else {
          console.log(`[FILE_ID.DIZ] Skipping extraction - already done`);
        }

        // Test file integrity (express.e:19348-19354)
        socket.emit('ansi-output', `\r\nTesting... ${currentFile.filename}...\r\n`);
        try {
          // Add 15 second timeout to prevent hanging on file tests
          const testPromise = testFile(data.path, nodeWorkDir);
          const timeoutPromise = new Promise<TestResult>((resolve) =>
            setTimeout(() => resolve(TestResult.NOT_TESTED), 15000)
          );
          testStatus = await Promise.race([testPromise, timeoutPromise]);
          console.log(`[testFile] Result: ${testStatus}`);

          if (testStatus === TestResult.SUCCESS || testStatus === TestResult.NOT_TESTED) {
            socket.emit('ansi-output', '\r\nTested Ok...\r\n');
          } else if (testStatus === TestResult.FAILURE) {
            socket.emit('ansi-output', '\r\n\x1b[33mRequires review, possibly bad format\x1b[0m\r\n');
            socket.emit('ansi-output', `\r\n\x1b[33mMoving to ${config.get('sysopName')}'s private Directory.\x1b[0m\r\n\r\n`);
            fileStatus = 'hold';  // Mark for HOLD directory (express.e:19364-19369)
          }
        } catch (error) {
          console.error(`[testFile] Error:`, error);
          testStatus = TestResult.NOT_TESTED;
          socket.emit('ansi-output', '\r\nTest skipped (error)...\r\n');
        }
      }

      // Determine file checked status marker (express.e:19410-19419)
      let checkedMarker: 'P' | 'F' | 'N' | 'D' = 'N';
      if (testStatus === TestResult.SUCCESS) {
        checkedMarker = 'P';  // Passed
      } else if (testStatus === TestResult.FAILURE) {
        checkedMarker = 'F';  // Failed
      } else {
        checkedMarker = 'N';  // Not tested
      }

      // Move file to appropriate directory (express.e:19403-19415)
      let finalFilePath = data.path || '';
      if (data.path && fileStatus !== 'active') {
        try {
          finalFilePath = await moveUploadedFile(
            data.path,
            currentFile.filename,
            fileStatus,
            session.currentConf,
            config.get('dataDir')
          );
          console.log(`[Upload] File moved to: ${finalFilePath}`);
        } catch (error: any) {
          console.error(`[Upload] Error moving file: ${error.message}`);
          // Continue with original path on error
        }
      }

      // Check for duplicate file in this area (UNIQUE constraint on filename, areaid)
      const existingFile = await db.query(
        'SELECT id, filename FROM file_entries WHERE LOWER(filename) = $1 AND areaid = $2',
        [normalizedFilename, fileArea.id]
      );

      if (existingFile.rows.length > 0) {
        throw new Error(`File "${currentFile.filename}" already exists in this area. Delete the old file first or choose a different filename.`);
      }

      // Save file to database
      const fileEntry = {
        filename: currentFile.filename,
        description: finalDescription,  // Use DIZ if found, otherwise batch description
        size: data.size,
        uploader: session.user!.username,
        uploadDate: new Date(),
        downloads: 0,
        areaId: fileArea.id,
        fileIdDiz: finalDescription,  // Store DIZ text if extracted
        rating: undefined,
        votes: undefined,
        status: fileStatus,  // active, private, or hold based on test result
        checked: checkedMarker,  // P/F/N status marker
        comment: undefined  // Optional sysop comment
      };

      await db.createFileEntry(fileEntry as any);

      // Write to DIR file (express.e:19473-19509)
      try {
        const conferencePath = getConferenceDir(session.currentConf, config.get('dataDir'));
        await writeUploadToDirFile(
          currentFile.filename,
          data.size,
          new Date(),
          finalDescription,
          checkedMarker,
          session.user!.name || session.user!.username,
          conferencePath,
          fileStatus,
          1,  // maxDirs - TODO: Make configurable
          true  // addSentBy - TODO: Make configurable via SENTBY_FILES
        );
        console.log(`[Upload] Wrote DIR entry for ${currentFile.filename}`);
      } catch (error: any) {
        console.error(`[Upload] Error writing DIR file: ${error.message}`);
        // Don't fail upload on DIR write error
      }

      // Update user stats in users table (for backward compatibility)
      // Use SQL arithmetic to avoid JavaScript number overflow for bytesUpload (BIGINT)
      await db.query(`
        UPDATE users
        SET uploads = uploads + 1,
            bytesupload = bytesupload + $1,
            updated = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [data.size, session.user!.id]);

      // Update user_stats table (for ratio calculations)
      await db.query(
        'UPDATE user_stats SET bytes_uploaded = bytes_uploaded + $1, files_uploaded = files_uploaded + 1 WHERE user_id = $2',
        [data.size, session.user!.id]
      );

      // Log file upload (express.e:9493 callersLog)
      await callersLog(session.user!.id, session.user!.username, 'Uploaded file', currentFile.filename);

      // Trigger webhook for file upload
      try {
        const { webhookService, WebhookTrigger } = await import('../services/webhook.service');
        const conference = await db.getConferenceById(session.currentConf);

        await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, {
          username: session.user!.username,
          filename: currentFile.filename,
          filesize: data.size,
          conference: conference?.name || 'Unknown',
          description: finalDescription.substring(0, 100)
        });
      } catch (error) {
        console.error('[Webhook] Error sending file upload webhook:', error);
      }

      // Update sysop upload statistics (express.e:19440)
      try {
        const conferencePath = getConferenceDir(session.currentConf, config.get('dataDir'));
        await updateSysopUploadStats(
          conferencePath,
          session.currentConf,
          config.get('dataDir'),
          fileStatus === 'hold' || fileStatus === 'private'
        );
      } catch (error: any) {
        console.error(`[Upload] Error updating sysop stats: ${error.message}`);
      }

      // Check if more files to upload
      if (currentIndex + 1 < session.tempData.uploadBatch.length) {
        // More files - trigger next upload
        session.tempData.currentUploadIndex = currentIndex + 1;
        const nextFile = session.tempData.uploadBatch[currentIndex + 1];

        socket.emit('show-file-upload', {
          accept: '*/*',
          maxSize: 10 * 1024 * 1024, // 10MB max
          uploadUrl: '/api/upload',
          fieldName: 'file',
          expectedFilename: nextFile.filename
        });

        session.subState = LoggedOnSubState.FILES_UPLOAD;
        return;
      }

      // All files uploaded - show statistics (express.e:19059-19083)
      const uploadTime = Math.floor((Date.now() - session.tempData.uploadStartTime) / 1000); // seconds
      const minutes = Math.floor(uploadTime / 60);
      const seconds = uploadTime % 60;
      const bytesKB = Math.floor(session.tempData.uploadedBytes / 1024);
      const cps = uploadTime > 0 ? Math.floor(session.tempData.uploadedBytes / uploadTime) : 0;

      socket.emit('ansi-output', '\r\n\r\nFile Uploading Complete...\r\n');
      socket.emit('ansi-output', ` ${session.tempData.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps.\r\n`);
      socket.emit('ansi-output', '\r\n');

      // Log batch upload summary
      const summaryLog = `\t ${session.tempData.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps.`;
      await callersLog(session.user!.id, session.user!.username, summaryLog);

      // Notify sysop of upload (express.e:19098)
      try {
        await doUploadNotify(
          session.user!.name || session.user!.username,
          session.user!.location || 'Unknown',
          config.get('bbsName') || 'AmiExpress BBS',
          undefined,  // TODO: Get sysop email from config
          false  // TODO: Get MAIL_ON_UPLOAD from config
        );
      } catch (error: any) {
        console.error(`[Upload] Error sending upload notification: ${error.message}`);
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;

    } catch (error: any) {
      console.error('File upload error:', error);

      // Show specific error message to user
      const errorMessage = error.message || 'Unknown database error';
      socket.emit('ansi-output', `\r\n\x1b[31mUpload failed: ${errorMessage}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
    }
  });

  // Handle file download started - express.e:9475+ (logUDFile for downloads)
  socket.on('file-download-started', async (data: { filename: string; fileId?: number }) => {
    const requestedFilename = sanitizeInput(data.filename);
    const normalizedRequestedFilename = normalizeForComparison(data.filename);
    console.log('[Download] File download started:', requestedFilename);

    if (!session.user) {
      console.error('[Download] No user session for download');
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
        console.error('[Download] File not found in database:', requestedFilename);
        return;
      }

      // Update file download count
      await db.updateFileEntry(fileEntry.id, {
        downloads: (fileEntry.downloads || 0) + 1
      });

      // Update user download statistics (express.e:9475-9492)
      // Use SQL arithmetic to avoid JavaScript number overflow for bytesDownload (BIGINT)
      await db.query(`
        UPDATE users
        SET downloads = downloads + 1,
            bytesdownload = bytesdownload + $1,
            updated = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [fileEntry.size, session.user.id]);

      // Update user_stats table (for ratio calculations)
      await db.query(
        'UPDATE user_stats SET bytes_downloaded = bytes_downloaded + $1, files_downloaded = files_downloaded + 1 WHERE user_id = $2',
        [fileEntry.size, session.user.id]
      );

      // Log file download (express.e:9493 callersLog)
      await callersLog(session.user.id, session.user.username, 'Downloaded file', fileEntry.filename);

      // Trigger webhook for file download
      try {
        const { webhookService, WebhookTrigger } = await import('../services/webhook.service');
        const conference = await db.getConferenceById(session.currentConf);

        await webhookService.sendWebhook(WebhookTrigger.FILE_DOWNLOADED, {
          username: session.user.username,
          filename: fileEntry.filename,
          filesize: fileEntry.size,
          conference: conference?.name || 'Unknown'
        });
      } catch (error) {
        console.error('[Webhook] Error sending file download webhook:', error);
      }

      console.log(`[Download] Updated stats for ${session.user.username} - ${fileEntry.filename} (${fileEntry.size} bytes)`);

    } catch (error) {
      console.error('[Download] Error updating statistics:', error);
    }
  });
}

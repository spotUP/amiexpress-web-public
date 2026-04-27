/**
 * Upload Notification Utilities
 * 1:1 port from AmiExpress express.e:6689-6700, 18746-18790
 *
 * Handles sysop notifications and upload statistics tracking
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { runExecuteOn } from '../services/batch-scheduler';
import { mailOnUpload } from '../services/mail-notification.service';
import { getSystemTime } from '../utils/date-time.util';

function resolveSysopStatsDir(bbsDataPath: string): string {
  const rootDir = path.join(bbsDataPath, 'SysopStats');
  if (existsSync(rootDir)) {
    return rootDir;
  }

  const legacyDir = path.join(bbsDataPath, 'BBS', 'SysopStats');
  if (existsSync(legacyDir)) {
    return legacyDir;
  }

  return rootDir;
}

/**
 * Update upload statistics for sysop tracking
 * Express.e:18746 - PROC sysopULStats(holdflag)
 *
 * Maintains two tracking files:
 * 1. NumULs - Conference-level upload counter
 * 2. SysopStats/NumULs_# - Sysop stats (normal vs HOLD)
 *
 * @param conferencePath Path to conference directory (e.g., Conf1)
 * @param conferenceId Conference ID (1, 2, 3, etc.)
 * @param bbsDataPath Base BBS data path
 * @param isHold Whether this upload went to HOLD directory
 */
export async function updateSysopUploadStats(
  conferencePath: string,
  conferenceId: number,
  bbsDataPath: string,
  isHold: boolean
): Promise<void> {
  try {
    // Update conference NumULs counter (express.e:18748-18768)
    // This tracks total uploads per conference
    if (!isHold) {
      const numULsPath = path.join(conferencePath, 'NumULs');
      let count = 0;

      // Read current count
      try {
        const content = await fs.readFile(numULsPath, 'utf-8');
        count = (parseInt(content.trim()) || 0) & 0xFFFF;  // AND 65535
      } catch {
        // File doesn't exist, start at 0
      }

      // Increment and wrap at 16-bit limit
      count = (count + 1) & 0xFFFF;

      // Write updated count
      await fs.writeFile(numULsPath, `${count}\n`);
console.log(`[UploadStats] Conference ${conferenceId} NumULs: ${count}`);
    }

    // Update SysopStats counter (express.e:18770-18790)
    // Tracks uploads for sysop review (normal vs HOLD)
    const sysopStatsDir = resolveSysopStatsDir(bbsDataPath);
    await fs.mkdir(sysopStatsDir, { recursive: true });

    let statsFilename = `NumULs_${conferenceId}`;
    if (isHold) {
      statsFilename += 'HOLD';  // Separate counter for HOLD uploads
    }

    const statsPath = path.join(sysopStatsDir, statsFilename);
    let statsCount = 0;

    // Read current count
    try {
      const content = await fs.readFile(statsPath, 'utf-8');
      statsCount = parseInt(content.trim()) || 0;
    } catch {
      // File doesn't exist, start at 0
    }

    // Increment
    statsCount++;

    // Write updated count
    await fs.writeFile(statsPath, `${statsCount}\n`);
console.log(`[UploadStats] Sysop stats ${statsFilename}: ${statsCount}`);
  } catch (error: any) {
console.error(`[UploadStats] Error updating stats: ${error.message}`);
  }
}

/**
 * Send upload notification to sysop
 * Express.e:6689 - PROC doUploadNotify()
 *
 * @param username Uploader's name
 * @param location Uploader's location
 * @param bbsName BBS name
 * @param webhookService Optional webhook service for triggering events
 * @param nodeId Node number for EXECUTE_ON context
 */
export async function doUploadNotify(
  username: string,
  location: string,
  bbsName: string,
  webhookService?: any,
  nodeId: number = 1,
  gdprConsented?: boolean
): Promise<void> {
  try {
    // Express.e:6692 - runExecuteOn('UPLOAD')
    // Run EXECUTE_ON_UPLOAD command from bbsConfig.info
    try {
      await runExecuteOn('UPLOAD', nodeId, { username, location });
    } catch (error: any) {
console.error(`[UploadNotify] EXECUTE_ON_UPLOAD failed: ${error.message}`);
    }

console.log(`[UploadNotify] Upload event triggered for ${username}`);

    // Trigger NEW_UPLOAD webhook if webhook service is available
    if (webhookService) {
      try {
        await webhookService.sendWebhook('new_upload', {
          username,
          location,
          gdprConsented,
          timestamp: getSystemTime().toISOString(),
        });
console.log(`[UploadNotify] NEW_UPLOAD webhook triggered`);
      } catch (webhookError: any) {
console.error(`[UploadNotify] Webhook error: ${webhookError.message}`);
      }
    }

    // Express.e:6693-6697 - Send email notification if configured
    // MAIL_ON_UPLOAD tooltype - handled by mail-notification.service
    try {
      await mailOnUpload(username, location);
    } catch (error: any) {
console.error(`[UploadNotify] MAIL_ON_UPLOAD failed: ${error.message}`);
    }
  } catch (error: any) {
console.error(`[UploadNotify] Error sending notification: ${error.message}`);
  }
}

/**
 * Display upload statistics to sysop
 * Express.e:18674 - PROC displaySysopULStats()
 *
 * Shows new uploads since last check
 *
 * @param bbsDataPath Base BBS data path
 * @param conferenceIds Array of conference IDs to check
 * @returns Statistics summary
 */
export async function getUploadStatsSummary(
  bbsDataPath: string,
  conferenceIds: number[]
): Promise<string[]> {
  const summary: string[] = [];

  try {
    const sysopStatsDir = resolveSysopStatsDir(bbsDataPath);

    for (const confId of conferenceIds) {
      let normalCount = 0;
      let holdCount = 0;

      // Read normal uploads
      try {
        const normalPath = path.join(sysopStatsDir, `NumULs_${confId}`);
        const content = await fs.readFile(normalPath, 'utf-8');
        normalCount = parseInt(content.trim()) || 0;
      } catch {
        // No stats file
      }

      // Read HOLD uploads
      try {
        const holdPath = path.join(sysopStatsDir, `NumULs_${confId}HOLD`);
        const content = await fs.readFile(holdPath, 'utf-8');
        holdCount = parseInt(content.trim()) || 0;
      } catch {
        // No HOLD stats
      }

      if (normalCount > 0 || holdCount > 0) {
        const total = normalCount + holdCount;
        summary.push(
          `Conference ${confId} has ${total} new uploads, ${normalCount} upload, ${holdCount} hold`
        );
      }
    }
  } catch (error: any) {
console.error(`[UploadStats] Error reading stats: ${error.message}`);
  }

  return summary;
}

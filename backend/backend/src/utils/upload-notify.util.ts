/**
 * Upload Notification Utilities
 * 1:1 port from AmiExpress express.e:6689-6700, 18746-18790
 *
 * Handles sysop notifications and upload statistics tracking
 */

import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Update upload statistics for sysop tracking
 * Express.e:18746 - PROC sysopULStats(holdflag)
 *
 * Maintains two tracking files:
 * 1. NumULs - Conference-level upload counter
 * 2. SysopStats/NumULs_# - Sysop stats (normal vs HOLD)
 *
 * @param conferencePath Path to conference directory (e.g., BBS/Conf01)
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
    const sysopStatsDir = path.join(bbsDataPath, 'BBS', 'SysopStats');
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
 * @param sysopEmail Sysop's email (if configured)
 * @param mailOnUpload Whether MAIL_ON_UPLOAD is enabled
 */
export async function doUploadNotify(
  username: string,
  location: string,
  bbsName: string,
  sysopEmail?: string,
  mailOnUpload: boolean = false
): Promise<void> {
  try {
    // Express.e:6691 - runExecuteOn('UPLOAD')
    // TODO: Implement AREXX script execution for UPLOAD event
    console.log(`[UploadNotify] Upload event triggered for ${username}`);

    // Express.e:6693-6697 - Send email notification if configured
    if (mailOnUpload && sysopEmail && sysopEmail.length > 0) {
      const subject = `${bbsName}: Ami-Express upload notification`;
      const body = `This is a notification that ${username} from ${location} has uploaded\n\n`;

      console.log(`[UploadNotify] Would send email to ${sysopEmail}`);
      console.log(`[UploadNotify] Subject: ${subject}`);
      console.log(`[UploadNotify] Body: ${body}`);

      // TODO: Implement actual email sending via sendMail()
      // For now, just log the notification
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
    const sysopStatsDir = path.join(bbsDataPath, 'BBS', 'SysopStats');

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

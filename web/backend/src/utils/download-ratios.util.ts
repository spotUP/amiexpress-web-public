/**
 * Download Ratios Utility
 * Port from express.e:19823+ checkRatiosAndTime()
 *
 * Checks download ratio limits before allowing downloads
 */

import { User } from '../types';

/**
 * Check if user can download based on ratio limits
 * Port from express.e:19823-19926 checkRatiosAndTime()
 *
 * @param user Current user
 * @param requestedBytes Total bytes requested for download
 * @returns Object with canDownload boolean and error message if not allowed
 */
export async function checkDownloadRatios(
  user: User | undefined,
  requestedBytes: number
): Promise<{ canDownload: boolean; errorMessage?: string }> {

  if (!user) {
    return { canDownload: false, errorMessage: 'User not authenticated' };
  }

  // Sysops bypass ratio checks - express.e:19845 checkSecurity(ACS_CONFERENCE_ACCOUNTING)
  if (user.secLevel >= 255) {
    return { canDownload: true };
  }

  // Get user stats
  const uploads = user.uploads || 0;
  const downloads = user.downloads || 0;
  const bytesAvailable = user.bytesAvailableForDownload || 0;

  // Check daily byte allowance - express.e:19853-19856
  if (requestedBytes > bytesAvailable) {
    return {
      canDownload: false,
      errorMessage: 'Not enough daily byte allowance for requested downloads'
    };
  }

  // Check upload/download ratio if applicable - express.e:19868-19880
  // Ratio format: X uploads required per 1 download
  const ratioRequired = user.downloadRatio || 0;

  if (ratioRequired > 0) {
    // Calculate free downloads based on uploads
    // express.e:19874: nad:=(cb.ratio*(cb.upload+1))-cb.downloads
    const allowedDownloads = (ratioRequired * (uploads + 1)) - downloads;

    if (allowedDownloads < 1) {
      return {
        canDownload: false,
        errorMessage: 'Not enough free files for requested downloads. Upload more files to increase ratio.'
      };
    }
  }

  // All checks passed
  return { canDownload: true };
}

/**
 * Update user download statistics after successful download
 * Port from express.e download tracking
 *
 * @param user User who downloaded
 * @param fileSize Size of file in bytes
 */
export async function updateDownloadStats(
  user: User,
  fileSize: number
): Promise<void> {
  // Increment download count
  user.downloads = (user.downloads || 0) + 1;

  // Decrement available bytes
  user.bytesAvailableForDownload = Math.max(0, (user.bytesAvailableForDownload || 0) - fileSize);

  // Update last download time
  user.lastDownloadTime = new Date();
}

/**
 * Calculate free bytes available for download
 * Port from express.e:19865 calcConfBad()
 *
 * @param user Current user
 * @returns Available bytes for download
 */
export function calculateAvailableBytes(user: User): number {
  const uploads = user.uploads || 0;
  const downloads = user.downloads || 0;
  const ratioRequired = user.downloadRatio || 0;

  if (ratioRequired === 0) {
    // No ratio required - use daily allowance
    return user.bytesAvailableForDownload || 0;
  }

  // Calculate based on upload/download ratio
  const allowedDownloads = (ratioRequired * (uploads + 1)) - downloads;

  // Assume average file size for calculation (could be made configurable)
  const averageFileSize = 100000; // 100KB

  return Math.max(0, allowedDownloads * averageFileSize);
}

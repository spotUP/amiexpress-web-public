/**
 * Download Ratios Utility
 * Port from express.e:19823+ checkRatiosAndTime()
 *
 * Checks download ratio limits before allowing downloads
 */

import { User } from '../types';
import { getSystemTime } from '../utils/date-time.util';

/**
 * What the per-conference ratio check reads for one conference: the caller's
 * own record in it (express.e:19891-19902 `cb:=confBases.item(getConfIndex(i,1))`,
 * calcConfBad 19797-19821) - his ratio, ratio type, files and bytes there.
 */
export interface ConferenceAccount {
  id: number;
  ratio: number;
  ratioType: number;
  uploads: number;
  downloads: number;
  bytesUpload: number;
  bytesDownload: number;
}

export interface DownloadRequest {
  size: number;
  isFree?: boolean;
  conference?: number;
}

// express.e credit-tracking bit field. Exported so the ! Credit Maintenance
// editor toggles the same bits this ratio logic reads (one source of truth).
export const TRACK_DOWNLOADS_BIT = 1;
export const TRACK_UPLOADS_BIT = 2;

const MAX_INT = 0x7fffffff;

/** The fields today's download allowance is made of. */
export interface TodaysBytesFields {
  todaysBytesLimit?: number;
  dailyBytesLimit?: number;
  byteLimit?: number;
  dailyBytesDld?: number;
}

/**
 * loggedOnUser.todaysBytesLimit: the daily limit plus today's extra bytes
 * (sysop Q edit 21537-21544, uploads 19531/19685), set at logon
 * (28512-28523). An account that carries no record value has the daily
 * limit, which is what the logon would have set. 0 means no limit.
 */
export function todaysBytesLimitOf(user: TodaysBytesFields): number {
  return (user.todaysBytesLimit ?? user.dailyBytesLimit ?? user.byteLimit) || 0;
}

/**
 * bytesADL, as express.e's logons set it (28531-28535 BBS, 28928-28932 FTP):
 *
 *     IF (loggedOnUser.todaysBytesLimit<>0)
 *       bytesADL:=loggedOnUser.todaysBytesLimit-loggedOnUser.dailyBytesDld
 *     ELSE
 *       bytesADL:=$7fffffff
 *
 * In bytes; $7fffffff is "no limit".
 */
/**
 * An upload raises today's limit (express.e:19530-19532 after a protocol
 * upload, 19684-19686 per background-checked file, which is FTP's path):
 *
 *     IF (bytesADL<>$7fffffff)
 *       loggedOnUser.todaysBytesLimit:=loggedOnUser.todaysBytesLimit+tempsize
 *       bytesADL:=bytesADL+tempsize
 *
 * bytesADL is $7fffffff exactly when today's limit is 0 (28531-28535), so an
 * unlimited caller gains nothing. `units` is already in bytes or, under
 * CREDITBYKB, kilobytes, as the caller computes it. bytesADL here is derived
 * from todaysBytesLimit on every read, so raising the limit raises it.
 */
export function creditUploadToToday(user: TodaysBytesFields, units: number): void {
  const limit = todaysBytesLimitOf(user);
  if (limit === 0) return;
  user.todaysBytesLimit = limit + units;
}

export function todaysBytesAvailable(user: TodaysBytesFields): number {
  const limit = todaysBytesLimitOf(user);
  return limit !== 0 ? limit - (user.dailyBytesDld || 0) : MAX_INT;
}

export function creditAccountEnabled(user: User): boolean {
  const days = user.creditDays || 0;
  if (days <= 0) return false;
  const start = user.creditStartDate || 0; // seconds since epoch
  const nowSeconds = Math.floor(Date.now() / 1000);
  return nowSeconds < start + (days * 86400);
}

export function creditAccountTrackDownloads(user: User): boolean {
  if (!creditAccountEnabled(user)) return true;
  const tracking = user.creditTracking || 0;
  return (tracking & TRACK_DOWNLOADS_BIT) !== 0;
}

export function creditAccountTrackUploads(user: User): boolean {
  if (!creditAccountEnabled(user)) return true;
  const tracking = user.creditTracking || 0;
  return (tracking & TRACK_UPLOADS_BIT) !== 0;
}

/**
 * Check if user can download based on ratio limits.
 * Ported from express.e:19823-19926 (checkRatiosAndTime). Under conference
 * accounting the per-conference block reads the caller's own records
 * (`conferences`, one ConferenceAccount per conference).
 *
 * - Respects daily byte limits (byteLimit / dailyBytesLimit - dailyBytesDld).
 * - Respects ratioType:
 *     0: byte ratio only (secLibrary style)
 *     1: byte + file ratio
 *     2: file ratio only (secBoard style)
 * - Free downloads (isFree=true) bypass ratio/file counters but still affect daily byte allowance.
 * - Credit accounts (creditDays>0 and active window) bypass ratio/file checks.
 *
 * Fields mapped from express.e:
 *   ratio/secLibrary  -> user.ratio or user.secLibrary
 *   ratioType/secBoard -> user.ratioType or user.secBoard
 *   uploads/downloads -> file counts
 *   bytesUpload/bytesDownload -> byte counters
 */
export async function checkDownloadRatios(
  user: User | undefined,
  requests: DownloadRequest[] | number,
  /** The caller's own per-conference records, under conference accounting. */
  conferences?: ConferenceAccount[],
  conferenceAccountingEnabled: boolean = false,
  creditByKb: boolean = false,
  /** The conference the caller is in: express.e reports what is left there even before a file is picked. */
  currentConf?: number
): Promise<{
  canDownload: boolean;
  errorMessage?: string;
  remainingBytes?: number;
  remainingFiles?: number;
}> {

  if (!user) {
    return { canDownload: false, errorMessage: 'User not authenticated' };
  }

  const requestList: DownloadRequest[] = Array.isArray(requests)
    ? requests
    : [{ size: typeof requests === 'number' ? requests : 0, isFree: false }];

  // Sysops bypass ratio checks - express.e:19845 checkSecurity(ACS_CONFERENCE_ACCOUNTING)
  if (user.secLevel >= 255) {
    return { canDownload: true };
  }

  const nonFree = requestList.filter(r => !r.isFree);
  const scale = creditByKb ? 1024 : 1;
  const toUnits = (value: number) => Math.floor(Math.max(0, value || 0) / scale);

  const requestedBytes = nonFree.reduce((sum, r) => sum + toUnits(r.size || 0), 0);
  const requestedFiles = nonFree.length;
  const totalRequestedBytes = requestList.reduce((sum, r) => sum + toUnits(r.size || 0), 0);

  // Get user stats
  const uploads = user.uploads || 0;
  const downloads = user.downloads || 0;
  const bytesUpload = toUnits((user.bytesUpload ?? (user as any).uploadBytes) || 0);
  const bytesDownload = toUnits((user.bytesDownload ?? (user as any).downloadBytes) || 0);

  // Daily allowance (bytesADL in express.e): today's limit, which carries
  // the sysop's and the uploads' extra bytes (28531-28535 / 28928-28932).
  const dailyLimit = todaysBytesLimitOf(user as TodaysBytesFields);
  const dailyDownloaded = toUnits(user.dailyBytesDld || 0);
  const limitUnits = toUnits(dailyLimit);
  const bytesADL = dailyLimit > 0 ? Math.max(0, limitUnits - dailyDownloaded) : MAX_INT;
  if (dailyLimit > 0 && totalRequestedBytes > bytesADL) {
    return {
      canDownload: false,
      // express.e:19854 — no trailing period in original
      errorMessage: 'Not enough daily byte allowance for requested downloads'
    };
  }

  const ratioValue = (user.ratio ?? (user as any).secLibrary ?? user.downloadRatio) || 0;
  const ratioType = (user.ratioType ?? (user as any).secBoard) || 0;

  // Credit accounts bypass ratio/file gates
  const creditEnabled = creditAccountEnabled(user);

  if (conferenceAccountingEnabled && conferences && conferences.length > 0) {
    // Per-conference check mirrors express.e checkRatiosAndTime per-conf block
    // Aggregate requested bytes/files per conference
    const perConfTotals: Record<number, { bytes: number; files: number; freeFiles: number }> = {};
    if (currentConf) perConfTotals[currentConf] = { bytes: 0, files: 0, freeFiles: 0 };
    for (const req of requestList) {
      const confNum = req.conference || user.confRJoin || 1;
      if (!perConfTotals[confNum]) perConfTotals[confNum] = { bytes: 0, files: 0, freeFiles: 0 };
      if (req.isFree) {
        perConfTotals[confNum].freeFiles += 1;
      } else {
        perConfTotals[confNum].bytes += toUnits(req.size || 0);
        perConfTotals[confNum].files += 1;
      }
    }

    let remainingBytes: number | undefined;
    let remainingFiles: number | undefined;

    for (const [confIdStr, totals] of Object.entries(perConfTotals)) {
      const confId = Number(confIdStr);
      const conf = conferences.find(c => c.id === confId);
      const cRatio = conf?.ratio ?? ratioValue;
      const cRatioType = conf?.ratioType ?? ratioType;
      // A record's bytes are already in the board's credit unit: express.e
      // books KB into it under CREDITBYKB (15435-15437, 19444) and calcConfBad
      // (19797-19821) compares them unscaled.
      const cBytesUpload = conf ? Math.max(0, conf.bytesUpload) : bytesUpload;
      const cBytesDownload = conf ? Math.max(0, conf.bytesDownload) : bytesDownload;
      const cUploads = conf?.uploads ?? uploads;
      const cDownloads = conf?.downloads ?? downloads;

      // If ratio disabled for this conference, skip
      if (cRatio === 0) {
        remainingBytes = remainingBytes === undefined ? bytesADL : Math.min(remainingBytes, bytesADL);
        continue;
      }
      const confCreditEnabled = creditEnabled; // express.e: per-conf still honors global credit account

      // calcConfBad equivalent: bytes available per conf when ratioType<2
      const allowedBytesConf = cRatioType === 2
        ? MAX_INT
        : Math.max(0, (cRatio * cBytesUpload) - cBytesDownload);
      const allowedFilesConf = Math.max(0, (cRatio * (cUploads + 1)) - cDownloads);

      if (!confCreditEnabled) {
        if (cRatioType < 2 && totals.bytes > allowedBytesConf) {
          return {
            canDownload: false,
            errorMessage: `Conf ${conf?.id ?? confId}: Not enough free bytes for requested downloads.`,
            remainingBytes: allowedBytesConf
          };
        }

        if (cRatioType > 0) {
          const requestedCount = totals.files;
          if (requestedCount > allowedFilesConf) {
            return {
              canDownload: false,
              errorMessage: `Conf ${conf?.id ?? confId}: Not enough free files for requested number of downloads.`,
              remainingFiles: allowedFilesConf
            };
          }
        }
      }

      const confAvailableBytes = Math.min(allowedBytesConf, bytesADL);
      const confRemainingBytes = confAvailableBytes - totals.bytes;
      remainingBytes = remainingBytes === undefined
        ? confRemainingBytes
        : Math.min(remainingBytes, confRemainingBytes);

      if (cRatioType > 0 && !confCreditEnabled) {
        const confRemainingFiles = allowedFilesConf - totals.files;
        remainingFiles = remainingFiles === undefined
          ? confRemainingFiles
          : Math.min(remainingFiles, confRemainingFiles);
      }
    }

    return {
      canDownload: true,
      remainingBytes,
      remainingFiles
    };
  }

  // If ratio is disabled or credit account is active, only daily byte check applies
  if (ratioValue === 0 || creditEnabled) {
    return {
      canDownload: true,
      remainingBytes: bytesADL === MAX_INT ? undefined : bytesADL - requestedBytes
    };
  }

  const allowedBytes = ratioType === 2
    ? MAX_INT
    : Math.max(0, (ratioValue * bytesUpload) - bytesDownload);
  const allowedFiles = Math.max(0, (ratioValue * (uploads + 1)) - downloads);
  const availableBytes = ratioType === 2 ? MAX_INT : Math.min(allowedBytes, bytesADL);

  // RatioType meanings (express.e):
  // 0: bytes only, 1: bytes AND files, 2: files only
  if (ratioType === 2) {
    if (requestedFiles > allowedFiles) {
      return {
        canDownload: false,
        errorMessage: 'Not enough free files for requested number of downloads.',
        remainingFiles: allowedFiles
      };
    }
  } else if (ratioType === 1) {
    if (requestedBytes > availableBytes) {
      return {
        canDownload: false,
        errorMessage: 'Not enough free bytes for requested downloads.',
        remainingBytes: availableBytes
      };
    }

    if (requestedFiles > allowedFiles) {
          return {
            canDownload: false,
            errorMessage: 'Not enough free files for requested number of downloads.',
            remainingFiles: allowedFiles
          };
        }
  } else {
    // ratioType 0 (bytes only)
    if (requestedBytes > availableBytes) {
      return {
        canDownload: false,
        errorMessage: 'Not enough free bytes for requested downloads.',
        remainingBytes: availableBytes
      };
    }
  }

  // All checks passed
  return {
    canDownload: true,
    remainingBytes: ratioType === 2 ? undefined : availableBytes - requestedBytes,
    remainingFiles: ratioType === 0 ? undefined : allowedFiles - requestedFiles
  };
}

/**
 * Update user download statistics after successful download
 * Port from express.e download tracking
 *
 * @param user User who downloaded
 * @param fileSize Size of file in bytes
 * @param isFree Whether file is marked as free download
 * @param cps The measured cps; without one the top cps is left alone
 */
export async function updateDownloadStats(
  user: User,
  fileSize: number,
  isFree: boolean = false,
  cps?: number,
  options: { accounting?: boolean } = {}
): Promise<void> {
  const effectiveSize = Math.max(0, fileSize || 0);
  // Under conference accounting the file's conference record takes the
  // download, not the account (express.e:15440-15452 vs 15453-15460).
  const shouldTrack = creditAccountTrackDownloads(user) && !isFree && !options.accounting;

  if (shouldTrack) {
    const currentDownloads = user.downloads || 0;
    const currentBytes = (user.bytesDownload ?? (user as any).downloadBytes) || 0;
    user.downloads = currentDownloads + 1;
    user.bytesDownload = currentBytes + effectiveSize;
  }
  user.dailyBytesDld = (user.dailyBytesDld || 0) + effectiveSize;

  // Decrement available bytes (if tracked)
  if (typeof user.bytesAvailableForDownload === 'number') {
    user.bytesAvailableForDownload = Math.max(
      0,
      user.bytesAvailableForDownload - effectiveSize
    );
  }

  // Update last download time
  user.lastDownloadTime = getSystemTime();

  // The top download cps, from a transfer the board timed. With no
  // measurement nothing is booked: this used to book a random "modem speed"
  // (1440-5600 cps) for every web and FTP download.
  const downloadCPS = cps ?? 0;
  const currentTopCPS = user.topDownloadCPS || 0;
  if (downloadCPS > currentTopCPS) {
    user.topDownloadCPS = downloadCPS;
console.log(`[DOWNLOAD] New top download CPS for ${user.username}: ${downloadCPS} (was ${currentTopCPS})`);
  }
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

/**
 * Update user upload statistics after successful upload
 * Port from express.e upload tracking
 *
 * @param user User who uploaded
 * @param fileSize Size of file in bytes
 * @param cps The measured cps; without one the top cps is left alone
 */
export async function updateUploadStats(
  user: User,
  fileSize: number,
  cps?: number
): Promise<void> {
  // The top upload cps, from a transfer the board timed; none, nothing booked
  // (this booked a random "modem speed" too).
  const uploadCPS = cps ?? 0;
  const currentTopCPS = user.topUploadCPS || 0;
  if (uploadCPS > currentTopCPS) {
    user.topUploadCPS = uploadCPS;
console.log(`[UPLOAD] New top upload CPS for ${user.username}: ${uploadCPS} (was ${currentTopCPS})`);
  }
}

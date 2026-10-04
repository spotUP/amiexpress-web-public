/**
 * Charging a caller for what he downloaded - one set of books for every path.
 *
 * `D` (handlers/file/download.handler.ts) and the flagged-file batch
 * (handlers/transfer/batch-download.handler.ts) each kept their own:
 *
 *  - the single-file path logged the download, updated the ratio stats, wrote
 *    the account to the database AND to its user.data slot, counted the
 *    conference and the node's bytes today, and on telnet waited for the
 *    transfer to finish;
 *  - the batch path did only the ratio stats and the conference, never touched
 *    user.data (the file AmiExpress itself reads), and on telnet booked
 *    BEFORE sz was even started - so an aborted batch was charged in full,
 *    the exact rule the single-file path had been corrected away from
 *    (web-vs-telnet audit item 19, 2026-09-28).
 *
 * Both call bookDownloads now, at the one moment file-delivery.ts gives them:
 * when a ZMODEM transfer has finished and succeeded (express.e:15437 books
 * behind `IF sentsize`), or at handoff for the browser, which reports no
 * completion.
 */
import type { BBSSession } from '../index';
import { db } from '../database';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity, getACSConfig, ToggleFlags } from '../utils/acs.util';
import { getConferenceToolFlags } from '../utils/conference-tooltypes.util';
import { updateDownloadStats, creditAccountTrackDownloads, checkDownloadRatios } from '../utils/download-ratios.util';
import { getTimeRemainingMinutes } from '../utils/time-tracking.util';
import { DEFAULT_CONNECTION_BAUD } from '../constants/modem';
import { logDownload } from '../utils/download-logging.util';
import { userFileManager } from './UserFileManager';
import { doorDropFileManager } from './DoorDropFileManager';
import { emitDownload } from './bbs-event-emitter';
import { messagePointerFileManager, accountedBytes } from './MessagePointerFileManager';
import type { ConferenceAccount } from '../utils/download-ratios.util';

/** A file as either path carries it. */
export interface BookableFile {
  name?: string;
  filename?: string;
  size: number;
  confNum?: number;
  comment?: string;
  isFree?: boolean;
}

/**
 * A download that costs the caller nothing: flagged free on the file (the
 * `F` comment or an explicit isFree) or free in its conference.
 */
export function isFreeDownload(file: BookableFile | null | undefined): boolean {
  if (!file) return false;
  if (file.isFree === true) return true;
  if (typeof file.comment === 'string' && file.comment.toUpperCase().startsWith('F')) return true;
  if (file.confNum && getConferenceToolFlags(file.confNum).freeDownloads) return true;
  return false;
}

/**
 * express.e:19973-19977 estDlCPS: the caller's best download rate so far, or
 * the line speed over ten before they have one.
 */
export function estimatedDownloadCps(session: BBSSession): number {
  const best = Number((session.user as { topDownloadCPS?: number } | undefined)?.topDownloadCPS) || 0;
  if (best > 0) return best;
  const baud = session.modemBps || session.connectionBaud || DEFAULT_CONNECTION_BAUD;
  return Math.max(1, Math.floor(baud / 10));
}

/** What express.e's checkRatiosAndTime answers for a download set. */
export interface RatiosAndTime {
  /**
   * 0: refused (`error` says why). 1: the caller's file allowance is used
   * exactly - express.e stops asking for more and goes to LAST CHANCE.
   * 2: there is room for more.
   */
  status: 0 | 1 | 2;
  error?: string;
  /** Minutes left once this set has transferred. */
  minsLeft: number;
  /** Bytes the caller may still take, where a byte ratio applies. */
  bytesLeft?: number;
  /** Files the caller may still take, where a file ratio applies. */
  filesLeft?: number;
}

/**
 * express.e:19823-19926 checkRatiosAndTime - the one gate D and DB ask
 * before each filespec and before a transfer: is there time for the set,
 * daily byte allowance, and ratio room (bytes and files, per conference
 * when the caller has conference accounting).
 */
export async function checkRatiosAndTime(
  session: BBSSession,
  files: readonly BookableFile[],
): Promise<RatiosAndTime> {
  const user = session.user;
  const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
  // express.e:19836-19838 tsec:=Div(tempsize,estDlCPS); min:=tsec/60
  const min = Math.floor(Math.floor(totalBytes / estimatedDownloadCps(session)) / 60);
  const minsLeft = getTimeRemainingMinutes(session) - min;

  // express.e:19840-19843
  if (minsLeft < 0 && !(user && checkSecurity(user, ACSPermission.OVERRIDE_TIMELIMIT))) {
    return { status: 0, error: 'Not enough time for requested downloads.', minsLeft };
  }

  const accounting = !!user && checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING);
  const requests = files.map(f => ({ size: f.size || 0, isFree: isFreeDownload(f), conference: f.confNum || session.currentConf }));
  const ratio = await checkDownloadRatios(
    user,
    requests,
    accounting ? callersAccounts(session, [session.currentConf, ...requests.map(r => r.conference)]) : undefined,
    accounting,
    getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true,
    session.currentConf,
  );
  if (!ratio.canDownload) {
    return { status: 0, error: ratio.errorMessage, minsLeft };
  }
  // express.e:19920-19924 RETURN 1 when nad=freeDFlag under a file ratio
  const status = ratio.remainingFiles === 0 ? 1 : 2;
  return { status, minsLeft, bytesLeft: ratio.remainingBytes, filesLeft: ratio.remainingFiles };
}

/**
 * The caller's own records for these conferences, as checkRatiosAndTime
 * reads them under ACS_CONFERENCE_ACCOUNTING (express.e:19891-19902,
 * calcConfBad 19797): ratio, ratio type, files and bytes from his slot in
 * each conference's Conf.DB, message base 1. Not the board-wide
 * `conferences` row - that held everyone's traffic and a ratio of 0, so the
 * per-conference ratio was never enforced.
 */
export function callersAccounts(session: BBSSession, conferenceIds: Array<number | undefined>): ConferenceAccount[] | undefined {
  const slot = Number(session.user?.slotNumber) || 0;
  if (slot < 1) return undefined;
  const ids = [...new Set(conferenceIds.filter((c): c is number => Number.isInteger(c) && (c as number) > 0))];
  return ids.map(id => {
    const rec = messagePointerFileManager.readRecordOrZero(id, slot);
    return {
      id,
      ratio: rec.ratio & 0xffff,
      ratioType: rec.ratioType & 0xffff,
      uploads: rec.upload & 0xffff,
      downloads: rec.downloads & 0xffff,
      bytesUpload: Number(accountedBytes(rec.bytesUpload, rec.uploadBytesBCD)),
      bytesDownload: Number(accountedBytes(rec.bytesDownload, rec.downloadBytesBCD)),
    };
  });
}

/**
 * express.e:15439-15452 updateDownloadStats under ACS_CONFERENCE_ACCOUNTING:
 * the download is booked in the caller's own record for the FILE's
 * conference (`cb:=confBases.item(getConfIndex(fileItem.confNum,1))`,
 * addBCD downloadBytesBCD, downloads+1) - not in a row the whole board shares.
 */
export async function bookConference(session: BBSSession, file: BookableFile, isFree: boolean): Promise<void> {
  const user = session.user;
  if (!user || isFree) return;
  if (!checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING)) return;
  if (!creditAccountTrackDownloads(user)) return;
  const slot = Number(user.slotNumber) || 0;
  const conf = file.confNum || session.currentConf;
  if (slot < 1 || !conf) return;
  // express.e:15435-15437 CREDITBYKB books kilobytes.
  const size = getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
    ? Math.floor((file.size || 0) / 1024) & 0x003fffff
    : (file.size || 0);
  messagePointerFileManager.addDownload(conf, slot, size);
}

/** The account, written where both the board and AmiExpress's own doors read it. */
async function saveAccount(session: BBSSession): Promise<void> {
  const user = session.user;
  if (!user) return;
  // Its own failure, not the file's: a database that cannot take the row
  // must not stop the conference count, the node's bytes and the event.
  try {
    await saveAccountRow(user);
  } catch (err) {
    console.error('[download-booking] could not save the account row:', err);
  }
  if (user.slotNumber) {
    try { userFileManager.updateUserDataFile(user, user.slotNumber); } catch { /* disk error: the DB copy stands */ }
  }
}

/**
 * Only what the account keeps. Not bytesAvailableForDownload - that is
 * AmiExpress's bytesADL, a session figure worked out at logon from the day's
 * limit minus dailyBytesDld (express.e:28529-28535) - and not
 * lastDownloadTime, which express.e has no field for and nothing reads back.
 * Saving them asked for columns that do not exist, so every booked
 * download's row write failed ("no such column").
 */
async function saveAccountRow(user: NonNullable<BBSSession['user']>): Promise<void> {
  await db.updateUser(user.id, {
    downloads: user.downloads,
    bytesDownload: user.bytesDownload,
    dailyBytesDld: user.dailyBytesDld,
    topDownloadCPS: user.topDownloadCPS,
  });
}

/**
 * What the board's own extras make of a download: the catalogue's per-file
 * count, the FILE_DOWNLOADED webhook and the achievement. They lived only in
 * the browser's `file-download-started` handler, which booked the download a
 * second time; here they run once, for every transport.
 */
async function announceDownload(session: BBSSession, file: BookableFile, name: string): Promise<void> {
  const user = session.user;
  if (!user) return;
  const conferenceId = file.confNum || session.currentConf || 1;
  let entry: { id: number; downloads?: number; size?: number; uploadDate?: Date } | null = null;
  try {
    entry = await db.getFileEntryByName(conferenceId, name);
    if (entry) await db.updateFileEntry(entry.id, { downloads: (entry.downloads || 0) + 1 });
  } catch (err) {
    console.warn(`[download-booking] catalogue count for ${name} failed:`, err);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { webhookService, WebhookTrigger } = require('./webhook.service');
    const conference = await db.getConferenceById(conferenceId);
    await webhookService.sendWebhook(WebhookTrigger.FILE_DOWNLOADED, {
      username: user.username,
      userId: user.id,
      gdprConsented: !!(user as any).gdprConsentAt,
      filename: name,
      filesize: file.size,
      conference: conference?.name || 'Unknown',
    });
  } catch (err) {
    console.warn(`[download-booking] download webhook for ${name} failed:`, err);
  }
  // Achievements (SP2): the download, keyed by the file's age. Non-throwing.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { reportDownload } = require('../achievements/sites');
  reportDownload(session as any, entry ?? { size: file.size });
}

/** Charge the caller for these files, one at a time, and say so to the board. */
export async function bookDownloads(session: BBSSession, files: readonly BookableFile[]): Promise<void> {
  const user = session.user;
  if (!user) return;
  for (const file of files) {
    const name = String(file.name ?? file.filename ?? '');
    const isFree = isFreeDownload(file);
    try {
      await logDownload(user, name, file.size, isFree, session.nodeId || 0);
      await updateDownloadStats(user, file.size, isFree);
      await saveAccount(session);
      await bookConference(session, file, isFree);
      doorDropFileManager.updateDownloadBytesToday(session.nodeId || 0, file.size);
      await announceDownload(session, file, name);
      emitDownload({
        username: user.username,
        nodeId: session.nodeId || 1,
        fileName: name,
        fileSize: file.size,
        conferenceId: session.currentConf,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn(`[download-booking] booking ${name} failed:`, err);
    }
  }
}

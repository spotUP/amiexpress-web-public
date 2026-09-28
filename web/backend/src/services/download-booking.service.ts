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
import { ConferenceRepository } from '../database/conference-repository';
import { checkSecurity } from '../utils/acs.util';
import { getConferenceToolFlags } from '../utils/conference-tooltypes.util';
import { updateDownloadStats, creditAccountTrackDownloads } from '../utils/download-ratios.util';
import { logDownload } from '../utils/download-logging.util';
import { userFileManager } from './UserFileManager';
import { doorDropFileManager } from './DoorDropFileManager';
import { emitDownload } from './bbs-event-emitter';

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

export async function conferencesOf(session: BBSSession): Promise<any[] | undefined> {
  if (Array.isArray(session.conferences)) return session.conferences;
  try {
    const confs = await new ConferenceRepository(db as any).getConferences();
    session.conferences = confs;
    return confs;
  } catch (err) {
    console.error('[download-booking] could not load conferences for accounting:', err);
    return undefined;
  }
}

/** The conference's own download count, where the board keeps accounts for it. */
export async function bookConference(session: BBSSession, file: BookableFile, isFree: boolean): Promise<void> {
  const user = session.user;
  if (!user || isFree) return;
  if (!checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING)) return;
  if (!creditAccountTrackDownloads(user)) return;
  const target = (await conferencesOf(session))?.find((c: any) => c.id === file.confNum);
  if (!target) return;
  target.downloads = (target.downloads || 0) + 1;
  target.bytesDownload = (target.bytesDownload || 0) + (file.size || 0);
  const rawDb = (db as any).db ?? db;
  await new ConferenceRepository(rawDb).updateConference(target.id, {
    downloads: target.downloads,
    bytesDownload: target.bytesDownload,
  });
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

async function saveAccountRow(user: NonNullable<BBSSession['user']>): Promise<void> {
  await db.updateUser(user.id, {
    downloads: user.downloads,
    bytesDownload: user.bytesDownload,
    dailyBytesDld: user.dailyBytesDld,
    bytesAvailableForDownload: user.bytesAvailableForDownload,
    lastDownloadTime: user.lastDownloadTime,
    topDownloadCPS: user.topDownloadCPS,
  });
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

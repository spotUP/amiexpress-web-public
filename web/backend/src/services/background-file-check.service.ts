/**
 * THE BACKGROUND FILE CHECK (BGFILECHECK), as express.e runs it.
 *
 * express.e checks an upload while the transfer is still going, on a thread of
 * its own with a message port (createBackgroundFileCheckThread 16922,
 * backgroundFileCheckThread 18495, bgCheckPortName):
 *
 *  - fileReceive (17280) starts the thread when `bgFileCheck` is on and the
 *    caller has USER_BGFILECHECK (or the node has FORCE_BGFILECHECK).
 *  - each file received in full is posted to the thread: BG_CHECKFILE
 *    (doBgCheck 18474, from xprfclose 13921 / zmuploadcompleted 16825).
 *  - the thread runs doBackgroundCheck (19551) on it: EXAMINE, and only when
 *    that produced a description, testFile with bgChecking=TRUE (so the
 *    checker's output is not shown, 18590), the duplicate rule, then the file
 *    goes to HOLD or into the upload area, the uploader is credited, the DIR
 *    line is written - no prompt, the caller is mid-transfer.
 *  - when the transfer ends (17327-17347) BG_EXIT is posted and, if the thread
 *    is still busy, "Waiting for background filecheck to complete..." is
 *    shown until it is gone.
 *  - the upload's own filing loop then runs over what is STILL in the playpen
 *    (receivePlayPen 18015): a bg-checked file has left it. The count and bytes
 *    the thread filed (bgData) are added to the stats (18029-18032) and the
 *    banner says "N files were checked and posted in the background during
 *    upload" (19082).
 *
 * FTP runs the same thread through ftpStartFileCheck (15205): a successful
 * transfer posts BG_CHECKFILE_THEN_QUIT (the thread checks that one file and
 * exits) and ftpWaitFileCheck (15224) polls until the port is gone.
 *
 * PORT. The thread is a promise queue: one file at a time, in the order
 * posted, like the thread's port. A message port, NP_STACKSIZE for the thread
 * (BGFILECHECKSTACK, 16928) and the thread's priority have no meaning for a JS
 * task and are not carried.
 *
 * DEVIATIONS, each forced by the caller being mid-transfer on this board:
 *  - EXAMINE is not run as the SysCmd door (a door takes over the caller's
 *    screen, which the ZMODEM transfer owns): the built-in FILE_ID.DIZ reader
 *    supplies the description. A file without a DIZ is left in the playpen, as
 *    express.e leaves it (19019 `IF fileExists(tempstr)`), for the filing loop.
 *  - FILECHECK (processSysCommand in testFile) is not run: it is a door too.
 */
import * as fs from 'fs';
import * as path from 'path';

import type { BBSSession } from '../index';
import { config } from '../config';
import { UserFlag } from '../constants/express-flags';
import { nodeFlag } from '../utils/node-tooltypes.util';
import { getNodeWorkDir, getPlaypenDir } from '../utils/bbs-paths.util';

/** express.e's max_desclines: the description's lines, including the first. */
const MAX_DESCRIPTION_LINES = 10;
/** express.e:19000 `StrLen(fname)<=12` */
const MAX_BG_NAME_LENGTH = 12;

/** What the thread did with a file it filed (it counts toward bgData). */
export interface CheckedFile {
  bytes: number;
}

/** express.e's thread + port + bgData. One per upload that wants it. */
export class BackgroundFileCheck {
  /** bgData.checkedCount / checkedBytes (16979-16983, 19670-19673). */
  checkedCount = 0;
  checkedBytes = 0;
  private open = true;
  private busy = 0;
  private tail: Promise<void> = Promise.resolve();
  private gone: Promise<void> | null = null;

  /** `doBackgroundCheck` returns what it filed, or null when it left the file alone. */
  constructor(private readonly doBackgroundCheck: (fname: string) => Promise<CheckedFile | null>) {}

  /** FindPort(bgCheckPortName): the thread is there. */
  get running(): boolean {
    return this.open;
  }

  /** The thread is checking or has files queued. */
  get working(): boolean {
    return this.busy > 0;
  }

  /** BG_CHECKFILE (18483-18489): one file to check, queued behind the others. */
  post(fname: string): void {
    if (!this.open) return;
    this.busy++;
    this.tail = this.tail.then(async () => {
      try {
        const done = await this.doBackgroundCheck(fname);
        if (done) {
          this.checkedCount++;
          this.checkedBytes += done.bytes;
        }
      } catch (error) {
        console.error(`[BGFILECHECK] ${fname}:`, error);
      } finally {
        this.busy--;
      }
    });
  }

  /** BG_EXIT (17331-17336): the thread finishes what is queued and goes. */
  exit(): Promise<void> {
    if (!this.gone) {
      this.gone = this.tail.then(() => {
        this.open = false;
      });
    }
    return this.gone;
  }

  /** BG_CHECKFILE_THEN_QUIT (15213-15219): check this file, then exit. */
  postThenQuit(fname: string): void {
    this.post(fname);
    void this.exit();
  }

  /**
   * ftpWaitFileCheck (15224-15246): true once the thread has gone, false when
   * `seconds` have passed first. The caller asks again, as ftpd.e's loop does.
   */
  async waitForExit(seconds: number): Promise<boolean> {
    if (!this.gone) return true; // bgChecking=FALSE: nothing was started
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), seconds * 1000);
    });
    try {
      return await Promise.race([this.gone.then(() => true), timedOut]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** express.e:17514 / 25614 (RZ): `checkToolTypeExists(TOOLTYPE_NODE, node, 'BGFILECHECK')`. */
export function nodeHasBackgroundFileCheck(nodeId: number): boolean {
  return nodeFlag(nodeId, 'BGFILECHECK');
}

/**
 * `bgFileCheck:=checkToolTypeExists(TOOLTYPE_NODE,node,'BGFILECHECK')`, which
 * express.e writes before every upload it starts for a remote caller: U
 * (25652), RZ (25614), the logon part-upload URG (28130) and the lost-carrier
 * restart in scanHoldDesc (17514). A message's file clears it (10728).
 */
export function raiseBackgroundFileCheck(session: BBSSession): void {
  session.bgFileCheck = nodeHasBackgroundFileCheck(session.nodeId || 1);
}

/**
 * express.e:25872 and 26085 (the W menu's option 16), 17764 and 17777 (the
 * upload's Okay prompt): the caller may switch USER_BGFILECHECK only when the
 * node has BGFILECHECK and does not FORCE_BGFILECHECK. A forced node checks
 * every upload whatever the caller's flag says, so there is nothing to choose.
 */
export function userMayToggleBackgroundFileCheck(nodeId: number): boolean {
  return nodeFlag(nodeId, 'BGFILECHECK') && !nodeFlag(nodeId, 'FORCE_BGFILECHECK');
}

/**
 * express.e:17280, 17327, 18478, 19081:
 *   bgFileCheck AND ((userFlags AND USER_BGFILECHECK) OR FORCE_BGFILECHECK)
 *
 * `session.bgFileCheck` is express.e's global, which stays set from the RZ
 * command that raised it until something clears it (a message's file, 10728).
 */
export function backgroundFileCheckWanted(session: BBSSession): boolean {
  if (!session.bgFileCheck) return false;
  const userWants = ((session.user?.userFlags || 0) & UserFlag.BGFILECHECK) !== 0;
  return userWants || nodeFlag(session.nodeId || 1, 'FORCE_BGFILECHECK');
}

/**
 * fileReceive (17279-17283): start the thread for this upload when it is
 * wanted. Returns what the transfer calls for each file received in full, or
 * undefined when there is no background check (the filing loop does it all).
 */
export function startBackgroundFileCheck(
  session: BBSSession,
): { onFileReceived: (fullPath: string) => void } | undefined {
  if (!session.user || !backgroundFileCheckWanted(session)) return undefined;
  session.backgroundFileCheck = new BackgroundFileCheck((fname) => backgroundCheckOfWebUpload(session, fname));
  return { onFileReceived: (fullPath) => doBgCheck(session, path.basename(fullPath)) };
}

/** doBgCheck (18474-18493): post the file to the thread, when it is there. */
export function doBgCheck(session: BBSSession, fname: string): void {
  const thread = session.backgroundFileCheck;
  if (!thread || !thread.running || !backgroundFileCheckWanted(session)) return;
  thread.post(fname);
}

/**
 * fileReceive's end (17327-17347) and receivePlayPen's start (18029-18032):
 * stop the thread, wait for it, and hand back what it filed. Zeroes when there
 * was no thread.
 */
export async function finishBackgroundFileCheck(
  socket: { emit: (event: string, ...args: unknown[]) => unknown },
  session: BBSSession,
): Promise<{ count: number; bytes: number }> {
  const thread = session.backgroundFileCheck;
  if (!thread) return { count: 0, bytes: 0 };
  const exiting = thread.exit();
  if (thread.working) {
    // 17337-17340: only when it is still busy after BG_EXIT was posted.
    socket.emit('ansi-output', 'Waiting for background filecheck to complete...\r\n\r\n');
  }
  await exiting;
  session.backgroundFileCheck = undefined;
  return { count: thread.checkedCount, bytes: thread.checkedBytes };
}

/**
 * express.e:19626-19630 and 19676-19686, which doBackgroundCheck runs for every
 * file it filed: a file that passed and is not held counts one upload and its
 * bytes (kilobytes under CREDITBYKB) when the credit account tracks uploads;
 * every filed file, held or not, raises today's limit by fsize - in kilobytes
 * only when the bytes were booked first, E's own order.
 *
 * `bookCounters` raises the caller's upload counters (the web path keeps a
 * database mirror and a CPS record besides; FTP only the in-memory user).
 */
export async function creditCheckedUpload(
  user: import('../database/types').User,
  checked: { held: boolean; bytes: number },
  bookCounters: (units: number) => void | Promise<void>,
): Promise<void> {
  const { creditAccountTrackUploads, creditUploadToToday } = require('../utils/download-ratios.util');
  const { getACSConfig, ToggleFlags } = require('../utils/acs.util');
  const booked = !checked.held && creditAccountTrackUploads(user);
  const units = booked && getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
    ? Math.floor(checked.bytes / 1024) & 0x003fffff
    : checked.bytes;
  if (booked) await bookCounters(units);
  creditUploadToToday(user, units);
}

/**
 * doBackgroundCheck (19551-19739) for a ZMODEM upload on a web / telnet / SSH
 * session. Returns what it filed, or null when it left the file in the playpen.
 */
export async function backgroundCheckOfWebUpload(session: BBSSession, fname: string): Promise<CheckedFile | null> {
  // 19000
  if (fname.length === 0 || fname.length > MAX_BG_NAME_LENGTH) return null;
  const user = session.user;
  if (!user) return null;

  const dataDir = config.get('dataDir');
  const nodeId = session.nodeId || 1;
  const playpenFile = path.join(getPlaypenDir(nodeId, dataDir), fname);
  // 19011
  if (!fs.existsSync(playpenFile)) return null;

  // 19012-19032: EXAMINE, and the description it wrote. No description, no check.
  const { extractAndReadDiz } = require('../utils/file-diz.util');
  const nodeWorkDir = getNodeWorkDir(nodeId, dataDir);
  const lines: string[] | null = await extractAndReadDiz(playpenFile, nodeWorkDir, [], MAX_DESCRIPTION_LINES);
  if (!lines || lines.length === 0) return null;

  const size = fs.statSync(playpenFile).size;

  // 19051: testFile with bgChecking=TRUE - no caller to show the checker's
  // output to, and no FILECHECK door (see DEVIATIONS).
  const { testFile, TestResult } = require('../utils/file-test.util');
  const verdict = await testFile(playpenFile, nodeWorkDir, { nodeId });

  // 19057 `IF(fcomment[0]="/") THEN status:=RESULT_PRIVATE`
  const isPrivate = lines[0]?.startsWith('/') ?? false;
  const initialStatus: 'active' | 'private' | 'hold' =
    verdict === TestResult.FAILURE ? 'hold' : isPrivate ? 'private' : 'active';
  const marker: 'P' | 'F' | 'N' =
    verdict === TestResult.SUCCESS ? 'P' : verdict === TestResult.FAILURE ? 'F' : 'N';

  // 19061-19130: the duplicate rule, HOLD or the upload area, the DIR line.
  const { areaForConference, fileUploadedFile } = require('./upload-filing.service');
  const fileArea = session.tempData?.fileArea ?? await areaForConference(session.currentConf, dataDir);
  const filing = await fileUploadedFile({
    playpenPath: playpenFile,
    filename: fname,
    size,
    description: lines.join('\n'),
    fileArea,
    conferenceId: session.currentConf,
    nodeId,
    uploader: {
      username: user.username,
      location: (user as { location?: string }).location || '',
      slotNumber: (user as { slotNumber?: number }).slotNumber,
    },
    initialStatus,
    marker,
  });
  // Nowhere to put it: it is still in the playpen for the filing loop.
  if (filing.orphaned) return null;

  const held = filing.duplicate || filing.status !== 'active';
  const { bookUploadCredit } = require('../server/file-socket-handlers');
  await creditCheckedUpload(user as never, { held, bytes: size }, () => bookUploadCredit(session, size));
  if (!filing.duplicate) {
    const { announceFiledUpload } = require('../server/file-socket-handlers');
    await announceFiledUpload(session, {
      filename: fname,
      size,
      description: lines.join('\n'),
      descriptionFromDiz: true,
    });
  }
  return { bytes: size };
}

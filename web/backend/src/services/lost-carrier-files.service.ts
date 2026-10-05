/**
 * LOST-CARRIER UPLOADS - express.e's LCFILES.
 *
 * A caller whose line drops after the transfer, while the board is asking for
 * descriptions, has files the board received whole and nobody described.
 * uploadaFile does not throw them away and does not park them as partials:
 * every file still waiting goes to `<conf>/LCFILES/<name>`, with a DIR-style
 * line - "LOST CARRIER <name>" for its description, N for untested - in
 * `<conf>/LCFILES/<slot>.lc` (handleLCFiles 19740-19774, the RESULT_LCFILES
 * filing 19358-19489). The next time that caller is auto-rejoined to the
 * conference, scanHoldDesc (17477-17522) moves them back into the playpen and
 * runs the upload's description and filing on them (uploadaFile(1), 17518).
 *
 * The port's description step is a sub-state machine, so "the line dropped
 * here" is the disconnect finding the session still in it; the files it had
 * not filed yet are the one being described and the queue behind it.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { config } from '../config';
import { conferenceDir } from '../conferences/conference-paths';
import { joinedConf } from '../utils/joined-conf.util';
import { getSystemTime } from '../utils/date-time.util';
import { emitText } from '../utils/output.util';

/** `<conf>/LCFILES/`, the directory express names `currentConfDir+'LCFILES/'`. */
function lcFilesDir(session: BBSSession): string {
  return path.join(conferenceDir(config.get('dataDir'), joinedConf(session).conf), 'LCFILES');
}

/** `<conf>/LCFILES/<slot>.lc` - purgeScanNM is the slot number (17485). */
function lcListPath(session: BBSSession): string {
  return path.join(lcFilesDir(session), `${session.user?.slotNumber ?? 0}.lc`);
}

/**
 * The files the caller had received and not yet described: the one at the
 * rename prompt or the description prompt, and the ones queued behind it.
 */
export function undescribedUploads(session: BBSSession): string[] {
  const s = session as any;
  const t = s.tempData;
  const out: string[] = [];
  if (session.subState === LoggedOnSubState.UPLOAD_RENAME_PROMPT && s.renamePromptState?.oldPath) {
    out.push(s.renamePromptState.oldPath);
  }
  if (t?.uploadMode) {
    if (t.currentUploadedFile?.path) out.push(t.currentUploadedFile.path);
    for (const next of t.pendingZmodemFiles ?? []) if (next?.path) out.push(next.path);
  }
  return [...new Set(out)].filter((p) => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  });
}

/**
 * The line dropped mid-description: each file waiting goes to LCFILES and
 * its line to `<slot>.lc` (express.e:19385-19489). Moved as move_It moves
 * (19410-19425): rename, else copy and delete, adding `_` to the name while
 * it stays under 35 characters. Returns how many were filed.
 */
export async function fileLostCarrierUploads(session: BBSSession): Promise<number> {
  const files = undescribedUploads(session);
  if (files.length === 0 || !session.user) return 0;

  const dataDir = config.get('dataDir');
  const dir = lcFilesDir(session);
  fs.mkdirSync(dir, { recursive: true });
  const { writeDirEntry } = require('../utils/dir-file.util');
  const { nodeFlag } = require('../utils/node-tooltypes.util');
  const { amigaPathOf } = require('./upload-examine.service');
  const { writeToCallersLog } = require('../utils/download-logging.util');
  const nodeId = session.nodeId || 0;
  const name = session.user.username;

  let filed = 0;
  for (const from of files) {
    const filename = path.basename(from);
    const size = fs.statSync(from).size;
    let dest = path.join(dir, filename);
    let moved = false;
    while (!moved && path.basename(dest).length < 35) {
      try {
        fs.renameSync(from, dest);
        moved = true;
      } catch {
        try {
          fs.copyFileSync(from, dest);
          moved = true;
          try { fs.unlinkSync(from); } catch { /* the copy is filed */ }
        } catch {
          dest += '_';
        }
      }
    }
    // express.e:19427-19435
    const where = moved ? (amigaPathOf(dataDir, dest) ?? dest) : 'WARNING!\r\nUnable to move file!\r\n';
    await writeToCallersLog(`\tUpload ${moved ? '' : 'unable to be '}moved to ${where}`, nodeId);
    // express.e:19448-19489: the description is handleLCFiles' "LOST CARRIER
    // <name>" (19771-19774); untested, so N (19458).
    await writeDirEntry(lcListPath(session), filename, size, getSystemTime(), `LOST CARRIER ${name}`, 'N', name,
      nodeFlag(nodeId, 'SENTBY_FILES'), true);
    filed++;
  }
  return filed;
}

/** MiscFuncs.e:635-643 dirLineNewFile: a line whose first character is not a space starts a file. */
function dirLineNewFile(line: string): boolean {
  const plain = line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  return plain.length > 0 && plain[0] !== ' ' && plain[0] !== '\n';
}

/**
 * express.e:17477-17522 scanHoldDesc, at an auto-rejoin (5067): the caller's
 * lost-carrier files back into the playpen, then the description and filing
 * of an upload, waited for here as uploadaFile's caller waits.
 */
export async function scanHoldDesc(socket: any, session: BBSSession): Promise<void> {
  const list = lcListPath(session);
  if (!session.user || !fs.existsSync(list)) return;

  const dataDir = config.get('dataDir');
  const conf = joinedConf(session).conf;
  const { getPlaypenDir } = require('../utils/bbs-paths.util');
  const { checkForFile } = require('../utils/file-upload.util');
  const playpen = getPlaypenDir(session.nodeId || 0, dataDir);
  fs.mkdirSync(playpen, { recursive: true });

  emitText(socket, 'Preparing Lost Carrier File(s) for File Description(s)\r\n\r\n');
  const prepared: string[] = [];
  for (const line of fs.readFileSync(list, 'latin1').split('\n')) {
    if (!dirLineNewFile(line)) continue;
    const filename = line.split(' ')[0];
    const text = path.join(lcFilesDir(session), filename);
    // checkForFile with lcFileXfr TRUE (17488): the file's own LCFILES copy
    // is not a duplicate of itself.
    if (!(await checkForFile(filename, conf, dataDir, session.nodeId || 0, true))) {
      const to = path.join(playpen, filename);
      try {
        fs.renameSync(text, to);
      } catch {
        try { fs.copyFileSync(text, to); } catch { /* nothing to prepare */ }
      }
      if (fs.existsSync(to)) prepared.push(to);
      emitText(socket, '\tPrepared!');
    } else {
      emitText(socket, '\tFile already exists, deleting file.');
    }
    try { fs.unlinkSync(text); } catch { /* moved */ }
  }
  try { fs.unlinkSync(list); } catch { /* gone */ }

  // uploadaFile(1,'',FALSE) (17518): no receive, the post-receive block on
  // what is in the playpen.
  const { awaitUploadEnd } = require('./upload-end.service');
  const { fileReceivedUploads } = require('../handlers/commands/user-commands.handler');
  const ended = awaitUploadEnd(session);
  await fileReceivedUploads(socket, session, prepared, [], Date.now());
  const stat = await ended;
  // 17519 IF stat=RESULT_GOODBYE THEN modemOffHook()
  if (stat === 'goodbye') {
    const { beginLogoff } = require('../server/logoff');
    beginLogoff(socket, session, {});
  }
}

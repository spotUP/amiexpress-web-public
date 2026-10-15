/**
 * Restricted-file gate (express.e checkFIBForFileSize).
 *
 * AmiExpress stores a file's comment/description in the conference DIR files.
 * A file whose description begins "Restricted" (case-insensitive, first word)
 * must never be downloadable — express.e logs the attempt to CallersLog and
 * refuses:
 *   IF StrCmp(fBlock.comment,'Restricted',10)=0 THEN
 *     callersLog('\t\tAttempt to download RESTRICTED file [<path>]'); RETURN
 *
 * This is the single source of truth for all download paths (single-file,
 * batch/flagged, and the D-command flagged ZMODEM path). Previously each path
 * checked `file.comment`, but their file resolvers never populated it from the
 * DIR metadata, so the gate was dead everywhere and Restricted files were
 * downloadable by anyone.
 */
import * as path from 'path';
import type { Socket } from 'socket.io';
import { getDirFiles } from './max-dirs.util';
import { readDirFile } from './dir-file-reader.util';
import * as amigafs from './amigafs';
import { emitText } from './output.util';

/**
 * True if a DIR description marks the file "Restricted".
 */
export function isRestrictedComment(comment: string | null | undefined): boolean {
  return typeof comment === 'string' && comment.trim().toLowerCase().startsWith('restricted');
}

/**
 * Resolve a file's DIR description (comment) by scanning the conference's
 * DIR files for an entry matching `filename` (case-insensitive). Returns ''
 * when no DIR entry is found.
 */
export async function resolveFileDescription(
  confNum: number,
  bbsDataPath: string,
  filename: string,
): Promise<string> {
  const target = filename.trim().toLowerCase();
  const dirFiles = await getDirFiles(confNum, bbsDataPath);
  for (const dir of dirFiles) {
    let entries;
    try {
      entries = await readDirFile(dir.path);
    } catch {
      continue;
    }
    const match = entries.find(e => e.filename.trim().toLowerCase() === target);
    if (match) {
      return match.description || '';
    }
  }
  return '';
}

/**
 * Convenience: is this file Restricted in the given conference?
 */
export async function isFileRestricted(
  confNum: number,
  bbsDataPath: string,
  filename: string,
): Promise<boolean> {
  return isRestrictedComment(await resolveFileDescription(confNum, bbsDataPath, filename));
}

/**
 * express.e:9579-9608 restricted(): TRUE unless the path can be examined. A
 * path that cannot be locked is refused without a word; one whose comment
 * starts "Restricted" is echoed, reported and written to the CallersLog.
 * This board keeps a file's comment as its DIR description (above).
 *
 * `file` is the path as the board names it (an Amiga path such as
 * `BBS:Conf1/Files/X.TXT`), which is what the caller is shown; `hostPath` is
 * where it is on this machine.
 */
export async function restricted(
  socket: Socket,
  session: { currentConf?: number; nodeId?: number },
  file: string,
  hostPath: string,
  bbsDataPath: string,
): Promise<boolean> {
  if (!amigafs.existsSync(hostPath)) return true;
  if (!(await isFileRestricted(session.currentConf ?? 1, bbsDataPath, path.basename(hostPath)))) return false;
  emitText(socket, '\r\n ');
  emitText(socket, file);
  emitText(socket, '\r\n >>Restricted File<< Updating CallersLog\r\n');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../services/CallersLogManager').callersLogManager.logActivity(
    session.nodeId || 1, `\tAttempt to examine RESTRICTED file ${file.slice(0, 100)}`);
  return true;
}

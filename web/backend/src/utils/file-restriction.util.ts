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
import { getDirFiles } from './max-dirs.util';
import { readDirFile } from './dir-file-reader.util';

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

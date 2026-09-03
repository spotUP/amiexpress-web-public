/**
 * Path resolution for the emulated rexxsupport.library / rexxarplib.library.
 *
 * Two things have to happen before an AREXX door's path can be handed to the
 * host filesystem:
 *
 *  1. Assign substitution - "BBS:", "DOORS:", "RAM:", "T:" ... become host
 *     directories. AmigaDOS volume and assign names are case-insensitive, so
 *     "bbs:bulletins/bull1.txt" and "BBS:Bulletins/Bull1.txt" are the same
 *     file. The mapping table for that already exists and is live: it is
 *     AREXXFileIO.resolveAmigaPath(), the resolver the AREXX interpreter
 *     itself uses. Reused here rather than copied, so the emulated libraries
 *     and the interpreter cannot drift apart.
 *
 *  2. Case resolution of the REST of the path. AmigaDOS filesystems are
 *     case-insensitive and case-preserving; ext2/overlayfs on the Linux
 *     container is neither. A door asking for "bbs:bulletins/bull1.txt" must
 *     still reach "Bulletins/bull1.txt". AREXXFileIO.resolveAmigaPath() does
 *     that too, through amigafs.resolveExistingAncestors() - the one case
 *     matcher. This module adds no matching logic of its own.
 *
 * macOS hides the whole problem behind a case-insensitive volume, which is why
 * these paths worked in development and silently failed on the board.
 */

import { AREXXFileIO } from '../../services/arexx-file-io';

/**
 * Assign substitution plus case resolution, delegated whole to the live AREXX
 * resolver so the emulated libraries and the interpreter cannot drift apart.
 *
 * Holds one AREXXFileIO instance because it carries the current directory that
 * pragma('directory') moves, so it must not be shared between doors.
 */
export class RexxPathResolver {
  private readonly assigns: AREXXFileIO;

  constructor(bbsRoot: string) {
    this.assigns = new AREXXFileIO(bbsRoot);
  }

  resolve(amigaPath: string): string {
    return this.assigns.resolveAmigaPath(amigaPath);
  }
}

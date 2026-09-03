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
 *     still reach "Bulletins/bull1.txt". That is what amigafs exists for, and
 *     amigafs.resolvePath() is the only case matcher used here - this module
 *     adds no matching logic of its own.
 *
 * macOS hides the whole problem behind a case-insensitive volume, which is why
 * these paths worked in development and silently failed on the board.
 */

import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { AREXXFileIO } from '../../services/arexx-file-io';

/**
 * Case-resolve as much of `hostPath` as exists on disk, leaving the components
 * that do not exist yet verbatim.
 *
 * A plain amigafs.resolvePath() is all-or-nothing: it returns null the moment
 * one component is missing, which is exactly the case for every file or
 * directory a door is about to CREATE. Returning the unresolved path in that
 * situation would let MAKEDIR/WRITEFILE mint a lowercase twin directory next
 * to the real, differently-cased one. Walking up to the deepest ancestor that
 * does exist gives the create a correctly-cased parent to land in.
 */
export function resolveExistingAncestors(hostPath: string): string {
  const direct = amigafs.resolvePath(hostPath);
  if (direct) {
    return direct;
  }

  const tail: string[] = [];
  let current = hostPath;

  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) {
      // Reached the filesystem root without resolving anything.
      return hostPath;
    }

    tail.unshift(path.basename(current));

    const resolvedParent = amigafs.resolvePath(parent);
    if (resolvedParent) {
      return path.join(resolvedParent, ...tail);
    }

    current = parent;
  }
}

/**
 * Assign substitution plus case resolution, in that order.
 *
 * Holds one AREXXFileIO purely for its assign table; the instance carries the
 * current directory that pragma('directory') would move, so it must not be
 * shared between doors.
 */
export class RexxPathResolver {
  private readonly assigns: AREXXFileIO;

  constructor(bbsRoot: string) {
    this.assigns = new AREXXFileIO(bbsRoot);
  }

  resolve(amigaPath: string): string {
    return resolveExistingAncestors(this.assigns.resolveAmigaPath(amigaPath));
  }
}

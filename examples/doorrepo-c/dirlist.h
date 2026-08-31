/* dirlist.h - the one place this door enumerates a directory.
 *
 * Its own platform pair, for the same reason shell.h has one: the two
 * targets do not merely spell it differently, they reach it by different
 * means.
 *
 *   native  - opendir()/readdir()/stat().
 *   AmigaOS - dos.library Lock()/Examine()/ExNext()/UnLock().
 *
 * Why this exists at all. Until now the door had no directory enumeration,
 * and flow.h said so - "C89 has no directory enumeration at all, and
 * AmigaDOS's Examine/ExNext is not available through the portable backend".
 * The second half of that was a statement about THIS door's structure, not
 * about AmigaOS: Examine/ExNext are ordinary dos.library calls, and
 * AmiExpress itself uses them in 36 places (express.e). The consequence of
 * not having them was that the door could only know what an archive
 * contained by asking the BBS for a listing - which is fine on this board
 * and useless on a real one, where there is no BBS API to ask.
 *
 * A CALLBACK, not a returned array, and deliberately. This door's static
 * data is already within ~80 KB of the ceiling the emulator enforces on a
 * door's CODE+DATA+BSS (see web/backend/src/amiga-emulation/memory-map.ts);
 * a listing buffer sized for a large door directory would eat a visible
 * fraction of that. The caller keeps only what it actually needs - a count,
 * one matching name, a screenful - and pays for nothing else.
 *
 * C89.
 */

#ifndef DOORREPO_DIRLIST_H
#define DOORREPO_DIRLIST_H

/* Called once per entry, in whatever order the filesystem yields.
 *
 * `name` is the bare entry name, never a path, and is only valid for the
 * duration of the call - copy it if you need it afterwards. `size` is
 * meaningless for a directory and is reported as 0. `is_dir` is 1 for a
 * directory, 0 for anything else.
 *
 * Return 0 to continue, non-zero to stop the walk early. */
typedef int (*dirlist_cb)(void *ctx, const char *name, unsigned long size,
                          int is_dir);

/* Enumerates the immediate children of `path` - it does NOT recurse, and it
 * never yields "." or "..".
 *
 * Returns the number of entries passed to the callback, or -1 if `path`
 * could not be opened or is not a directory. A directory that exists and is
 * empty returns 0, which is why the failure value is negative rather than
 * 0: "no entries" and "no such directory" are different answers and the
 * caller of an install verification needs to tell them apart.
 *
 * Stopping early via the callback is not an error: the count returned is
 * how many entries were reported, including the one that stopped it. */
long dirlist_scan(const char *path, dirlist_cb cb, void *ctx);

#endif /* DOORREPO_DIRLIST_H */

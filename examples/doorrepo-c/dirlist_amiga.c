/* dirlist_amiga.c - dirlist.h for the real m68k/AmigaOS target.
 *
 * Lock()/Examine()/ExNext()/UnLock(). dos.library itself is opened by
 * vbcc's -lauto stub the first time one of these is referenced, the same
 * way shell_amiga.c reaches Execute().
 *
 * The FileInfoBlock comes from AllocMem(MEMF_CLEAR|MEMF_PUBLIC) rather than
 * the stack. It MUST be longword aligned - AmigaOS says so, because the
 * filesystem writes it through a packet - and a struct on the stack carries
 * only the alignment the compiler happened to give the frame.
 * AllocDosObject(DOS_FIB) is the other correct way; AllocMem is used here
 * because it is one fewer dos.library entry to depend on and this door
 * already relies on AllocMem working.
 *
 * fib_FileName is a plain NUL-terminated C string - the NDK's dos/dos.h
 * declares `TEXT fib_FileName[108]` and documents it as null terminated.
 * That is worth stating because this project's 68K emulator wrote it as a
 * BCPL string (a leading length byte) until 2026-08-31, which put a stray
 * control character in front of every name. If names ever come back looking
 * like that again, the emulator regressed, not this file.
 *
 * ExNext() ends by returning DOSFALSE with IoErr() == ERROR_NO_MORE_ENTRIES.
 * Any other IoErr is a real failure, but by then entries have already been
 * reported, so the count is still the honest answer to "how many did you
 * see" and the caller is told that much.
 *
 * C89.
 */

#include <exec/types.h>
#include <exec/memory.h>
#include <dos/dos.h>
#include <proto/exec.h>
#include <proto/dos.h>

#include "dirlist.h"

long dirlist_scan(const char *path, dirlist_cb cb, void *ctx)
{
    BPTR lock;
    struct FileInfoBlock *fib;
    long count = 0;

    if (path == (const char *) 0 || cb == (dirlist_cb) 0) {
        return -1L;
    }

    lock = Lock((STRPTR) path, ACCESS_READ);
    if (lock == (BPTR) 0) {
        return -1L;
    }

    fib = (struct FileInfoBlock *)
        AllocMem((ULONG) sizeof(struct FileInfoBlock), MEMF_CLEAR | MEMF_PUBLIC);
    if (fib == (struct FileInfoBlock *) 0) {
        UnLock(lock);
        return -1L;
    }

    if (!Examine(lock, fib)) {
        FreeMem(fib, (ULONG) sizeof(struct FileInfoBlock));
        UnLock(lock);
        return -1L;
    }

    /* dos/dos.h: "If < 0, then a plain file. If > 0 a directory". */
    if (fib->fib_DirEntryType <= 0) {
        FreeMem(fib, (ULONG) sizeof(struct FileInfoBlock));
        UnLock(lock);
        return -1L;
    }

    while (ExNext(lock, fib)) {
        int is_dir = (fib->fib_DirEntryType > 0) ? 1 : 0;
        unsigned long size = is_dir ? 0UL : (unsigned long) fib->fib_Size;

        count++;
        if (cb(ctx, (const char *) fib->fib_FileName, size, is_dir) != 0) {
            break;
        }
    }

    FreeMem(fib, (ULONG) sizeof(struct FileInfoBlock));
    UnLock(lock);
    return count;
}

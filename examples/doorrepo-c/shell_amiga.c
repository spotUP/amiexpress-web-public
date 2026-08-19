/* shell_amiga.c - shell.h for the real m68k/AmigaOS target.
 *
 * dos.library/Execute() over the AmigaDOS LhA form. dos.library itself is
 * opened by vbcc's -lauto stub the first time Execute() is referenced, the
 * same way this project's other Amiga-side code reaches DOS.
 *
 * Execute() is given NULL for both input and output, which tells DOS to use
 * the process's own streams - the door has no console of its own here, and
 * an archiver that wants to print goes to the same place every other
 * message from this process goes.
 *
 * Execute() returns DOSTRUE/DOSFALSE, not the archiver's return code, so
 * "it ran" is all this can honestly report. The caller must check that the
 * files are actually there.
 *
 * C89.
 */

#include <exec/types.h>
#include <proto/dos.h>

#include "flow.h"
#include "shell.h"

int shell_extract(const char *lha_command, const char *archive_path,
                  const char *dest_dir)
{
    char cmd[600];

    if (flow_build_extract_command(cmd, sizeof(cmd), lha_command,
                                   archive_path, dest_dir, 1) < 0) {
        return 0;
    }

    return Execute((STRPTR) cmd, (BPTR) 0, (BPTR) 0) ? 1 : 0;
}

/* shell_native.c - shell.h for the development/host build.
 *
 * system() over the Unix lha "xw=<dir>" form. See flow_build_extract_command()
 * for why the two targets cannot share one spelling.
 *
 * C89.
 */

#include <stdlib.h>

#include "flow.h"
#include "shell.h"

int shell_extract(const char *lha_command, const char *archive_path,
                  const char *dest_dir)
{
    char cmd[600];

    if (flow_build_extract_command(cmd, sizeof(cmd), lha_command,
                                   archive_path, dest_dir, 0) < 0) {
        return 0;
    }

    return system(cmd) == 0;
}

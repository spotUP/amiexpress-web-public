/* dirlist_native.c - dirlist.h for the development/host build.
 *
 * opendir()/readdir()/stat(). POSIX, not C89, which is why the Makefile's
 * NATIVE_CFLAGS defines _DEFAULT_SOURCE - under a bare -std=c89 glibc hides
 * these behind a feature-test macro, the same trip-up netio.c documents for
 * fd_set and getaddrinfo.
 *
 * C89 otherwise.
 */

#include <dirent.h>
#include <string.h>
#include <sys/stat.h>

#include "dirlist.h"

long dirlist_scan(const char *path, dirlist_cb cb, void *ctx)
{
    DIR *d;
    struct dirent *ent;
    long count = 0;

    if (path == (const char *) 0 || cb == (dirlist_cb) 0) {
        return -1L;
    }

    d = opendir(path);
    if (d == (DIR *) 0) {
        return -1L;
    }

    while ((ent = readdir(d)) != (struct dirent *) 0) {
        char full[1024];
        struct stat st;
        unsigned long size = 0UL;
        int is_dir = 0;

        if (strcmp(ent->d_name, ".") == 0 || strcmp(ent->d_name, "..") == 0) {
            continue;
        }

        /* stat() rather than d_type: d_type is not POSIX, and several
         * filesystems report DT_UNKNOWN for every entry. The size has to
         * be fetched anyway. */
        if (strlen(path) + strlen(ent->d_name) + 2 > sizeof(full)) {
            continue;
        }
        strcpy(full, path);
        if (full[0] != '\0' && full[strlen(full) - 1] != '/') {
            strcat(full, "/");
        }
        strcat(full, ent->d_name);

        if (stat(full, &st) == 0) {
            is_dir = S_ISDIR(st.st_mode) ? 1 : 0;
            if (!is_dir) {
                size = (unsigned long) st.st_size;
            }
        }

        count++;
        if (cb(ctx, ent->d_name, size, is_dir) != 0) {
            break;
        }
    }

    closedir(d);
    return count;
}

/* listtxt.h - parser for the DoorRepo list.txt plain-text index.
 *
 * Binding format contract: docs/DOOR-REPO-API.md, section 3 ("list.txt
 * format"). Byte-exact ISO-8859-1, CRLF line endings:
 *
 *   DOORREPO|<formatVersion>|<revision>|<count>
 *   <archiveName>|<doorType>|<archiveSize>|<md5>|<name>|<description>
 *   ... (one row per door)
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_LISTTXT_H
#define DOORREPO_LISTTXT_H

typedef struct {
    char archive[64];
    char type[8];
    unsigned long size;
    char md5[33];
    char name[64];
    char desc[128];
} dr_entry;

/* Parses one header line ("DOORREPO|<formatVersion>|<revision>|<count>").
 * `line` must be NUL-terminated and is never modified.
 * `revision` receives the revision field, bounded to `revlen` bytes
 * (including the terminating NUL); pass revlen==0 to skip it entirely.
 * Returns 0 on success, non-zero if the "DOORREPO" literal is missing or
 * a required field/delimiter is absent. */
int listtxt_parse_header(const char *line, int *format_version,
                          char *revision, unsigned long revlen,
                          unsigned long *count);

/* Parses one data row ("<archiveName>|<doorType>|<archiveSize>|<md5>|
 * <name>|<description>") into `out`. `line` must be NUL-terminated and is
 * never modified (no strtok - bounded copies only).
 *
 * Per the append-only format-evolution promise (DOOR-REPO-API.md section
 * 3): a row may carry MORE than six pipe-delimited fields in a future
 * format revision. This parser reads only the first six fields by
 * position and silently ignores anything after the sixth - a seventh (or
 * later) field never causes a parse failure.
 *
 * The server has already replaced any literal '|' inside a text field
 * with '!' before transmission (see "Pipe escaping" in the format doc).
 * This parser does NOT unescape '!' back to '|' - callers see the
 * escaped form verbatim, exactly as the wire bytes read.
 *
 * Every destination field is bounded-copied and always NUL-terminated,
 * even when the source field is longer than the destination array - the
 * value is truncated, never overrun. `size` (archiveSize) is parsed as
 * an unsigned long; a missing/non-numeric size field yields 0, not a
 * parse failure. An empty md5 field is valid (see the format doc's
 * "Digest freshness" note) and yields `out->md5[0] == '\0'`.
 *
 * Returns 0 on success. Returns non-zero if fewer than six pipe-delimited
 * fields are present (the row is malformed) - in that case `out` may have
 * been partially filled, but no write ever crosses a destination array's
 * own bound. */
int listtxt_parse_row(const char *line, dr_entry *out);

#endif /* DOORREPO_LISTTXT_H */

/* listtxt.c - parser for the DoorRepo list.txt plain-text index.
 * See listtxt.h for the format contract and the public interface.
 *
 * C89. No strtok on the caller's buffer (the interface takes a
 * `const char *` and must never modify it) - fields are located by
 * scanning for delimiters and copied out with bounded memcpy, always
 * NUL-terminated.
 */

#include <string.h>
#include <stdlib.h>
#include "listtxt.h"

/* Scans forward from `p` for the first delimiter: '|' (the field
 * separator), '\r' or '\n' (so a row arriving with a trailing CRLF - or a
 * bare LF, or a stray CR - never leaks into the field it terminates), or
 * the string's own '\0'. Always stops at '\0' if reached first, so a line
 * with no trailing line ending is still safely bounded. Never modifies
 * the source and never reads past the terminating '\0'. */
static const char *field_end(const char *p)
{
    while (*p != '\0' && *p != '|' && *p != '\r' && *p != '\n') {
        p++;
    }
    return p;
}

/* Bounded-copies the half-open byte range [start, stop) into dest, a
 * buffer of destsize bytes (including the terminating NUL). Truncates
 * rather than overflowing: at most destsize - 1 bytes are copied, and
 * dest is always NUL-terminated afterward (when destsize > 0 - a
 * destsize of 0 is a no-op, so a caller may pass a NULL dest with
 * destsize 0 to skip a field entirely, as listtxt_parse_header does for
 * an uninteresting revision buffer). */
static void copy_field(const char *start, const char *stop, char *dest, unsigned long destsize)
{
    unsigned long len;
    unsigned long copy_len;

    if (destsize == 0) {
        return;
    }

    len = (unsigned long) (stop - start);
    copy_len = len;
    if (copy_len > destsize - 1) {
        copy_len = destsize - 1;
    }
    if (copy_len > 0) {
        memcpy(dest, start, (size_t) copy_len);
    }
    dest[copy_len] = '\0';
}

int listtxt_parse_header(const char *line, int *format_version,
                          char *revision, unsigned long revlen,
                          unsigned long *count)
{
    static const char prefix[] = "DOORREPO";
    unsigned long prefixlen = (unsigned long) (sizeof(prefix) - 1);
    const char *p = line;
    const char *end;
    char verbuf[16];
    char countbuf[32];

    if (strncmp(p, prefix, (size_t) prefixlen) != 0) {
        return 1;
    }
    p += prefixlen;
    if (*p != '|') {
        return 1;
    }
    p++;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, verbuf, sizeof(verbuf));
    if (verbuf[0] == '\0') {
        return 1;
    }
    p = end + 1;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, revision, revlen);
    p = end + 1;

    end = field_end(p);
    copy_field(p, end, countbuf, sizeof(countbuf));
    if (countbuf[0] == '\0') {
        return 1;
    }

    /* format_version is the field the contract designates as "the
     * authority for what fields to expect" - a door that reads a
     * silently-defaulted 0 here and proceeds is trusting a version it
     * never actually received. So unlike archiveSize (a genuinely
     * optional data field, where 0 doubles as "unknown" per the format
     * doc), a non-numeric or empty format_version - or count, which
     * gates how many data rows the caller should expect to read - makes
     * the whole header malformed: return non-zero rather than guessing.
     * strtol/strtoul's endptr tells us whether the field was consumed
     * in full; a stray trailing byte (or, for an all-non-numeric field,
     * an endptr that never advanced past the start) means the field
     * was not purely numeric. */
    {
        char *version_end;
        char *count_end;
        long fv;
        unsigned long cnt;

        fv = strtol(verbuf, &version_end, 10);
        if (*version_end != '\0') {
            return 1;
        }

        cnt = strtoul(countbuf, &count_end, 10);
        if (*count_end != '\0') {
            return 1;
        }

        if (format_version != (int *) 0) {
            *format_version = (int) fv;
        }
        if (count != (unsigned long *) 0) {
            *count = cnt;
        }
    }

    return 0;
}

int listtxt_parse_row(const char *line, dr_entry *out)
{
    const char *p = line;
    const char *end;
    char sizebuf[32];

    /* The optional fields' "not supplied" state, set BEFORE any parsing so
     * a row that ends after field six - or one that fails partway - never
     * leaves a caller reading whatever the previous row put in a reused
     * dr_entry. */
    out->author[0] = '\0';
    out->group[0] = '\0';
    out->junk = -1;
    out->has_doc = -1;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, out->archive, sizeof(out->archive));
    p = end + 1;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, out->type, sizeof(out->type));
    p = end + 1;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, sizebuf, sizeof(sizebuf));
    out->size = strtoul(sizebuf, (char **) 0, 10);
    p = end + 1;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, out->md5, sizeof(out->md5));
    p = end + 1;

    end = field_end(p);
    if (*end != '|') {
        return 1;
    }
    copy_field(p, end, out->name, sizeof(out->name));
    p = end + 1;

    /* Sixth field. Everything from here on is optional: the row is already
     * valid, and a server that predates the 2026-08-18 append ends the line
     * here. */
    end = field_end(p);
    copy_field(p, end, out->desc, sizeof(out->desc));
    if (*end != '|') {
        return 0;
    }
    p = end + 1;

    /* Seventh: author. */
    end = field_end(p);
    copy_field(p, end, out->author, sizeof(out->author));
    if (*end != '|') {
        return 0;
    }
    p = end + 1;

    /* Eighth: release group. */
    end = field_end(p);
    copy_field(p, end, out->group, sizeof(out->group));
    if (*end != '|') {
        return 0;
    }
    p = end + 1;

    /* Ninth: junk/ad file count. An empty or non-numeric field stays -1
     * ("unknown") rather than becoming 0 ("clean"): claiming an archive
     * has no ads because a field was garbled is the one wrong answer here,
     * since it is the answer that makes a UI hide a warning. Validated the
     * same way listtxt_parse_header validates its numeric fields - via
     * strtoul's endptr, which catches both a partly-numeric field and one
     * that never advanced at all. */
    end = field_end(p);
    copy_field(p, end, sizebuf, sizeof(sizebuf));
    if (sizebuf[0] != '\0') {
        char *junk_end;
        unsigned long parsed = strtoul(sizebuf, &junk_end, 10);
        if (*junk_end == '\0') {
            out->junk = (long) parsed;
        }
    }
    if (*end != '|') {
        return 0;
    }
    p = end + 1;

    /* Tenth: documentation flag, exactly '0' or '1'. Anything else (empty,
     * a word, a longer number) leaves it unknown, for the same reason. */
    end = field_end(p);
    if (end == p + 1) {
        if (*p == '0') {
            out->has_doc = 0;
        } else if (*p == '1') {
            out->has_doc = 1;
        }
    }

    /* Any eleventh-or-later field is ignored, per the append-only
     * promise - reaching one is not an error. */
    return 0;
}

/* listtxt.h - parser for the DoorRepo list.txt plain-text index.
 *
 * Binding format contract: docs/DOOR-REPO-API.md, section 3 ("list.txt
 * format"). Byte-exact ISO-8859-1, CRLF line endings:
 *
 *   DOORREPO|<formatVersion>|<revision>|<count>
 *   <archiveName>|<doorType>|<archiveSize>|<md5>|<name>|<description>
 *     |<author>|<releaseGroup>|<junkCount>|<hasDoc>
 *   ... (one row per door)
 *
 * Fields 7-10 were appended to the format on 2026-08-18 and are OPTIONAL
 * here: a row that stops after the sixth field parses exactly as before,
 * with the new members set to their "the server did not say" values (see
 * dr_entry below). That is not defensive padding - the door has to keep
 * working against a repo server that has not been redeployed yet, and
 * against the cached list.txt of one that had not been.
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
    /* Fields 7-10, appended to the format 2026-08-18. Sized to the
     * server's own caps (48 and 32 characters plus a NUL) so a value is
     * never truncated on this side - a client-truncated author would
     * silently stop matching a search for its tail. */
    char author[49];
    char group[33];
    /* Ad/junk files inside the archive, and whether documentation exists.
     * Both use -1 for "the row did not carry this field", which is NOT the
     * same as 0/"none": a UI gating a key on these must treat unknown as
     * "offer it" (the pre-append behaviour) rather than hiding a key that
     * would have worked. */
    long junk;
    int has_doc;
} dr_entry;

/* Parses one header line ("DOORREPO|<formatVersion>|<revision>|<count>").
 * `line` must be NUL-terminated and is never modified.
 * `revision` receives the revision field, bounded to `revlen` bytes
 * (including the terminating NUL); pass revlen==0 to skip it entirely.
 *
 * `formatVersion` is the field the format contract designates as "the
 * authority for what fields to expect" (DOOR-REPO-API.md section 3) - so
 * unlike `archiveSize` in listtxt_parse_row (a genuinely optional data
 * field where 0 doubles as "unknown"), this parser refuses to guess it:
 * a non-numeric or empty `formatVersion` OR `count` field makes the
 * whole header malformed. A door that cannot establish the true format
 * version must refuse the catalog, not proceed having silently
 * substituted 0 for a value it never actually received.
 *
 * Returns 0 on success, non-zero if the "DOORREPO" literal is missing, a
 * required field/delimiter is absent, or `formatVersion`/`count` is
 * empty or not purely numeric. */
int listtxt_parse_header(const char *line, int *format_version,
                          char *revision, unsigned long revlen,
                          unsigned long *count);

/* Parses one data row ("<archiveName>|<doorType>|<archiveSize>|<md5>|
 * <name>|<description>|<author>|<releaseGroup>|<junkCount>|<hasDoc>")
 * into `out`. `line` must be NUL-terminated and is never modified (no
 * strtok - bounded copies only).
 *
 * Per the append-only format-evolution promise (DOOR-REPO-API.md section
 * 3): a row may carry MORE fields than this parser knows. Fields 1-6 are
 * required; fields 7-10 are read when present and left at their "not
 * supplied" values when the row ends early; anything after the tenth is
 * silently ignored and never causes a parse failure.
 *
 * "Not supplied" is `author[0] == '\0'`, `group[0] == '\0'`, `junk == -1`
 * and `has_doc == -1`. Note that an EMPTY field seven or eight is a
 * different statement from an absent one (the server sends an empty author
 * when the catalog has none), but both leave the same empty string here -
 * a caller that needs to tell those apart cannot, by design: there is
 * nothing a UI would do differently for "no author recorded" versus "this
 * server predates the author field".
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
 * parse failure - deliberately, since the format doc already uses 0 to
 * mean "unknown" for this field (unlike listtxt_parse_header's
 * `formatVersion`/`count`, which are refused outright when malformed).
 * A CONSEQUENCE OF THIS: `out->size == 0` is ambiguous between "the
 * server recorded size 0 / doesn't know the size" and "the size field
 * was garbled in transit" - a caller must not infer "the server said
 * unknown" from 0 alone if it needs to tell those two apart. An empty
 * md5 field is valid (see the format doc's "Digest freshness" note) and
 * yields `out->md5[0] == '\0'`.
 *
 * Returns 0 on success. Returns non-zero if fewer than six pipe-delimited
 * fields are present (the row is malformed) - in that case `out` may have
 * been partially filled, but no write ever crosses a destination array's
 * own bound. */
int listtxt_parse_row(const char *line, dr_entry *out);

#endif /* DOORREPO_LISTTXT_H */

/* json_lite.h - narrow, targeted JSON extraction for the DoorRepo admin API
 * (owner-mode curation: login token, submission list). NOT a general JSON
 * parser, matching this door's existing minimalist-parser ethos -
 * listtxt.c reads six positional pipe-delimited fields and ignores the
 * rest; this reads a handful of named keys out of a flat or shallowly
 * nested object and ignores everything else. Every key this door ever
 * looks for (token, id, archiveName, error, ok, size, md5, note, status)
 * is unique within the one response it is read from, so none of the
 * scalar extractors below track {}/[] nesting depth at all - only
 * json_next_array_object() does, because that is the one place nesting
 * depth is unavoidable (a row's own closing brace must not be confused
 * with its nested "derived" object's closing brace).
 *
 * This is the single most important security surface in the owner-mode
 * curation plan (see this door's own README.md, "Security" section,
 * vulnerability class #4 - "unbounded response bodies"): these functions
 * are handed byte content that arrived over the network from a server
 * this door does not control. Every one of them is byte-by-byte bounded,
 * refuses rather than guesses on anything malformed or truncated, and
 * never reads past a NUL terminator - see json_lite.c's file header for
 * the specific defenses.
 *
 * Pure, I/O-free. C89. No stdint.h (not available on the m68k-amiga-elf/
 * vbcc toolchain).
 */

#ifndef DOORREPO_JSON_LITE_H
#define DOORREPO_JSON_LITE_H

/* Finds "key":"value" (a string field) anywhere in a flat or nested JSON
 * object and copies the unescaped value into `out` (\" \\ \/ \n \t \r and
 * \uXXXX are unescaped per the JSON spec's minimum - this door's own
 * values never need more; a \uXXXX code point above 0xFF is truncated to
 * its low byte, matching the Latin-1-everywhere assumption this door
 * already makes elsewhere - see listtxt.h's file header). Scans
 * byte-by-byte and respects quoted strings (a key name appearing inside
 * an unrelated string VALUE, e.g. `{"note":"the token field matters"}`,
 * must not false-match when looking for "token") but does NOT track {}
 * object-nesting depth - safe for this door's use because every key it
 * looks for is unique within the one response it's read from (see the
 * file header above).
 *
 * Returns 0 on success. Returns non-zero if the key is absent, the value
 * is not a JSON string, the input is truncated/malformed (an unterminated
 * string, a cut escape sequence, or a scan-length cap reached before a
 * terminator was found), or the decoded value would not fit `outcap` -
 * `out` is left as "" on any failure, never partially filled. */
int json_extract_string(const char *json, const char *key,
                         char *out, unsigned long outcap);

/* Same contract for a bare boolean or integer/numeric field (e.g. an
 * httpish "ok":true read as 1, or "size":12345 read as 12345). Accepts
 * the literal tokens `true`/`false` (read as 1/0) or an optionally
 * negative run of ASCII digits; anything else at the value position
 * (a string, null, an object/array, or no digits at all) is refused.
 * Same key-finding rule as json_extract_string() above (string-respecting,
 * no {} nesting tracking). Returns 0/non-zero the same way; `*out` is
 * left untouched on failure. */
int json_extract_bool(const char *json, const char *key, int *out);

/* Cursor-based scanner for a top-level JSON array of objects (GET
 * /submissions' `{"rows":[{...},{...}]}` shape). Call repeatedly with
 * the same `*cursor` (start it at 0); each call returns a pointer to the
 * START of the next {...} object that is a DIRECT ELEMENT of the first
 * array found in `json` (so the response's own outer wrapping object,
 * e.g. the `{` before `"rows":`, is never itself mistaken for a row), and
 * its length, and advances *cursor past it.
 *
 * This is the one function in this module that DOES track bracket
 * nesting - a small, fixed-depth stack of container types ('{' / '[')
 * rather than a single integer, so a row's own nested "derived":{...}
 * object is walked through (its braces balanced, its content otherwise
 * ignored) without ending the row early, and so an object nested inside
 * something OTHER than the target array (the response's own wrapping
 * object) is never mistaken for a row either. "derived" is never parsed
 * by this module - it is opaque, skipped whole; v1 has no use for it. The
 * caller then runs json_extract_string()/json_extract_bool() against
 * just that object's slice (copied into a small NUL-terminated buffer
 * first - this function returns a pointer/length INTO `json`, not a
 * NUL-terminated string on its own) for id/archiveName/size/md5/note/
 * status.
 *
 * Returns 0 and sets *obj_start and *obj_len when an object was found,
 * non-zero at the end of the array (including a genuinely empty `[]`),
 * on malformed input (mismatched/unbalanced brackets, an unterminated
 * string, nesting deeper than this scanner's fixed stack, or a
 * scan-length cap reached before a terminator was found), or on bad
 * arguments (`*cursor` past the end of `json`). A non-zero return means
 * "stop calling" - the caller should not keep looping on the same
 * cursor expecting a different answer. */
int json_next_array_object(const char *json, unsigned long *cursor,
                            const char **obj_start, unsigned long *obj_len);

/* Builds `{"username":"...","password":"..."}` into `out`, JSON-escaping
 * both fields (`"` and `\` at minimum, per the interface this was
 * specified against - a password containing either must not break the
 * request or, worse, let its content escape the JSON string and be
 * interpreted as JSON structure; this implementation also escapes every
 * control byte 0x00-0x1F as \u00XX, since an unescaped one is invalid
 * JSON and could otherwise inject a raw newline into the request body).
 * High-bit Latin-1 bytes (0x80-0xFF) pass through unescaped, matching how
 * this door treats them everywhere else (see listtxt.h). The escaping is
 * the exact inverse of json_extract_string()'s unescaping - a value built
 * here and read back through that function round-trips byte-for-byte.
 *
 * Same signature style as flow_build_info_content(): returns the byte
 * count written, or -1 if `out`/`username`/`password` is NULL, or the
 * escaped result would not fit `outcap` - in either failure case `out` is
 * left as "". */
int json_build_login_body(char *out, unsigned long outcap,
                           const char *username, const char *password);

#endif /* DOORREPO_JSON_LITE_H */

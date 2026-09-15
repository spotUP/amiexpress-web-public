/*
 * The bulletin REQUESTS writes, apart from the door that writes it.
 *
 * `Bulletins/bull9.txt` used to be written by the classic 68K `Request v2.1`
 * door from its own `BULL.HEADER` / `BULL.TAIL` art plus one row per open
 * request. That door is wired to no command on this board any more - `REQ`
 * now launches THIS door - so the bulletin froze on 2026-09-10 and would
 * never regenerate. The sysop's call (2026-09-15): our door writes it, and
 * the classic door goes.
 *
 * Extracted from requests.c so a host test can assert the bytes, the pattern
 * `examples/achieve/achieve_rows.c` already uses. The door does the fetching
 * and the file writing; everything that decides what the file CONTAINS is
 * here, where it can be tested without a server or an Amiga.
 *
 * THE ROW BUDGET, and why it is not a taste question. A generated screen is
 * shown to whoever logs in next, so it must fit the SHORTEST terminal the
 * board serves - 24 rows (`web/backend/src/screens/screen-rows.ts`, and this
 * board's own default in three places). The loader paginates at MORE than
 * `height` lines counting the empty element after the trailing newline, so a
 * screen escapes the `(Pause)...More(y/n/ns)?` prompt at 23 REAL rows. The
 * art costs 8 + 2 of those, which leaves 13 requests. The old door had no
 * budget at all, which is why the live screen was 26 rows and paginated.
 *
 * The byte shape is the classic door's, measured from the live file rather
 * than guessed: rows are latin1, separators are CRLF, every line is padded to
 * 80 visible columns, and the last line ends `[0m` with no newline after it.
 * The art goes out VERBATIM - it is authored with the colour carrying from
 * line to line, and an ink reset at the end of a line would have to be
 * undone at the start of the next.
 */

#ifndef REQUESTS_BULLETIN_H
#define REQUESTS_BULLETIN_H

/** Visible columns one bulletin line occupies. */
#define REQUESTS_BULLETIN_COLUMNS 80

/** The handle column, as the header art rules it. */
#define REQUESTS_BULLETIN_HANDLE_W 12

/** The description column, as the header art rules it. */
#define REQUESTS_BULLETIN_TITLE_W 60

/**
 * The tallest a generated screen may be and still arrive whole on the
 * shortest terminal this board serves. 23, for the reason in the header.
 */
#define REQUESTS_BULLETIN_ROW_BUDGET 23

/** One row of the table: who asked, and for what. */
typedef struct {
    const char *handle;
    const char *title;
} requests_bulletin_row;

/**
 * How many rows the art in `art` occupies, a trailing newline not counting
 * as one. LF and CRLF both read as one row.
 */
int requests_bulletin_art_rows(const char *art);

/**
 * How many request rows fit between `header` and `tail` inside `budget`.
 * Never negative: art too tall for the budget yields 0, and the bulletin is
 * then written with an empty table rather than a torn one.
 */
int requests_bulletin_capacity(const char *header, const char *tail, int budget);

/**
 * Does a bulletin ALREADY on disk fit `budget` rows?
 *
 * The door repairs what it finds, not only what it wrote. When this version
 * first reaches a board the screen sitting there is the classic door's, with
 * no budget behind it - the live one was 26 rows - and nothing would replace
 * it until the next caller happened to post a request. Rows are counted the
 * way the board's loader counts them, so "fits" here means "does not
 * paginate there".
 */
int requests_bulletin_fits(const char *text, int budget);

/**
 * Render the bulletin into `out`.
 *
 * Writes at most `capacity` rows of `rows`, in the order given - the server
 * lists open requests most-voted first, so the bulletin shows what the scene
 * wants most. Returns the number of bytes written, or 0 when `out` is too
 * small for the whole bulletin. On 0 the buffer holds however much fitted and
 * MUST NOT reach the disk: half a bulletin is worse than yesterday's, so the
 * door writes the file only on a non-zero return.
 */
unsigned long requests_bulletin_render(char *out, unsigned long cap,
                                       const char *header, const char *tail,
                                       const requests_bulletin_row *rows,
                                       int row_count, int budget);

#endif /* REQUESTS_BULLETIN_H */

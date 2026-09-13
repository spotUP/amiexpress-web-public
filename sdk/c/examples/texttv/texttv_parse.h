/* texttv_parse.h - pure Text-TV helpers: page validation, request paths,
 * content_plain extraction, UTF-8 to Latin-1, favorites.
 *
 * No I/O, no BBS, no terminal - host-tested in tests/test_texttv.c and
 * linked into the Amiga binary beside texttv.c. C89.
 */
#ifndef TEXTTV_PARSE_H
#define TEXTTV_PARSE_H

#ifdef __cplusplus
extern "C" {
#endif

#define TEXTTV_APP "amiexpress-web-bbs"

typedef struct {
    char host[64];
    int port;
    int timeout_secs;
    int start_page;
    int favs[32];
    int fav_count;
} texttv_config;

void texttv_config_defaults(texttv_config *cfg);

/** 100-999 is a page, anything else is not. Returns the page or 0. */
int texttv_valid_page(const char *s);

/** "/api/texttv/{page}" on the board-side proxy into out. 0 ok, -1 no room. */
int texttv_page_path(int page, char *out, unsigned long cap);

/*
 * "Page {n}: {title}" into out, truncated to fit and always terminated.
 * The title comes off the wire - texttv.nu writes it and the board passes
 * it through - so it is as long as the upstream cares to make it, while
 * the caller's line is one screen row. Returns 0 when the whole title
 * fitted, 1 when it was cut, -1 when out is unusable.
 */
int texttv_page_line(char *out, unsigned long cap, int page, const char *title);

/*
 * The reader's box for a screen this wide.
 *
 * A teletext row IS forty columns. An eighty-column caller can afford the
 * door's frame around it; a forty-column one cannot - the two columns of
 * margin cut three characters off every row, and the reader then wrapped
 * what was left. The compact tier gets the whole width.
 */
void texttv_reader_box(int cols, int rows, int *left, int *width, int *height);

/** 1 when the reader must drop its frame to fit a forty-column teletext row. */
int texttv_reader_frameless(int cols);

/*
 * The reader's title row for a screen this wide.
 *
 * A teletext row is forty columns and the page's OWN first row already says
 * which page this is ("100 SVT Text sondag 13 sep 2026"), so at forty the
 * number is repetition that costs four columns - and the title is what gets
 * cut for it: "...prognos over vale" (sysop, 2026-09-13). The compact tier
 * gets the title alone, and only then, if it still does not fit, is it cut.
 *
 * `pickable` says the page offers headlines to choose, which the eighty-
 * column title says out loud because there is room to.
 *
 * Returns 0 when everything fitted, 1 when the title was cut, -1 when out
 * is unusable.
 */
int texttv_reader_title(char *out, unsigned long cap, int cols,
                        int page, const char *title, int pickable);

/*
 * What an index page points at: one entry per headline the caller can open.
 *
 * The proxy reads the anchors (`<a href="/331">331</a>`) and resolves each to
 * the headline above it, because SVT right-aligns the page number on its own
 * row under the words. `row` is where the anchor was; `label_row` is where the
 * cursor belongs.
 */
#define TEXTTV_MAX_LINKS 24

typedef struct {
    int page;
    int row;
    int label_row;
    char label[64];
} texttv_link;

/** Reads the "links" array. Returns how many were stored (0 = none). */
int texttv_links_parse(const char *json, texttv_link *out, int cap);

/**
 * Move a selection by `delta` entries, wrapping at both ends. `current` of -1
 * (nothing selected) lands on the first entry going forward and the last
 * going back. Returns the new index, or -1 when there is nothing to select.
 */
int texttv_link_step(int count, int current, int delta);

/*
 * The page's "title" out of the JSON and into Latin-1, in one step.
 *
 * The body was converted and the title was not, so a Swedish headline drew as
 * `fÃ¶r val` in the frame while the same words read `för val` two rows below
 * it - UTF-8 bytes painted one per column. Extraction and conversion belong
 * together for exactly that reason. 0 on success, non-zero when the key is
 * missing (out is left empty).
 */
int texttv_title(const char *json, char *out, unsigned long cap);

/*
 * SGR colour escapes into the SDK's pen markers, everything else copied.
 *
 * The proxy converts texttv.nu's HTML to rows carrying real `ESC[0;37;44m`
 * sequences, and the door draws through ansi_text, which replaces every byte
 * below 32 with a space on purpose - a raw ESC from a server would otherwise
 * move a cursor-addressed layout wherever it liked. So the colour arrived as
 * literal text: `[0;37;44m` printed across the row.
 *
 * A foreground colour becomes UI_INK + its palette digit, a reset becomes
 * UI_INK 'R', and background and everything else is dropped - the door owns
 * its ground. Markers cost no columns (ui_ansi.h), so the row still measures
 * what the reader wraps by. Returns the number of bytes written, or 0 when
 * out is unusable.
 */
unsigned long texttv_ansi_to_ink(const char *in, char *out, unsigned long cap);

/*
 * The same conversion, told whether the caller's terminal can draw a
 * double-height row.
 *
 * The proxy marks SVT's double-height headlines with `ESC # 3` / `ESC # 4`.
 * With `double_height` those become the SDK's line markers and the headline
 * is drawn at twice the height; without, they are dropped and the row is
 * ordinary text. A door asks the board which it has (AEW_DISPLAYMODE,
 * ae_display_mode) rather than guessing from the width: forty columns is
 * true of a C64 and of a teletext screen alike.
 */
unsigned long texttv_ansi_to_ink_mode(const char *in, char *out, unsigned long cap,
                                      int double_height);

/*
 * First string of the "content_plain" array into out. 0 on success;
 * non-zero (out left "") when the key, the bracket, the opening quote,
 * the terminator or room is missing - an off-air page answers `[]` and
 * lands here, which the door reports as "not on air" rather than as a
 * transport failure.
 */
int texttv_first_plain(const char *json, char *out, unsigned long outcap);

/*
 * The door's body, in priority order: the proxy's "ansi" rows when
 * present and non-empty (colors, bars, double-height), else the first
 * content_plain string. 0 + out set on success; non-zero + out "" when
 * neither exists (off-air page) or nothing fits.
 */
int texttv_pick_body(const char *json, char *out, unsigned long outcap);

/*
 * UTF-8 to Latin-1, bounded, never guessing past a truncation.
 * U+0000-U+00FF map direct; en/em dash, curly quotes, ellipsis and NBSP
 * fold to ASCII; everything else outside Latin-1 - and every malformed,
 * overlong or cut sequence - is '?'. Always NUL-terminates; returns
 * bytes written (truncation included).
 */
int utf8_to_latin1(const char *in, char *out, unsigned long cap);

/** "100,300,401" into cfg->favs (deduped, garbage skipped). Returns count. */
int texttv_fav_parse(texttv_config *cfg, const char *value);

int texttv_fav_has(const texttv_config *cfg, int page);

/* Toggle: 1 added, 0 removed, -1 list full. */
int texttv_fav_toggle(texttv_config *cfg, int page);

#ifdef __cplusplus
}
#endif

#endif /* TEXTTV_PARSE_H */

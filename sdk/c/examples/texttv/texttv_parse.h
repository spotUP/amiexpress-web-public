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

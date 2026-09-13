/* texttv_parse.c - pure Text-TV helpers. See texttv_parse.h. C89. */

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#include "texttv_parse.h"
#include "json_lite.h"

#define TEXTTV_TIMEOUT_DEFAULT 15
#define TEXTTV_START_DEFAULT 100

void texttv_config_defaults(texttv_config *cfg)
{
    memset(cfg, 0, sizeof *cfg);
    /* Loopback: the door usually runs on the same host as the board
       (in-container or localhost dev), where the public hostname
       hairpins out and back - or blackholes, costing the full timeout
       on every page turn (measured 2026-09-10). A sysop serving another
       board points Host at it; a classic Amiga uses the LAN IP. */
    strcpy(cfg->host, "127.0.0.1");
    /* The sidecar, not the board. A door that fetches from the process
       running it parks the shared event loop - see
       web/backend/src/scripts/texttv-sidecar-server.ts. */
    cfg->port = 3002;
    cfg->timeout_secs = TEXTTV_TIMEOUT_DEFAULT;
    cfg->start_page = TEXTTV_START_DEFAULT;
    cfg->fav_count = 0;
}

int texttv_valid_page(const char *s)
{
    int page;
    int i;
    if (s == 0 || s[0] == '\0') return 0;
    for (i = 0; s[i] != '\0'; i++) {
        if (s[i] < '0' || s[i] > '9') return 0;
        if (i > 4) return 0;
    }
    page = atoi(s);
    return page >= 100 && page <= 999 ? page : 0;
}

int texttv_page_path(int page, char *out, unsigned long cap)
{
    int n;
    if (out == 0 || cap == 0 || page < 100 || page > 999) return -1;
    n = sprintf(out, "/api/texttv/%d", page);
    if (n < 0 || (unsigned long)n + 1 > cap) { if (cap > 0) out[0] = '\0'; return -1; }
    return 0;
}

int texttv_page_line(char *out, unsigned long cap, int page, const char *title)
{
    char head[24];
    unsigned long headlen;
    unsigned long room;
    unsigned long i;

    if (out == 0 || cap == 0) return -1;
    out[0] = '\0';
    if (title == 0) title = "";

    sprintf(head, "Page %d: ", page);
    headlen = strlen(head);
    if (headlen + 1 > cap) {
        /* Not even the prefix fits: give back as much of it as there is
           room for rather than writing past the caller's buffer. */
        for (i = 0; i + 1 < cap; i++) out[i] = head[i];
        out[cap - 1] = '\0';
        return 1;
    }

    strcpy(out, head);
    room = cap - headlen - 1;
    for (i = 0; i < room && title[i] != '\0'; i++) out[headlen + i] = title[i];
    out[headlen + i] = '\0';
    return title[i] == '\0' ? 0 : 1;
}

int texttv_first_plain(const char *json, char *out, unsigned long outcap)
{
    const char *p;
    unsigned long n = 0;
    if (outcap > 0) out[0] = '\0';
    if (json == 0 || out == 0 || outcap == 0) return -1;
    p = strstr(json, "\"content_plain\"");
    if (p == 0) return -1;
    p += 15;
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    if (*p != ':') return -1;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    if (*p != '[') return -1;
    p++;
    while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
    if (*p != '"') return -1;
    p++;
    while (*p != '\0' && *p != '"') {
        char c = *p;
        if (c == '\\') {
            p++;
            c = *p;
            if (c == '\0') return -1;
            if (c == 'n') c = '\n';
            else if (c == 'r') c = '\r';
            else if (c == 't') c = '\t';
            else if (c == 'b') c = '\b';
            else if (c == 'f') c = '\f';
            /* \" \\ \/ pass through as the literal; \uXXXX passes through
               raw (the bytes stay UTF-8 for utf8_to_latin1). */
            else if (c == 'u') {
                int k;
                if (n + 6 >= outcap) { out[0] = '\0'; return -1; }
                out[n++] = '\\';
                out[n++] = 'u';
                for (k = 0; k < 4; k++) {
                    p++;
                    if (*p == '\0') { out[0] = '\0'; return -1; }
                    out[n++] = *p;
                }
                p++;
                continue;
            }
        }
        if (n + 1 >= outcap) { out[0] = '\0'; return -1; }
        out[n++] = (char)c;
        p++;
    }
    if (*p != '"') { out[0] = '\0'; return -1; }
    out[n] = '\0';
    return 0;
}

#define TEXTTV_INK '\001'

static char ink_digit(int colour)
{
    if (colour < 0) colour = 0;
    if (colour > 15) colour = 15;
    return colour < 10 ? (char)('0' + colour) : (char)('a' + (colour - 10));
}

#define TEXTTV_COMPACT_COLS 40

void texttv_reader_box(int cols, int rows, int *left, int *width, int *height)
{
    int compact = cols <= TEXTTV_COMPACT_COLS;
    /* Column ONE, not zero: ansi_goto writes `ESC[row;colH` and those are
       1-based. A left of 0 emitted `ESC[r;0H`, which a terminal clamps to
       column 1 - so every row lost its first character or two and the tail
       ran off the right. On the sysop's C64 the footer read "AGE 1/3". */
    if (left) *left = compact ? 1 : 2;
    if (width) *width = compact ? cols : cols - 3;
    if (height) *height = rows - 7;
}

int texttv_reader_title(char *out, unsigned long cap, int cols,
                        int page, const char *title, int pickable)
{
    static const char *const HINT = " - ARROWS PICK, RETURN READS";
    unsigned long width;
    unsigned long used;
    int cut = 0;

    if (out == 0 || cap == 0) return -1;
    out[0] = '\0';
    if (title == 0) title = "";

    /* The row the title is drawn on is the box's width, and never more of
       the buffer than the caller gave us. */
    width = (unsigned long) (cols > 0 ? cols : 0);
    if (width + 1 > cap) width = cap - 1;

    if (cols > TEXTTV_COMPACT_COLS) {
        char head[16];
        unsigned long headlen;
        sprintf(head, "%d ", page);
        headlen = strlen(head);
        if (headlen >= width) { out[0] = '\0'; return 1; }
        strcpy(out, head);
        used = headlen;
    } else {
        /* Forty columns: the page number is already on the page's own first
           row, and it is the TITLE that would be cut to make room for it. */
        used = 0;
    }

    while (*title != '\0' && used < width) out[used++] = *title++;
    cut = (*title != '\0');

    /* Only where there is room to spare does the title also say what RETURN
       does; the footer says it at every width. */
    if (pickable && cols > TEXTTV_COMPACT_COLS && !cut
        && used + strlen(HINT) <= width) {
        strcpy(out + used, HINT);
        used += strlen(HINT);
    }

    out[used] = '\0';
    return cut ? 1 : 0;
}

int texttv_reader_frameless(int cols)
{
    /* A framed reader needs width + 2 columns and a teletext row is exactly
       forty, so at forty the frame costs two characters of every row. The
       page wins; the box goes. */
    return cols <= TEXTTV_COMPACT_COLS;
}

/* "key":<digits> out of one JSON object slice. -1 when absent. */
static int json_int_field(const char *obj, unsigned long len, const char *key)
{
    char pattern[32];
    const char *p;
    unsigned long i;
    int value = 0;
    int seen = 0;

    sprintf(pattern, "\"%s\"", key);
    p = 0;
    for (i = 0; i + strlen(pattern) <= len; i++) {
        if (strncmp(obj + i, pattern, strlen(pattern)) == 0) { p = obj + i + strlen(pattern); break; }
    }
    if (p == 0) return -1;
    while (*p == ' ' || *p == ':' || *p == '\t') p++;
    while (*p >= '0' && *p <= '9') { value = value * 10 + (*p - '0'); p++; seen = 1; }
    return seen ? value : -1;
}

int texttv_links_parse(const char *json, texttv_link *out, int cap)
{
    unsigned long cursor = 0;
    const char *obj;
    unsigned long len;
    int n = 0;

    if (json == 0 || out == 0 || cap <= 0) return 0;
    while (n < cap && json_next_array_object(json, "links", &cursor, &obj, &len) == 0) {
        int page = json_int_field(obj, len, "page");
        int row = json_int_field(obj, len, "row");
        int label_row = json_int_field(obj, len, "labelRow");
        char slice[1024];
        unsigned long copy = len < sizeof slice - 1 ? len : sizeof slice - 1;

        if (page < 100 || page > 999) continue;
        memcpy(slice, obj, copy);
        slice[copy] = '\0';

        out[n].page = page;
        out[n].row = row < 0 ? 0 : row;
        out[n].label_row = label_row < 0 ? out[n].row : label_row;
        out[n].label[0] = '\0';
        {
            char raw[256];
            if (json_extract_string(slice, "label", raw, sizeof raw) == 0)
                utf8_to_latin1(raw, out[n].label, sizeof out[n].label);
        }
        n++;
    }
    return n;
}

int texttv_link_step(int count, int current, int delta)
{
    if (count <= 0) return -1;
    if (current < 0) return delta >= 0 ? 0 : count - 1;
    current = (current + delta) % count;
    if (current < 0) current += count;
    return current;
}

int texttv_title(const char *json, char *out, unsigned long cap)
{
    char raw[256];
    if (out == 0 || cap == 0) return -1;
    out[0] = '\0';
    if (json == 0) return -1;
    if (json_extract_string(json, "title", raw, sizeof raw) != 0) return -1;
    utf8_to_latin1(raw, out, cap);
    return 0;
}

unsigned long texttv_ansi_to_ink(const char *in, char *out, unsigned long cap)
{
    unsigned long n = 0;
    const char *p = in;
    if (out == 0 || cap == 0) return 0;
    out[0] = '\0';
    if (in == 0) return 0;

    while (*p != '\0' && n + 1 < cap) {
        if (p[0] == 0x1b && p[1] == '[') {
            const char *q = p + 2;
            int value = -1;
            int pen = -1;
            int bright = 0;
            int reset = 0;
            /* Parameters up to the terminator. Only the final byte 'm'
               carries colour; any other sequence is dropped whole. */
            while (*q != '\0' && !(*q >= 0x40 && *q <= 0x7e)) {
                if (*q >= '0' && *q <= '9') {
                    value = (value < 0 ? 0 : value) * 10 + (*q - '0');
                } else {
                    if (value == 0) reset = 1;
                    else if (value == 1) bright = 1;
                    else if (value >= 30 && value <= 37) pen = value - 30;
                    else if (value >= 90 && value <= 97) { pen = value - 90; bright = 1; }
                    value = -1;
                }
                q++;
            }
            if (value == 0) reset = 1;
            else if (value == 1) bright = 1;
            else if (value >= 30 && value <= 37) pen = value - 30;
            else if (value >= 90 && value <= 97) { pen = value - 90; bright = 1; }

            if (*q == 'm') {
                if (pen >= 0 && n + 2 < cap) {
                    out[n++] = TEXTTV_INK;
                    out[n++] = ink_digit(bright ? pen + 8 : pen);
                } else if (reset && pen < 0 && n + 2 < cap) {
                    out[n++] = TEXTTV_INK;
                    out[n++] = 'R';
                }
            }
            if (*q == '\0') break;
            p = q + 1;
            continue;
        }
        out[n++] = *p++;
    }
    out[n] = '\0';
    return n;
}

int texttv_pick_body(const char *json, char *out, unsigned long outcap)
{
    if (outcap > 0) out[0] = '\0';
    if (json == 0 || out == 0 || outcap == 0) return -1;
    /* ANSI rows first: the proxy converts content HTML to colored rows,
       and an old proxy (or a hand-rolled one) answers plain only. */
    if (json_extract_string(json, "ansi", out, outcap) == 0 && out[0] != '\0')
        return 0;
    out[0] = '\0';
    return texttv_first_plain(json, out, outcap);
}

int utf8_to_latin1(const char *in, char *out, unsigned long cap)
{
    unsigned long n = 0;
    const unsigned char *p;
    if (cap > 0) out[0] = '\0';
    if (in == 0 || out == 0 || cap == 0) return 0;
    p = (const unsigned char *)in;
    while (*p != '\0') {
        unsigned long cp;
        if (*p < 0x80) {
            cp = *p++;
        } else if ((*p & 0xE0) == 0xC0) {
            /* One broken pair is one '?': an invalid lead consumes its
               continuation with it, so C0 AF is not two errors. */
            if (*p < 0xC2 || p[1] == '\0' || (p[1] & 0xC0) != 0x80) {
                cp = 0xFFFD;
                p++;
                if (*p != '\0' && (*p & 0xC0) == 0x80) p++;
            }
            else { cp = ((unsigned long)(*p & 0x1F) << 6) | (p[1] & 0x3F); p += 2; }
        } else if ((*p & 0xF0) == 0xE0) {
            if (p[1] == '\0' || p[2] == '\0' ||
                (p[1] & 0xC0) != 0x80 || (p[2] & 0xC0) != 0x80) {
                int k;
                cp = 0xFFFD;
                p++;
                for (k = 0; k < 2 && (*p & 0xC0) == 0x80 && *p != '\0'; k++) p++;
            }
            else {
                cp = ((unsigned long)(*p & 0x0F) << 12) |
                     ((unsigned long)(p[1] & 0x3F) << 6) | (p[2] & 0x3F);
                /* Overlongs and UTF-16 surrogates are malformed. */
                if (cp < 0x800 || (cp >= 0xD800 && cp <= 0xDFFF)) { cp = 0xFFFD; p += 3; }
                else p += 3;
            }
        } else {
            /* 4-byte (astral) and strays: no Latin-1 answer. Skip the whole
               run so one emoji is one '?', not four. */
            cp = 0xFFFD;
            p++;
            while ((*p & 0xC0) == 0x80) p++;
        }
        if (n + 1 >= cap) break;
        if (cp < 0x80) out[n++] = (char)cp;
        else if (cp <= 0xFF) out[n++] = (char)cp;
        else if (cp == 0x2013 || cp == 0x2014) out[n++] = '-';
        else if (cp == 0x2018 || cp == 0x2019) out[n++] = '\'';
        else if (cp == 0x201C || cp == 0x201D) out[n++] = '"';
        else if (cp == 0x2026) out[n++] = '.';
        else if (cp == 0x00A0) out[n++] = ' ';
        else out[n++] = '?';
    }
    out[n] = '\0';
    return (int)n;
}

int texttv_fav_parse(texttv_config *cfg, const char *value)
{
    const char *p;
    cfg->fav_count = 0;
    if (value == 0) return 0;
    p = value;
    while (*p != '\0' && cfg->fav_count < 32) {
        int page;
        while (*p == ' ' || *p == '\t' || *p == ',') p++;
        if (*p == '\0') break;
        page = atoi(p);
        if (page >= 100 && page <= 999) {
            int i, dup = 0;
            for (i = 0; i < cfg->fav_count; i++) {
                if (cfg->favs[i] == page) { dup = 1; break; }
            }
            if (!dup) cfg->favs[cfg->fav_count++] = page;
        }
        /* To the next comma or NUL, always moving: a garbage field is
           skipped whole, never re-scanned (which hung the first draft). */
        while (*p != '\0' && *p != ',') p++;
    }
    return cfg->fav_count;
}

int texttv_fav_has(const texttv_config *cfg, int page)
{
    int i;
    for (i = 0; i < cfg->fav_count; i++) {
        if (cfg->favs[i] == page) return 1;
    }
    return 0;
}

int texttv_fav_toggle(texttv_config *cfg, int page)
{
    int i;
    for (i = 0; i < cfg->fav_count; i++) {
        if (cfg->favs[i] == page) {
            for (; i + 1 < cfg->fav_count; i++) cfg->favs[i] = cfg->favs[i + 1];
            cfg->fav_count--;
            return 0;
        }
    }
    if (cfg->fav_count >= 32) return -1;
    cfg->favs[cfg->fav_count++] = page;
    return 1;
}

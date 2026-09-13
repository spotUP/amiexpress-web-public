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
    cfg->port = 3001;
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

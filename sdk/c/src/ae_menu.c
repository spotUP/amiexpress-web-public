/* ae_menu.c - the client for AEW_MENU (10900). C89. See ae_menu.h. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "aedoor.h"
#include "ae_session.h"
#include "ae_dos.h"
#include "ae_menu.h"

/* The catalogue file: 256 entries at their widest are ~36 KB. A bigger file is cut, and then has no final ".". */
#define FILE_CAP 49152
static char file_buffer[FILE_CAP];

static int ask(const char *request, char *reply, int cap)
{
    return ae_field_exchange(AE_FIELD_MENU, request, reply, cap);
}

/* Copy up to the next TAB (or the end of the line) into dest, cut at cap-1 with the rest skipped, NUL always
   written. Returns the start of the next field, or 0 when this was the last one. */
static const char *take(const char *from, const char *end, char *dest, int cap)
{
    int n = 0;
    while (from < end && *from != '\t') {
        if (n < cap - 1) dest[n++] = *from;
        from++;
    }
    dest[n] = '\0';
    return from < end ? from + 1 : 0;
}

/* A whole non-negative decimal number filling [from, end). */
static int number(const char *from, const char *end, int *out)
{
    long v = 0;
    if (from >= end) return 0;
    for (; from < end; from++) {
        if (*from < '0' || *from > '9') return 0;
        v = v * 10 + (*from - '0');
        if (v > 100000L) return 0;
    }
    *out = (int)v;
    return 1;
}

/* One TAB-separated number; the last field ends at `end`. */
static const char *take_number(const char *from, const char *end, int *out, int last)
{
    const char *tab = from;
    while (tab < end && *tab != '\t') tab++;
    if (last ? tab != end : tab == end) return 0;
    if (!number(from, tab, out)) return 0;
    return last ? end : tab + 1;
}

#define NO_SECTION   (-2)   /* no S line seen yet */
#define SECTION_FULL (-1)   /* the 25th section and after: its entries are dropped */

static int parse_line(const char *p, const char *end, ae_menu *m, int *in_section, int *seen_end)
{
    char tag;
    const char *q;
    int v1, v2, v3;

    if (end - p == 1 && *p == '.') { *seen_end = 1; return 1; }
    if (end - p < 2 || p[1] != ' ') return 0;
    tag = p[0];
    p += 2;
    switch (tag) {
    case 'K':
        q = take(p, end, m->kind, (int)sizeof m->kind);
        if (!q) return 0;
        take(q, end, m->parent, (int)sizeof m->parent);
        if (strcmp(m->parent, "-") == 0) m->parent[0] = '\0';
        return 1;
    case 'T': take(p, end, m->title, (int)sizeof m->title); return 1;
    case 'P': take(p, end, m->prompt, (int)sizeof m->prompt); return 1;
    case 'O':
        /* The style the board decided (the caller's choice or the board default); the door only obeys it. */
        if (end - p == 5 && memcmp(p, "pages", 5) == 0) m->style = AE_MENU_STYLE_PAGES;
        else if (end - p == 6 && memcmp(p, "scroll", 6) == 0) m->style = AE_MENU_STYLE_SCROLL;
        else if (end - p == 9 && memcmp(p, "coverflow", 9) == 0) m->style = AE_MENU_STYLE_COVERFLOW;
        else return 0;
        m->pages = m->style == AE_MENU_STYLE_PAGES;
        return 1;
    case 'F':
        /* One flag: cover flow slides between pages. */
        if (end - p != 1 || (p[0] != '0' && p[0] != '1')) return 0;
        m->slide = p[0] == '1';
        return 1;
    case 'W':
        /* Three one-character codes, "-" for none: "X TAB - TAB H". */
        if (end - p != 5 || p[1] != '\t' || p[3] != '\t') return 0;
        m->wipe_open = p[0] == '-' ? 0 : p[0];
        m->wipe_leave = p[2] == '-' ? 0 : p[2];
        m->wipe_page = p[4] == '-' ? 0 : p[4];
        return 1;
    case 'D':
        /* Legacy, read for one release: "1 TAB 0" was drill-down on, slide off. Drill-down is now the cover flow style,
           and the board wrote D after O, so it wins. Remove once no catalogue on disk carries a D line. */
        if (end - p != 3 || p[1] != '\t' || (p[0] != '0' && p[0] != '1') || (p[2] != '0' && p[2] != '1')) return 0;
        if (p[0] == '1') { m->style = AE_MENU_STYLE_COVERFLOW; m->pages = 0; m->slide = p[2] == '1'; }
        return 1;
    case 'R': return number(p, end, &m->last_row);
    case 'L': {
        ae_menu_logo l;
        q = take(p, end, l.position, (int)sizeof l.position);
        if (!q || !(q = take_number(q, end, &v1, 0)) || !(q = take_number(q, end, &v2, 0))
            || !take_number(q, end, &v3, 1)) return 0;
        if (m->logo_count >= AE_MENU_MAX_LOGOS) { m->truncated = 1; return 1; }
        l.rows = v1; l.cols = v2; l.after_section = v3;
        m->logos[m->logo_count++] = l;
        return 1;
    }
    case 'S':
        if (m->section_count >= AE_MENU_MAX_SECTIONS) { m->truncated = 1; *in_section = SECTION_FULL; return 1; }
        take(p, end, m->section_title[m->section_count], (int)sizeof m->section_title[0]);
        *in_section = m->section_count++;
        return 1;
    case 'E': {
        ae_menu_entry *e;
        /* Exactly five fields: a half-written line is not an entry. */
        int tabs = 0;
        for (q = p; q < end; q++) if (*q == '\t') tabs++;
        if (tabs != 4) return 0;
        if (*in_section == NO_SECTION) {                       /* no S line yet: the entries are one untitled section */
            if (m->section_count >= AE_MENU_MAX_SECTIONS) { m->truncated = 1; return 1; }
            m->section_title[m->section_count][0] = '\0';
            *in_section = m->section_count++;
        }
        if (*in_section < 0 || m->entry_count >= AE_MENU_MAX_ENTRIES) { m->truncated = 1; return 1; }
        e = &m->entries[m->entry_count];
        q = take(p, end, e->key, (int)sizeof e->key);
        q = take(q, end, e->label, (int)sizeof e->label);
        q = take(q, end, e->description, (int)sizeof e->description);
        q = take(q, end, e->right, (int)sizeof e->right);
        take(q, end, e->flags, (int)sizeof e->flags);
        m->entry_section[m->entry_count++] = *in_section;
        return 1;
    }
    default:
        return 0;
    }
}

int ae_menu_parse(const char *text, long len, ae_menu *m)
{
    const char *p = text, *stop = text + len, *nl, *end;
    int in_section = NO_SECTION, seen_end = 0, first = 1;

    if (!text || !m || len < 0) return 0;
    memset(m, 0, sizeof *m);
    while (p < stop) {
        if (seen_end) return 0;                              /* nothing may follow the terminator but its newline */
        nl = (const char *)memchr(p, '\n', (size_t)(stop - p));
        end = nl ? nl : stop;
        if (end > p && end[-1] == '\r') end--;
        if (first) {
            if (end - p != 8 || memcmp(p, "AEMENU 1", 8) != 0) return 0;
            first = 0;
        } else if (!parse_line(p, end, m, &in_section, &seen_end)) {
            return 0;
        }
        p = nl ? nl + 1 : stop;
    }
    if (first || !seen_end) return 0;
    return 1;
}

int ae_menu_open(const char *kind, const char *parent, ae_menu *m)
{
    char request[64], reply[AE_MAX_LINE + 1];
    ae_file *f;
    long size, got;
    int n;

    if (!kind || !m) return 0;
    if (parent && parent[0]) sprintf(request, "OPEN %.15s %.15s", kind, parent);
    else sprintf(request, "OPEN %.15s", kind);
    n = ask(request, reply, (int)sizeof reply);
    if (n < 0) return AE_MENU_GONE;
    if (n == 0) return AE_MENU_SILENT;
    if (strncmp(reply, "OK\t", 3) != 0) return 0;             /* NO: the board printed the reason */
    f = ae_dos_open(reply + 3, AE_DOS_READ);
    if (!f) return AE_MENU_SILENT;
    size = ae_dos_size(f);
    if (size < 0 || size > FILE_CAP - 1) size = FILE_CAP - 1;   /* cut: the missing "." will refuse it */
    got = ae_dos_read(f, file_buffer, size);
    while (got >= 0 && got < size) {
        long more = ae_dos_read(f, file_buffer + got, size - got);
        if (more <= 0) break;
        got += more;
    }
    ae_dos_close(f);
    if (got < 0) return AE_MENU_SILENT;
    file_buffer[got] = '\0';
    return ae_menu_parse(file_buffer, got, m) ? 1 : AE_MENU_SILENT;
}

int ae_menu_logo_draw(const char *position, int top, int left, int rows, int cols)
{
    char request[64], reply[AE_MAX_LINE + 1];
    int n, drawn;

    if (!position) return 0;
    sprintf(request, "LOGO %.7s %d %d %d %d", position, top, left, rows, cols);
    n = ask(request, reply, (int)sizeof reply);
    if (n < 0) return AE_MENU_GONE;
    if (strncmp(reply, "OK\t", 3) != 0) return 0;
    drawn = atoi(reply + 3);
    return drawn > 0 ? drawn : 0;
}

static int ok_or_not(const char *request)
{
    char reply[AE_MAX_LINE + 1];
    int n = ask(request, reply, (int)sizeof reply);
    if (n < 0) return AE_MENU_GONE;
    return strcmp(reply, "OK") == 0 ? 1 : 0;
}

int ae_menu_row(int row)
{
    char request[24];
    if (row < 0) return 0;
    sprintf(request, "ROW %d", row);
    return ok_or_not(request);
}

int ae_menu_style_get(char *stored, char *effective)
{
    char reply[AE_MAX_LINE + 1], s[AE_MENU_STYLE_CAP], e[AE_MENU_STYLE_CAP];
    const char *p;
    int n;

    if (stored) stored[0] = '\0';
    if (effective) effective[0] = '\0';
    n = ask("STYLE?", reply, (int)sizeof reply);
    if (n < 0) return AE_MENU_GONE;
    if (n == 0) return 0;
    p = take(reply, reply + n, s, (int)sizeof s);
    if (!p) return 0;
    take(p, reply + n, e, (int)sizeof e);
    if (stored) strcpy(stored, s);
    if (effective) strcpy(effective, e);
    return 1;
}

int ae_menu_style(const char *mode, char *effective)
{
    char request[40], reply[AE_MAX_LINE + 1];
    int n;

    if (effective) effective[0] = '\0';
    if (!mode) return 0;
    sprintf(request, "STYLE %.12s", mode);
    n = ask(request, reply, (int)sizeof reply);
    if (n < 0) return AE_MENU_GONE;
    if (strncmp(reply, "OK\t", 3) != 0) return 0;
    if (effective) take(reply + 3, reply + n, effective, AE_MENU_STYLE_CAP);
    return 1;
}

static void cut(char *to, int cap, const char *from)
{
    int n = (int)strlen(from);
    if (!to || cap < 1) return;
    if (n > cap - 1) n = cap - 1;
    memcpy(to, from, (size_t)n);
    to[n] = '\0';
}

int ae_menu_overflow_get(char *stored, int scap, char *effective, int ecap)
{
    char s[AE_MENU_STYLE_CAP], e[AE_MENU_STYLE_CAP];
    int rc = ae_menu_style_get(s, e);
    cut(stored, scap, rc == 1 ? s : "");
    cut(effective, ecap, rc == 1 ? e : "");
    return rc;
}

int ae_menu_overflow(const char *mode, char *effective, int cap)
{
    char s[AE_MENU_STYLE_CAP], e[AE_MENU_STYLE_CAP];
    int rc;

    if (!effective || cap < 1) return 0;
    rc = mode ? ae_menu_style(mode, e) : ae_menu_style_get(s, e);
    cut(effective, cap, rc == 1 ? e : "");
    return rc;
}

int ae_menu_run(const char *line)
{
    char request[AE_MAX_LINE + 1];
    if (!line || !line[0]) return 0;
    sprintf(request, "RUN %.190s", line);
    return ok_or_not(request);
}

int ae_menu_show(const char *key)
{
    char request[40];
    if (!key || !key[0]) return 0;
    sprintf(request, "SHOW %.20s", key);
    return ok_or_not(request);
}

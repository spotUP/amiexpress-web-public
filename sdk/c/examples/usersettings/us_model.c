/* us_model.c - the W door's rows. Pure: no board, no screen. C89. */
#include <stdio.h>
#include <string.h>
#include "us_model.h"

/* express.e's numbers grouped into the spec's sections (spec section 3). */
static const struct { const char *title; int first, last; } SECTIONS[] = {
    { "Account", 0, 6 }, { "Display", 7, 10 }, { "Transfers and Mail", 11, 13 },
    { "Chat", 14, 15 }, { "Files", 16, 16 }
};
#define SECTION_COUNT 5

/* Row text layout: " label [nn] value" at 80+, a value line of its own at 40. */
#define LABEL_WIDE 24
#define VALUE_OFFSET_WIDE (1 + LABEL_WIDE + 1 + 4 + 1)   /* text index of the value */
#define VALUE_OFFSET_STACKED 5

int us_text_room(int cols)
{
    return cols - 1 - 1 - US_CARET_WIDTH;     /* list width, scroll bar, caret */
}

int us_message_width(int cols)
{
    return cols - 1;                          /* from column 1; the last column stays free */
}

int us_editor_left(const us_model *m)
{
    return us_value_column(m) - 1;
}

int us_value_column(const us_model *m)
{
    return US_CARET_WIDTH + 1 + (m->stacked ? VALUE_OFFSET_STACKED : VALUE_OFFSET_WIDE);
}

static int add(us_model *m, us_row_kind kind, int ref)
{
    if (m->row_count >= US_MAX_ROWS) return -1;
    m->row[m->row_count].kind = kind;
    m->row[m->row_count].ref = ref;
    return m->row_count++;
}

/* One empty line between sections, never before the first. */
static int add_header(us_model *m, int *headers, const char *title)
{
    if (m->row_count > 0) add(m, US_ROW_BLANK, 0);
    strncpy(m->header[*headers], title, sizeof(m->header[0]) - 1);
    m->header[*headers][sizeof(m->header[0]) - 1] = '\0';
    return add(m, US_ROW_HEADER, (*headers)++);
}

/* A door without a section sits under the "Board settings" heading, once. */
static const char *section_of(const us_model *m, int d)
{
    return m->door[d].section[0] ? m->door[d].section : "Board settings";
}

/* The "Board settings" group comes first, under the outer heading itself; named sections follow alphabetically. */
static int section_before(const char *a, const char *b)
{
    const int ra = strcmp(a, "Board settings") == 0 ? 0 : 1, rb = strcmp(b, "Board settings") == 0 ? 0 : 1;
    if (ra != rb) return ra < rb;
    return strcmp(a, b) < 0;
}

void us_model_layout(us_model *m, int cols)
{
    int s, n, d, headers = 0, done[US_MAX_DOORS];
    m->cols = cols;
    m->stacked = cols < 80;
    m->row_count = 0;
    for (s = 0; s < SECTION_COUNT; s++) {
        add_header(m, &headers, SECTIONS[s].title);
        for (n = SECTIONS[s].first; n <= SECTIONS[s].last; n++) {
            if (m->field[n].state == 'H') continue;
            add(m, US_ROW_FIELD, n);
            if (m->stacked) add(m, US_ROW_VALUE, n);
        }
    }
    if (m->door_count == 0) return;
    add_header(m, &headers, "Board settings");
    memset(done, 0, sizeof(done));
    /* Sections in alphabetical order, each one's doors in the board's (label) order. */
    for (;;) {
        int pick = -1;
        for (d = 0; d < m->door_count; d++) {
            if (done[d]) continue;
            if (pick < 0 || section_before(section_of(m, d), section_of(m, pick))) pick = d;
        }
        if (pick < 0) break;
        if (strcmp(section_of(m, pick), "Board settings") != 0) add_header(m, &headers, section_of(m, pick));
        for (d = 0; d < m->door_count; d++) {
            if (!done[d] && strcmp(section_of(m, d), section_of(m, pick)) == 0) {
                done[d] = 1;
                add(m, US_ROW_DOOR, d);
            }
        }
    }
}

int us_row_selectable(const us_model *m, int index)
{
    if (index < 0 || index >= m->row_count) return 0;
    return m->row[index].kind == US_ROW_FIELD || m->row[index].kind == US_ROW_DOOR;
}

int us_first(const us_model *m)
{
    int i;
    for (i = 0; i < m->row_count; i++) if (us_row_selectable(m, i)) return i;
    return 0;
}

int us_step(const us_model *m, int from, int delta)
{
    int dir = delta < 0 ? -1 : 1, left = delta < 0 ? -delta : delta, i = from;
    while (left > 0) {
        int next = i + dir;
        while (next >= 0 && next < m->row_count && !us_row_selectable(m, next)) next += dir;
        if (next < 0 || next >= m->row_count) break;
        i = next;
        left--;
    }
    return i;
}

int us_row_of_field(const us_model *m, int n)
{
    int i;
    for (i = 0; i < m->row_count; i++) if (m->row[i].kind == US_ROW_FIELD && m->row[i].ref == n) return i;
    return -1;
}

static void clip_into(char *dest, const char *src, int width)
{
    int n = (int) strlen(src);
    if (width < 0) width = 0;
    if (n > width) n = width;
    memcpy(dest, src, (size_t) n);
    dest[n] = '\0';
}

static void build_row(us_model *m, int index, char *line)
{
    const us_row *r = &m->row[index];
    line[0] = '\0';
    switch (r->kind) {
        case US_ROW_BLANK:
            break;
        case US_ROW_HEADER:
            sprintf(line, "%s", m->header[r->ref]);
            break;
        case US_ROW_FIELD: {
            const ae_uf_field *f = &m->field[r->ref];
            if (m->stacked) { const int w = us_text_room(m->cols) - 5; sprintf(line, " %-*.*s[%2d]", w, w, f->label, f->number); }
            else sprintf(line, " %-*.*s [%2d] %s", LABEL_WIDE, LABEL_WIDE, f->label, f->number, f->value);
            break;
        }
        case US_ROW_VALUE:
            sprintf(line, "%*s%s", VALUE_OFFSET_STACKED, "", m->field[r->ref].value);
            break;
        case US_ROW_DOOR: {
            const ae_uf_door *d = &m->door[r->ref];
            if (m->stacked) sprintf(line, " %s", d->label);
            else if (m->cols >= 100) sprintf(line, " %-24.24s      %-12.12s %s", d->label, d->command, d->description);
            else sprintf(line, " %-24.24s      %s", d->label, d->command);
            break;
        }
    }
}

int us_row_split(const us_model *m, int index)
{
    const us_row *r;
    if (index < 0 || index >= m->row_count) return 0;
    r = &m->row[index];
    if (r->kind == US_ROW_FIELD) return m->stacked ? 0 : VALUE_OFFSET_WIDE;
    if (r->kind == US_ROW_DOOR) return m->stacked ? 0 : 1 + 24 + 6;   /* label, then the command */
    return 0;
}

int us_row_length(us_model *m, int index)
{
    char line[256];
    build_row(m, index, line);
    return (int) strlen(line);
}

const char *us_row_text(us_model *m, int index)
{
    char line[256];
    build_row(m, index, line);
    clip_into(m->text, line, us_text_room(m->cols));
    return m->text;
}

int us_jump(int *pending, int key)
{
    int digit;
    if (key < '0' || key > '9') { *pending = -1; return -1; }
    digit = key - '0';
    if (*pending == 1 && digit <= 6) { *pending = -1; return 10 + digit; }
    *pending = (digit == 1) ? 1 : -1;
    return digit;
}

int us_wrap(const char *text, int width, char lines[][81], int max_lines)
{
    int count = 0;
    const char *p = text;
    if (width > 80) width = 80;
    while (*p && count < max_lines) {
        int len = 0, cut;
        while (*p == '\r' || *p == '\n') p++;
        if (!*p) break;
        while (p[len] && p[len] != '\r' && p[len] != '\n') len++;
        cut = len;
        if (cut > width) {
            cut = width;
            while (cut > 0 && p[cut] != ' ') cut--;
            if (cut == 0) cut = width;
        }
        memcpy(lines[count], p, (size_t) cut);
        lines[count][cut] = '\0';
        count++;
        p += cut;
        while (*p == ' ') p++;
    }
    return count;
}

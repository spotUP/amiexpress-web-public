/* guide.c - AmigaGuide parsing and rendering. See guide.h for the design
 * and for why it mirrors web/backend/src/amigaguide/AmigaGuideParser.ts.
 *
 * C89. No allocation: the parse result is offsets into the caller's
 * buffer, and rendering writes into a caller-supplied output buffer.
 */

#include <string.h>
#include "guide.h"

static char guide_lower(char c)
{
    if (c >= 'A' && c <= 'Z') {
        return (char) (c - 'A' + 'a');
    }
    return c;
}

static int guide_ieq(const char *a, const char *b)
{
    int i;

    for (i = 0; a[i] != '\0' && b[i] != '\0'; i++) {
        if (guide_lower(a[i]) != guide_lower(b[i])) {
            return 0;
        }
    }
    return a[i] == '\0' && b[i] == '\0';
}

static void guide_copy(char *dest, unsigned long destsize, const char *src, unsigned long len)
{
    unsigned long take = len;

    if (destsize == 0) {
        return;
    }
    if (take > destsize - 1) {
        take = destsize - 1;
    }
    if (take > 0) {
        memcpy(dest, src, (size_t) take);
    }
    dest[take] = '\0';
}

/* Reads one whitespace-delimited, optionally double-quoted argument
 * starting at *p, advancing *p past it. Returns the length written.
 * Quoted arguments may contain spaces - that is how @node carries a
 * multi-word title ( @node MAIN "Getting started" ). */
static unsigned long guide_read_arg(const char **p, char *out, unsigned long outsize)
{
    const char *s = *p;
    const char *start;
    unsigned long len;

    while (*s == ' ' || *s == '\t') {
        s++;
    }

    if (*s == '"') {
        s++;
        start = s;
        while (*s != '\0' && *s != '"' && *s != '\n' && *s != '\r') {
            s++;
        }
        len = (unsigned long) (s - start);
        if (*s == '"') {
            s++;
        }
    } else {
        start = s;
        while (*s != '\0' && *s != ' ' && *s != '\t' && *s != '\n' && *s != '\r') {
            s++;
        }
        len = (unsigned long) (s - start);
    }

    guide_copy(out, outsize, start, len);
    *p = s;
    return len;
}

/* Rest of the line from *p, trimmed, with surrounding quotes removed -
 * used for @node's title, which is everything after the node name. */
static void guide_read_rest(const char *p, char *out, unsigned long outsize)
{
    const char *end;
    unsigned long len;

    while (*p == ' ' || *p == '\t') {
        p++;
    }
    end = p;
    while (*end != '\0' && *end != '\n' && *end != '\r') {
        end++;
    }
    while (end > p && (end[-1] == ' ' || end[-1] == '\t')) {
        end--;
    }
    if (end > p + 1 && *p == '"' && end[-1] == '"') {
        p++;
        end--;
    }
    len = (unsigned long) (end - p);
    guide_copy(out, outsize, p, len);
}

/* Command name of an @-line, lowercased into `name`. `p` must point at
 * the '@'. Returns a pointer to the argument text after the name. */
static const char *guide_command(const char *p, char *name, unsigned long namesize)
{
    const char *start;
    unsigned long i;

    p++; /* skip '@' */
    start = p;
    while (*p != '\0' && *p != ' ' && *p != '\t' && *p != '\n' && *p != '\r') {
        p++;
    }
    guide_copy(name, namesize, start, (unsigned long) (p - start));
    for (i = 0; name[i] != '\0'; i++) {
        name[i] = guide_lower(name[i]);
    }
    return p;
}

/* Start of the line's first non-blank character. */
static const char *guide_skip_blanks(const char *p)
{
    while (*p == ' ' || *p == '\t') {
        p++;
    }
    return p;
}

/* Commands the parser itself consumes. A line carrying one of these is
 * metadata, not body text, and must not be rendered - AmigaGuideParser.ts
 * never puts them in a node's content either. Anything NOT in this list
 * stays visible, which is the rule that keeps a copyright line written as
 * "@ 1994 Some Group" on screen. */
static int guide_is_known_command(const char *name)
{
    static const char *known[] = {
        "database", "node", "endnode", "prev", "next", "toc", "index",
        "help", "author", "version", "copyright", "master", "wordwrap",
        "smartwrap", "tab", "width", "height", "font", "remark", "rem",
        (const char *) 0
    };
    int i;

    for (i = 0; known[i] != (const char *) 0; i++) {
        if (strcmp(name, known[i]) == 0) {
            return 1;
        }
    }
    return 0;
}

int guide_looks_like_guide(const char *text)
{
    const char *p = text;

    if (text == (const char *) 0) {
        return 0;
    }

    if (strncmp(guide_skip_blanks(text), "@database", 9) == 0) {
        return 1;
    }

    /* Otherwise look for an @node at the start of any line. Real corpus
     * files omit @database more often than they omit @node, so refusing
     * on the magic alone would leave most of them rendered raw. */
    for (;;) {
        const char *line = guide_skip_blanks(p);
        if (strncmp(line, "@node", 5) == 0) {
            return 1;
        }
        while (*p != '\0' && *p != '\n') {
            p++;
        }
        if (*p == '\0') {
            return 0;
        }
        p++;
    }
}

int guide_parse(const char *text, guide_doc *doc)
{
    const char *p = text;
    int in_node = 0;
    guide_node *cur = (guide_node *) 0;
    unsigned long content_start = 0;

    doc->database[0] = '\0';
    doc->node_count = 0;
    doc->main_node = -1;
    doc->nodes_dropped = 0;

    if (text == (const char *) 0) {
        return 0;
    }

    for (;;) {
        const char *line_start = p;
        const char *line = guide_skip_blanks(p);
        const char *line_end = line;

        while (*line_end != '\0' && *line_end != '\n') {
            line_end++;
        }

        if (*line == '@') {
            char name[24];
            const char *args = guide_command(line, name, sizeof(name));

            if (strcmp(name, "database") == 0) {
                guide_read_rest(args, doc->database, sizeof(doc->database));
            } else if (strcmp(name, "node") == 0) {
                if (in_node && cur != (guide_node *) 0) {
                    cur->len = (unsigned long) (line_start - text) - content_start;
                }
                if (doc->node_count < GUIDE_MAX_NODES) {
                    cur = &doc->nodes[doc->node_count];
                    (void) guide_read_arg(&args, cur->name, sizeof(cur->name));
                    guide_read_rest(args, cur->title, sizeof(cur->title));
                    if (cur->title[0] == '\0') {
                        guide_copy(cur->title, sizeof(cur->title), cur->name,
                                   (unsigned long) strlen(cur->name));
                    }
                    cur->prev[0] = '\0';
                    cur->next[0] = '\0';
                    cur->toc[0] = '\0';
                    /* Content starts on the line AFTER @node. */
                    content_start = (unsigned long) (line_end - text);
                    if (*line_end == '\n') {
                        content_start++;
                    }
                    cur->start = content_start;
                    cur->len = 0;
                    /* The first node, or any node actually named "main",
                     * is where a reader starts - AmigaGuideParser.ts's
                     * rule, kept so both clients open the same page. */
                    if (doc->main_node < 0 || guide_ieq(cur->name, "main")) {
                        doc->main_node = doc->node_count;
                    }
                    doc->node_count++;
                    in_node = 1;
                } else {
                    doc->nodes_dropped++;
                    cur = (guide_node *) 0;
                    in_node = 0;
                }
            } else if (strcmp(name, "endnode") == 0) {
                if (in_node && cur != (guide_node *) 0) {
                    cur->len = (unsigned long) (line_start - text) - content_start;
                }
                in_node = 0;
                cur = (guide_node *) 0;
            } else if (in_node && cur != (guide_node *) 0 && strcmp(name, "prev") == 0) {
                (void) guide_read_arg(&args, cur->prev, sizeof(cur->prev));
            } else if (in_node && cur != (guide_node *) 0 && strcmp(name, "next") == 0) {
                (void) guide_read_arg(&args, cur->next, sizeof(cur->next));
            } else if (in_node && cur != (guide_node *) 0 && strcmp(name, "toc") == 0) {
                (void) guide_read_arg(&args, cur->toc, sizeof(cur->toc));
            } else if (strcmp(name, "author") == 0 || strcmp(name, "version") == 0
                       || strcmp(name, "copyright") == 0 || strcmp(name, "master") == 0
                       || strcmp(name, "index") == 0 || strcmp(name, "help") == 0
                       || strcmp(name, "wordwrap") == 0 || strcmp(name, "tab") == 0
                       || strcmp(name, "width") == 0 || strcmp(name, "height") == 0
                       || strcmp(name, "font") == 0 || strcmp(name, "remark") == 0
                       || strcmp(name, "rem") == 0 || strcmp(name, "smartwrap") == 0) {
                /* Recognized but not needed by a text-mode reader. */
            } else {
                /* Unknown @-command: content when inside a node, ignored
                 * outside one. Nothing to do at parse time - the node's
                 * byte range already covers the line, and the renderer
                 * decides what to drop (guide_is_known_command). Same rule
                 * as AmigaGuideParser.ts, and it matters: "@ 1994 Some
                 * Group" appears as body text in real files. */
            }
        }

        if (*line_end == '\0') {
            break;
        }
        p = line_end + 1;
    }

    /* A document whose last node has no @endnode still has content. */
    if (in_node && cur != (guide_node *) 0) {
        cur->len = (unsigned long) strlen(text) - content_start;
    }

    return doc->node_count;
}

int guide_find_node(const guide_doc *doc, const char *name)
{
    int i;

    if (name == (const char *) 0 || name[0] == '\0') {
        return -1;
    }
    for (i = 0; i < doc->node_count; i++) {
        if (guide_ieq(doc->nodes[i].name, name)) {
            return i;
        }
    }
    return -1;
}

/* True for the @{...} forms that are display attributes rather than
 * links. Compared case-insensitively against the whole brace body. */
static int guide_is_attribute(const char *body, unsigned long len)
{
    static const char *attrs[] = {
        "b", "ub", "i", "ui", "u", "uu", "plain", "amigaguide", "lindent",
        "jleft", "jright", "jcenter", "par", "line", "cleartabs", "settabs",
        (const char *) 0
    };
    char buf[24];
    int i;

    if (len >= sizeof(buf)) {
        /* Long bodies are only attributes in the "fg x"/"bg x" form,
         * handled below by prefix. */
        len = sizeof(buf) - 1;
    }
    guide_copy(buf, sizeof(buf), body, len);
    for (i = 0; buf[i] != '\0'; i++) {
        buf[i] = guide_lower(buf[i]);
    }
    for (i = 0; attrs[i] != (const char *) 0; i++) {
        if (strcmp(buf, attrs[i]) == 0) {
            return 1;
        }
    }
    if (strncmp(buf, "fg ", 3) == 0 || strncmp(buf, "bg ", 3) == 0) {
        return 1;
    }
    return 0;
}

/* Appends one character, respecting the output bound. */
static void guide_put(char *out, unsigned long outsize, unsigned long *pos, char c)
{
    if (*pos + 1 < outsize) {
        out[*pos] = c;
        (*pos)++;
    }
}

static void guide_puts(char *out, unsigned long outsize, unsigned long *pos, const char *s)
{
    while (*s != '\0') {
        guide_put(out, outsize, pos, *s);
        s++;
    }
}

unsigned long guide_render_node(const char *text, const guide_doc *doc,
                                 int node_index, char *out, unsigned long outsize,
                                 guide_link *links, int max_links, int *link_count)
{
    const guide_node *node;
    const char *p;
    const char *end;
    unsigned long pos = 0;
    int nlinks = 0;

    *link_count = 0;
    if (outsize == 0) {
        return 0;
    }
    out[0] = '\0';
    if (node_index < 0 || node_index >= doc->node_count) {
        return 0;
    }

    node = &doc->nodes[node_index];
    p = text + node->start;
    end = p + node->len;

    while (p < end && *p != '\0') {
        /* At the start of a line: drop the whole line when it carries a
         * command the parser already consumed (@toc, @next, ...). Only
         * checked at line start, so an '@' mid-sentence is untouched. */
        if (pos == 0 || out[pos - 1] == '\n') {
            const char *at = p;
            while (at < end && (*at == ' ' || *at == '\t')) {
                at++;
            }
            if (at < end && *at == '@' && at + 1 < end && at[1] != '{') {
                char name[24];
                (void) guide_command(at, name, sizeof(name));
                if (guide_is_known_command(name)) {
                    while (p < end && *p != '\n') {
                        p++;
                    }
                    if (p < end) {
                        p++; /* the newline too - the line vanishes whole */
                    }
                    continue;
                }
            }
        }

        if (*p == '\\' && p + 1 < end && p[1] == '@') {
            /* AmigaGuide's escape for a literal '@'. */
            guide_put(out, outsize, &pos, '@');
            p += 2;
            continue;
        }

        if (*p == '@' && p + 1 < end && p[1] == '{') {
            const char *body = p + 2;
            const char *close = body;
            unsigned long body_len;

            while (close < end && *close != '}' && *close != '\n') {
                close++;
            }
            if (close >= end || *close != '}') {
                /* Unterminated - emit the '@' literally rather than
                 * swallowing the rest of the line. */
                guide_put(out, outsize, &pos, *p);
                p++;
                continue;
            }
            body_len = (unsigned long) (close - body);

            if (guide_is_attribute(body, body_len)) {
                p = close + 1;
                continue;
            }

            {
                /* Link forms: `"text" link TARGET [line]`, `text link
                 * TARGET`, or a bare `TARGET`.
                 *
                 * The brace body is copied out FIRST, so every scan below
                 * is bounded by its own NUL rather than running past the
                 * closing brace - reading the target straight out of the
                 * document produced "INSTALL}" for @{"x" link INSTALL},
                 * since '}' is not a whitespace delimiter. */
                char bodybuf[160];
                char *link_kw = (char *) 0;
                char *scan;

                guide_copy(bodybuf, sizeof(bodybuf), body, body_len);

                scan = bodybuf;
                while (scan[0] != '\0' && scan[1] != '\0' && scan[2] != '\0'
                       && scan[3] != '\0' && scan[4] != '\0') {
                    if ((scan[0] == 'l' || scan[0] == 'L')
                        && (scan[1] == 'i' || scan[1] == 'I')
                        && (scan[2] == 'n' || scan[2] == 'N')
                        && (scan[3] == 'k' || scan[3] == 'K')
                        && (scan == bodybuf || scan[-1] == ' ' || scan[-1] == '\t')
                        && (scan[4] == ' ' || scan[4] == '\t')) {
                        link_kw = scan;
                        break;
                    }
                    scan++;
                }

                if (nlinks < max_links) {
                    char label[64];
                    char target[48];
                    char numbuf[16];
                    int n = nlinks + 1;

                    if (link_kw != (char *) 0) {
                        const char *lt = link_kw + 4;
                        const char *le = link_kw;
                        unsigned long llen;

                        /* Label: everything before "link", trimmed and
                         * unquoted. */
                        while (le > bodybuf && (le[-1] == ' ' || le[-1] == '\t')) {
                            le--;
                        }
                        llen = (unsigned long) (le - bodybuf);
                        if (llen >= 2 && bodybuf[0] == '"' && bodybuf[llen - 1] == '"') {
                            guide_copy(label, sizeof(label), bodybuf + 1, llen - 2);
                        } else {
                            guide_copy(label, sizeof(label), bodybuf, llen);
                        }
                        (void) guide_read_arg(&lt, target, sizeof(target));
                    } else {
                        guide_copy(target, sizeof(target), bodybuf,
                                   (unsigned long) strlen(bodybuf));
                        guide_copy(label, sizeof(label), bodybuf,
                                   (unsigned long) strlen(bodybuf));
                    }

                    if (target[0] != '\0') {
                        guide_copy(links[nlinks].text, sizeof(links[nlinks].text),
                                   label, (unsigned long) strlen(label));
                        guide_copy(links[nlinks].target, sizeof(links[nlinks].target),
                                   target, (unsigned long) strlen(target));
                        nlinks++;

                        /* "[n] label" - the same shape DOORMAN's viewer
                         * uses, so the number a reader types means the
                         * same thing in both. */
                        numbuf[0] = '[';
                        {
                            int digits = 0;
                            int v = n;
                            char rev[8];
                            while (v > 0 && digits < 7) {
                                rev[digits++] = (char) ('0' + (v % 10));
                                v /= 10;
                            }
                            if (digits == 0) {
                                rev[digits++] = '0';
                            }
                            {
                                int k = 1;
                                while (digits > 0) {
                                    numbuf[k++] = rev[--digits];
                                }
                                numbuf[k++] = ']';
                                numbuf[k++] = ' ';
                                numbuf[k] = '\0';
                            }
                        }
                        guide_puts(out, outsize, &pos, numbuf);
                        guide_puts(out, outsize, &pos, label);
                        p = close + 1;
                        continue;
                    }
                }

                /* Over the link ceiling, or a target-less brace: drop the
                 * markup, keep nothing. */
                p = close + 1;
                continue;
            }
        }

        guide_put(out, outsize, &pos, *p);
        p++;
    }

    out[pos] = '\0';
    *link_count = nlinks;
    return pos;
}

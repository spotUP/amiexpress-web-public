/* guide.h - AmigaGuide parsing and rendering for the DoorRepo C client.
 *
 * A third of the catalog's documentation is AmigaGuide: 1125 of the 3301
 * rows carry an @node, and 1319 have a .guide filename (measured against
 * this checkout's catalog on 2026-08-18). Until now this door printed
 * those files raw, so the reader saw @{"Installation" link INSTALL} and
 * @{b} markup instead of text and links - DOORMAN, reading the same
 * documents, renders them through web/backend/src/amigaguide/
 * AmigaGuideParser.ts with node navigation.
 *
 * This is the C89 equivalent of the parts of that parser a text-mode door
 * can use, and it deliberately mirrors its decisions so the two clients
 * agree about what a given file means:
 *   - @node/@endnode delimit nodes; the first node (or one named "main")
 *     is where a reader starts.
 *   - An @-command this parser does not know, INSIDE a node, is content,
 *     not a dropped line (AmigaGuideParser.ts's `default:` case).
 *   - @{... link TARGET} and the bare @{TARGET} form are both links;
 *     @{b}/@{ub}/@{i}/@{ui}/@{u}/@{uu}/@{fg x}/@{bg x}/@{j...} are
 *     attributes and are removed rather than shown.
 *
 * NO ALLOCATION and no copy of the document: a guide_doc holds byte
 * offsets into the caller's own buffer, which on this door is the static
 * g_doc the /doc endpoint was streamed into. Everything here is bounded
 * by the fixed limits below; a document with more nodes or links than
 * these simply stops gaining them (the rest of the document still reads),
 * because a door with an 8 KB stack cannot grow a table and must not
 * refuse a file for being large.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_GUIDE_H
#define DOORREPO_GUIDE_H

/* Chosen against the real corpus: the largest AmigaGuide document in this
 * checkout's catalog has well under 64 nodes, and no node in it carries
 * more than a couple of dozen links. */
#define GUIDE_MAX_NODES 64
#define GUIDE_MAX_LINKS 32

typedef struct {
    char text[64];    /* what the reader sees, quotes stripped */
    char target[48];  /* node name to jump to */
} guide_link;

typedef struct {
    char name[48];
    char title[64];
    unsigned long start;  /* offset of the node's first content byte */
    unsigned long len;    /* content length in bytes */
    char prev[48];
    char next[48];
    char toc[48];
} guide_node;

typedef struct {
    char database[64];
    guide_node nodes[GUIDE_MAX_NODES];
    int node_count;
    int main_node;        /* index of the node to open first, or -1 */
    int nodes_dropped;    /* nodes past GUIDE_MAX_NODES, for an honest UI */
} guide_doc;

/* Non-zero when `text` looks like an AmigaGuide document: it begins with
 * the @database magic, or an @node command appears at the start of some
 * line. Both are checked because real-world files in this corpus omit
 * @database more often than they omit @node. */
int guide_looks_like_guide(const char *text);

/* Parses `text` into `doc`. Returns the number of nodes found (0 means
 * "not an AmigaGuide document, render it as plain text"). `text` must
 * outlive `doc` - the node offsets point into it. */
int guide_parse(const char *text, guide_doc *doc);

/* Index of the node named `name` (case-insensitive), or -1. */
int guide_find_node(const guide_doc *doc, const char *name);

/* Renders node `node_index` into `out`: attribute codes removed, each
 * link shown as "[n] text" with n starting at 1, line structure of the
 * source preserved (Amiga docs are laid out in columns and ASCII art that
 * re-wrapping would destroy). Links are appended to `links` in the order
 * their numbers were assigned, up to `max_links`.
 *
 * `*link_count` receives how many links were recorded. Returns the number
 * of bytes written to `out` (always NUL-terminated). Output is truncated,
 * never overrun, if the rendered node exceeds `outsize`. */
unsigned long guide_render_node(const char *text, const guide_doc *doc,
                                 int node_index, char *out, unsigned long outsize,
                                 guide_link *links, int max_links, int *link_count);

#endif /* DOORREPO_GUIDE_H */

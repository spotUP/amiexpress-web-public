/* test_guide.c - unit tests for the AmigaGuide parser/renderer.
 *
 * C89. Run natively:
 *   cc -std=c89 -Wall -Wextra -pedantic \
 *       examples/doorrepo-c/guide.c examples/doorrepo-c/tests/test_guide.c \
 *       -o /tmp/test_guide && /tmp/test_guide
 *
 * The main fixture is REAL: the documentation of CDT-CS15.LZX, taken from
 * this checkout's door catalog on 2026-08-18 (doc_filename
 * ZZC_EMPLOYEE.GUIDE), transcribed here with its high-bit bytes written as
 * octal escapes so this source stays pure ASCII. It is worth using rather
 * than a hand-written sample because it exercises three things a made-up
 * fixture would probably not: a mixed-case "@Node", a link whose TARGET is
 * quoted, and a node name that is itself quoted.
 */

#include <stdio.h>
#include <string.h>
#include "../guide.h"

static int failures = 0;

static void check(const char *label, int cond)
{
    if (cond) {
        printf("PASS %s\n", label);
    } else {
        printf("FAIL %s\n", label);
        failures++;
    }
}

static const char REAL_GUIDE[] =
    "@database \"ByTeR\241DeRs - A CODERS DREAM COMES TRUE!\"\n"
    "@Node MAIN \"ByTeR\241DeRs\"\n"
    "\n"
    "                              Byteriders BBS\n"
    "\n"
    "                        @{\" Why should I call this BBS? \" link \"menu\"}\n"
    "@endnode\n"
    "\n"
    "@node \"menu\" \"ByTeR\241DeRs - Coders Paradise\"\n"
    "@toc \"menu\"\n"
    "\n"
    "          This BBS is especially set up for coders.\n"
    "- Famous coders\n"
    "@endnode\n";

static void test_real_document(void)
{
    guide_doc doc;
    guide_link links[GUIDE_MAX_LINKS];
    char out[2048];
    int nlinks = 0;
    int n;

    check("real: looks like a guide", guide_looks_like_guide(REAL_GUIDE) != 0);

    n = guide_parse(REAL_GUIDE, &doc);
    check("real: two nodes", n == 2);
    check("real: database title captured",
          strcmp(doc.database, "ByTeR\241DeRs - A CODERS DREAM COMES TRUE!") == 0);
    check("real: main node is the first one", doc.main_node == 0);
    check("real: node 0 name (mixed-case @Node)", strcmp(doc.nodes[0].name, "MAIN") == 0);
    check("real: node 0 title", strcmp(doc.nodes[0].title, "ByTeR\241DeRs") == 0);
    check("real: node 1 name is unquoted", strcmp(doc.nodes[1].name, "menu") == 0);
    check("real: node 1 @toc captured", strcmp(doc.nodes[1].toc, "menu") == 0);
    check("real: find_node is case-insensitive", guide_find_node(&doc, "main") == 0);
    check("real: find_node misses an absent node", guide_find_node(&doc, "nope") == -1);

    (void) guide_render_node(REAL_GUIDE, &doc, 0, out, sizeof(out), links,
                             GUIDE_MAX_LINKS, &nlinks);
    check("real: node 0 has one link", nlinks == 1);
    check("real: link label has its quotes stripped",
          strcmp(links[0].text, " Why should I call this BBS? ") == 0);
    check("real: link target is unquoted", strcmp(links[0].target, "menu") == 0);
    check("real: rendered text keeps the body", strstr(out, "Byteriders BBS") != (char *) 0);
    check("real: rendered link shows as [1] label",
          strstr(out, "[1]  Why should I call this BBS?") != (char *) 0);
    check("real: no raw markup survives", strstr(out, "@{") == (char *) 0);
    /* Node 0's content must stop at @endnode - bleeding into node 1 is the
     * classic off-by-one in this kind of parser. */
    check("real: node 0 does not contain node 1's text",
          strstr(out, "especially set up for coders") == (char *) 0);

    (void) guide_render_node(REAL_GUIDE, &doc, 1, out, sizeof(out), links,
                             GUIDE_MAX_LINKS, &nlinks);
    check("real: node 1 renders its own body",
          strstr(out, "especially set up for coders") != (char *) 0);
    check("real: node 1 has no links", nlinks == 0);
    check("real: @toc line is not shown as body text",
          strstr(out, "@toc") == (char *) 0);
}

static void test_attributes_and_escapes(void)
{
    static const char src[] =
        "@node MAIN\n"
        "@{b}Bold@{ub} and @{u}under@{uu} and @{fg highlight}colour@{fg text}\n"
        "Mail us at foo\\@example.com\n"
        "@{jcenter}centred@{jleft}\n"
        "@endnode\n";
    guide_doc doc;
    guide_link links[GUIDE_MAX_LINKS];
    char out[1024];
    int nlinks = -1;

    (void) guide_parse(src, &doc);
    (void) guide_render_node(src, &doc, 0, out, sizeof(out), links, GUIDE_MAX_LINKS, &nlinks);

    check("attrs: bold markers removed", strstr(out, "Bold and under and colour") != (char *) 0);
    check("attrs: justification markers removed", strstr(out, "\ncentred\n") != (char *) 0);
    check("attrs: no attribute became a link", nlinks == 0);
    check("attrs: escaped \\@ becomes a literal @",
          strstr(out, "foo@example.com") != (char *) 0);
}

static void test_link_forms(void)
{
    static const char src[] =
        "@node MAIN\n"
        "See @{\"Installation\" link INSTALL} or @{Usage link USAGE 12} or @{OTHER}\n"
        "@endnode\n";
    guide_doc doc;
    guide_link links[GUIDE_MAX_LINKS];
    char out[1024];
    int nlinks = 0;

    (void) guide_parse(src, &doc);
    (void) guide_render_node(src, &doc, 0, out, sizeof(out), links, GUIDE_MAX_LINKS, &nlinks);

    check("links: all three forms recognized", nlinks == 3);
    check("links: quoted label", strcmp(links[0].text, "Installation") == 0);
    check("links: quoted-label target", strcmp(links[0].target, "INSTALL") == 0);
    check("links: unquoted label", strcmp(links[1].text, "Usage") == 0);
    check("links: target with a trailing line number", strcmp(links[1].target, "USAGE") == 0);
    check("links: bare @{TARGET} is both label and target",
          strcmp(links[2].text, "OTHER") == 0 && strcmp(links[2].target, "OTHER") == 0);
    check("links: numbered in source order",
          strstr(out, "[1] Installation") != (char *) 0
          && strstr(out, "[2] Usage") != (char *) 0
          && strstr(out, "[3] OTHER") != (char *) 0);
}

static void test_unknown_commands_are_content(void)
{
    /* AmigaGuideParser.ts keeps an unrecognized @-command inside a node as
     * body text, and real files rely on it - a copyright line written as
     * "@ 1994 Some Group" would otherwise vanish. */
    static const char src[] =
        "@node MAIN\n"
        "@ 1994 Some Group\n"
        "@wibble something\n"
        "Body line\n"
        "@endnode\n";
    guide_doc doc;
    guide_link links[GUIDE_MAX_LINKS];
    char out[1024];
    int nlinks = 0;

    (void) guide_parse(src, &doc);
    (void) guide_render_node(src, &doc, 0, out, sizeof(out), links, GUIDE_MAX_LINKS, &nlinks);

    check("unknown: '@ 1994 Some Group' survives as text",
          strstr(out, "@ 1994 Some Group") != (char *) 0);
    check("unknown: '@wibble' survives as text", strstr(out, "@wibble something") != (char *) 0);
    check("unknown: body still there", strstr(out, "Body line") != (char *) 0);
}

static void test_malformed_and_bounds(void)
{
    static const char unterminated[] =
        "@node MAIN\n"
        "Broken @{link that never closes\n"
        "Second line\n"
        "@endnode\n";
    static const char no_endnode[] =
        "@node MAIN\n"
        "Content with no endnode\n";
    guide_doc doc;
    guide_link links[GUIDE_MAX_LINKS];
    char out[1024];
    char tiny[16];
    int nlinks = 0;

    (void) guide_parse(unterminated, &doc);
    (void) guide_render_node(unterminated, &doc, 0, out, sizeof(out), links,
                             GUIDE_MAX_LINKS, &nlinks);
    check("malformed: unterminated brace does not eat the rest of the document",
          strstr(out, "Second line") != (char *) 0);

    (void) guide_parse(no_endnode, &doc);
    (void) guide_render_node(no_endnode, &doc, 0, out, sizeof(out), links,
                             GUIDE_MAX_LINKS, &nlinks);
    check("malformed: a node with no @endnode still renders to end of file",
          strstr(out, "Content with no endnode") != (char *) 0);

    /* Truncation must be bounded and NUL-terminated, never an overrun. */
    (void) guide_render_node(no_endnode, &doc, 0, tiny, sizeof(tiny), links,
                             GUIDE_MAX_LINKS, &nlinks);
    check("bounds: output truncated inside its buffer", strlen(tiny) < sizeof(tiny));

    check("bounds: an out-of-range node index renders nothing",
          guide_render_node(no_endnode, &doc, 99, out, sizeof(out), links,
                            GUIDE_MAX_LINKS, &nlinks) == 0);
}

static void test_not_a_guide(void)
{
    static const char plain[] =
        "DoorRepo\n"
        "--------\n"
        "Just a plain README with an email address foo@bar.com in it.\n";
    guide_doc doc;

    check("plain: not detected as a guide", guide_looks_like_guide(plain) == 0);
    check("plain: parses to zero nodes", guide_parse(plain, &doc) == 0);
}

static void test_node_and_link_ceilings(void)
{
    /* A document with more nodes than the fixed table holds must keep the
     * ones it has and COUNT the rest, so a UI can say so rather than
     * pretending the document ended. */
    char src[8192];
    guide_doc doc;
    unsigned long pos = 0;
    int i;

    for (i = 0; i < GUIDE_MAX_NODES + 5; i++) {
        int written = sprintf(src + pos, "@node N%d\nbody %d\n@endnode\n", i, i);
        pos += (unsigned long) written;
    }
    src[pos] = '\0';

    (void) guide_parse(src, &doc);
    check("ceiling: node table filled to its limit", doc.node_count == GUIDE_MAX_NODES);
    check("ceiling: overflow nodes are counted, not silently lost",
          doc.nodes_dropped == 5);
}

int main(void)
{
    test_real_document();
    test_attributes_and_escapes();
    test_link_forms();
    test_unknown_commands_are_content();
    test_malformed_and_bounds();
    test_not_a_guide();
    test_node_and_link_ceilings();

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }
    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}

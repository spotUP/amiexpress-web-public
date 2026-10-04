/* test_texttv.c - host tests for the pure Text-TV helpers
 * (examples/texttv/texttv_parse.c). No BBS, no sockets, no terminal.
 *
 * Reachability: every pure function the door depends on is driven here,
 * including the compat-relevant edges (classic boards, off-air pages,
 * truncated UTF-8) that a live fetch may never produce on demand.
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "texttv_parse.h"
#include "ui_key.h"

static int failures = 0;
#define CHECK(cond) do { \
    if (!(cond)) { printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); failures++; } \
} while (0)

static void test_valid_page(void)
{
    CHECK(texttv_valid_page("100") == 100);
    CHECK(texttv_valid_page("999") == 999);
    CHECK(texttv_valid_page("300") == 300);
    CHECK(texttv_valid_page("99") == 0);
    CHECK(texttv_valid_page("1000") == 0);
    CHECK(texttv_valid_page("") == 0);
    CHECK(texttv_valid_page("10a") == 0);
    CHECK(texttv_valid_page(" 100") == 0);
    CHECK(texttv_valid_page("100 ") == 0);
    CHECK(texttv_valid_page(0) == 0);
    CHECK(texttv_valid_page("123456") == 0);
}

static void test_page_path(void)
{
    char out[128];
    CHECK(texttv_page_path(100, out, sizeof out) == 0);
    CHECK(strcmp(out, "/api/texttv/100") == 0);
    CHECK(texttv_page_path(999, out, sizeof out) == 0);
    CHECK(strcmp(out, "/api/texttv/999") == 0);
    CHECK(texttv_page_path(99, out, sizeof out) != 0);
    CHECK(texttv_page_path(1000, out, sizeof out) != 0);
    CHECK(texttv_page_path(100, out, 10) != 0);
    CHECK(out[0] == '\0');
}

static void test_first_plain(void)
{
    char out[512];
    /* Recorded shape: one object in a top-level array. */
    const char *one = "[{\"num\":\"100\",\"title\":\"News\",\"content_plain\":[\"100 SVT Text line1\\nline2\"],\"next_page\":\"101\"}]";
    CHECK(texttv_first_plain(one, out, sizeof out) == 0);
    CHECK(strcmp(out, "100 SVT Text line1\nline2") == 0);
    /* Off-air page: empty array is "not on air", not a transport failure. */
    CHECK(texttv_first_plain("[]", out, sizeof out) != 0);
    CHECK(out[0] == '\0');
    /* Missing key, wrong shape, truncation: all refused, out left "". */
    CHECK(texttv_first_plain("[{\"num\":\"100\"}]", out, sizeof out) != 0);
    CHECK(out[0] == '\0');
    CHECK(texttv_first_plain("[{\"content_plain\":[]}]", out, sizeof out) != 0);
    CHECK(texttv_first_plain("[{\"content_plain\":[\"abc}", out, sizeof out) != 0);
    CHECK(texttv_first_plain(one, out, 10) != 0);
    CHECK(out[0] == '\0');
    /* Escapes decode; a key inside an unrelated string value cannot match. */
    CHECK(texttv_first_plain("[{\"note\":\"content_plain is here\",\"content_plain\":[\"a\\\"b\\\\c\"]}]",
                             out, sizeof out) == 0);
    CHECK(strcmp(out, "a\"b\\c") == 0);
}

static void test_utf8(void)
{
    char out[64];
    /* ASCII passes through. */
    CHECK(utf8_to_latin1("Hello", out, sizeof out) == 5);
    CHECK(strcmp(out, "Hello") == 0);
    /* Swedish pages: åäöÅÄÖ arrive as two-byte UTF-8, leave as Latin-1. */
    CHECK(utf8_to_latin1("F\xc3\xa4rjebrand \xc3\x96", out, sizeof out) > 0);
    CHECK((unsigned char)out[1] == 0xE4);
    CHECK((unsigned char)out[11] == 0xD6);
    /* Punctuation folds to ASCII. */
    utf8_to_latin1("\xe2\x80\x93\xe2\x80\x9cHi\xe2\x80\x9d", out, sizeof out);
    CHECK(strcmp(out, "-\"Hi\"") == 0);
    /* Outside Latin-1 is '?'; one emoji is one '?', not four. */
    utf8_to_latin1("a\xf0\x9f\x98\x80" "b", out, sizeof out);
    CHECK(strcmp(out, "a?b") == 0);
    /* Truncated and overlong sequences are '?', never an overrun. */
    utf8_to_latin1("a\xc3", out, sizeof out);
    CHECK(strcmp(out, "a?") == 0);
    utf8_to_latin1("a\xc0\xaf" "b", out, sizeof out);
    CHECK(strcmp(out, "a?b") == 0);
    /* Truncation always NUL-terminates inside the cap. */
    utf8_to_latin1("abcdef", out, 4);
    CHECK(strcmp(out, "abc") == 0);
    CHECK(utf8_to_latin1(0, out, sizeof out) == 0);
}

static void test_pick_body(void)
{
    /* Recorded proxy shapes: the door's exact parse chain, driven. */
    char out[512];
    const char *both =
        "[{\"num\":\"100\",\"title\":\"T\",\"content_plain\":[\"plain\"],"
        "\"next_page\":\"101\",\"ansi\":\"\\u001b[0;33;44mDH\\u001b[0m\"}]";
    const char *plain_only =
        "[{\"num\":\"100\",\"title\":\"T\",\"content_plain\":[\"plain\"],"
        "\"next_page\":\"101\"}]";
    /* ANSI wins when present and non-empty (ESC arrives \u-escaped). */
    CHECK(texttv_pick_body(both, out, sizeof out) == 0);
    CHECK(out[0] == '\x1b');
    CHECK(strstr(out, "DH") != 0);
    /* Old proxy without ansi: plain carries the page. */
    CHECK(texttv_pick_body(plain_only, out, sizeof out) == 0);
    CHECK(strcmp(out, "plain") == 0);
    /* Empty ansi falls back to plain, not to a blank screen. */
    CHECK(texttv_pick_body(
        "[{\"content_plain\":[\"plain\"],\"ansi\":\"\"}]",
        out, sizeof out) == 0);
    CHECK(strcmp(out, "plain") == 0);
    /* Neither: off-air, out left "". */
    CHECK(texttv_pick_body("[]", out, sizeof out) != 0);
    CHECK(out[0] == '\0');
}

static void test_favs(void){
    texttv_config cfg;
    texttv_config_defaults(&cfg);
    CHECK(cfg.fav_count == 0);
    CHECK(strcmp(cfg.host, "127.0.0.1") == 0);
    /* The sidecar, never the board's own 3001 - a door that fetches from
       the process running it parks the shared event loop (live, 09-13). */
    CHECK(cfg.port == 3002);
    CHECK(texttv_fav_parse(&cfg, "100,300,401") == 3);
    CHECK(texttv_fav_has(&cfg, 300) == 1);
    CHECK(texttv_fav_has(&cfg, 200) == 0);
    /* Garbage skipped, duplicates folded, out of range dropped. */
    CHECK(texttv_fav_parse(&cfg, "100,xx,100,99,1000, 300 ") == 2);
    CHECK(cfg.favs[0] == 100 && cfg.favs[1] == 300);
    /* Toggle both ways. */
    CHECK(texttv_fav_toggle(&cfg, 400) == 1);
    CHECK(texttv_fav_has(&cfg, 400) == 1);
    CHECK(texttv_fav_toggle(&cfg, 400) == 0);
    CHECK(texttv_fav_has(&cfg, 400) == 0);
}

static void test_page_line(void)
{
    /* The title is upstream text. texttv.nu writes it, the board passes it
       through, and the door prints it on one row - so the row buffer is the
       small one and the title is the long one. Before the fix this was a
       sprintf into char[96] from a char[128] title. */
    struct { char line[96]; char canary[16]; } frame;
    char longtitle[128];
    int i;

    memset(&frame, 0, sizeof frame);
    memset(frame.canary, '#', sizeof frame.canary);
    for (i = 0; i < 127; i++) longtitle[i] = 'T';
    longtitle[127] = '\0';

    CHECK(texttv_page_line(frame.line, sizeof frame.line, 999, longtitle) == 1);
    CHECK(strlen(frame.line) == sizeof frame.line - 1);
    CHECK(strncmp(frame.line, "Page 999: TTT", 13) == 0);
    for (i = 0; i < (int)sizeof frame.canary; i++) CHECK(frame.canary[i] == '#');

    /* A title that fits is not cut and is not padded. */
    CHECK(texttv_page_line(frame.line, sizeof frame.line, 100, "Nyheter") == 0);
    CHECK(strcmp(frame.line, "Page 100: Nyheter") == 0);

    /* Degenerate buffers: terminated, never written past. */
    CHECK(texttv_page_line(frame.line, 4, 100, "Nyheter") == 1);
    CHECK(strcmp(frame.line, "Pag") == 0);
    CHECK(texttv_page_line(frame.line, 1, 100, "Nyheter") == 1);
    CHECK(frame.line[0] == '\0');
    CHECK(texttv_page_line(0, 96, 100, "Nyheter") == -1);

    /* No title at all is an empty tail, not a crash. */
    CHECK(texttv_page_line(frame.line, sizeof frame.line, 300, 0) == 0);
    CHECK(strcmp(frame.line, "Page 300: ") == 0);
}

static void test_ansi_to_ink(void)
{
    char out[256];
    /* The proxy's own shape: SGR foreground, background, and a reset. The
       door draws through ansi_text, which replaces control bytes with
       spaces - so an untranslated escape printed as "[0;37;44m" across the
       row, which is what a caller saw on every coloured page. */
    CHECK(texttv_ansi_to_ink("\033[0;37;44mNEWS\033[0m", out, sizeof out) > 0);
    CHECK(strcmp(out, "\001" "7NEWS\001R") == 0);

    /* Bright is the top half of the palette, not a separate flag. */
    CHECK(texttv_ansi_to_ink("\033[1;31mHOT", out, sizeof out) > 0);
    CHECK(strcmp(out, "\001" "9HOT") == 0);
    CHECK(texttv_ansi_to_ink("\033[93mHOT", out, sizeof out) > 0);
    CHECK(strcmp(out, "\001" "bHOT") == 0);

    /* A body with no escapes is copied through unchanged. */
    CHECK(texttv_ansi_to_ink("plain rows\nsecond", out, sizeof out) > 0);
    CHECK(strcmp(out, "plain rows\nsecond") == 0);

    /* Anything that is not a colour is dropped whole, not printed. */
    CHECK(texttv_ansi_to_ink("a\033[2Jb", out, sizeof out) > 0);
    CHECK(strcmp(out, "ab") == 0);

    /* A truncated escape at the end does not run off the string. */
    CHECK(texttv_ansi_to_ink("tail\033[", out, sizeof out) > 0);
    CHECK(strcmp(out, "tail") == 0);

    /* Degenerate buffers: terminated, never written past. */
    {
        struct { char buf[8]; char canary[8]; } frame;
        int i;
        memset(&frame, 0, sizeof frame);
        memset(frame.canary, '#', sizeof frame.canary);
        texttv_ansi_to_ink("\033[31mtoo long for this", frame.buf, sizeof frame.buf);
        CHECK(frame.buf[sizeof frame.buf - 1] == '\0');
        for (i = 0; i < (int)sizeof frame.canary; i++) CHECK(frame.canary[i] == '#');
    }
    CHECK(texttv_ansi_to_ink("x", out, 0) == 0);
    CHECK(texttv_ansi_to_ink(0, out, sizeof out) == 0);
}

static void test_reader_box(void)
{
    int left = -1, width = -1, height = -1;

    /* Eighty columns: the page fits inside the door's frame. */
    texttv_reader_box(80, 25, &left, &width, &height);
    CHECK(left == 2);
    CHECK(width == 77);
    CHECK(height == 18);

    /* Forty: a teletext row is exactly this wide, and the frame's margin
       used to take three of its characters before the reader even wrapped. */
    texttv_reader_box(40, 25, &left, &width, &height);
    /* Column ONE. ansi_goto is 1-based, and a left of 0 emits `ESC[r;0H`,
       which the terminal clamps - every row then lost its first characters
       and overran on the right (sysop's C64, 2026-09-13). */
    CHECK(left == 1);
    CHECK(width == 40);
    CHECK(height == 18);

    /* Narrower than a teletext row: still the whole screen, never negative. */
    texttv_reader_box(32, 24, &left, &width, &height);
    CHECK(left == 1);
    CHECK(width == 32);
    CHECK(height == 17);

    /* Null outputs are allowed - a caller may want one number. */
    texttv_reader_box(80, 25, 0, &width, 0);
    CHECK(width == 77);

    /* No width a caller can have puts the reader in column zero. */
    {
        int c;
        for (c = 20; c <= 132; c++) {
            texttv_reader_box(c, 25, &left, &width, &height);
            CHECK(left >= 1);
        }
    }
}

static void test_double_height_rows(void)
{
    /* The proxy marks SVT's double-height headlines with the escapes a
       VT100 knows. A teletext caller keeps them as the SDK's line markers -
       three bytes, no columns; anyone else must not see them at all, or a
       C64 renders the escape as glyphs. */
    const char *in = "\033#3\033[0;33mNyheter\033[0m";
    char out[128];

    CHECK(texttv_ansi_to_ink_mode(in, out, sizeof out, 1) > 0);
    CHECK(out[0] == '\001' && out[1] == 'H' && out[2] == '3');
    CHECK(strstr(out, "Nyheter") != 0);
    CHECK(strchr(out, 0x1b) == 0);         /* no raw escapes survive */

    CHECK(texttv_ansi_to_ink_mode(in, out, sizeof out, 0) > 0);
    CHECK(strstr(out, "Nyheter") != 0);
    CHECK(strstr(out, "\001H") == 0);       /* dropped, not kept */
    CHECK(strchr(out, 0x1b) == 0);

    /* The bottom half, and the back-to-normal form. */
    CHECK(texttv_ansi_to_ink_mode("\033#4rad", out, sizeof out, 1) > 0);
    CHECK(out[0] == '\001' && out[1] == 'H' && out[2] == '4');
    CHECK(texttv_ansi_to_ink_mode("\033#5rad", out, sizeof out, 1) > 0);
    CHECK(out[2] == '5');

    /* The old entry point is unchanged: no double height, no markers. */
    CHECK(texttv_ansi_to_ink(in, out, sizeof out) > 0);
    CHECK(strstr(out, "\001H") == 0);

    /* An escape this door does not know is dropped whole rather than
       half-copied - `ESC # 8` is DECALN and has no place on a page. */
    CHECK(texttv_ansi_to_ink_mode("\033#8rad", out, sizeof out, 1) > 0);
    CHECK(strcmp(out, "rad") == 0);
}

static void test_reader_title(void)
{
    /* The real page on 2026-09-13: "Rysarjamnt i SVT:s prognos over valet"
       is thirty-seven columns. With "100 " in front of it the row is
       forty-one on a forty-column screen and the caller read "...over vale"
       (sysop's teletext walk). The page's own first row already says 100. */
    const char *headline = "Rysarj\344mnt i SVT:s prognos \366ver valet";
    char out[160];

    CHECK(texttv_reader_title(out, sizeof out, 40, 100, headline, 1) == 0);
    CHECK(strcmp(out, headline) == 0);
    CHECK(strlen(out) <= 40);

    /* Eighty columns can afford the number, and the hint as well. */
    CHECK(texttv_reader_title(out, sizeof out, 80, 100, headline, 1) == 0);
    CHECK(strncmp(out, "100 ", 4) == 0);
    CHECK(strstr(out, headline) != 0);
    CHECK(strstr(out, "ARROWS PICK") != 0);
    CHECK(strlen(out) <= 80);

    /* A page with nothing to choose says nothing about choosing. */
    CHECK(texttv_reader_title(out, sizeof out, 80, 131, headline, 0) == 0);
    CHECK(strstr(out, "ARROWS PICK") == 0);
    CHECK(strncmp(out, "131 ", 4) == 0);

    /* A headline longer than the row is cut, and says so - but only after
       the number has been dropped, never instead of it. */
    {
        const char *monster =
            "Ett alldeles f\366r l\344ngt nyhetsrubrikexempel som aldrig tar slut";
        CHECK(texttv_reader_title(out, sizeof out, 40, 100, monster, 1) == 1);
        CHECK(strlen(out) == 40);
        CHECK(strncmp(out, monster, 40) == 0);
    }

    /* The hint never appears at a width that cannot hold it whole. */
    CHECK(texttv_reader_title(out, sizeof out, 50, 100, headline, 1) == 0);
    CHECK(strstr(out, "ARROWS") == 0);
    CHECK(strlen(out) <= 50);

    /* An unusable buffer is an error, and a tiny one still terminates. */
    CHECK(texttv_reader_title(0, sizeof out, 40, 100, headline, 1) == -1);
    CHECK(texttv_reader_title(out, 8, 40, 100, headline, 1) == 1);
    CHECK(strlen(out) <= 7);

    /* No width a caller can have overflows the row. */
    {
        int c;
        for (c = 20; c <= 132; c++) {
            texttv_reader_title(out, sizeof out, c, 100, headline, 1);
            CHECK((int) strlen(out) <= c);
        }
    }
}

static void test_title_latin1(void)
{
    /* The real shape off the wire on 2026-09-13: a Swedish headline in
       UTF-8. The body was converted and the title was not, so the frame drew
       "Dags fÃ¶r val - vallokalerna har Ã¶ppnat" above a body that read it
       correctly - the screenshot the sysop sent. */
    const char *json =
        "[{\"num\":\"100\",\"title\":\"Dags f\303\266r val - vallokalerna har \303\266ppnat\"}]";
    char out[128];

    CHECK(texttv_title(json, out, sizeof out) == 0);
    /* Latin-1 o-umlaut is one byte, 0xF6 - one column on the caller's glass. */
    CHECK(strcmp(out, "Dags f\366r val - vallokalerna har \366ppnat") == 0);
    CHECK(strstr(out, "\303") == 0);

    /* No title key: out is emptied and the caller falls back to its own. */
    CHECK(texttv_title("[{\"num\":\"100\"}]", out, sizeof out) != 0);
    CHECK(out[0] == '\0');
    CHECK(texttv_title(0, out, sizeof out) != 0);
    CHECK(texttv_title(json, out, 0) != 0);

    /* A title longer than the buffer is cut, not overrun. */
    {
        struct { char buf[16]; char canary[8]; } frame;
        int i;
        memset(&frame, 0, sizeof frame);
        memset(frame.canary, '#', sizeof frame.canary);
        texttv_title(json, frame.buf, sizeof frame.buf);
        CHECK(frame.buf[sizeof frame.buf - 1] == '\0');
        for (i = 0; i < (int)sizeof frame.canary; i++) CHECK(frame.canary[i] == '#');
    }
}

static void test_links(void)
{
    /* The shape the proxy sends for an index page: the anchor sits on the row
       with the number, and the headline is the block above it, which is why
       row and labelRow differ. UTF-8 in, Latin-1 out, like the title. */
    const char *json =
        "[{\"num\":\"100\",\"ansi\":\"x\",\"links\":["
        "{\"page\":106,\"row\":10,\"labelRow\":9,\"label\":\"Prelimin\303\244rt valresultat\"},"
        "{\"page\":113,\"row\":22,\"labelRow\":22,\"label\":\"SD-politiker hotad 113\"}"
        "]}]";
    texttv_link links[TEXTTV_MAX_LINKS];
    int n;

    n = texttv_links_parse(json, links, TEXTTV_MAX_LINKS);
    CHECK(n == 2);
    CHECK(links[0].page == 106);
    CHECK(links[0].row == 10);
    CHECK(links[0].label_row == 9);
    CHECK(strcmp(links[0].label, "Prelimin\344rt valresultat") == 0);
    CHECK(links[1].page == 113);
    CHECK(links[1].label_row == links[1].row);

    /* A page with nothing to select, and rubbish, are both "no links". */
    CHECK(texttv_links_parse("[{\"num\":\"100\",\"links\":[]}]", links, TEXTTV_MAX_LINKS) == 0);
    CHECK(texttv_links_parse("[{\"num\":\"100\"}]", links, TEXTTV_MAX_LINKS) == 0);
    CHECK(texttv_links_parse(0, links, TEXTTV_MAX_LINKS) == 0);
    CHECK(texttv_links_parse(json, links, 0) == 0);

    /* A page number outside 100-999 is not a page and is skipped. */
    CHECK(texttv_links_parse(
        "[{\"links\":[{\"page\":99,\"row\":1,\"labelRow\":1,\"label\":\"no\"}]}]",
        links, TEXTTV_MAX_LINKS) == 0);

    /* The cap is honoured rather than overrun. */
    CHECK(texttv_links_parse(json, links, 1) == 1);
}

static void test_link_step(void)
{
    /* Nothing selected yet: down takes the first, up takes the last. */
    CHECK(texttv_link_step(4, -1, 1) == 0);
    CHECK(texttv_link_step(4, -1, -1) == 3);
    /* Wraps at both ends - a four-headline page is a ring. */
    CHECK(texttv_link_step(4, 3, 1) == 0);
    CHECK(texttv_link_step(4, 0, -1) == 3);
    CHECK(texttv_link_step(4, 1, 1) == 2);
    /* A page with nothing to select has no cursor at all. */
    CHECK(texttv_link_step(0, -1, 1) == -1);
    CHECK(texttv_link_step(0, 0, -1) == -1);
}

/* The "Page N" menu: a digit opens number entry and is NOT eaten - typing
   100 there must reach the prompt as 100, not 00 (2026-10-04). */
static void test_action_key_keeps_the_first_digit(void)
{
    int pushback = -1;
    CHECK(texttv_action_key('1', &pushback) == TEXTTV_ACT_NUMBER);
    CHECK(pushback == '1');
    pushback = -1;
    CHECK(texttv_action_key('9', &pushback) == TEXTTV_ACT_NUMBER);
    CHECK(pushback == '9');
    /* Letters are actions and leave the pushback alone. */
    pushback = -1;
    CHECK(texttv_action_key('n', &pushback) == TEXTTV_ACT_NEXT);
    CHECK(texttv_action_key('Q', &pushback) == TEXTTV_ACT_QUIT);
    CHECK(texttv_action_key(UI_KEY_ESC, &pushback) == TEXTTV_ACT_INDEX);
    CHECK(texttv_action_key('x', &pushback) == TEXTTV_ACT_NONE);
    CHECK(pushback == -1);
    /* A dropped caller is a quit; a null pushback still names the action. */
    CHECK(texttv_action_key(-1, &pushback) == TEXTTV_ACT_QUIT);
    CHECK(texttv_action_key('5', 0) == TEXTTV_ACT_NUMBER);
}

int main(void)
{
    test_action_key_keeps_the_first_digit();
    test_valid_page();
    test_page_path();
    test_page_line();
    test_ansi_to_ink();
    test_reader_box();
    test_reader_title();
    test_double_height_rows();
    test_title_latin1();
    test_links();
    test_link_step();
    test_first_plain();
    test_pick_body();
    test_utf8();
    test_favs();
    if (failures == 0) printf("test_texttv: all green\n");
    return failures != 0;
}

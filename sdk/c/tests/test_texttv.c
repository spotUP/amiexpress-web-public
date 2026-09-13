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
    CHECK(cfg.port == 3001);
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

int main(void)
{
    test_valid_page();
    test_page_path();
    test_page_line();
    test_first_plain();
    test_pick_body();
    test_utf8();
    test_favs();
    if (failures == 0) printf("test_texttv: all green\n");
    return failures != 0;
}

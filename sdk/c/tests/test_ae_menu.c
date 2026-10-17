/* test_ae_menu.c - the AEW_MENU client: the catalogue parser and the conversation, against a stand-in board. */
#include "../include/ae_menu.h"
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CAT_PATH "build/test_ae_menu_main.cat"

static const char *GOOD =
    "AEMENU 1\n"
    "K MAIN\t-\n"
    "T MAIN MENU\n"
    "P BBS [1:Main] Menu (59 mins. left): \n"
    "O pages\n"
    "W X\t-\tH\n"
    "R 4\n"
    "L header\t3\t40\t0\n"
    "L between\t2\t80\t1\n"
    "S Messages\n"
    "E R\tRead Mail\tRead your mail\t12 new\tCL\n"
    "E E\tEnter Message\tWrite a message\t\t\n"
    "E MS\tMail Scan\tScan for new mail\t\t\n"
    "S Files\n"
    "E F\tFile Listings\tList the files\t\tG\n"
    "E D\tDownload\tDownload a file\t\t\n"
    ".\n";

static char last_request[256];
/* What the stub board answers to STYLE?: two fields is a board before the slide field. */
static const char *style_reply = "default\tpages";
static int requests;
static const char *open_answer = "OK\t" CAT_PATH;   /* what OPEN gets */
static int gone, silent;

static int answer(const char *text, char *out, int cap)
{
    int n = (int)strlen(text);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, text, (size_t)n);
    out[n] = '\0';
    return n;
}

static int stand_in(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx;
    assert(field == AE_FIELD_MENU);
    out[0] = '\0';
    strncpy(last_request, request, sizeof(last_request) - 1);
    requests++;
    if (gone) return -1;
    if (silent) return 0;
    if (strncmp(request, "OPEN ", 5) == 0) return answer(open_answer, out, cap);
    if (strncmp(request, "LOGO header", 11) == 0) return answer("OK\t3", out, cap);
    if (strncmp(request, "LOGO ", 5) == 0) return answer("NONE", out, cap);
    if (strncmp(request, "ROW ", 4) == 0) return answer("OK", out, cap);
    if (strcmp(request, "STYLE?") == 0) return answer(style_reply, out, cap);
    if (strncmp(request, "STYLE ", 6) == 0) return answer("OK\tcoverflow", out, cap);
    if (strncmp(request, "RUN ", 4) == 0) return answer("OK", out, cap);
    if (strncmp(request, "SHOW 3", 6) == 0) return answer("OK", out, cap);
    if (strncmp(request, "SHOW ", 5) == 0) return answer("NO", out, cap);
    return 0;
}

static void write_cat(const char *text)
{
    FILE *f = fopen(CAT_PATH, "wb");
    assert(f);
    fwrite(text, 1, strlen(text), f);
    fclose(f);
}

static ae_menu menu;

static int parse(const char *text) { return ae_menu_parse(text, (long)strlen(text), &menu); }

static void a_whole_catalogue_is_parsed_field_for_field(void)
{
    assert(parse(GOOD) == 1);
    assert(strcmp(menu.kind, "MAIN") == 0 && menu.parent[0] == '\0');
    assert(strcmp(menu.title, "MAIN MENU") == 0);
    assert(strcmp(menu.prompt, "BBS [1:Main] Menu (59 mins. left): ") == 0);
    assert(menu.entry_count == 5 && menu.section_count == 2);
    assert(menu.entry_section[0] == 0 && menu.entry_section[1] == 0 && menu.entry_section[2] == 0
           && menu.entry_section[3] == 1 && menu.entry_section[4] == 1);
    assert(strcmp(menu.section_title[1], "Files") == 0);
    assert(menu.pages == 1);
    assert(menu.wipe_open == 'X' && menu.wipe_leave == 0 && menu.wipe_page == 'H');
    assert(menu.last_row == 4);
    assert(menu.logo_count == 2 && menu.logos[1].after_section == 1 && menu.logos[1].cols == 80);
    assert(strcmp(menu.logos[0].position, "header") == 0 && menu.logos[0].rows == 3 && menu.logos[0].cols == 40);
    assert(strcmp(menu.entries[0].key, "R") == 0 && strcmp(menu.entries[0].label, "Read Mail") == 0);
    assert(strcmp(menu.entries[0].right, "12 new") == 0 && strcmp(menu.entries[0].flags, "CL") == 0);
    assert(strcmp(menu.entries[3].flags, "G") == 0 && menu.entries[1].right[0] == '\0');
    assert(strcmp(menu.entries[2].description, "Scan for new mail") == 0);
    assert(menu.truncated == 0);
    printf("  [OK] a whole catalogue is parsed field for field\n");
}

static void a_child_catalogue_keeps_its_parent_and_crlf_is_tolerated(void)
{
    assert(parse("AEMENU 1\r\nK CONFERENCES\t3\r\nS A\r\nE 1\tOne\tFirst\t\t\r\n.\r\n") == 1);
    assert(strcmp(menu.parent, "3") == 0 && menu.entry_count == 1);
    printf("  [OK] a child catalogue keeps its parent; CRLF is tolerated\n");
}

static void the_style_lines_set_the_style_and_the_legacy_drill_line_means_cover_flow(void)
{
    assert(parse("AEMENU 1\nK MAIN\t-\nO coverflow\nF 1\nS A\nE k\tl\td\t\t\n.\n") == 1);
    assert(menu.style == AE_MENU_STYLE_COVERFLOW && menu.slide == 1 && menu.pages == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nO pages\nF 0\nS A\nE k\tl\td\t\t\n.\n") == 1);
    assert(menu.style == AE_MENU_STYLE_PAGES && menu.slide == 0 && menu.pages == 1);
    assert(parse("AEMENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\t\n.\n") == 1);
    assert(menu.style == AE_MENU_STYLE_SCROLL && menu.slide == 0 && menu.pages == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nO classic\n.\n") == 0);              /* classic never reaches the grid door */
    assert(parse("AEMENU 1\nK MAIN\t-\nF 2\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nF 1\t1\n.\n") == 0);
    /* Legacy D, read for one release: drill on is cover flow, its second flag the slide; drill off changes nothing. */
    assert(parse("AEMENU 1\nK MAIN\t-\nO pages\nD 1\t0\nS A\nE k\tl\td\t\t\n.\n") == 1);
    assert(menu.style == AE_MENU_STYLE_COVERFLOW && menu.slide == 0 && menu.pages == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nO scroll\nD 1\t1\nS A\nE k\tl\td\t\t\n.\n") == 1);
    assert(menu.style == AE_MENU_STYLE_COVERFLOW && menu.slide == 1);
    assert(parse("AEMENU 1\nK MAIN\t-\nO pages\nD 0\t1\nS A\nE k\tl\td\t\t\n.\n") == 1);
    assert(menu.style == AE_MENU_STYLE_PAGES && menu.slide == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nD 1\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nD 2\t1\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nD 1\t1\t1\n.\n") == 0);
    printf("  [OK] O and F set the style and slide; a legacy D 1 line is cover flow\n");
}

static void a_malformed_file_is_refused(void)
{
    assert(parse("MENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\t\n.\n") == 0);                 /* missing magic */
    assert(parse("") == 0);
    /* THE half-written file: everything is fine but the final ".". */
    assert(parse("AEMENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\t\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\t\nE k2\tl2\td2") == 0);     /* cut mid-line */
    assert(parse("AEMENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\n.\n") == 0);                /* 4 fields */
    assert(parse("AEMENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\t\t\n.\n") == 0);            /* 6 fields */
    assert(parse("AEMENU 1\nK MAIN\t-\nX what\n.\n") == 0);                          /* unknown line */
    assert(parse("AEMENU 1\nK MAIN\t-\nO sideways\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nW X\t-\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nL header\t3\t40\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\nR four\n.\n") == 0);
    assert(parse("AEMENU 1\nK MAIN\t-\n.\nS late\n") == 0);                          /* nothing after the end */
    assert(ae_menu_parse(0, 0, &menu) == 0);
    printf("  [OK] a malformed or half-written file is refused\n");
}

static void too_many_entries_are_cut_and_flagged(void)
{
    static char big[300 * 40 + 100];
    int i, at;
    at = sprintf(big, "AEMENU 1\nK MAIN\t-\nS All\n");
    for (i = 0; i < 300; i++) at += sprintf(big + at, "E k%d\tLabel\tDesc\t\t\n", i);
    strcpy(big + at, ".\n");
    assert(parse(big) == 1);
    assert(menu.entry_count == AE_MENU_MAX_ENTRIES && menu.truncated == 1);
    assert(strcmp(menu.entries[AE_MENU_MAX_ENTRIES - 1].key, "k255") == 0);
    printf("  [OK] 300 entries are cut at the limit and flagged\n");
}

static void too_many_sections_and_logos_are_cut_and_flagged(void)
{
    static char big[8192];
    int i, at;
    at = sprintf(big, "AEMENU 1\nK MAIN\t-\n");
    for (i = 0; i < 6; i++) at += sprintf(big + at, "L side\t3\t20\t0\n");
    for (i = 0; i < 30; i++) at += sprintf(big + at, "S Section %d\nE k%d\tLabel\tDesc\t\t\n", i, i);
    strcpy(big + at, ".\n");
    assert(parse(big) == 1);
    assert(menu.logo_count == AE_MENU_MAX_LOGOS && menu.section_count == AE_MENU_MAX_SECTIONS && menu.truncated == 1);
    assert(menu.entry_count == AE_MENU_MAX_SECTIONS);                /* the 25th section's entries are not shown */
    printf("  [OK] too many sections and logos are cut and flagged\n");
}

static void a_long_field_is_cut_without_spilling_into_the_next(void)
{
    const char *line = "AEMENU 1\nK MAIN\t-\nS A\n"
        "E KEY\tABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCD\tdescription\tright\tC\n.\n";
    assert(parse(line) == 1);
    assert(strcmp(menu.entries[0].label, "ABCDEFGHIJKLMNOPQRSTUVWXYZ") == 0);       /* 26 */
    assert(strcmp(menu.entries[0].description, "description") == 0);
    assert(strcmp(menu.entries[0].right, "right") == 0 && strcmp(menu.entries[0].flags, "C") == 0);
    printf("  [OK] a 40 character label is cut at 26 without spilling\n");
}

static void open_reads_the_file_the_board_names(void)
{
    gone = 0; silent = 0;
    write_cat(GOOD);
    open_answer = "OK\t" CAT_PATH;
    assert(ae_menu_open("MAIN", 0, &menu) == 1);
    assert(strcmp(last_request, "OPEN MAIN") == 0);
    assert(menu.entry_count == 5 && strcmp(menu.title, "MAIN MENU") == 0);

    assert(ae_menu_open("MAIN", "3", &menu) == 1);
    assert(strcmp(last_request, "OPEN MAIN 3") == 0);
    assert(ae_menu_open("MAIN", "", &menu) == 1 && strcmp(last_request, "OPEN MAIN") == 0);

    open_answer = "NO";
    assert(ae_menu_open("MAIN", 0, &menu) == 0);
    open_answer = "NO\tdenied";
    assert(ae_menu_open("BULLETINS", 0, &menu) == 0);

    silent = 1;
    assert(ae_menu_open("MAIN", 0, &menu) == AE_MENU_SILENT);
    silent = 0; gone = 1;
    assert(ae_menu_open("MAIN", 0, &menu) == AE_MENU_GONE);
    gone = 0;
    printf("  [OK] OPEN reads the file the board names; refused, silent and gone are told apart\n");
}

static void an_unreadable_or_half_written_file_is_silent(void)
{
    open_answer = "OK\tbuild/no-such-catalogue.cat";
    assert(ae_menu_open("MAIN", 0, &menu) == AE_MENU_SILENT);
    write_cat("AEMENU 1\nK MAIN\t-\nS A\nE k\tl\td\t\t\n");                      /* no final "." */
    open_answer = "OK\t" CAT_PATH;
    assert(ae_menu_open("MAIN", 0, &menu) == AE_MENU_SILENT);
    write_cat(GOOD);
    printf("  [OK] an unreadable or half-written file is silent, never shown\n");
}

static void actions_send_exactly_their_verb(void)
{
    char eff[16], stored[16];
    gone = 0; silent = 0;
    assert(ae_menu_run("J 5 secret") == 1 && strcmp(last_request, "RUN J 5 secret") == 0);
    assert(ae_menu_run("") == 0);
    assert(ae_menu_row(7) == 1 && strcmp(last_request, "ROW 7") == 0);
    assert(ae_menu_show("3") == 1 && strcmp(last_request, "SHOW 3") == 0);
    assert(ae_menu_show("9") == 0);
    assert(ae_menu_logo_draw("header", 2, 1, 3, 80) == 3 && strcmp(last_request, "LOGO header 2 1 3 80") == 0);
    assert(ae_menu_logo_draw("footer", 20, 1, 3, 80) == 0);
    assert(ae_menu_style_get(stored, eff) == 1 && strcmp(last_request, "STYLE?") == 0
           && strcmp(stored, "default") == 0 && strcmp(eff, "pages") == 0);
    {
        int slide = -1;
        /* A board before the slide field always slid. */
        assert(ae_menu_style_query(stored, eff, &slide) == 1 && slide == 1 && strcmp(eff, "pages") == 0);
        style_reply = "default\tcoverflow\t0";
        assert(ae_menu_style_query(stored, eff, &slide) == 1 && slide == 0 && strcmp(eff, "coverflow") == 0);
        style_reply = "default\tcoverflow\t1";
        assert(ae_menu_style_query(stored, eff, &slide) == 1 && slide == 1);
        style_reply = "default\tpages";
    }
    assert(ae_menu_style("coverflow", eff) == 1 && strcmp(last_request, "STYLE coverflow") == 0 && strcmp(eff, "coverflow") == 0);
    /* The overflow calls are thin wrappers over the style calls. */
    assert(ae_menu_overflow(0, eff, (int)sizeof eff) == 1 && strcmp(last_request, "STYLE?") == 0 && strcmp(eff, "pages") == 0);
    assert(ae_menu_overflow_get(stored, (int)sizeof stored, eff, (int)sizeof eff) == 1
           && strcmp(stored, "default") == 0 && strcmp(eff, "pages") == 0);
    assert(ae_menu_overflow("scroll", eff, (int)sizeof eff) == 1 && strcmp(last_request, "STYLE scroll") == 0);
    silent = 1;
    assert(ae_menu_run("M") == 0 && ae_menu_row(1) == 0 && ae_menu_overflow(0, eff, (int)sizeof eff) == 0);
    silent = 0; gone = 1;
    assert(ae_menu_run("M") == AE_MENU_GONE && ae_menu_row(1) == AE_MENU_GONE && ae_menu_logo_draw("header", 1, 1, 1, 1) == AE_MENU_GONE);
    gone = 0;
    printf("  [OK] RUN, ROW, SHOW, LOGO and STYLE send exactly their verb\n");
}

int main(void)
{
    ae_native_set_exchange(stand_in, 0);
    a_whole_catalogue_is_parsed_field_for_field();
    a_child_catalogue_keeps_its_parent_and_crlf_is_tolerated();
    the_style_lines_set_the_style_and_the_legacy_drill_line_means_cover_flow();
    a_malformed_file_is_refused();
    too_many_entries_are_cut_and_flagged();
    too_many_sections_and_logos_are_cut_and_flagged();
    a_long_field_is_cut_without_spilling_into_the_next();
    open_reads_the_file_the_board_names();
    an_unreadable_or_half_written_file_is_silent();
    actions_send_exactly_their_verb();
    remove(CAT_PATH);
    puts("test_ae_menu: OK");
    return 0;
}

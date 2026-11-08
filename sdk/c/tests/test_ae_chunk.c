/*
 * ae_safe_chunk: where a message may be cut without tearing an escape sequence.
 *
 * The case this was written for (plan M15 follow-up): the masthead rail tick ends in ESC 8 (restore cursor), a
 * complete two-byte sequence. The chunker looked for a CSI final byte after the ESC, found none in an "ESC 8" that
 * ends the string, and cut BEFORE it - so every tick left the door as a 109-byte message plus a lone two-byte
 * message, twice the XIM round trips of the one it is.
 */
#include "../include/ae_chunk.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

static unsigned long take(const char *text, unsigned long budget)
{
    return ae_safe_chunk(text, (unsigned long)strlen(text), budget);
}

static void a_two_byte_escape_that_ends_the_string_is_not_cut_off(void)
{
    const char *tick = "\0337\033[1;1Hrail run\0338";                    /* save, move, text, restore */
    assert(take(tick, 198) == strlen(tick));                            /* whole: one message, not one and a lone ESC 8 */
    assert(take("abc\0337", 198) == 5);                                 /* ESC 7 at the end is whole too */
    printf("  [OK] ESC 7 / ESC 8 at the end of a write go out with it\n");
}

static void an_escape_still_torn_by_the_budget_is_cut_before_it(void)
{
    assert(take("AB\033[13;5Hxx", 7) == 2);                             /* inside a CSI: back off to before the ESC */
    assert(take("AB\033", 3) == 2);                                     /* a lone ESC that ends the buffer: the sequence is not here yet */
    assert(take("AB\033[1", 5) == 2);                                   /* a CSI with no final byte */
    assert(take("AB\033(", 4) == 2);                                    /* a charset designation is three bytes: ESC ( has no final byte yet */
    assert(take("AB\033(Bxy", 5) == 5);                                 /* ...and whole with it */
    assert(take("\033[2JHELLO", 4) == 4);                               /* a CSI that finishes at the budget stays */
    assert(take("just text", 4) == 4);
    printf("  [OK] a sequence the budget would tear is still cut before its ESC\n");
}

static void a_utf8_sequence_the_budget_would_tear_goes_whole_in_the_next_message(void)
{
    const char *thumbs = "ab\360\237\221\215 2";                  /* "ab", U+1F44D, " 2" */
    assert(take(thumbs, 3) == 2);                                       /* lead byte only: back off */
    assert(take(thumbs, 5) == 2);                                       /* three of four bytes: back off */
    assert(take(thumbs, 6) == 6);                                       /* whole: send it */
    assert(take("ab\342\235\244x", 4) == 2);                         /* three-byte heart, torn after two */
    assert(take("ab\351cd", 3) == 2);                                  /* a lone lead byte moves on too: same bytes, next message */
    assert(take("ab\351", 3) == 3);                                    /* the end of the text is never held back */
    printf("  [OK] a UTF-8 sequence the budget would tear goes whole in the next message\n");
}

int main(void)
{
    a_utf8_sequence_the_budget_would_tear_goes_whole_in_the_next_message();
    a_two_byte_escape_that_ends_the_string_is_not_cut_off();
    an_escape_still_torn_by_the_budget_is_cut_before_it();
    puts("test_ae_chunk: OK");
    return 0;
}

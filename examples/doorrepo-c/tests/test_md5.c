/* test_md5.c - unit tests for the streaming MD5 implementation.
 *
 * C89. Run natively:
 *   cc -std=c89 -Wall -Wextra -pedantic \
 *       examples/doorrepo-c/md5.c examples/doorrepo-c/tests/test_md5.c \
 *       -o /tmp/test_md5 && /tmp/test_md5
 *
 * Exits 0 and prints "ALL TESTS PASSED" if every assertion holds; exits 1
 * and prints which check failed otherwise.
 */

#include <stdio.h>
#include <string.h>
#include "../md5.h"

static int failures = 0;

static void check_digest(const char *label, const unsigned char *msg,
                          unsigned long len, const char *expected_hex)
{
    md5_ctx ctx;
    unsigned char digest[16];
    char hex[33];

    md5_init(&ctx);
    md5_update(&ctx, msg, len);
    md5_final(&ctx, digest);
    md5_hex(digest, hex);

    if (strcmp(hex, expected_hex) != 0) {
        printf("FAIL %s: expected %s got %s\n", label, expected_hex, hex);
        failures++;
    } else {
        printf("PASS %s\n", label);
    }
}

/* Feeds a fixed message through md5_update split into two chunks of
 * chunk1_len and (len - chunk1_len) bytes, and checks the digest matches
 * expected_hex. Used to exercise the internal 64-byte buffer boundary. */
static void check_chunked(const char *label, const unsigned char *msg,
                           unsigned long len, unsigned long chunk1_len,
                           const char *expected_hex)
{
    md5_ctx ctx;
    unsigned char digest[16];
    char hex[33];

    md5_init(&ctx);
    md5_update(&ctx, msg, chunk1_len);
    md5_update(&ctx, msg + chunk1_len, len - chunk1_len);
    md5_final(&ctx, digest);
    md5_hex(digest, hex);

    if (strcmp(hex, expected_hex) != 0) {
        printf("FAIL %s: expected %s got %s\n", label, expected_hex, hex);
        failures++;
    } else {
        printf("PASS %s\n", label);
    }
}

int main(void)
{
    unsigned char aaa[65];
    unsigned long i;

    /* RFC 1321 test vectors. */
    check_digest("rfc1321 empty",
                  (const unsigned char *) "", 0,
                  "d41d8cd98f00b204e9800998ecf8427e");
    check_digest("rfc1321 a",
                  (const unsigned char *) "a", 1,
                  "0cc175b9c0f1b6a831c399e269772661");
    check_digest("rfc1321 abc",
                  (const unsigned char *) "abc", 3,
                  "900150983cd24fb0d6963f7d28e17f72");
    check_digest("rfc1321 message digest",
                  (const unsigned char *) "message digest", 14,
                  "f96b697d7cb7938d525a2f31aaf161d0");
    check_digest("rfc1321 a-z",
                  (const unsigned char *) "abcdefghijklmnopqrstuvwxyz", 26,
                  "c3fcd3d76192e4007dfb496cca67e13b");

    /* Streaming equivalence: "abc" fed as three separate one-byte calls
     * must equal the one-shot digest above. */
    {
        md5_ctx ctx;
        unsigned char digest[16];
        char hex[33];

        md5_init(&ctx);
        md5_update(&ctx, (const unsigned char *) "a", 1);
        md5_update(&ctx, (const unsigned char *) "b", 1);
        md5_update(&ctx, (const unsigned char *) "c", 1);
        md5_final(&ctx, digest);
        md5_hex(digest, hex);

        if (strcmp(hex, "900150983cd24fb0d6963f7d28e17f72") != 0) {
            printf("FAIL streaming abc: expected 900150983cd24fb0d6963f7d28e17f72 got %s\n",
                   hex);
            failures++;
        } else {
            printf("PASS streaming abc\n");
        }
    }

    /* Extra: 64-byte block boundary. RFC 1321 only exercises messages
     * that fall well inside or, via padding, straddle one block. A naive
     * streaming implementation typically gets the boundary wrong when the
     * running buffer fill count hits exactly 64 (off-by-one on "is the
     * buffer full yet, and did I process a block before or after
     * appending the current byte") or when a single md5_update call's
     * input crosses from one block into the next partway through. We
     * build a 65-byte message ('a' * 65) and check it three ways:
     *   - one-shot (baseline, against an independently computed digest)
     *   - split 63/2 (chunk boundary falls one byte BEFORE the 64-byte
     *     block edge, forcing the block flush to happen mid-second-call)
     *   - split 64/1 (chunk boundary falls EXACTLY on the block edge,
     *     the classic off-by-one case)
     *   - split 1/64 (first call leaves 1 byte pending, second call's
     *     63 remaining + 1 pending must still assemble one full block)
     * All four must produce the same digest; expected value computed
     * independently via `python3 -c "import hashlib;
     * print(hashlib.md5(b'a'*65).hexdigest())"`.
     */
    for (i = 0; i < 65; i++) {
        aaa[i] = 'a';
    }
    check_digest("boundary 65 one-shot", aaa, 65,
                  "c743a45e0d2e6a95cb859adae0248435");
    check_chunked("boundary 65 split 63/2", aaa, 65, 63,
                   "c743a45e0d2e6a95cb859adae0248435");
    check_chunked("boundary 65 split 64/1", aaa, 65, 64,
                   "c743a45e0d2e6a95cb859adae0248435");
    check_chunked("boundary 65 split 1/64", aaa, 65, 1,
                   "c743a45e0d2e6a95cb859adae0248435");

    /* Also cover the exact-block-size cases (63 and 64 bytes), since the
     * padding path treats "input already fills the last block" specially. */
    check_digest("boundary 63 one-shot", aaa, 63,
                  "b06521f39153d618550606be297466d5");
    check_digest("boundary 64 one-shot", aaa, 64,
                  "014842d480b571495a4a0363793f7367");

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }

    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}

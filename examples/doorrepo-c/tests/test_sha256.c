/* test_sha256.c - unit tests for the streaming SHA-256 implementation.
 *
 * C89. Run natively:
 *   cc -std=c89 -Wall -Wextra -pedantic \
 *       examples/doorrepo-c/sha256.c examples/doorrepo-c/tests/test_sha256.c \
 *       -o /tmp/test_sha256 && /tmp/test_sha256
 *
 * Exits 0 and prints "ALL TESTS PASSED" if every assertion holds; exits 1
 * and prints which check failed otherwise.
 *
 * Vectors: the empty string, "abc" and the 448-bit message are the FIPS
 * 180-4 / NIST published vectors; the length-boundary vectors (55, 56, 57,
 * 63, 64, 65, 119, 120 bytes of 'a') and the one-million-'a' vector were
 * generated with Python's hashlib on 2026-08-18. The boundary lengths are
 * the ones that break a padding implementation: 55 is the last length that
 * pads inside its own block, 56 forces a second block for the length
 * field, and 64/65 straddle the buffer-flush path in sha256_update.
 */

#include <stdio.h>
#include <string.h>
#include "../sha256.h"

static int failures = 0;

static void check_digest(const char *label, const unsigned char *msg,
                          unsigned long len, const char *expected_hex)
{
    sha256_ctx ctx;
    unsigned char digest[32];
    char hex[65];

    sha256_init(&ctx);
    sha256_update(&ctx, msg, len);
    sha256_final(&ctx, digest);
    sha256_hex(digest, hex);

    if (strcmp(hex, expected_hex) != 0) {
        printf("FAIL %s: expected %s got %s\n", label, expected_hex, hex);
        failures++;
    } else {
        printf("PASS %s\n", label);
    }
}

/* Feeds a message through sha256_update in chunks of `chunk` bytes, so the
 * internal 64-byte buffer boundary is crossed at every possible offset.
 * A streaming hash that only works when fed whole blocks is useless here:
 * the door hashes an archive as it arrives off the socket, in whatever
 * sizes recv() happens to return. */
static void check_streamed(const char *label, const unsigned char *msg,
                            unsigned long len, unsigned long chunk,
                            const char *expected_hex)
{
    sha256_ctx ctx;
    unsigned char digest[32];
    char hex[65];
    unsigned long off = 0;

    sha256_init(&ctx);
    while (off < len) {
        unsigned long take = len - off;
        if (take > chunk) {
            take = chunk;
        }
        sha256_update(&ctx, msg + off, take);
        off += take;
    }
    sha256_final(&ctx, digest);
    sha256_hex(digest, hex);

    if (strcmp(hex, expected_hex) != 0) {
        printf("FAIL %s: expected %s got %s\n", label, expected_hex, hex);
        failures++;
    } else {
        printf("PASS %s\n", label);
    }
}

static void test_nist_vectors(void)
{
    static const char abc[] = "abc";
    static const char msg448[] =
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";

    check_digest("empty string", (const unsigned char *) "", 0UL,
                 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    check_digest("\"abc\"", (const unsigned char *) abc, 3UL,
                 "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    check_digest("448-bit NIST message", (const unsigned char *) msg448,
                 (unsigned long) (sizeof(msg448) - 1),
                 "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
}

static void test_length_boundaries(void)
{
    unsigned char buf[200];
    int i;

    for (i = 0; i < 200; i++) {
        buf[i] = (unsigned char) 'a';
    }

    check_digest("55 bytes (last length that pads in its own block)", buf, 55UL,
                 "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318");
    check_digest("56 bytes (padding needs a second block)", buf, 56UL,
                 "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a");
    check_digest("57 bytes", buf, 57UL,
                 "f13b2d724659eb3bf47f2dd6af1accc87b81f09f59f2b75e5c0bed6589dfe8c6");
    check_digest("63 bytes", buf, 63UL,
                 "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34");
    check_digest("64 bytes (exactly one block)", buf, 64UL,
                 "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
    check_digest("65 bytes (one block plus one)", buf, 65UL,
                 "635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0");
    check_digest("119 bytes", buf, 119UL,
                 "31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb");
    check_digest("120 bytes (two blocks, padding spills again)", buf, 120UL,
                 "2f3d335432c70b580af0e8e1b3674a7c020d683aa5f73aaaedfdc55af904c21c");
}

static void test_streaming_matches_one_shot(void)
{
    unsigned char buf[200];
    int i;
    static const char *expected120 =
        "2f3d335432c70b580af0e8e1b3674a7c020d683aa5f73aaaedfdc55af904c21c";

    for (i = 0; i < 200; i++) {
        buf[i] = (unsigned char) 'a';
    }

    check_streamed("120 bytes fed 1 byte at a time", buf, 120UL, 1UL, expected120);
    check_streamed("120 bytes fed 7 at a time (never block-aligned)", buf, 120UL, 7UL, expected120);
    check_streamed("120 bytes fed 63 at a time (straddles the boundary)", buf, 120UL, 63UL, expected120);
    check_streamed("120 bytes fed 64 at a time (exactly aligned)", buf, 120UL, 64UL, expected120);
    check_streamed("120 bytes fed 119 at a time", buf, 120UL, 119UL, expected120);
}

/* One million 'a' - the classic long-message vector. It is the only test
 * here that exercises the bit counter past 2^20 bits and takes a
 * measurable moment, which is the point: an archive is megabytes, not
 * bytes. Fed in 4093-byte chunks (deliberately a prime, so no chunk
 * boundary ever lands on a block boundary). */
static void test_long_message(void)
{
    sha256_ctx ctx;
    unsigned char digest[32];
    unsigned char chunk[4093];
    char hex[65];
    unsigned long remaining = 1000000UL;
    int i;

    for (i = 0; i < 4093; i++) {
        chunk[i] = (unsigned char) 'a';
    }

    sha256_init(&ctx);
    while (remaining > 0) {
        unsigned long take = (remaining > 4093UL) ? 4093UL : remaining;
        sha256_update(&ctx, chunk, take);
        remaining -= take;
    }
    sha256_final(&ctx, digest);
    sha256_hex(digest, hex);

    if (strcmp(hex, "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0") != 0) {
        printf("FAIL one million 'a': got %s\n", hex);
        failures++;
    } else {
        printf("PASS one million 'a'\n");
    }
}

/* A digest of high-bit bytes, which is what a real archive actually is -
 * a hash that only ever saw ASCII in its tests would not catch a sign-
 * extension bug on a char that is signed by default. */
static void test_binary_input(void)
{
    unsigned char buf[256];
    int i;

    for (i = 0; i < 256; i++) {
        buf[i] = (unsigned char) i;
    }

    check_digest("all 256 byte values 0x00-0xFF", buf, 256UL,
                 "40aff2e9d2d8922e47afd4648e6967497158785fbd1da870e7110266bf944880");
}

int main(void)
{
    test_nist_vectors();
    test_length_boundaries();
    test_streaming_matches_one_shot();
    test_long_message();
    test_binary_input();

    if (failures == 0) {
        printf("ALL TESTS PASSED\n");
        return 0;
    }

    printf("%d TEST(S) FAILED\n", failures);
    return 1;
}

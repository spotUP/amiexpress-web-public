/* sha256.c - streaming SHA-256 (FIPS 180-4) for the DoorRepo C client.
 * See sha256.h for why this exists and how it is used.
 *
 * C89. Portable across 32-bit `unsigned long` (68K/AmigaOS, the actual
 * deployment target) and 64-bit `unsigned long` (this development host):
 * every accumulation that could carry above bit 31 is masked with
 * `& 0xFFFFFFFFUL` immediately, and every rotation masks its result the
 * same way. Bytes are read/written explicitly BIG-endian (SHA-2's
 * convention, and the opposite of MD5's) rather than by struct punning,
 * so the digest does not depend on host endianness either.
 *
 * Structured deliberately like md5.c - same buffer-then-transform loop,
 * same two-halves bit counter, same masking discipline - because the two
 * are maintained together and a reader who has understood one should not
 * have to re-derive the other.
 */

#include "sha256.h"

#define SHA_MASK 0xFFFFFFFFUL

/* Right-rotate a 32-bit value by n bits (1 <= n <= 31), masked to 32 bits
 * so the result is correct even when sha_u32 is wider than 32 bits. */
static sha_u32 sha_rotr(sha_u32 x, int n)
{
    x &= SHA_MASK;
    return ((x >> n) | (x << (32 - n))) & SHA_MASK;
}

static sha_u32 sha_shr(sha_u32 x, int n)
{
    return (x & SHA_MASK) >> n;
}

/* FIPS 180-4 section 4.1.2 logical functions. */
#define SHA_CH(x, y, z)  (((x) & (y)) ^ ((~(x)) & (z)))
#define SHA_MAJ(x, y, z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))

static sha_u32 sha_bsig0(sha_u32 x)
{
    return (sha_rotr(x, 2) ^ sha_rotr(x, 13) ^ sha_rotr(x, 22)) & SHA_MASK;
}

static sha_u32 sha_bsig1(sha_u32 x)
{
    return (sha_rotr(x, 6) ^ sha_rotr(x, 11) ^ sha_rotr(x, 25)) & SHA_MASK;
}

static sha_u32 sha_ssig0(sha_u32 x)
{
    return (sha_rotr(x, 7) ^ sha_rotr(x, 18) ^ sha_shr(x, 3)) & SHA_MASK;
}

static sha_u32 sha_ssig1(sha_u32 x)
{
    return (sha_rotr(x, 17) ^ sha_rotr(x, 19) ^ sha_shr(x, 10)) & SHA_MASK;
}

/* FIPS 180-4 section 4.2.2 constants: the first 32 bits of the fractional
 * parts of the cube roots of the first 64 primes. */
static const sha_u32 sha_k[64] = {
    0x428a2f98UL, 0x71374491UL, 0xb5c0fbcfUL, 0xe9b5dba5UL,
    0x3956c25bUL, 0x59f111f1UL, 0x923f82a4UL, 0xab1c5ed5UL,
    0xd807aa98UL, 0x12835b01UL, 0x243185beUL, 0x550c7dc3UL,
    0x72be5d74UL, 0x80deb1feUL, 0x9bdc06a7UL, 0xc19bf174UL,
    0xe49b69c1UL, 0xefbe4786UL, 0x0fc19dc6UL, 0x240ca1ccUL,
    0x2de92c6fUL, 0x4a7484aaUL, 0x5cb0a9dcUL, 0x76f988daUL,
    0x983e5152UL, 0xa831c66dUL, 0xb00327c8UL, 0xbf597fc7UL,
    0xc6e00bf3UL, 0xd5a79147UL, 0x06ca6351UL, 0x14292967UL,
    0x27b70a85UL, 0x2e1b2138UL, 0x4d2c6dfcUL, 0x53380d13UL,
    0x650a7354UL, 0x766a0abbUL, 0x81c2c92eUL, 0x92722c85UL,
    0xa2bfe8a1UL, 0xa81a664bUL, 0xc24b8b70UL, 0xc76c51a3UL,
    0xd192e819UL, 0xd6990624UL, 0xf40e3585UL, 0x106aa070UL,
    0x19a4c116UL, 0x1e376c08UL, 0x2748774cUL, 0x34b0bcb5UL,
    0x391c0cb3UL, 0x4ed8aa4aUL, 0x5b9cca4fUL, 0x682e6ff3UL,
    0x748f82eeUL, 0x78a5636fUL, 0x84c87814UL, 0x8cc70208UL,
    0x90befffaUL, 0xa4506cebUL, 0xbef9a3f7UL, 0xc67178f2UL
};

/* Processes exactly one 64-byte block, updating ctx->state in place. */
static void sha256_transform(sha256_ctx *ctx, const unsigned char block[64])
{
    sha_u32 w[64];
    sha_u32 a, b, c, d, e, f, g, h;
    sha_u32 t1, t2;
    int i;

    /* Message schedule, big-endian words. */
    for (i = 0; i < 16; i++) {
        w[i] = ((((sha_u32) block[i * 4]) << 24) |
                (((sha_u32) block[i * 4 + 1]) << 16) |
                (((sha_u32) block[i * 4 + 2]) << 8) |
                ((sha_u32) block[i * 4 + 3])) & SHA_MASK;
    }
    for (i = 16; i < 64; i++) {
        w[i] = (sha_ssig1(w[i - 2]) + w[i - 7] + sha_ssig0(w[i - 15]) + w[i - 16]) & SHA_MASK;
    }

    a = ctx->state[0];
    b = ctx->state[1];
    c = ctx->state[2];
    d = ctx->state[3];
    e = ctx->state[4];
    f = ctx->state[5];
    g = ctx->state[6];
    h = ctx->state[7];

    for (i = 0; i < 64; i++) {
        t1 = (h + sha_bsig1(e) + SHA_CH(e, f, g) + sha_k[i] + w[i]) & SHA_MASK;
        t2 = (sha_bsig0(a) + SHA_MAJ(a, b, c)) & SHA_MASK;
        h = g;
        g = f;
        f = e;
        e = (d + t1) & SHA_MASK;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) & SHA_MASK;
    }

    ctx->state[0] = (ctx->state[0] + a) & SHA_MASK;
    ctx->state[1] = (ctx->state[1] + b) & SHA_MASK;
    ctx->state[2] = (ctx->state[2] + c) & SHA_MASK;
    ctx->state[3] = (ctx->state[3] + d) & SHA_MASK;
    ctx->state[4] = (ctx->state[4] + e) & SHA_MASK;
    ctx->state[5] = (ctx->state[5] + f) & SHA_MASK;
    ctx->state[6] = (ctx->state[6] + g) & SHA_MASK;
    ctx->state[7] = (ctx->state[7] + h) & SHA_MASK;
}

void sha256_init(sha256_ctx *ctx)
{
    /* FIPS 180-4 section 5.3.3: fractional parts of the square roots of
     * the first eight primes. */
    ctx->state[0] = 0x6a09e667UL;
    ctx->state[1] = 0xbb67ae85UL;
    ctx->state[2] = 0x3c6ef372UL;
    ctx->state[3] = 0xa54ff53aUL;
    ctx->state[4] = 0x510e527fUL;
    ctx->state[5] = 0x9b05688cUL;
    ctx->state[6] = 0x1f83d9abUL;
    ctx->state[7] = 0x5be0cd19UL;
    ctx->count_lo = 0;
    ctx->count_hi = 0;
}

void sha256_update(sha256_ctx *ctx, const unsigned char *data, unsigned long len)
{
    unsigned long buffer_used;
    unsigned long space;
    unsigned long bits_added;
    sha_u32 new_lo;

    /* Bytes already sitting in ctx->buffer, derived from the running bit
     * count: count_lo is bits, so bytes-in-buffer is (count_lo / 8) mod 64. */
    buffer_used = (unsigned long) ((ctx->count_lo >> 3) & 0x3FUL);

    bits_added = len << 3;
    new_lo = (ctx->count_lo + (sha_u32) bits_added) & SHA_MASK;
    if (new_lo < ctx->count_lo) {
        ctx->count_hi = (ctx->count_hi + 1) & SHA_MASK;
    }
    ctx->count_lo = new_lo;
    /* len can exceed 2^29 bytes where unsigned long is wider than 32 bits
     * (bits_added would overflow 32 bits before the mask above); fold that
     * overflow into count_hi explicitly, as md5.c does. */
    ctx->count_hi = (ctx->count_hi + (sha_u32) (len >> 29)) & SHA_MASK;

    if (buffer_used > 0) {
        space = 64 - buffer_used;
        if (len < space) {
            unsigned long i;
            for (i = 0; i < len; i++) {
                ctx->buffer[buffer_used + i] = data[i];
            }
            return;
        }
        {
            unsigned long i;
            for (i = 0; i < space; i++) {
                ctx->buffer[buffer_used + i] = data[i];
            }
        }
        sha256_transform(ctx, ctx->buffer);
        data += space;
        len -= space;
        buffer_used = 0;
    }

    while (len >= 64) {
        sha256_transform(ctx, data);
        data += 64;
        len -= 64;
    }

    if (len > 0) {
        unsigned long i;
        for (i = 0; i < len; i++) {
            ctx->buffer[i] = data[i];
        }
    }
}

void sha256_final(sha256_ctx *ctx, unsigned char digest[32])
{
    unsigned char pad[64];
    unsigned long buffer_used;
    unsigned long pad_len;
    unsigned char length_bytes[8];
    int i;

    buffer_used = (unsigned long) ((ctx->count_lo >> 3) & 0x3FUL);

    /* BIG-endian encoding of the 64-bit bit count (FIPS 180-4 section
     * 5.1.1) - the one place this differs structurally from md5.c, which
     * writes the same counter little-endian. */
    length_bytes[0] = (unsigned char) ((ctx->count_hi >> 24) & 0xFFUL);
    length_bytes[1] = (unsigned char) ((ctx->count_hi >> 16) & 0xFFUL);
    length_bytes[2] = (unsigned char) ((ctx->count_hi >> 8) & 0xFFUL);
    length_bytes[3] = (unsigned char) (ctx->count_hi & 0xFFUL);
    length_bytes[4] = (unsigned char) ((ctx->count_lo >> 24) & 0xFFUL);
    length_bytes[5] = (unsigned char) ((ctx->count_lo >> 16) & 0xFFUL);
    length_bytes[6] = (unsigned char) ((ctx->count_lo >> 8) & 0xFFUL);
    length_bytes[7] = (unsigned char) (ctx->count_lo & 0xFFUL);

    pad[0] = 0x80;
    for (i = 1; i < 64; i++) {
        pad[i] = 0;
    }

    if (buffer_used < 56) {
        pad_len = 56 - buffer_used;
    } else {
        pad_len = 120 - buffer_used;
    }
    /* length_bytes was captured above, BEFORE this padding call, so it
     * holds the true pre-padding message length; the updates below only
     * advance the running counters. */
    sha256_update(ctx, pad, pad_len);
    sha256_update(ctx, length_bytes, 8);

    for (i = 0; i < 8; i++) {
        digest[i * 4]     = (unsigned char) ((ctx->state[i] >> 24) & 0xFFUL);
        digest[i * 4 + 1] = (unsigned char) ((ctx->state[i] >> 16) & 0xFFUL);
        digest[i * 4 + 2] = (unsigned char) ((ctx->state[i] >> 8) & 0xFFUL);
        digest[i * 4 + 3] = (unsigned char) (ctx->state[i] & 0xFFUL);
    }
}

void sha256_hex(const unsigned char digest[32], char out[65])
{
    static const char hexchars[] = "0123456789abcdef";
    int i;

    for (i = 0; i < 32; i++) {
        out[i * 2]     = hexchars[(digest[i] >> 4) & 0x0F];
        out[i * 2 + 1] = hexchars[digest[i] & 0x0F];
    }
    out[64] = '\0';
}

/* md5.c - streaming MD5 (RFC 1321) for the DoorRepo C client.
 *
 * C89. Portable across 32-bit `unsigned long` (68K/AmigaOS, the actual
 * deployment target) and 64-bit `unsigned long` (this development host).
 * md5_u32 (see md5.h) is `unsigned long`; every accumulation that could
 * carry above bit 31 on a 64-bit host is masked with `& 0xFFFFFFFFUL`
 * immediately after the operation, and every left rotation masks its
 * result the same way, so the arithmetic is bit-identical on both word
 * sizes. Bytes are read/written explicitly least-significant-byte-first
 * (RFC 1321's convention) rather than via struct punning, so the digest
 * does not depend on host endianness either.
 */

#include "md5.h"

#define MD5_MASK 0xFFFFFFFFUL

/* Left-rotate a 32-bit value by n bits (1 <= n <= 31), masked to 32 bits
 * so the result is correct even when md5_u32 is wider than 32 bits. */
static md5_u32 md5_rotl(md5_u32 x, int n)
{
    x &= MD5_MASK;
    return ((x << n) | (x >> (32 - n))) & MD5_MASK;
}

/* RFC 1321 per-round auxiliary functions. */
#define MD5_F(x, y, z) (((x) & (y)) | ((~(x)) & (z)))
#define MD5_G(x, y, z) (((x) & (z)) | ((y) & (~(z))))
#define MD5_H(x, y, z) ((x) ^ (y) ^ (z))
#define MD5_I(x, y, z) ((y) ^ ((x) | (~(z))))

/* One MD5 round step: a = b + ((a + F(b,c,d) + x + ac) <<< s). Every
 * addition is masked to 32 bits so overflow above bit 31 on a 64-bit
 * host is discarded exactly as it would be on a 32-bit host. */
#define MD5_STEP(f, a, b, c, d, x, s, ac) \
    (a) = ((a) + f((b), (c), (d)) + (x) + (ac)) & MD5_MASK; \
    (a) = (md5_rotl((a), (s)) + (b)) & MD5_MASK;

/* RFC 1321 per-round shift amounts. */
static const int md5_s[64] = {
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
    5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21
};

/* RFC 1321 sine-derived additive constants, K[0..63]. */
static const md5_u32 md5_k[64] = {
    0xd76aa478UL, 0xe8c7b756UL, 0x242070dbUL, 0xc1bdceeeUL,
    0xf57c0fafUL, 0x4787c62aUL, 0xa8304613UL, 0xfd469501UL,
    0x698098d8UL, 0x8b44f7afUL, 0xffff5bb1UL, 0x895cd7beUL,
    0x6b901122UL, 0xfd987193UL, 0xa679438eUL, 0x49b40821UL,
    0xf61e2562UL, 0xc040b340UL, 0x265e5a51UL, 0xe9b6c7aaUL,
    0xd62f105dUL, 0x02441453UL, 0xd8a1e681UL, 0xe7d3fbc8UL,
    0x21e1cde6UL, 0xc33707d6UL, 0xf4d50d87UL, 0x455a14edUL,
    0xa9e3e905UL, 0xfcefa3f8UL, 0x676f02d9UL, 0x8d2a4c8aUL,
    0xfffa3942UL, 0x8771f681UL, 0x6d9d6122UL, 0xfde5380cUL,
    0xa4beea44UL, 0x4bdecfa9UL, 0xf6bb4b60UL, 0xbebfbc70UL,
    0x289b7ec6UL, 0xeaa127faUL, 0xd4ef3085UL, 0x04881d05UL,
    0xd9d4d039UL, 0xe6db99e5UL, 0x1fa27cf8UL, 0xc4ac5665UL,
    0xf4292244UL, 0x432aff97UL, 0xab9423a7UL, 0xfc93a039UL,
    0x655b59c3UL, 0x8f0ccc92UL, 0xffeff47dUL, 0x85845dd1UL,
    0x6fa87e4fUL, 0xfe2ce6e0UL, 0xa3014314UL, 0x4e0811a1UL,
    0xf7537e82UL, 0xbd3af235UL, 0x2ad7d2bbUL, 0xeb86d391UL
};

/* Processes exactly one 64-byte block, updating ctx->state in place. */
static void md5_transform(md5_ctx *ctx, const unsigned char block[64])
{
    md5_u32 a, b, c, d;
    md5_u32 x[16];
    int i;

    for (i = 0; i < 16; i++) {
        x[i] = ((md5_u32) block[i * 4]) |
               (((md5_u32) block[i * 4 + 1]) << 8) |
               (((md5_u32) block[i * 4 + 2]) << 16) |
               (((md5_u32) block[i * 4 + 3]) << 24);
        x[i] &= MD5_MASK;
    }

    a = ctx->state[0];
    b = ctx->state[1];
    c = ctx->state[2];
    d = ctx->state[3];

    /* Round 1 */
    MD5_STEP(MD5_F, a, b, c, d, x[ 0], md5_s[ 0], md5_k[ 0]);
    MD5_STEP(MD5_F, d, a, b, c, x[ 1], md5_s[ 1], md5_k[ 1]);
    MD5_STEP(MD5_F, c, d, a, b, x[ 2], md5_s[ 2], md5_k[ 2]);
    MD5_STEP(MD5_F, b, c, d, a, x[ 3], md5_s[ 3], md5_k[ 3]);
    MD5_STEP(MD5_F, a, b, c, d, x[ 4], md5_s[ 4], md5_k[ 4]);
    MD5_STEP(MD5_F, d, a, b, c, x[ 5], md5_s[ 5], md5_k[ 5]);
    MD5_STEP(MD5_F, c, d, a, b, x[ 6], md5_s[ 6], md5_k[ 6]);
    MD5_STEP(MD5_F, b, c, d, a, x[ 7], md5_s[ 7], md5_k[ 7]);
    MD5_STEP(MD5_F, a, b, c, d, x[ 8], md5_s[ 8], md5_k[ 8]);
    MD5_STEP(MD5_F, d, a, b, c, x[ 9], md5_s[ 9], md5_k[ 9]);
    MD5_STEP(MD5_F, c, d, a, b, x[10], md5_s[10], md5_k[10]);
    MD5_STEP(MD5_F, b, c, d, a, x[11], md5_s[11], md5_k[11]);
    MD5_STEP(MD5_F, a, b, c, d, x[12], md5_s[12], md5_k[12]);
    MD5_STEP(MD5_F, d, a, b, c, x[13], md5_s[13], md5_k[13]);
    MD5_STEP(MD5_F, c, d, a, b, x[14], md5_s[14], md5_k[14]);
    MD5_STEP(MD5_F, b, c, d, a, x[15], md5_s[15], md5_k[15]);

    /* Round 2 */
    MD5_STEP(MD5_G, a, b, c, d, x[ 1], md5_s[16], md5_k[16]);
    MD5_STEP(MD5_G, d, a, b, c, x[ 6], md5_s[17], md5_k[17]);
    MD5_STEP(MD5_G, c, d, a, b, x[11], md5_s[18], md5_k[18]);
    MD5_STEP(MD5_G, b, c, d, a, x[ 0], md5_s[19], md5_k[19]);
    MD5_STEP(MD5_G, a, b, c, d, x[ 5], md5_s[20], md5_k[20]);
    MD5_STEP(MD5_G, d, a, b, c, x[10], md5_s[21], md5_k[21]);
    MD5_STEP(MD5_G, c, d, a, b, x[15], md5_s[22], md5_k[22]);
    MD5_STEP(MD5_G, b, c, d, a, x[ 4], md5_s[23], md5_k[23]);
    MD5_STEP(MD5_G, a, b, c, d, x[ 9], md5_s[24], md5_k[24]);
    MD5_STEP(MD5_G, d, a, b, c, x[14], md5_s[25], md5_k[25]);
    MD5_STEP(MD5_G, c, d, a, b, x[ 3], md5_s[26], md5_k[26]);
    MD5_STEP(MD5_G, b, c, d, a, x[ 8], md5_s[27], md5_k[27]);
    MD5_STEP(MD5_G, a, b, c, d, x[13], md5_s[28], md5_k[28]);
    MD5_STEP(MD5_G, d, a, b, c, x[ 2], md5_s[29], md5_k[29]);
    MD5_STEP(MD5_G, c, d, a, b, x[ 7], md5_s[30], md5_k[30]);
    MD5_STEP(MD5_G, b, c, d, a, x[12], md5_s[31], md5_k[31]);

    /* Round 3 */
    MD5_STEP(MD5_H, a, b, c, d, x[ 5], md5_s[32], md5_k[32]);
    MD5_STEP(MD5_H, d, a, b, c, x[ 8], md5_s[33], md5_k[33]);
    MD5_STEP(MD5_H, c, d, a, b, x[11], md5_s[34], md5_k[34]);
    MD5_STEP(MD5_H, b, c, d, a, x[14], md5_s[35], md5_k[35]);
    MD5_STEP(MD5_H, a, b, c, d, x[ 1], md5_s[36], md5_k[36]);
    MD5_STEP(MD5_H, d, a, b, c, x[ 4], md5_s[37], md5_k[37]);
    MD5_STEP(MD5_H, c, d, a, b, x[ 7], md5_s[38], md5_k[38]);
    MD5_STEP(MD5_H, b, c, d, a, x[10], md5_s[39], md5_k[39]);
    MD5_STEP(MD5_H, a, b, c, d, x[13], md5_s[40], md5_k[40]);
    MD5_STEP(MD5_H, d, a, b, c, x[ 0], md5_s[41], md5_k[41]);
    MD5_STEP(MD5_H, c, d, a, b, x[ 3], md5_s[42], md5_k[42]);
    MD5_STEP(MD5_H, b, c, d, a, x[ 6], md5_s[43], md5_k[43]);
    MD5_STEP(MD5_H, a, b, c, d, x[ 9], md5_s[44], md5_k[44]);
    MD5_STEP(MD5_H, d, a, b, c, x[12], md5_s[45], md5_k[45]);
    MD5_STEP(MD5_H, c, d, a, b, x[15], md5_s[46], md5_k[46]);
    MD5_STEP(MD5_H, b, c, d, a, x[ 2], md5_s[47], md5_k[47]);

    /* Round 4 */
    MD5_STEP(MD5_I, a, b, c, d, x[ 0], md5_s[48], md5_k[48]);
    MD5_STEP(MD5_I, d, a, b, c, x[ 7], md5_s[49], md5_k[49]);
    MD5_STEP(MD5_I, c, d, a, b, x[14], md5_s[50], md5_k[50]);
    MD5_STEP(MD5_I, b, c, d, a, x[ 5], md5_s[51], md5_k[51]);
    MD5_STEP(MD5_I, a, b, c, d, x[12], md5_s[52], md5_k[52]);
    MD5_STEP(MD5_I, d, a, b, c, x[ 3], md5_s[53], md5_k[53]);
    MD5_STEP(MD5_I, c, d, a, b, x[10], md5_s[54], md5_k[54]);
    MD5_STEP(MD5_I, b, c, d, a, x[ 1], md5_s[55], md5_k[55]);
    MD5_STEP(MD5_I, a, b, c, d, x[ 8], md5_s[56], md5_k[56]);
    MD5_STEP(MD5_I, d, a, b, c, x[15], md5_s[57], md5_k[57]);
    MD5_STEP(MD5_I, c, d, a, b, x[ 6], md5_s[58], md5_k[58]);
    MD5_STEP(MD5_I, b, c, d, a, x[13], md5_s[59], md5_k[59]);
    MD5_STEP(MD5_I, a, b, c, d, x[ 4], md5_s[60], md5_k[60]);
    MD5_STEP(MD5_I, d, a, b, c, x[11], md5_s[61], md5_k[61]);
    MD5_STEP(MD5_I, c, d, a, b, x[ 2], md5_s[62], md5_k[62]);
    MD5_STEP(MD5_I, b, c, d, a, x[ 9], md5_s[63], md5_k[63]);

    ctx->state[0] = (ctx->state[0] + a) & MD5_MASK;
    ctx->state[1] = (ctx->state[1] + b) & MD5_MASK;
    ctx->state[2] = (ctx->state[2] + c) & MD5_MASK;
    ctx->state[3] = (ctx->state[3] + d) & MD5_MASK;
}

void md5_init(md5_ctx *ctx)
{
    ctx->state[0] = 0x67452301UL;
    ctx->state[1] = 0xefcdab89UL;
    ctx->state[2] = 0x98badcfeUL;
    ctx->state[3] = 0x10325476UL;
    ctx->count_lo = 0;
    ctx->count_hi = 0;
}

void md5_update(md5_ctx *ctx, const unsigned char *data, unsigned long len)
{
    unsigned long buffer_used;
    unsigned long space;
    unsigned long bits_added;
    md5_u32 new_lo;

    /* Number of bytes already sitting in ctx->buffer, derived from the
     * running bit count. count_lo is bits, so bytes-in-buffer is
     * (count_lo / 8) mod 64. */
    buffer_used = (unsigned long) ((ctx->count_lo >> 3) & 0x3FUL);

    /* Advance the 64-bit (as two 32-bit halves) bit counter by len*8,
     * masking each half to 32 bits and carrying into count_hi by hand so
     * this is correct whether md5_u32 is 32 or 64 bits wide. */
    bits_added = len << 3;
    new_lo = (ctx->count_lo + (md5_u32) bits_added) & MD5_MASK;
    if (new_lo < ctx->count_lo) {
        ctx->count_hi = (ctx->count_hi + 1) & MD5_MASK;
    }
    ctx->count_lo = new_lo;
    /* len can exceed 2^29 bytes on a host where unsigned long is wider
     * than 32 bits (bits_added would then itself overflow 32 bits before
     * masking above); fold any such overflow into count_hi explicitly. */
    ctx->count_hi = (ctx->count_hi + (md5_u32) (len >> 29)) & MD5_MASK;

    if (buffer_used > 0) {
        space = 64 - buffer_used;
        if (len < space) {
            {
                unsigned long i;
                for (i = 0; i < len; i++) {
                    ctx->buffer[buffer_used + i] = data[i];
                }
            }
            return;
        }
        {
            unsigned long i;
            for (i = 0; i < space; i++) {
                ctx->buffer[buffer_used + i] = data[i];
            }
        }
        md5_transform(ctx, ctx->buffer);
        data += space;
        len -= space;
        buffer_used = 0;
    }

    while (len >= 64) {
        md5_transform(ctx, data);
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

void md5_final(md5_ctx *ctx, unsigned char digest[16])
{
    unsigned char pad[64];
    unsigned long buffer_used;
    unsigned long pad_len;
    unsigned char length_bytes[8];
    int i;

    buffer_used = (unsigned long) ((ctx->count_lo >> 3) & 0x3FUL);

    /* Little-endian encoding of the 64-bit bit count, RFC 1321 sec 3.1. */
    length_bytes[0] = (unsigned char) (ctx->count_lo & 0xFFUL);
    length_bytes[1] = (unsigned char) ((ctx->count_lo >> 8) & 0xFFUL);
    length_bytes[2] = (unsigned char) ((ctx->count_lo >> 16) & 0xFFUL);
    length_bytes[3] = (unsigned char) ((ctx->count_lo >> 24) & 0xFFUL);
    length_bytes[4] = (unsigned char) (ctx->count_hi & 0xFFUL);
    length_bytes[5] = (unsigned char) ((ctx->count_hi >> 8) & 0xFFUL);
    length_bytes[6] = (unsigned char) ((ctx->count_hi >> 16) & 0xFFUL);
    length_bytes[7] = (unsigned char) ((ctx->count_hi >> 24) & 0xFFUL);

    /* Pad with 0x80 then zeros so the message length is congruent to 56
     * mod 64, leaving exactly 8 bytes for the length field. */
    pad[0] = 0x80;
    for (i = 1; i < 64; i++) {
        pad[i] = 0;
    }

    if (buffer_used < 56) {
        pad_len = 56 - buffer_used;
    } else {
        pad_len = 120 - buffer_used;
    }
    /* length_bytes was captured above from ctx->count_lo/count_hi BEFORE
     * this padding call, so it already holds the true pre-padding
     * message length; md5_update below only advances the running
     * counters, it does not touch the local length_bytes array. */
    md5_update(ctx, pad, pad_len);

    md5_update(ctx, length_bytes, 8);

    for (i = 0; i < 4; i++) {
        digest[i * 4]     = (unsigned char) (ctx->state[i] & 0xFFUL);
        digest[i * 4 + 1] = (unsigned char) ((ctx->state[i] >> 8) & 0xFFUL);
        digest[i * 4 + 2] = (unsigned char) ((ctx->state[i] >> 16) & 0xFFUL);
        digest[i * 4 + 3] = (unsigned char) ((ctx->state[i] >> 24) & 0xFFUL);
    }
}

void md5_hex(const unsigned char digest[16], char out[33])
{
    static const char hexchars[] = "0123456789abcdef";
    int i;

    for (i = 0; i < 16; i++) {
        out[i * 2]     = hexchars[(digest[i] >> 4) & 0x0F];
        out[i * 2 + 1] = hexchars[digest[i] & 0x0F];
    }
    out[32] = '\0';
}

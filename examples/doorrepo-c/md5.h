/* md5.h - streaming MD5 (RFC 1321) for the DoorRepo C client.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 * md5_u32 is declared as `unsigned long` and every place that matters masks
 * explicitly with `& 0xFFFFFFFFUL` so the digest is bit-identical whether
 * `unsigned long` is 32 bits (68K/AmigaOS) or 64 bits (this host).
 *
 * Streaming: md5_update may be called any number of times with any chunk
 * sizes (including one byte at a time) before md5_final; this lets the
 * caller hash an archive as it is written straight to disk, without ever
 * buffering the whole file in memory.
 */

#ifndef DOORREPO_MD5_H
#define DOORREPO_MD5_H

/* 32-bit unsigned type. On a 32-bit host this IS unsigned long; on a
 * 64-bit host it is a wider type that we mask down to 32 bits by hand
 * wherever arithmetic could carry into the high bits. */
typedef unsigned long md5_u32;

typedef struct md5_ctx {
    md5_u32 state[4];        /* A, B, C, D */
    md5_u32 count_lo;        /* number of bits hashed so far, low 32 bits */
    md5_u32 count_hi;        /* number of bits hashed so far, high 32 bits */
    unsigned char buffer[64]; /* partial input block */
} md5_ctx;

void md5_init(md5_ctx *ctx);
void md5_update(md5_ctx *ctx, const unsigned char *data, unsigned long len);
void md5_final(md5_ctx *ctx, unsigned char digest[16]);
void md5_hex(const unsigned char digest[16], char out[33]);

#endif /* DOORREPO_MD5_H */

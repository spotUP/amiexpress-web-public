/* sha256.h - streaming SHA-256 (FIPS 180-4) for the DoorRepo C client.
 *
 * Exists because the repo publishes BOTH digests for every archive
 * (docs/DOOR-REPO-API.md section 9: "MD5 is the minimum a client should
 * verify... SHA256 is also available"), and DOORMAN - the reference
 * consumer - verifies the SHA-256. This door verified only MD5, so the two
 * clients of the same API disagreed about what "verified" meant.
 *
 * The digest does not travel in list.txt (that would add 64 bytes to every
 * one of ~3300 rows for a value only a downloading client needs); it
 * arrives in the X-Archive-SHA256 response header alongside the archive
 * bytes, which http.c already captures into http_response.sha256.
 *
 * C89, and deliberately the same shape as md5.h so the two are used
 * identically at the call site. No stdint.h (not available on the
 * m68k-amiga-elf/vbcc toolchain): sha_u32 is `unsigned long` and every
 * operation that could carry into the high bits masks with 0xFFFFFFFFUL,
 * so the digest is bit-identical whether unsigned long is 32 bits (68K)
 * or 64 (this host).
 *
 * Streaming: sha256_update may be called any number of times with any
 * chunk sizes (including one byte at a time) before sha256_final, so an
 * archive can be hashed as it is written straight to disk, never buffered
 * whole in RAM.
 *
 * Cost on the real target: SHA-256 is roughly two to three times the work
 * of MD5 per byte on a 68020. That is why MD5 remains the fallback and
 * neither digest is computed twice - see doorrepo.c's download context,
 * which runs both hashes in one pass over the stream because the bytes are
 * only in memory once.
 */

#ifndef DOORREPO_SHA256_H
#define DOORREPO_SHA256_H

/* 32-bit unsigned type - see the masking note above. */
typedef unsigned long sha_u32;

typedef struct sha256_ctx {
    sha_u32 state[8];         /* H0..H7 */
    sha_u32 count_lo;         /* bits hashed so far, low 32 */
    sha_u32 count_hi;         /* bits hashed so far, high 32 */
    unsigned char buffer[64]; /* partial input block */
} sha256_ctx;

void sha256_init(sha256_ctx *ctx);
void sha256_update(sha256_ctx *ctx, const unsigned char *data, unsigned long len);
void sha256_final(sha256_ctx *ctx, unsigned char digest[32]);
void sha256_hex(const unsigned char digest[32], char out[65]);

#endif /* DOORREPO_SHA256_H */

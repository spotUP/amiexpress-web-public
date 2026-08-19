/* probe_fetch.c - smallest program that reproduces the archive download
 * through the SAME netio.c/http.c path DoorRepo uses, with no catalog, no
 * UI and no user input, so it can be run head-less under this project's 68K
 * emulator and compared byte-for-byte against what curl gets.
 *
 * Written for the -D-CALC.LHA mismatch: the door computes a stable but wrong
 * digest under the emulator while the native build of the same source gets
 * the archive right, which points at the emulator's bsdsocket recv path
 * rather than at anything in the client. Guessing at the corruption failed;
 * this captures the actual bytes instead.
 *
 * Output (next to the executable, so it can be pulled off the host):
 *   probe.bin - the response body exactly as it arrived
 *   probe.txt - status, framing, digests, and the size of every chunk the
 *               sink was handed, which is what shows a recv()-level fault
 *
 * C89, same rules as the rest of examples/doorrepo-c.
 */

#include <stdio.h>
#include <string.h>
#include "config.h"
#include "http.h"
#include "md5.h"
#include "sha256.h"

#define MAX_LOGGED_CHUNKS 512

typedef struct {
    FILE *file;
    md5_ctx md5;
    sha256_ctx sha;
    unsigned long received;
    unsigned long chunks;
    unsigned long chunk_len[MAX_LOGGED_CHUNKS];
} probe_ctx;

static int probe_sink(void *ctx, const unsigned char *buf, unsigned long len)
{
    probe_ctx *pc = (probe_ctx *) ctx;

    if (pc->chunks < MAX_LOGGED_CHUNKS) {
        pc->chunk_len[pc->chunks] = len;
    }
    pc->chunks++;

    if (len > 0) {
        fwrite(buf, 1, (size_t) len, pc->file);
        md5_update(&pc->md5, buf, len);
        sha256_update(&pc->sha, buf, len);
        pc->received += len;
    }
    return 0;
}

int main(int argc, char **argv)
{
    dr_config cfg;
    http_response resp;
    probe_ctx pc;
    unsigned char digest[16];
    unsigned char shadigest[32];
    char md5hex[33];
    char shahex[65];
    char path[256];
    FILE *report;
    int rc;
    unsigned long i;

    config_defaults(&cfg);
    strcpy(cfg.host, "bbs.uprough.net");
    cfg.port = 80;
    strcpy(cfg.path, "/api/door-repo");
    cfg.timeout_secs = 60;

    /* Archive name from argv when a shell gives us one. Under this project's
     * emulator the program is started the way AmiExpress starts a door, which
     * means argv[1] is the NODE NUMBER ("1"), not an argument of ours - so
     * only an argument that actually looks like an archive name (it has an
     * extension) is treated as one. Otherwise fall back to the failing case. */
    if (argc > 1 && strchr(argv[1], '.') != (char *) 0) {
        sprintf(path, "/api/door-repo/archive/%.200s", argv[1]);
    } else {
        strcpy(path, "/api/door-repo/archive/-D-CALC.LHA");
    }

    memset(&pc, 0, sizeof(pc));
    pc.file = fopen("PROGDIR:probe.bin", "wb");
    if (pc.file == (FILE *) 0) {
        pc.file = fopen("probe.bin", "wb");
    }
    if (pc.file == (FILE *) 0) {
        return 20;
    }
    md5_init(&pc.md5);
    sha256_init(&pc.sha);

    rc = http_get(&cfg, path, &resp, probe_sink, &pc);
    fclose(pc.file);

    md5_final(&pc.md5, digest);
    md5_hex(digest, md5hex);
    sha256_final(&pc.sha, shadigest);
    sha256_hex(shadigest, shahex);

    report = fopen("PROGDIR:probe.txt", "wb");
    if (report == (FILE *) 0) {
        report = fopen("probe.txt", "wb");
    }
    if (report == (FILE *) 0) {
        return 20;
    }

    fprintf(report, "path=%s\n", path);
    fprintf(report, "http_get_rc=%d\n", rc);
    fprintf(report, "status=%d\n", resp.status);
    fprintf(report, "have_content_length=%d\n", resp.have_content_length);
    fprintf(report, "content_length=%lu\n", resp.content_length);
    fprintf(report, "received=%lu\n", pc.received);
    fprintf(report, "header_md5=%s\n", resp.md5);
    fprintf(report, "header_sha256=%s\n", resp.sha256);
    fprintf(report, "computed_md5=%s\n", md5hex);
    fprintf(report, "computed_sha256=%s\n", shahex);
    fprintf(report, "sink_calls=%lu\n", pc.chunks);
    fprintf(report, "chunk_sizes=");
    for (i = 0; i < pc.chunks && i < MAX_LOGGED_CHUNKS; i++) {
        fprintf(report, "%lu%s", pc.chunk_len[i],
                (i + 1 < pc.chunks && i + 1 < MAX_LOGGED_CHUNKS) ? "," : "");
    }
    fprintf(report, "\n");
    fclose(report);

    return 0;
}

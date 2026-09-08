/*
 * ae_msgbase - the public feed, split. See ae_msgbase.h for what this is and
 * why the door does not read the message base itself.
 *
 * Everything here is bounded and on the stack. Nothing allocates. The one
 * buffer of any size is AE_MSG_REPLY_MAX + 1 bytes, which is the wire's own
 * limit, and it is reused for every round trip.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ae_msgbase.h"
#include "ae_session.h"
#include "aedoor.h"

/* One reply, plus the NUL the transport always writes. */
#define REPLY_BUF (AE_MSG_REPLY_MAX + 1)

/**
 * One round trip, with the "is this board even answering" question resolved.
 *
 * A classic AmiExpress's DEFAULT case (express.e:4221-4228) touches neither
 * msg.String nor msg.data, so the door reads back the request it wrote itself.
 * That echo IS the signal, and it is a better one than an empty reply: an
 * empty reply is what a board WITH the feed says when there is nothing more,
 * and the two need different sentences on screen.
 *
 * The theoretical false positive - a message body whose 190-byte chunk spells
 * exactly "BODY 103 2" - costs the caller a "this board does not answer the
 * message feed" line, not a wrong message.
 *
 * Returns bytes written, AE_MSG_ERR_CARRIER, or AE_MSG_ERR_NOHOST.
 */
static int ask(const char *request, char *out, int cap)
{
    int got = ae_field_exchange((int)AE_FIELD_MSGQUERY, request, out, cap);

    if (got < 0) return AE_MSG_ERR_CARRIER;
    if (out[0] != '\0' && strcmp(out, request) == 0) return AE_MSG_ERR_NOHOST;
    return got;
}

/** Copy at most `cap - 1` bytes and always terminate. */
static void copy_field(char *dst, int cap, const char *src)
{
    int i;
    for (i = 0; i < cap - 1 && src[i] != '\0'; i++) dst[i] = src[i];
    dst[i] = '\0';
}

int ae_msg_split_row(char *line, ae_msg_row *out)
{
    char *field[5];
    int found = 0;
    char *p;

    if (line == 0 || out == 0) return AE_MSG_ERR_ARGS;

    memset(out, 0, sizeof *out);

    /* Split in place, keeping the first five. A row with MORE is not an error:
     * the format is append-only and a door built today must keep working
     * against a board that grows a sixth field tomorrow. */
    field[found++] = line;
    p = line;
    while (found < 5) {
        char *bar = strchr(p, '|');
        if (bar == 0) break;
        *bar = '\0';
        p = bar + 1;
        field[found++] = p;
    }
    if (found < 5) return AE_MSG_ERR_ARGS;

    /* The fifth field ends at the next '|' if the board sent more than five,
     * so it is terminated here rather than left running into field six. */
    {
        char *bar = strchr(field[4], '|');
        if (bar != 0) *bar = '\0';
    }

    out->number = atol(field[0]);
    copy_field(out->from, AE_MSG_NAME_MAX, field[1]);
    copy_field(out->subject, AE_MSG_SUBJECT_MAX, field[2]);
    copy_field(out->date, (int)sizeof out->date, field[3]);
    out->flag = field[4][0] != '\0' ? field[4][0] : '-';
    return AE_MSG_OK;
}

int ae_msg_stat_read(ae_msg_stat *out)
{
    char reply[REPLY_BUF];
    char *field[4];
    int found = 0;
    char *p;
    int got;
    int i;

    if (out == 0) return AE_MSG_ERR_ARGS;
    memset(out, 0, sizeof *out);

    got = ask("STAT", reply, (int)sizeof reply);
    if (got < 0) return got;
    if (got == 0) return AE_MSG_ERR_NOHOST;   /* it answered, but with nothing */

    field[found++] = reply;
    p = reply;
    while (found < 4) {
        char *bar = strchr(p, '|');
        if (bar == 0) break;
        *bar = '\0';
        p = bar + 1;
        field[found++] = p;
    }
    /* Four fields or it is not a STAT answer, whatever else it may be. */
    if (found < 4) return AE_MSG_ERR_NOHOST;
    for (i = 0; i < 3; i++) {
        if (field[i][0] < '0' || field[i][0] > '9') return AE_MSG_ERR_NOHOST;
    }

    out->total = atol(field[0]);
    out->unread = atol(field[1]);
    out->pointer = atol(field[2]);
    copy_field(out->conf, (int)sizeof out->conf, field[3]);
    return AE_MSG_OK;
}

int ae_msg_list(long first, ae_msg_row *out, int cap)
{
    char request[48];
    char reply[REPLY_BUF];
    /* Sent VERBATIM on the first trip, negative included: a negative `first`
       asks the board for the last `count` rows (see xim/msgfeed.ts). After the
       first reply `next` is a real message number and the paging is ordinary. */
    long next = first;
    int filled = 0;
    int trips = 0;

    if (out == 0 || cap <= 0) return AE_MSG_ERR_ARGS;

    while (filled < cap) {
        char *p;
        int got;
        int had_complete_row;

        sprintf(request, "LIST %ld %d", next, cap - filled);
        got = ask(request, reply, (int)sizeof reply);
        if (got == AE_MSG_ERR_CARRIER) return AE_MSG_ERR_CARRIER;
        if (got == AE_MSG_ERR_NOHOST) {
            /* Only the FIRST trip decides that. A board that answered rows and
             * then echoed would be a board that changed mid-listing, which it
             * cannot; treating a later one as "no host" would throw away rows
             * the caller is already looking at. */
            return trips == 0 ? AE_MSG_ERR_NOHOST : filled;
        }
        trips++;
        if (got == 0) break;               /* the board has nothing more */

        /* Asked BEFORE the split, which overwrites every '\n' with a NUL. A
         * non-empty reply carrying no complete row would otherwise loop for
         * ever: `next` never advances, so the same request goes out again. A
         * malformed answer ends the listing; it does not hang the door. */
        had_complete_row = strchr(reply, '\n') != 0;

        p = reply;
        while (*p != '\0' && filled < cap) {
            char *end = strchr(p, '\n');
            if (end == 0) break;           /* never a partial row - the board
                                              truncates at a row boundary */
            *end = '\0';
            if (*p != '\0' && ae_msg_split_row(p, &out[filled]) == AE_MSG_OK) {
                next = out[filled].number + 1;
                filled++;
            }
            p = end + 1;
        }

        if (!had_complete_row) break;
    }

    return filled;
}

long ae_msg_body(long number, char *out, unsigned long cap)
{
    char request[48];
    char reply[REPLY_BUF];
    unsigned long written = 0;
    long chunk = 0;

    if (out == 0 || cap == 0) return AE_MSG_ERR_ARGS;
    out[0] = '\0';
    if (number <= 0) return AE_MSG_ERR_ARGS;

    for (;;) {
        int got;
        unsigned long room;
        unsigned long take;

        sprintf(request, "BODY %ld %ld", number, chunk);
        got = ask(request, reply, (int)sizeof reply);
        if (got == AE_MSG_ERR_CARRIER) return AE_MSG_ERR_CARRIER;
        if (got == AE_MSG_ERR_NOHOST) return chunk == 0 ? AE_MSG_ERR_NOHOST : (long)written;
        if (got == 0) break;               /* the whole body has arrived */

        room = cap - 1 - written;
        if (room == 0) break;              /* the caller's buffer is full */
        take = (unsigned long)got;
        if (take > room) take = room;

        memcpy(out + written, reply, (size_t)take);
        written += take;
        out[written] = '\0';

        chunk++;
        /* A body longer than any caller will read, and a stop that cannot be
         * argued with if a board ever answers the same chunk for ever. */
        if (chunk > 512) break;
    }

    return (long)written;
}

/*
 * ae_msgbase - the current conference's PUBLIC message feed, for a C door.
 *
 * WHAT THIS IS NOT: a message-base parser. A 68K door could open
 * `<conf>/MsgBase/HeaderFile` and walk its 110-byte records - Doors/Conftop
 * and Doors/Request both do - and for a COUNT that is fine. For a discussion
 * reader it is wrong twice over:
 *
 *   1. This board's HeaderFiles hold TWO record layouts interleaved, and
 *      telling them apart needs a whole-file sequence pass
 *      (web/backend/src/services/msgheader-layout.ts). Conftop reading a
 *      message number at the wrong offset is a wrong statistic; a reader doing
 *      it puts the wrong person's name on somebody's post.
 *   2. A door reading the disk sees every message regardless of the caller's
 *      READ_PRIV_EALL / READ_PRIV_ALL. Making the door apply the caller's ACS
 *      would put the read filter in C on the wrong side of the trust boundary.
 *
 * So the BOARD decodes and filters, and the DOOR renders. One XIM command
 * (AEW_MSGQUERY, 10200) answers in plain '|'-separated Latin-1 text; this
 * module is the splitter. The 110-byte record is parsed in exactly one place
 * on this board and it is not here.
 *
 * A CLASSIC AmiExpress answers nothing to command 10200, which is not an
 * error - it is a board without this feature. That is AE_MSG_ERR_NOHOST, and
 * a door must say so rather than showing an empty list, which reads as
 * "nobody has posted here".
 *
 * Every round trip goes through ae_field_exchange (aedoor.h). There is no
 * "#ifdef AMIGA" here: the transport file the Makefile picks IS the platform
 * mechanism, same as every other module in this SDK.
 *
 * Nothing allocates. Every buffer is the caller's or is on this module's
 * stack, bounded, and refuses to overflow.
 *
 * C89. ASCII only.
 */

#ifndef AE_MSGBASE_H
#define AE_MSGBASE_H

#ifdef __cplusplus
extern "C" {
#endif

#define AE_MSG_OK            0
#define AE_MSG_ERR_ARGS     -1
#define AE_MSG_ERR_CARRIER  -2
#define AE_MSG_ERR_NOHOST   -3   /* a classic board: it answered nothing */

#define AE_MSG_SUBJECT_MAX 32
#define AE_MSG_NAME_MAX    32

/*
 * The board's reply cap, and it is not a preference: it must equal
 * MSGQUERY_REPLY_MAX in web/backend/src/amiga-emulation/xim/msgfeed.ts.
 * The XIM string holds 198 usable bytes (FieldLengths.GENERIC_STRING); 190
 * leaves headroom for the terminator and for the backend's "bbs:" guard byte.
 * A door that paged on a different number would ask for chunks the board
 * never sends and would lose the tail of every body.
 */
#define AE_MSG_REPLY_MAX 190

/** One row of the feed. Message numbers ascend and are never renumbered. */
typedef struct {
    long number;
    char from[AE_MSG_NAME_MAX];
    char subject[AE_MSG_SUBJECT_MAX];
    char date[10];                      /* ddmmmyy, as the board rendered it */
    char flag;                          /* 'N' new, '*' censored, '-' ordinary */
} ae_msg_row;

/** What the conference looks like to THIS caller. */
typedef struct {
    long total;        /* public messages here that this caller may read */
    long unread;       /* new for this caller, against his scan pointer */
    long pointer;      /* his last-new-read; the door never writes it */
    char conf[32];
} ae_msg_stat;

/**
 * Read the conference's headline numbers.
 *
 * Returns AE_MSG_OK, or a negative AE_MSG_ERR_*. On AE_MSG_ERR_NOHOST the
 * board has no such command - a classic AmiExpress - and `out` is zeroed.
 */
int ae_msg_stat_read(ae_msg_stat *out);

/**
 * Fill up to `cap` rows starting at message number `first`, ascending.
 *
 * `first` == 0 starts at the beginning. `first` < 0 starts `cap` rows back
 * from the END - the newest window, still delivered in plain ascending number
 * order, which is what a discussion door opens on. That is an ARGUMENT and not
 * a fourth verb, and it exists because message numbers are sparse: a door
 * cannot work out "the hundredth from the end" from a total and a highest
 * number, so without it a long conference would open on its oldest messages.
 *
 * Returns the number of rows filled - 0 is a legitimate answer and means the
 * conference has nothing more, NOT an error - or a negative AE_MSG_ERR_*.
 *
 * Pages internally: one XIM round trip per AE_MSG_REPLY_MAX bytes, which is
 * what the protocol costs. Every trip is ~45ms of emulation, so a door asks
 * for the window it is about to DRAW, not for two hundred rows it will not
 * show.
 */
int ae_msg_list(long first, ae_msg_row *out, int cap);

/**
 * Append one message's body into `out`, NUL-terminated.
 *
 * Returns the number of bytes written (0 for a message the caller may not
 * read, or one with an empty body), or a negative AE_MSG_ERR_*.
 */
long ae_msg_body(long number, char *out, unsigned long cap);

/**
 * Split one already-received row in place. Exposed because it is the part
 * worth testing on its own, and because a door that has its own paging can
 * reuse it.
 *
 * `line` is modified: the '|' separators become NULs. Returns AE_MSG_OK when
 * the row had at least the five fields v1 defines, AE_MSG_ERR_ARGS otherwise.
 * A row with MORE than five fields still parses - the format is append-only
 * and a door must never reject a row for carrying a field it does not know.
 */
int ae_msg_split_row(char *line, ae_msg_row *out);

#ifdef __cplusplus
}
#endif

#endif /* AE_MSGBASE_H */

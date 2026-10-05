/*
 * ae_msgbase - the current conference's messages, read off the disk.
 *
 * THIS REPLACES AN EARLIER MODULE THAT ASKED THE BOARD. That one sent
 * AEW_MSGQUERY (10200) and rendered what came back, on the reasoning that the
 * board should decode and the door should draw. The reasoning was sound and
 * the conclusion is not available: AEW_MSGQUERY is this port's own invention,
 * and a real Amiga AmiExpress answers no command that lists or reads a
 * message. A door that wants messages opens <conf>/MsgBase/HeaderFile itself.
 * Doors/Conftop and Doors/Request have always done exactly that.
 *
 * So this module reads files, through ae_dos. The two objections the old
 * header raised are still real, and are answered here rather than avoided:
 *
 *   1. TWO RECORD LAYOUTS, INTERLEAVED IN ONE FILE. This board's HeaderFiles
 *      hold records AmiExpress wrote next to records this port wrote, and
 *      telling them apart cannot be done record by record: a port record has
 *      a plausible message number at BOTH offsets. It needs the file's
 *      sequence - message numbers run in order, so the reading that continues
 *      the run is the right one, and `1, 2, 3` beats `321, 578, 835`. That
 *      pass is ported here from web/backend/src/services/msgheader-layout.ts,
 *      which is where it was worked out, and it streams: one record in hand
 *      and the previous number, so nothing allocates.
 *
 *   2. THE CALLER'S ACCESS. The STATUS BYTE decides public from private
 *      (express.e:8929-8933), and a private message is shown to its sender,
 *      its recipient, a caller with ACS_SYSOP_READ, and - for mail to EALL
 *      or ALL - a caller with ACS_READ_PRIV_EALL / ACS_READ_PRIV_ALL
 *      (readit, express.e:12343-12355). The door asks the board for those
 *      three with DT_QUERYBIT (ae_check_security), which a real AmiExpress
 *      answers too, and passes the answers to ae_msg_open.
 *
 * IT ALSO WRITES, but only where the board will not: ae_msg_write appends a
 * message itself, under express.e's own MailLock, for a board that does not
 * answer AEW_POSTMSG - a real AmiExpress. On this port a door posts through
 * the board (ae_post_message, ae_session.h) so the post gets everything the
 * board's saveNewMSG does.
 *
 * Nothing allocates. Every buffer is the caller's or is this module's own,
 * bounded, and refuses to overflow.
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
#define AE_MSG_ERR_NOBASE   -2   /* no HeaderFile there, or it cannot be read */
#define AE_MSG_ERR_LOCKED   -3   /* another node holds MailLock */
#define AE_MSG_ERR_MIXED    -4   /* the base holds records this writer will not append to */
#define AE_MSG_ERR_IO       -5   /* the write itself failed */

#define AE_MSG_NAME_MAX    32
#define AE_MSG_SUBJECT_MAX 32
#define AE_MSG_PATH_MAX   256

/** The 110-byte on-disk record, AmiExpress layout. Named because the size is
 *  arithmetic every caller would otherwise repeat. */
#define AE_MSG_RECORD_SIZE 110

/* What a caller may see of other people's private mail - the `access` bits
 * for ae_msg_open. Each is one of the board's ACS answers. */
#define AE_MSG_SEE_ALL_PRIVATE 1   /* ACS_SYSOP_READ */
#define AE_MSG_SEE_PRIV_EALL   2   /* ACS_READ_PRIV_EALL */
#define AE_MSG_SEE_PRIV_ALL    4   /* ACS_READ_PRIV_ALL */

/* The status byte, which is what decides public from private - never the
 * recipient's name. express.e:10790-10794, 10868, 11930. */
#define AE_MSG_PUBLIC    'P'
#define AE_MSG_CENSORED  'p'
#define AE_MSG_PRIVATE   'R'
#define AE_MSG_DELETED   'D'

/** One message's header. Dates are the board's own LONGs; the door formats. */
typedef struct {
    long number;
    char to[AE_MSG_NAME_MAX];
    char from[AE_MSG_NAME_MAX];
    char subject[AE_MSG_SUBJECT_MAX];
    long date;
    long recv;                          /* 0 = the recipient has not read it */
    char status;                        /* 'P' 'p' 'R' 'D', as on disk */
    char flag;                          /* 'N' new, '*' censored, '-' plain */
} ae_msg_row;

/** What the base looks like to THIS caller. */
typedef struct {
    long total;        /* messages here this caller may read */
    long unread;       /* of those, new since his scan pointer */
    long pointer;      /* the scan pointer he arrived with */
    long lowest;       /* lowest message number present */
    long high;         /* what MailStats calls highMsgNum: the NEXT number */
    long unreadable;   /* records with no usable number at either offset */
} ae_msg_stat;

/**
 * Render a message's date as `08Sep26`, NUL-terminated. `out` needs 8 bytes.
 *
 * msgDate and recv hold express.e's getSystemTime() (MiscFuncs.e:463-469):
 * the Amiga's LOCAL wall clock, counted in seconds from 1970 as if it were
 * UTC, plus 21600. Taking the 21600 back off, as express.e's own
 * dateTimeToDateStamp does (MiscFuncs.e:256-263), leaves the wall clock, so
 * the day comes out as the board shows it at the `R` prompt - no timezone
 * needed, because the value never had one.
 */
void ae_msg_date_string(long stored, char *out, int cap);

/**
 * Who a message is to, as the reader sees it.
 *
 * `EALL` is not a person: it is "every caller", and express.e shows it as the
 * READER's own name followed by ` (ALL)` (express.e:8902-8912). Anything else
 * is the stored name, unchanged. Printing the raw field showed Conftop's
 * results as "To eall" (SUBS, 2026-09-28).
 */
void ae_msg_to_label(const char *to, const char *reader, char *out, int cap);

/**
 * Point the module at a message base and say who is reading it.
 *
 * `dir` is what the board answered to ae_msgbase_path() - e.g.
 * "BBS:Conf3/MsgBase/". A trailing slash is optional.
 *
 * `caller` is the name to match against `to` and `from` when deciding whether
 * a private message is this caller's business. It must be the CONFERENCE mail
 * name, which is not always the login name: a conference may be configured to
 * use the caller's real name or internet name instead (express.e's
 * confMailName). Case is ignored, as it is on the board.
 *
 * `access` is AE_MSG_SEE_* bits: which of other people's private mail this
 * caller may read, as the BOARD answered for him (ae_check_security). A door
 * that guessed would either leak mail or hide the sysop's own.
 *
 * `scan_pointer` is the caller's scan pointer, from ae_last_scanned() - the
 * board's lastNewReadConf, which is the NEXT number to scan. That message and
 * everything above it count as new. Pass -1 when the board would not say, and
 * nothing is reported as new rather than everything.
 *
 * Returns AE_MSG_OK, or AE_MSG_ERR_NOBASE when there is no readable
 * HeaderFile there - which is a real answer for a brand-new conference and
 * must be told apart from "no messages you may read".
 */
int ae_msg_open(const char *dir, const char *caller, int access, long scan_pointer);

/**
 * The base's headline numbers for this caller. One pass over HeaderFile.
 *
 * `total` and `unread` count only what this caller may read, because a
 * conference that says "142 messages" and then lists 3 has told him nothing
 * useful. `unreadable` is records the sequence pass could not resolve; a door
 * should say so plainly rather than quietly showing fewer messages than the
 * board would.
 */
int ae_msg_stat_read(ae_msg_stat *out);

/**
 * Fill up to `cap` rows, ascending by message number, skipping anything this
 * caller may not read.
 *
 * `first` > 0 starts at that message number. `first` == 0 starts at the
 * beginning. `first` < 0 returns the LAST `cap` readable messages - the
 * newest window, still in ascending order, which is what a discussion door
 * opens on. That is an argument rather than a second function because message
 * numbers are sparse: a door cannot compute "the hundredth from the end" from
 * a total and a highest number.
 *
 * Returns the number of rows filled - 0 is a legitimate answer meaning there
 * is nothing more - or a negative AE_MSG_ERR_*.
 */
int ae_msg_list(long first, ae_msg_row *out, int cap);

/**
 * Read one message's header by number, without its body.
 *
 * Returns AE_MSG_OK, or AE_MSG_ERR_ARGS when there is no such message or the
 * caller may not read it. Those two are deliberately the same answer: a door
 * that distinguished them would tell a caller that a message he cannot see
 * exists, which is how a message base leaks who is talking to whom.
 */
int ae_msg_header(long number, ae_msg_row *out);

/**
 * Read a message's body into `out`, NUL-terminated.
 *
 * The body is a file of its own named after the message number, holding text
 * and nothing else - no header, no subject, LF-terminated lines. A message
 * whose body file is missing is not an error: express.e's own scan skips
 * those, and they occur on real boards.
 *
 * The text comes back in Latin-1, which is what this door's screen speaks:
 * a body that is valid UTF-8 (the board writes UTF-8) is converted, anything
 * else is already Latin-1 (an Amiga wrote it) - the board's own
 * decodeMessageBody rule. See ae_msg_utf8_to_latin1.
 *
 * Returns the number of bytes written - 0 for an empty or missing body, or
 * for a message the caller may not read - or a negative AE_MSG_ERR_*.
 */
long ae_msg_body(long number, char *out, unsigned long cap);

/**
 * Convert `text` (len bytes, NUL-terminated in place) from UTF-8 to Latin-1
 * when it is valid UTF-8 with something above ASCII in it; otherwise leave it
 * alone. A character Latin-1 cannot hold becomes '?'. Returns the new length.
 */
long ae_msg_utf8_to_latin1(char *text, long len);

/**
 * Whether this caller may read this message. Exposed because it is the rule
 * worth testing on its own, and because a door showing its own listing needs
 * to ask the same question this module asks.
 */
int ae_msg_may_read(const ae_msg_row *row);

/** A message about to be written. Every string may be NULL, meaning empty. */
typedef struct {
    const char *to;
    const char *from;
    const char *subject;
    /** AE_MSG_PUBLIC or AE_MSG_PRIVATE; anything else is refused. */
    int status;
    /** The header's msgDate: express.e's getSystemTime() form, which is what
        ae_now() answers (DT_CURR_TIME). */
    long date;
} ae_msg_new;

/**
 * Append one message to the open base.
 *
 * Returns the number it was given (>= 1), or a negative AE_MSG_ERR_*.
 *
 * `body` is the message text, lines separated by LF. It is written verbatim
 * with a trailing LF added if missing - express.e:10700-10703 stores body
 * lines and nothing else, no header metadata, which lives only in HeaderFile.
 *
 * THE ORDER IS express.e's, via the port's own writer
 * (web/backend/src/utils/message-file.util.ts:157), because that one is
 * already correct: lock, take highMsgNum as the new number, write the body,
 * append the header, bump highMsgNum, unlock. Assigning the number before the
 * lock is how two nodes post the same one and one body file wins.
 *
 * REFUSES (AE_MSG_ERR_MIXED) when the HeaderFile holds any record this reader
 * cannot settle as AmiExpress layout. Appending an AmiExpress record to a file
 * the board reads with a different classifier is how mail becomes unreadable,
 * and a refusal the caller can explain beats a base nobody can open.
 *
 * THE LOCK IS express.e's: an exclusive Lock() on MailLock (ae_dos_lock),
 * not a stamp written into it. It is not retried here - AE_MSG_ERR_LOCKED
 * comes straight back so the door can wait with its own clock; this module
 * does disk, not time. express.e's own caller prints "Another task has the
 * MsgBase locked!" (express.e:10744) when lockMsgBase gives up.
 *
 * FOR A BOARD THAT WILL NOT POST FOR THE DOOR. Where the board answers
 * AEW_POSTMSG (ae_post_message), use that: this writer skips everything
 * saveNewMSG does besides the files.
 */
long ae_msg_write(const ae_msg_new *msg, const char *body, unsigned long body_len);

/** Release a MailLock this node took. Safe to call when it holds none. */
void ae_msg_unlock(void);

#ifdef __cplusplus
}
#endif

#endif /* AE_MSGBASE_H */

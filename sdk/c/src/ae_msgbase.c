/* ae_msgbase.c - reading a conference's messages off the disk.
 *
 * See ae_msgbase.h for why this reads files rather than asking the board.
 * This file is the two hard parts: telling the two record layouts apart, and
 * deciding what the caller may see.
 *
 * C89. ASCII only.
 */

#include <string.h>

#include "ae_msgbase.h"
#include "ae_dos.h"

/* ---- the two layouts ---------------------------------------------------
 *
 * Ported from web/backend/src/services/msgheader-layout.ts, which is where
 * this was worked out against 560 live records and two earlier wrong
 * attempts. Field offsets:
 *
 *   AmiExpress  status(0) pad(1) msgNumb(2) toName(6) fromName(37)
 *               subject(68) pad(99) msgDate(100) recv(104) extMsgNum(108)
 *   this port   status(0) msgNumb(1) toName(5) fromName(36)
 *               subject(67) msgDate(98) recv(102) extMsgNum(106) pad(108,109)
 *
 * The two do NOT differ by a constant offset - one pad moves in before
 * msgNumb and another before msgDate - so nothing here may shift bytes; every
 * field is taken from its own offset.
 */

#define AMIGA_NUM   2
#define AMIGA_TO    6
#define AMIGA_FROM  37
#define AMIGA_SUBJ  68
#define AMIGA_DATE  100
#define AMIGA_RECV  104

#define PORT_NUM    1
#define PORT_TO     5
#define PORT_FROM   36
#define PORT_SUBJ   67
#define PORT_DATE   98
#define PORT_RECV   102

#define NAME_WIDTH  31

#define LAYOUT_AMIGA   0
#define LAYOUT_PORT    1
#define LAYOUT_UNKNOWN 2

/* ---- module state ------------------------------------------------------
 *
 * A door reads one message base at a time, so this is a module, not a handle.
 * Nothing here allocates; the paths are fixed buffers and the header walk
 * carries one record.
 */
static char base_dir[AE_MSG_PATH_MAX];
static char caller_name[AE_MSG_NAME_MAX];
static int  caller_is_sysop;
static long caller_pointer;
static int  base_open;

/* ---- small helpers ----------------------------------------------------- */

static int same_name(const char *a, const char *b)
{
    /* Case-insensitive, as every name comparison on the board is: express.e
     * matches confMailName without regard to case, and a caller who signs on
     * as "Spot" must still see mail addressed to "spot". Written out rather
     * than using strcasecmp, which is not C89 and is not in vbcc's library. */
    int i = 0;
    if (a == 0 || b == 0) return 0;
    for (;;) {
        char x = a[i];
        char y = b[i];
        if (x >= 'A' && x <= 'Z') x = (char)(x - 'A' + 'a');
        if (y >= 'A' && y <= 'Z') y = (char)(y - 'A' + 'a');
        if (x != y) return 0;
        if (x == '\0') return 1;
        i++;
    }
}

static void copy_field(char *out, int cap, const unsigned char *record, int at)
{
    /* Only up to the NUL. The bytes after a name's terminator are UNDEFINED -
     * on a real board they are leftovers, and a real toName there reads
     * "eall\0\xf9\xfc\x0e". Copying the whole field would put that junk on
     * screen. */
    int i = 0;
    int limit = (cap - 1 < NAME_WIDTH) ? cap - 1 : NAME_WIDTH;

    while (i < limit && record[at + i] != '\0') {
        out[i] = (char)record[at + i];
        i++;
    }
    out[i] = '\0';
}

/**
 * A message number AmiExpress could have written.
 *
 * express.e numbers from 1, so a zero is not a message number - it is what
 * reading a LONG from the wrong offset gives you. This is the signal that
 * actually separates the layouts.
 */
static int plausible_number(long n)
{
    return n >= 1 && n <= 10000000L;
}

/**
 * A name field that STARTS where this layout says it does.
 *
 * Non-empty, and printable up to the NUL. The padding proves nothing - see
 * copy_field - so only the part before the terminator is tested. An earlier
 * version of the port's classifier tested a byte INSIDE the padding and
 * called 480 perfectly ordinary records unidentifiable.
 */
static int name_at(const unsigned char *record, int at)
{
    int i = 0;
    while (i < NAME_WIDTH && record[at + i] != '\0') {
        unsigned char c = record[at + i];
        if (c < 0x20 || c > 0xFE) return 0;
        i++;
    }
    return i > 0;
}

/**
 * One record's layout, with no knowledge of the file around it.
 *
 * Deliberately answers UNKNOWN rather than guessing: a record this port wrote
 * has a plausible number at BOTH offsets - its real one at 1, and at 2 the
 * same number shifted a byte with the first letter of toName carried into it.
 * The pads are NOT part of the test; Amiga E does not clear structure
 * padding, and requiring them clear called a whole live conference
 * unidentifiable.
 */
static int classify_record(const unsigned char *record)
{
    int amiga_shaped =
        plausible_number(ae_dos_get_long(record + AMIGA_NUM))
        && name_at(record, AMIGA_TO)
        && name_at(record, AMIGA_FROM);

    int port_shaped =
        plausible_number(ae_dos_get_long(record + PORT_NUM))
        && name_at(record, PORT_TO)
        && name_at(record, PORT_FROM);

    if (amiga_shaped && !port_shaped) return LAYOUT_AMIGA;
    if (port_shaped && !amiga_shaped) return LAYOUT_PORT;
    return LAYOUT_UNKNOWN;
}

/**
 * Settle an undecidable record using the run of numbers before it.
 *
 * Message numbers ascend, so the reading that continues the run is the right
 * one: after 2, a record reading `3` at one offset and `835` at the other is
 * not ambiguous at all. `previous` is the last number this walk resolved.
 *
 * When the sequence cannot separate them either, the answer stays UNKNOWN and
 * the caller falls back to the AmiExpress layout - which is what the port's
 * own reader does, and what express.e itself wrote for every message before
 * this port existed. Falling back costs a wrong number on screen in a case
 * that has never been observed on this board; refusing to show the message
 * would hide mail the board displays.
 */
static int settle_with_sequence(const unsigned char *record, int layout, long previous)
{
    long amiga_num;
    long port_num;
    long amiga_distance;
    long port_distance;
    long want;

    if (layout != LAYOUT_UNKNOWN) return layout;

    want = previous + 1;
    amiga_num = ae_dos_get_long(record + AMIGA_NUM);
    port_num  = ae_dos_get_long(record + PORT_NUM);

    if (amiga_num < 1 && port_num < 1) return LAYOUT_UNKNOWN;
    if (amiga_num < 1) return LAYOUT_PORT;
    if (port_num < 1) return LAYOUT_AMIGA;

    amiga_distance = amiga_num - want; if (amiga_distance < 0) amiga_distance = -amiga_distance;
    port_distance  = port_num - want;  if (port_distance < 0)  port_distance = -port_distance;

    if (amiga_distance == port_distance) return LAYOUT_UNKNOWN;
    return (amiga_distance < port_distance) ? LAYOUT_AMIGA : LAYOUT_PORT;
}

/** Pull a record into a row, in whichever layout it turned out to be. */
static void record_to_row(const unsigned char *record, int layout, ae_msg_row *out)
{
    int num_at  = (layout == LAYOUT_PORT) ? PORT_NUM  : AMIGA_NUM;
    int to_at   = (layout == LAYOUT_PORT) ? PORT_TO   : AMIGA_TO;
    int from_at = (layout == LAYOUT_PORT) ? PORT_FROM : AMIGA_FROM;
    int subj_at = (layout == LAYOUT_PORT) ? PORT_SUBJ : AMIGA_SUBJ;
    int date_at = (layout == LAYOUT_PORT) ? PORT_DATE : AMIGA_DATE;
    int recv_at = (layout == LAYOUT_PORT) ? PORT_RECV : AMIGA_RECV;

    out->number = ae_dos_get_long(record + num_at);
    copy_field(out->to,      AE_MSG_NAME_MAX,    record, to_at);
    copy_field(out->from,    AE_MSG_NAME_MAX,    record, from_at);
    copy_field(out->subject, AE_MSG_SUBJECT_MAX, record, subj_at);
    out->date = ae_dos_get_long(record + date_at);
    out->recv = ae_dos_get_long(record + recv_at);
    out->status = (char)record[0];

    /* 'N' beats '*' beats '-': a new censored message is reported new, since
     * that is the fact the caller is looking for in a list. */
    if (caller_pointer >= 0 && out->number > caller_pointer) out->flag = 'N';
    else if (out->status == AE_MSG_CENSORED) out->flag = '*';
    else out->flag = '-';
}

int ae_msg_may_read(const ae_msg_row *row)
{
    if (row == 0) return 0;

    /* Deleted is deleted, for everybody including the sysop: express.e's own
     * reader refuses it before any access question (express.e:8890). */
    if (row->status == AE_MSG_DELETED) return 0;

    /* Public is public. EALL and ALL are both public and are not special
     * here - EALL's access gate is on POSTING, at the board's compose prompt,
     * not on reading. */
    if (row->status == AE_MSG_PUBLIC || row->status == AE_MSG_CENSORED) return 1;

    /* Private: sender, recipient, or a sysop (express.e:12343-12355). */
    if (caller_is_sysop) return 1;
    if (same_name(row->to, caller_name)) return 1;
    if (same_name(row->from, caller_name)) return 1;
    return 0;
}

/* ---- paths ------------------------------------------------------------- */

/**
 * Join the base directory and a file name into `out`.
 *
 * An Amiga path may end with '/' OR ':' - "BBS:" is a whole volume - and a
 * separator must be added after neither. Getting this wrong produces
 * "BBS:Conf3/MsgBase//HeaderFile", which AmigaDOS reads as a parent directory
 * reference and not as the file that was meant.
 */
static int join_path(char *out, int cap, const char *name)
{
    int len = (int)strlen(base_dir);
    int need = len + (int)strlen(name) + 2;

    if (need > cap) return 0;

    memcpy(out, base_dir, (size_t)len);
    if (len > 0 && base_dir[len - 1] != '/' && base_dir[len - 1] != ':') {
        out[len++] = '/';
    }
    strcpy(out + len, name);
    return 1;
}

/* ---- dates -------------------------------------------------------------
 *
 * Civil date from a unix timestamp, without time.h. vbcc has localtime(), and
 * calling it would be wrong here rather than merely heavy: an Amiga's system
 * clock is already set to local time, so converting a unix stamp with a local
 * timezone shifts it twice. This does the arithmetic in UTC, which is at
 * worst a few hours from what the board shows and is never silently doubled.
 *
 * The algorithm is the standard days-to-civil one: shift the epoch to
 * 0000-03-01 so that February - the month with the leap day - falls at the end
 * of the year and the leap rule stops needing a special case in the middle.
 */
void ae_msg_date_string(long unix_seconds, char *out, int cap)
{
    static const char *MONTHS[12] = {
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    };
    long days;
    long era;
    long doe;      /* day of era */
    long yoe;      /* year of era */
    long y;
    long doy;      /* day of year, counting from March */
    long mp;       /* month, 0 = March */
    long d;
    long m;
    int i = 0;

    if (out == 0 || cap < 8) { if (out && cap > 0) out[0] = '\0'; return; }
    if (unix_seconds <= 0) { out[0] = '\0'; return; }

    days = unix_seconds / 86400L;
    days += 719468L;                        /* 1970-01-01 -> 0000-03-01 */

    era = (days >= 0 ? days : days - 146096L) / 146097L;
    doe = days - era * 146097L;
    yoe = (doe - doe / 1460L + doe / 36524L - doe / 146096L) / 365L;
    y   = yoe + era * 400L;
    doy = doe - (365L * yoe + yoe / 4L - yoe / 100L);
    mp  = (5L * doy + 2L) / 153L;
    d   = doy - (153L * mp + 2L) / 5L + 1L;
    m   = mp + (mp < 10L ? 3L : -9L);
    if (m <= 2L) y += 1L;

    out[i++] = (char)('0' + (int)((d / 10L) % 10L));
    out[i++] = (char)('0' + (int)(d % 10L));
    out[i++] = MONTHS[m - 1][0];
    out[i++] = MONTHS[m - 1][1];
    out[i++] = MONTHS[m - 1][2];
    out[i++] = (char)('0' + (int)((y / 10L) % 10L));
    out[i++] = (char)('0' + (int)(y % 10L));
    out[i] = '\0';
}

/** A message number as the decimal file name its body lives under. */
static void number_to_name(char *out, long number)
{
    char digits[16];
    int n = 0;
    int i = 0;

    if (number <= 0) { out[0] = '0'; out[1] = '\0'; return; }
    while (number > 0 && n < (int)sizeof(digits)) {
        digits[n++] = (char)('0' + (int)(number % 10));
        number /= 10;
    }
    while (n > 0) out[i++] = digits[--n];
    out[i] = '\0';
}

/* ---- the header walk ---------------------------------------------------
 *
 * Every public function is one forward pass over HeaderFile, carrying a
 * single 110-byte record and the previous resolved number. There is no index
 * and no cache: a conference of a few hundred records is a few tens of KB,
 * and the alternative is either an allocation or a stale view of a file other
 * nodes are appending to while the door reads it.
 */

typedef int (*row_fn)(const ae_msg_row *row, void *context);

static int walk(row_fn visit, void *context, long *unreadable_out)
{
    unsigned char record[AE_MSG_RECORD_SIZE];
    char path[AE_MSG_PATH_MAX];
    ae_file *f;
    long previous = 0;
    long unreadable = 0;
    int rc;

    if (unreadable_out) *unreadable_out = 0;
    if (!base_open) return AE_MSG_ERR_NOBASE;
    if (!join_path(path, (int)sizeof(path), "HeaderFile")) return AE_MSG_ERR_NOBASE;

    f = ae_dos_open(path, AE_DOS_READ);
    if (f == 0) return AE_MSG_ERR_NOBASE;

    for (;;) {
        ae_msg_row row;
        int layout;

        rc = ae_dos_read_full(f, record, AE_MSG_RECORD_SIZE);
        if (rc == 0) break;          /* a clean end of file */
        if (rc < 0) break;           /* truncated tail: stop, keep what we have */

        layout = settle_with_sequence(record, classify_record(record), previous);
        if (layout == LAYOUT_UNKNOWN) {
            /* Fall back to AmiExpress, as the board's own reader does - but
             * only when there is a usable number there. A record with no
             * number at either offset is not a record. */
            if (!plausible_number(ae_dos_get_long(record + AMIGA_NUM))) {
                unreadable++;
                continue;
            }
            layout = LAYOUT_AMIGA;
        }

        record_to_row(record, layout, &row);
        if (row.number >= 1) previous = row.number;

        if (visit && visit(&row, context) == 0) break;   /* the visitor is full */
    }

    ae_dos_close(f);
    if (unreadable_out) *unreadable_out = unreadable;
    return AE_MSG_OK;
}

/* ---- the public calls -------------------------------------------------- */

int ae_msg_open(const char *dir, const char *caller, int sysop, long scan_pointer)
{
    char path[AE_MSG_PATH_MAX];
    ae_file *f;

    base_open = 0;
    base_dir[0] = '\0';
    caller_name[0] = '\0';
    caller_is_sysop = 0;
    caller_pointer = -1;

    if (dir == 0 || dir[0] == '\0') return AE_MSG_ERR_ARGS;
    if (strlen(dir) + 1 > sizeof(base_dir)) return AE_MSG_ERR_ARGS;

    strcpy(base_dir, dir);
    if (caller && caller[0] != '\0') {
        strncpy(caller_name, caller, sizeof(caller_name) - 1);
        caller_name[sizeof(caller_name) - 1] = '\0';
    }
    caller_is_sysop = sysop ? 1 : 0;
    caller_pointer = scan_pointer;

    /* Prove the base is there NOW rather than at the first listing, so a door
     * can say "this conference has no messages yet" on the screen it is
     * already drawing instead of half way through one. */
    if (!join_path(path, (int)sizeof(path), "HeaderFile")) return AE_MSG_ERR_ARGS;
    f = ae_dos_open(path, AE_DOS_READ);
    if (f == 0) { base_dir[0] = '\0'; return AE_MSG_ERR_NOBASE; }
    ae_dos_close(f);

    base_open = 1;
    return AE_MSG_OK;
}

typedef struct {
    long total;
    long unread;
    long lowest;
    long highest;
} stat_walk;

static int stat_visit(const ae_msg_row *row, void *context)
{
    stat_walk *s = (stat_walk *)context;

    if (!ae_msg_may_read(row)) return 1;

    s->total++;
    if (row->flag == 'N') s->unread++;
    if (s->lowest == 0 || row->number < s->lowest) s->lowest = row->number;
    if (row->number > s->highest) s->highest = row->number;
    return 1;
}

int ae_msg_stat_read(ae_msg_stat *out)
{
    stat_walk s;
    unsigned char stats[18];
    char path[AE_MSG_PATH_MAX];
    ae_file *f;
    long unreadable = 0;
    int rc;

    if (out == 0) return AE_MSG_ERR_ARGS;
    memset(out, 0, sizeof(*out));
    memset(&s, 0, sizeof(s));

    rc = walk(stat_visit, &s, &unreadable);
    if (rc != AE_MSG_OK) return rc;

    out->total = s.total;
    out->unread = s.unread;
    out->pointer = caller_pointer;
    out->lowest = s.lowest;
    out->unreadable = unreadable;
    out->high = s.highest + 1;   /* the NEXT number, which is the convention */

    /* MailStats, when it is there, is the board's own answer and wins for
     * `high` - it is what express.e hands the next message. It is only 18
     * bytes and a base can be missing it entirely (a fresh conference), in
     * which case the walk's own count above stands. */
    if (join_path(path, (int)sizeof(path), "MailStats")) {
        f = ae_dos_open(path, AE_DOS_READ);
        if (f != 0) {
            if (ae_dos_read_full(f, stats, 18) == 1) {
                long high = ae_dos_get_long(stats + 4);
                if (high >= 1) out->high = high;
            }
            ae_dos_close(f);
        }
    }

    return AE_MSG_OK;
}

typedef struct {
    long first;
    ae_msg_row *out;
    int cap;
    int filled;
    /* For the tail window: how many readable rows there are in total, worked
     * out by a first pass, so the second can start counting down to the last
     * `cap` of them. */
    long skip;
    long seen;
} list_walk;

static int count_visit(const ae_msg_row *row, void *context)
{
    list_walk *l = (list_walk *)context;
    if (ae_msg_may_read(row)) l->seen++;
    return 1;
}

static int list_visit(const ae_msg_row *row, void *context)
{
    list_walk *l = (list_walk *)context;

    if (!ae_msg_may_read(row)) return 1;
    if (l->skip > 0) { l->skip--; return 1; }
    if (l->first > 0 && row->number < l->first) return 1;

    l->out[l->filled] = *row;
    l->filled++;
    return (l->filled < l->cap) ? 1 : 0;   /* 0 stops the walk */
}

int ae_msg_list(long first, ae_msg_row *out, int cap)
{
    list_walk l;
    int rc;

    if (out == 0 || cap <= 0) return AE_MSG_ERR_ARGS;

    memset(&l, 0, sizeof(l));
    l.first = first;
    l.out = out;
    l.cap = cap;

    if (first < 0) {
        /* The tail window needs to know how many readable rows exist before
         * it can say which is the (total - cap)th. Two passes over a few tens
         * of KB, and no allocation - the alternative is holding every row. */
        rc = walk(count_visit, &l, 0);
        if (rc != AE_MSG_OK) return rc;
        l.skip = l.seen - (long)cap;
        if (l.skip < 0) l.skip = 0;
        l.first = 0;
    }

    rc = walk(list_visit, &l, 0);
    if (rc != AE_MSG_OK) return rc;
    return l.filled;
}

typedef struct {
    long want;
    ae_msg_row *out;
    int found;
} find_walk;

static int find_visit(const ae_msg_row *row, void *context)
{
    find_walk *fw = (find_walk *)context;

    if (row->number != fw->want) return 1;
    if (!ae_msg_may_read(row)) return 0;    /* found, but not for this caller */

    *fw->out = *row;
    fw->found = 1;
    return 0;
}

int ae_msg_header(long number, ae_msg_row *out)
{
    find_walk fw;
    int rc;

    if (out == 0 || number < 1) return AE_MSG_ERR_ARGS;

    fw.want = number;
    fw.out = out;
    fw.found = 0;

    rc = walk(find_visit, &fw, 0);
    if (rc != AE_MSG_OK) return rc;

    /* "No such message" and "not yours" are the same answer on purpose: a
     * door that told them apart would confirm that a message exists to
     * somebody who may not see it. */
    return fw.found ? AE_MSG_OK : AE_MSG_ERR_ARGS;
}

long ae_msg_body(long number, char *out, unsigned long cap)
{
    ae_msg_row row;
    char name[16];
    char path[AE_MSG_PATH_MAX];
    ae_file *f;
    long got;

    if (out == 0 || cap == 0) return AE_MSG_ERR_ARGS;
    out[0] = '\0';
    if (number < 1) return AE_MSG_ERR_ARGS;

    /* The header decides visibility. Reading the body first and checking
     * afterwards would already have put somebody's private mail in the
     * caller's buffer. */
    if (ae_msg_header(number, &row) != AE_MSG_OK) return AE_MSG_ERR_ARGS;

    number_to_name(name, number);
    if (!join_path(path, (int)sizeof(path), name)) return AE_MSG_ERR_ARGS;

    f = ae_dos_open(path, AE_DOS_READ);
    if (f == 0) return 0;    /* a header with no body file: real, and not an error */

    got = ae_dos_read(f, out, (long)(cap - 1));
    ae_dos_close(f);
    if (got < 0) return 0;

    out[got] = '\0';
    return got;
}

/* ---- writing ------------------------------------------------------------
 *
 * Release 1 deliberately wrote nothing: "a wrong byte in a 110-byte header is
 * not a bug anyone notices until somebody's mail is unreadable". What makes it
 * safe now is that the reader above already settles every record in the file,
 * so the writer can REFUSE a base it would be guessing about - see
 * every_record_is_amiga_shaped.
 */

/** Whether this node currently holds MailLock, so unlock cannot free another's. */
static int lock_held;

/**
 * Refuse to append where the file is not uniformly AmiExpress-shaped.
 *
 * The board reads HeaderFile with a whole-file sequence pass and can cope with
 * both layouts; this writer only knows how to add one of them. Appending an
 * AmiExpress record after a run of port records shifts what the sequence pass
 * concludes about ITS neighbours, which is how a base that read fine before a
 * post stops reading afterwards.
 */
static int every_record_is_amiga_shaped(void)
{
    unsigned char record[AE_MSG_RECORD_SIZE];
    char path[AE_MSG_PATH_MAX];
    ae_file *f;
    long previous = 0;
    int clean = 1;

    if (!join_path(path, (int)sizeof(path), "HeaderFile")) return 0;
    f = ae_dos_open(path, AE_DOS_READ);
    if (f == 0) return 1;              /* a base with no HeaderFile yet is clean */

    while (ae_dos_read_full(f, record, AE_MSG_RECORD_SIZE) == 1) {
        int layout = classify_record(record);
        if (layout == LAYOUT_UNKNOWN) layout = settle_with_sequence(record, layout, previous);
        if (layout != LAYOUT_AMIGA) { clean = 0; break; }
        previous = ae_dos_get_long(record + AMIGA_NUM);
    }

    ae_dos_close(f);
    return clean;
}

/** A lock older than this is a dead holder's, not a live one's. */
#define AE_MSG_LOCK_STALE_SECONDS 30

/**
 * The seconds this lock was taken at, or 0 when the file says nothing.
 *
 * 0 covers all three ways a lock file can be uninformative: absent, empty, or
 * holding something that is not a number. Each means the same thing here -
 * nobody who is still running wrote it.
 */
static long lock_stamp(const char *path)
{
    char text[32];
    ae_file *f;
    long got, value = 0;
    int i = 0;

    f = ae_dos_open(path, AE_DOS_READ);
    if (f == 0) return 0;
    got = ae_dos_read(f, text, (long)sizeof(text) - 1);
    ae_dos_close(f);
    if (got <= 0) return 0;
    text[got] = 0;

    /*
     * SECONDS, from a stamp that may be written in MILLISECONDS.
     *
     * The board's own writer (services/MessageIndexManager.ts) stamps
     * `Date.now()`, which is 13 digits and does not fit in a 32-bit long on
     * this machine at all. The first ten digits of a millisecond stamp ARE
     * its second stamp, so read those and stop: the two writers then judge
     * each other's locks on the same scale, and neither posts over a holder
     * that is still alive.
     */
    while (text[i] >= '0' && text[i] <= '9') {
        if (i < 10) value = (value * 10) + (text[i] - '0');
        i++;
    }
    if (i == 0) return 0;
    /* Fewer than ten digits is a small clock (the tests use one), not a
       truncated stamp - take it as the seconds it is. */
    return value;
}

/**
 * Take MailLock, or report that somebody else has it.
 *
 * File-based, because that is what express.e uses and what another NODE can
 * see - a flag in this door's memory would not stop the board itself posting.
 *
 * THE FILE EXISTING IS NOT THE LOCK, and reading it that way is what broke
 * posting on the live board. express.e holds an exclusive AmigaDOS `Lock()`
 * on MailLock (express.e:11944-11964) and CREATES the file when it is missing:
 * the file is the thing being locked, not the lock, and it is left on disk for
 * ever by design - AmigaOS drops the handle when the holder exits. This port
 * has no such handle, so it does what the board's own writer does
 * (services/MessageIndexManager.ts): the file carries the SECOND it was taken
 * at, and a stamp older than AE_MSG_LOCK_STALE_SECONDS belongs to a holder
 * that is gone.
 *
 * Without that, a door killed between take and unlock - the inactivity fuse,
 * a dropped carrier, a node restart - left a zero-byte MailLock that refused
 * every later post in that conference for ever. Three conferences on the live
 * board were in that state for up to eight days (Conf1 and Conf3 from
 * 2026-09-14, Conf5 from 2026-09-18), and the caller only ever saw
 * "Another task has the MsgBase locked".
 *
 * `now` is the board's clock in Unix seconds, the same value the caller is
 * about to stamp the message with. 0 means the board would not say what time
 * it is, and then a lock file can only be judged by its existence again -
 * refuse, rather than post over somebody.
 */
static int take_lock(long now)
{
    char path[AE_MSG_PATH_MAX];
    char stamp[16];
    long held;
    int len;
    ae_file *f;

    if (!join_path(path, (int)sizeof(path), "MailLock")) return 0;

    if (ae_dos_exists(path)) {
        held = lock_stamp(path);
        if (now <= 0) return 0;
        /* A stamp from the future is a clock that moved, not a live holder;
           only the window between `now` and `now - stale` is somebody's. */
        if (held > 0 && held <= now && (now - held) < AE_MSG_LOCK_STALE_SECONDS) return 0;
    }

    f = ae_dos_open(path, AE_DOS_WRITE);
    if (f == 0) return 0;
    number_to_name(stamp, now > 0 ? now : 0);   /* decimal, same as a msg name */
    len = 0;
    while (stamp[len] != 0) len++;
    if (len > 0) ae_dos_write(f, stamp, (long)len);
    ae_dos_close(f);
    lock_held = 1;
    return 1;
}

void ae_msg_unlock(void)
{
    char path[AE_MSG_PATH_MAX];

    if (!lock_held) return;            /* never free a lock this node did not take */
    if (join_path(path, (int)sizeof(path), "MailLock")) ae_dos_delete(path);
    lock_held = 0;
}

/** The next number, straight out of MailStats - express.e:10688. */
static long next_number(void)
{
    unsigned char stats[18];
    char path[AE_MSG_PATH_MAX];
    ae_file *f;
    long high = 0;

    if (join_path(path, (int)sizeof(path), "MailStats")) {
        f = ae_dos_open(path, AE_DOS_READ);
        if (f != 0) {
            if (ae_dos_read_full(f, stats, 18) == 1) high = ae_dos_get_long(stats + 4);
            ae_dos_close(f);
        }
    }
    /* highMsgNum is the NEXT number, not the highest. An off-by-one here has
       already caused data loss in this codebase once: express.e opens the body
       MODE_NEWFILE, so a post at a number that exists truncates that message's
       body. A base with no MailStats starts at 1. */
    return high >= 1 ? high : 1;
}

/** Rewrite MailStats so the number after this one is free. */
static int bump_stats(long written)
{
    unsigned char stats[18];
    char path[AE_MSG_PATH_MAX];
    ae_file *f;
    long lowest_key = written;
    long lowest_not_del = written;
    int i;

    for (i = 0; i < 18; i++) stats[i] = 0;

    if (!join_path(path, (int)sizeof(path), "MailStats")) return 0;

    /* Keep the floors the base already had; only `high` is ours to move. */
    f = ae_dos_open(path, AE_DOS_READ);
    if (f != 0) {
        unsigned char old[18];
        if (ae_dos_read_full(f, old, 18) == 1) {
            long k = ae_dos_get_long(old + 0);
            long d = ae_dos_get_long(old + 8);
            if (k >= 1) lowest_key = k;
            if (d >= 1) lowest_not_del = d;
        }
        ae_dos_close(f);
    }

    ae_dos_put_long(stats + 0, lowest_key);
    ae_dos_put_long(stats + 4, written + 1);
    ae_dos_put_long(stats + 8, lowest_not_del);

    f = ae_dos_open(path, AE_DOS_WRITE);
    if (f == 0) return 0;
    if (ae_dos_write(f, stats, 18) != 18) { ae_dos_close(f); return 0; }
    ae_dos_close(f);
    return 1;
}

/** Copy a C string into a fixed field, NUL-terminated, never overrunning. */
static void put_field(unsigned char *record, int at, int cap, const char *s)
{
    int i = 0;
    if (s) {
        while (s[i] && i < cap - 1) { record[at + i] = (unsigned char)s[i]; i++; }
    }
    record[at + i] = 0;
}

long ae_msg_write(const ae_msg_new *msg, const char *body, unsigned long body_len)
{
    unsigned char record[AE_MSG_RECORD_SIZE];
    char path[AE_MSG_PATH_MAX];
    char name[16];
    ae_file *f;
    long number;
    int i;

    if (!base_open) return AE_MSG_ERR_NOBASE;
    if (!msg) return AE_MSG_ERR_ARGS;
    if (msg->status != AE_MSG_PUBLIC && msg->status != AE_MSG_PRIVATE)
        return AE_MSG_ERR_ARGS;
    if (!body) { body = ""; body_len = 0; }

    if (!every_record_is_amiga_shaped()) return AE_MSG_ERR_MIXED;
    if (!take_lock(msg->date)) return AE_MSG_ERR_LOCKED;

    number = next_number();

    /* Body first, header second. A header pointing at a body that was never
       written is a message the board lists and cannot open; a body with no
       header is invisible and harmless, and the next post overwrites it. */
    number_to_name(name, number);
    if (!join_path(path, (int)sizeof(path), name)) { ae_msg_unlock(); return AE_MSG_ERR_IO; }

    f = ae_dos_open(path, AE_DOS_WRITE);
    if (f == 0) { ae_msg_unlock(); return AE_MSG_ERR_IO; }
    if (body_len > 0 && ae_dos_write(f, body, (long)body_len) != (long)body_len) {
        ae_dos_close(f);
        ae_msg_unlock();
        return AE_MSG_ERR_IO;
    }
    /* express.e writes each line LF-terminated, so the last one is too. */
    if (body_len == 0 || body[body_len - 1] != '\n') {
        if (ae_dos_write(f, "\n", 1) != 1) {
            ae_dos_close(f);
            ae_msg_unlock();
            return AE_MSG_ERR_IO;
        }
    }
    ae_dos_close(f);

    for (i = 0; i < AE_MSG_RECORD_SIZE; i++) record[i] = 0;
    record[0] = (unsigned char)msg->status;
    ae_dos_put_long(record + AMIGA_NUM, number);
    put_field(record, AMIGA_TO, 31, msg->to);
    put_field(record, AMIGA_FROM, 31, msg->from);
    put_field(record, AMIGA_SUBJ, 31, msg->subject);
    ae_dos_put_long(record + AMIGA_DATE, msg->date);
    ae_dos_put_long(record + AMIGA_RECV, 0);   /* 0 = unread by its recipient */

    if (!join_path(path, (int)sizeof(path), "HeaderFile")) { ae_msg_unlock(); return AE_MSG_ERR_IO; }
    f = ae_dos_open(path, AE_DOS_APPEND);
    if (f == 0) { ae_msg_unlock(); return AE_MSG_ERR_IO; }
    if (ae_dos_write(f, record, AE_MSG_RECORD_SIZE) != AE_MSG_RECORD_SIZE) {
        ae_dos_close(f);
        ae_msg_unlock();
        return AE_MSG_ERR_IO;
    }
    ae_dos_close(f);

    if (!bump_stats(number)) { ae_msg_unlock(); return AE_MSG_ERR_IO; }

    ae_msg_unlock();
    return number;
}

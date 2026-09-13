/*
 * ae_session - who is calling, and on what screen.
 *
 * Phase 1 of the C SDK. A door could already ask WHERE it was running
 * (ae_host.h); this is the other half of the question - who is on the other
 * end, how much room they have, and whether the line is still up.
 *
 * CALLER-OWNED STORAGE, on purpose. The existing C door keeps its BBS
 * message buffer in a `static` (examples/doorrepo-c/aedoor_amiga.c:199-204),
 * which means two subsystems in one door cannot both talk to the board. Here
 * the caller hands over the memory and the library keeps no globals of its
 * own, so a door may open a second session for a background task without the
 * two treading on each other.
 *
 * THE TRANSPORT IS A SEAM. On the Amiga a field is one AEDoor round trip; on
 * a host build it is a table a test filled in. Same accessors either way,
 * which is what lets phase 1 be tested at all without an emulator.
 */

#ifndef AE_SESSION_H
#define AE_SESSION_H

#ifdef __cplusplus
extern "C" {
#endif

/** The fields a door may ask for, with the AEDoor numbers they map to. */
typedef enum {
    AE_FIELD_USER_NAME      = 100,  /* DT_NAME */
    AE_FIELD_USER_LOCATION  = 102,  /* DT_LOCATION */
    AE_FIELD_USER_LEVEL     = 105,  /* DT_SECSTATUS */
    AE_FIELD_TIME_LEFT      = 115,  /* DT_TIMELIMIT */
    /*
     * 541, not the 123 the plan wrote down: 123 is ACTIVE_NODES, and a door
     * asking it would have got a node count and read it as "yes, ANSI".
     * Checked against the board's own table (xim/types.ts) and against
     * axcommon.e:230, which is where that table came from.
     */
    AE_FIELD_IS_ANSI        = 541,  /* DT_ISANSI */
    AE_FIELD_SCREEN_COLS    = 520,  /* BB_SCRWIDTH */
    AE_FIELD_SCREEN_ROWS    = 521,  /* BB_SCRHEIGHT */
    AE_FIELD_CONFERENCE     = 510,  /* BB_CONFNUM */
    /* What the conference is CALLED, for a masthead. Not in the message base:
     * a message base is headers and bodies and knows nothing about it. */
    AE_FIELD_CONF_NAME      = 126,  /* BB_CONFNAME */
    /*
     * WHERE THE CALLER'S CONFERENCE AND ITS MESSAGES LIVE ON DISK.
     *
     * These two are what let a door read a message base for itself rather
     * than asking the board to decode one for it - and they are ORDINARY
     * AmiExpress, not this port's inventions, which is the entire point. A
     * real AmiExpress answers no command that lists or reads a message; a
     * door that wants messages opens <conf>/MsgBase/HeaderFile, and these say
     * where that is. Doors/Conftop and Doors/Request already do exactly this.
     *
     * MSGBASE_LOC answers the conference's DEFAULT base. A conference with
     * several (MsgBases.info: NMSGBASES, NAME.n, LOCATION.n - express.e:2048
     * and ~2068) needs the door to read that file and resolve LOCATION.n
     * itself; CONF_LOCATION is the directory to read it from.
     *
     * Both answer in String, so they need no entry in the transport's
     * field_answers_in_data() - unlike the two pointers below.
     */
    AE_FIELD_CONF_LOCATION  = 127,  /* BB_CONFLOCAL */
    AE_FIELD_MSGBASE_LOC    = 604,  /* GET_MSGBASE_LOC */
    /*
     * THE CALLER'S READ POINTERS - express.e:3963-3966, both answered in
     * Data:
     *
     *     CASE LAST_READ    -> msg.data:=lastMsgReadConf
     *     CASE LAST_SCANNED -> msg.data:=lastNewReadConf
     *
     * A door asks the BOARD for these rather than parsing <conf>/Conf.DB,
     * whose 74-byte records are indexed by the caller's account SLOT - a
     * number the door interface does not expose at all. Asking also stays
     * right on a board that keeps its pointers somewhere else entirely.
     */
    AE_FIELD_LAST_READ      = 602,  /* LAST_READ */
    AE_FIELD_LAST_SCANNED   = 603,  /* LAST_SCANNED */
    /*
     * WHICH COMMAND NAME LAUNCHED THIS DOOR - express.e:3974-3975,
     * AstrCopy(msg.string, customMsgCmd, 200).
     *
     * The only way one binary can behave differently under two registrations,
     * because AmigaDOS gives a door ONE argument string and only argv[1]
     * survives (sdk/c/README.md:132-143) - and argv[1] is the node number.
     * SUBS uses it to tell its full screen from its three-line digest.
     */
    AE_FIELD_MENU_COMMAND   = 605,  /* GET_CUSTOM_MSGBASE_MENUCMD */
    /*
     * THE BOARD'S CLOCK, in Unix seconds - express.e:3771,
     * `StringF(tempstring,'\d',getSystemTime())`.
     *
     * A door that wrote a message header needs a date, and must not reach for
     * time() to get one: on AmigaOS the C library's epoch is not reliably the
     * Unix one, so a door built with the wrong toolchain would stamp every
     * message eight years out and nobody would notice until the list was
     * sorted. The board already knows, and it is the same clock express.e
     * stamps its own messages with.
     */
    AE_FIELD_CURR_TIME      = 145,  /* DT_CURR_TIME */
    /*
     * THIS BOARD'S OWN, above express.e's MAX_CMD (1003).
     *
     * A classic board answers an unknown command with nothing, which is the
     * signal to fall back - and a door should have checked AE_HOST first
     * anyway (ae_host.h).
     */
    AE_FIELD_THEME          = 10100, /* AEW_THEME */
    /*
     * ALSO THIS BOARD'S OWN, and the one field here that is not a field.
     *
     * AEW_MSGQUERY carries a QUERY out and TEXT back in the same message, so
     * it is reached through ae_field_exchange (aedoor.h), never through the
     * session accessors above - there is no "the caller's message feed" the
     * way there is "the caller's name". It is named here because this enum is
     * where the board's numbers are pinned against xim/types.ts
     * (sdk/test/c-sdk-agrees-with-typescript.test.ts), and a number that lives
     * in two files and is checked in neither is how they drift.
     *
     * The door-facing wrapper is sdk/c/include/ae_msgbase.h.
     */
    AE_FIELD_MSGQUERY       = 10200, /* AEW_MSGQUERY */
    /*
     * ALSO THIS BOARD'S OWN: move the caller's read pointer.
     *
     * AE_FIELD_LAST_READ / _LAST_SCANNED above are READ-ONLY, and that is
     * true of a real AmiExpress too, not just of a board that has not got
     * round to it - express.e:3963-3966 only ever answers, while MSGBASE_LOC
     * three lines below shows the settable idiom the author used where a
     * field WAS meant to be written. The board owns the pointer and writes it
     * when the BOARD does the reading.
     *
     * A door that reads the message base itself therefore cannot mark
     * anything read, and SUBS is exactly that door. This is the additive
     * command that closes it. Written as "READ <n>" or "SCAN <n>".
     *
     * A board that does not have it ignores the write, the read-back does not
     * move, and ae_set_last_read answers 0 - so the door keeps working with
     * nothing marked, which is what it does on a classic board today.
     *
     * Proposed upstream: Documentation/4-Door-Developers/PROPOSED_SETPOINTER.md
     */
    AE_FIELD_SETPOINTER     = 10300  /* AEW_SETPOINTER */
} ae_field;

/**
 * One round trip to the board.
 *
 * Returns the number of characters written to `out` (0 for a field with no
 * text), or -1 when the CARRIER IS GONE - which is the one failure a door
 * must notice, because everything after it is writing into a dropped line.
 */
typedef int (*ae_transport_fn)(void *context, ae_field field, char *out, int cap);

/**
 * Write one field back to the board.
 *
 * Optional: a transport that only reads leaves it NULL, and the one call
 * that needs it (ae_set_user_theme) answers "this host cannot" rather than
 * failing. Returns 0 when the board took it, -1 when the carrier is gone.
 */
typedef int (*ae_write_fn)(void *context, ae_field field, const char *value);

/**
 * A session.
 *
 * The fields are visible so a caller can place one on its own stack; treat
 * them as private. `storage`/`cap` are the buffer the transport works in.
 */
typedef struct {
    ae_transport_fn transport;
    /** May be NULL: a read-only transport is a valid one. */
    ae_write_fn write;
    void *context;
    char *storage;
    long cap;
    int node;
    /** 0 once any round trip has reported the carrier gone. */
    int carrier;
} ae_session;

/**
 * Start a session on `node`, with a buffer the caller owns.
 *
 * The buffer must be at least AE_SESSION_MIN_STORAGE bytes - the AEDoor
 * message is 264 and a door that hands over less would corrupt the board's
 * reply. Returns 0 on success, -1 when the arguments cannot work, and does
 * not allocate.
 */
int ae_open(ae_session *s, ae_transport_fn transport, void *context,
            char *storage, long cap, int node);

/**
 * Give a session a write path. Optional, and separate from ae_open so the
 * dozens of read-only callers do not grow an argument they would pass NULL
 * to.
 */
void ae_set_writer(ae_session *s, ae_write_fn write);

/** The AEDoor message size, which is the floor for `cap`. */
#define AE_SESSION_MIN_STORAGE 264

/**
 * Open a session on the REAL board, using the AEDoor protocol.
 *
 * The convenience every door wants: ae_open with the transport already
 * wired, reads and writes both. Declared here, implemented in its own
 * module, so a door that never opens a session does not link the protocol.
 *
 * `node` is what AmiExpress passed as argv[1].
 */
int ae_open_bbs(ae_session *s, char *storage, long cap, int node);

/** End a session. Safe on one that never opened. */
void ae_close(ae_session *s);

/** Is the line still up? 0 once a round trip has said otherwise. */
int ae_carrier(const ae_session *s);

/** The node this door was started on (argv[1] on a real board). */
int ae_node(const ae_session *s);

/*
 * User identity. Each is one round trip; the caller owns `out`, and every
 * one of them leaves `out` a valid empty string when the answer is unknown,
 * so a door can print the result without checking first.
 */
int ae_user_name(ae_session *s, char *out, int n);
int ae_user_location(ae_session *s, char *out, int n);

/** -1 when the board did not answer, which is not a level a door should use. */
int ae_user_level(ae_session *s);
int ae_user_time_left(ae_session *s);

/** 1 when the caller's terminal takes ANSI, 0 when it does not. */
int ae_user_is_ansi(ae_session *s);

/*
 * Geometry. A door that never asks gets 80x25, the board's own default and
 * the size every classic door assumed.
 */
int ae_screen_cols(ae_session *s);
int ae_screen_rows(ae_session *s);
int ae_conference(ae_session *s);

/**
 * The current conference's directory, e.g. "BBS:Conf3/". "" when the board
 * does not answer.
 *
 * A door needs this to read the conference's own files - MsgBases.info above
 * all, which is the only place the names and locations of several message
 * bases in one conference are written down.
 */
int ae_conf_location(ae_session *s, char *out, int n);

/**
 * The current conference's name, e.g. "Coding". "" when the board does not
 * answer.
 *
 * It is NOT in the message base - a message base is headers and bodies and
 * knows nothing about what the conference is called - so a door that wants it
 * on a masthead asks the board.
 */
int ae_conf_name(ae_session *s, char *out, int n);

/**
 * The current conference's DEFAULT message base directory, e.g.
 * "BBS:Conf3/MsgBase/". "" when the board does not answer.
 *
 * HeaderFile, MailStats, MailLock and the numbered body files all live here.
 * On a conference with several bases this is base 1 and not necessarily the
 * one the caller has joined - resolve LOCATION.n out of MsgBases.info for
 * that, starting from ae_conf_location().
 */
int ae_msgbase_path(ae_session *s, char *out, int n);

/**
 * The highest message number this caller has READ in this conference
 * (express.e's lastMsgReadConf), or -1 when the board does not answer.
 *
 * -1 and not 0, because 0 is a real answer: it is what a caller who has never
 * read anything here has, and a door that could not ask must not silently
 * treat every message as new.
 */
int ae_last_read(ae_session *s);

/**
 * The highest message number this caller has been SCANNED up to
 * (lastNewReadConf), or -1 when the board does not answer. This is the one
 * that decides what counts as new; ae_last_read is where he stopped reading.
 */
int ae_last_scanned(ae_session *s);

/**
 * The board's clock, in Unix seconds, or 0 where it will not say.
 *
 * 0 rather than a guess: a message stamped with a wrong date is worse than one
 * the door refuses to write, and the caller can decide which.
 */
long ae_now(ae_session *s);

/**
 * Tell the board the caller has read up to `msg_num`.
 *
 * For a door that reads the message base itself: without this nothing ever
 * advances the pointer, so every message stays new for ever and the caller
 * can never clear "N new for you".
 *
 * Returns 1 when the pointer is now at or past `msg_num`, 0 otherwise -
 * including on a board that does not implement the command, which is not an
 * error and must not stop the door. Requires a writer (ae_set_writer).
 *
 * Pointers move FORWARD ONLY, as express.e's own readit does
 * (`IF(msgNum>lastMsgReadConf)`, express.e:12370). Asking for a lower number
 * answers 1 without moving anything: the state asked for is already true.
 */
int ae_set_last_read(ae_session *s, int msg_num);

/** As ae_set_last_read, for the new-scan pointer (express.e lastNewReadConf). */
int ae_set_last_scanned(ae_session *s, int msg_num);

/**
 * The caller's theme id ("classic", "uprough-neon", ...), or "" where the
 * board does not answer - a classic AmiExpress, which has no themes.
 */
int ae_user_theme(ae_session *s, char *out, int n);

/**
 * The command name the caller typed to get here, or "" where the board does
 * not say.
 *
 * One binary can then be registered twice and behave differently under each
 * name - which is the only mechanism available, since AmigaDOS hands a door a
 * single argument string and argv[1] is already the node number.
 */
int ae_menu_command(ae_session *s, char *out, int n);

/**
 * Change the caller's theme, and have the board remember it.
 *
 * Returns 1 when the board took it, 0 when this host has no such command -
 * which is not an error, it is a classic board. A door should say so rather
 * than pretending the choice was saved.
 *
 * Requires a write, so it is the one call here that needs the transport to
 * support direction; see ae_transport_fn.
 */
int ae_set_user_theme(ae_session *s, const char *theme_id);

/** What a door falls back to. */
#define AE_DEFAULT_COLS 80
#define AE_DEFAULT_ROWS 25

#ifdef __cplusplus
}
#endif

#endif /* AE_SESSION_H */

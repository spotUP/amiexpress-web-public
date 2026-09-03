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
    AE_FIELD_IS_ANSI        = 123,  /* DT_ISANSI */
    AE_FIELD_SCREEN_COLS    = 520,  /* BB_SCRWIDTH */
    AE_FIELD_SCREEN_ROWS    = 521,  /* BB_SCRHEIGHT */
    AE_FIELD_CONFERENCE     = 510   /* BB_CONFNUM */
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
 * A session.
 *
 * The fields are visible so a caller can place one on its own stack; treat
 * them as private. `storage`/`cap` are the buffer the transport works in.
 */
typedef struct {
    ae_transport_fn transport;
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

/** The AEDoor message size, which is the floor for `cap`. */
#define AE_SESSION_MIN_STORAGE 264

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

/** What a door falls back to. */
#define AE_DEFAULT_COLS 80
#define AE_DEFAULT_ROWS 25

#ifdef __cplusplus
}
#endif

#endif /* AE_SESSION_H */

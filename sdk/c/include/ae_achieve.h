/*
 * ae_achieve - reporting achievement events from a C door.
 *
 * A door does not decide what unlocks. It reports FACTS - "this player
 * finished a game", "this player scored 120000" - and the server answers with
 * whatever those facts unlocked. That is the whole client: one POST, one
 * answer, no per-achievement code anywhere on this side.
 *
 * The wire is the board's own: `POST /achievements/v1/events` with
 * `Authorization: Board <key>` and a JSON body of one or more events, exactly
 * as web/backend/src/achievements/client.ts sends it. A 200 means the server
 * took them; the counts in the reply say how many were accepted, how many
 * were duplicates it had already seen, and how many it refused for good.
 *
 * WHY A DOOR SENDS ONE AT A TIME. The board batches from an outbox because it
 * survives restarts; a door does not - it runs, it reports, it exits - and a
 * 68K door has neither the memory for a queue nor anywhere to keep it. So the
 * unit here is one event, sent when it happens, and a failure is reported to
 * the caller rather than retried behind his back.
 *
 * Platform-neutral C89, like everything else in this SDK: the socket access
 * is ae_net's and the framing is ae_http's, so this file never mentions
 * AMIGA.
 */
#ifndef AE_ACHIEVE_H
#define AE_ACHIEVE_H

#ifdef __cplusplus
extern "C" {
#endif

#define AE_ACHIEVE_OK               0
#define AE_ACHIEVE_ERR_ARGS         -1  /* NULL config/event, or an empty required field */
#define AE_ACHIEVE_ERR_TOO_LONG     -2  /* the JSON body did not fit the fixed buffer */
#define AE_ACHIEVE_ERR_TRANSPORT    -3  /* the request never completed; see ae_achieve_last_http_error() */
#define AE_ACHIEVE_ERR_STATUS       -4  /* the server answered, and not with 200; see resp->status */
#define AE_ACHIEVE_ERR_BODY         -5  /* a 200 whose body is not an events response */

/** The path the events endpoint lives at, so a caller can log it. */
#define AE_ACHIEVE_EVENTS_PATH "/achievements/v1/events"

/** Where the board's achievements server is, and who this board is. */
typedef struct {
    const char *host;        /* "doors.uprough.net"; never NULL */
    int port;                /* 80 unless the board says otherwise */
    const char *board_key;   /* the key the sysop minted; never NULL */
    int timeout_secs;        /* 0 -> AE_ACHIEVE_DEFAULT_TIMEOUT */
    const char *user_agent;  /* NULL -> ae_http's default */
} ae_achieve_config;

#define AE_ACHIEVE_DEFAULT_TIMEOUT 10

/**
 * One fact about one player.
 *
 * `ref` is the door's own idea of "this event": the server treats a repeat of
 * the same ref as a duplicate rather than a second fact, which is what makes
 * a retry safe. `email` is how the server knows the player - the board has
 * already linked it - and `type` is the event name the catalogue's rules are
 * written against ("door.gmaster.game"). `at` is ISO 8601 UTC.
 *
 * `value` is counted by the `sum` rules and ignored by the rest; pass 0 when
 * the fact has no number in it. `key` and `door` are optional dimensions -
 * `distinct` rules count them - and NULL leaves each out of the JSON
 * entirely rather than sending a null.
 */
typedef struct {
    const char *ref;
    const char *email;
    const char *type;
    const char *at;
    long value;
    int have_value;
    const char *key;
    const char *door;
} ae_achieve_event;

/** What the server said. `unlocked` is how many achievements this call opened. */
typedef struct {
    int status;        /* the HTTP status; 200 on success */
    int accepted;
    int duplicates;
    int rejected;
    int unlocked;
    int not_linked;    /* the player's board link is missing: tell him to link */
} ae_achieve_result;

/**
 * Report one event. Returns AE_ACHIEVE_OK, or one of the codes above with
 * `out` filled as far as it got (`out` may be NULL if the door does not care
 * what unlocked).
 */
int ae_achieve_report(const ae_achieve_config *config,
                      const ae_achieve_event *event,
                      ae_achieve_result *out);

/**
 * The ae_http error from the last ae_achieve_report() that returned
 * AE_ACHIEVE_ERR_TRANSPORT, for a door that wants to say why.
 */
int ae_achieve_last_http_error(void);

/**
 * The JSON one event becomes, for a door that wants to log it and for the
 * tests. Writes at most `size` bytes including the NUL and returns the length
 * written, or -1 when it would not fit or an argument is missing.
 */
long ae_achieve_build_body(const ae_achieve_event *event, char *buf, unsigned long size);

#ifdef __cplusplus
}
#endif

#endif /* AE_ACHIEVE_H */

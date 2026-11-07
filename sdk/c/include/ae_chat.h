/*
 * ae_chat - the livechat client a C door talks to the door server through.
 * A sibling of ae_request: the same wire (`Authorization: Board <key>`), the
 * same ae_http, the same bounded allocation-free style. The contract is the
 * /chat/v1 surface in CHAT-API.md; this file mirrors its field order.
 *
 * Differences from ae_request:
 *  - A session. open() gets a sid, every later call sends it as
 *    X-Chat-Session, close() ends it. A session the server expired
 *    (session_expired) is reopened once, silently, and the call retried.
 *  - The reply buffer is 8192 bytes and owned here (a 20-row history of 500
 *    byte lines does not fit ae_request's 2048).
 *  - Receive is plain text rows: `|` separated, a literal `|` travels as `!`
 *    and is turned back here. JSON is read only for the session reply.
 *
 * Reading rows: after a list call, loop ae_chat_next_row(c, fields, max)
 * until it returns 0. The fields are pointers into the reply buffer, valid
 * until the next call on the same ae_chat. A header row (ROOMS|, EVENTS|) is
 * consumed by the call itself; ae_chat_poll stores the next `since` in
 * c->last_seq.
 *
 * Platform-neutral C89: sockets through ae_net, framing through ae_http.
 */
#ifndef AE_CHAT_H
#define AE_CHAT_H

#include "ae_http.h"

#ifdef __cplusplus
extern "C" {
#endif

#define AE_CHAT_OK            0
#define AE_CHAT_ERR_ARGS      -1  /* NULL argument or an empty required field */
#define AE_CHAT_ERR_TOO_LONG  -2  /* the body or path did not fit its fixed buffer */
#define AE_CHAT_ERR_TRANSPORT -3  /* the request never completed; see c->http_error */
#define AE_CHAT_ERR_STATUS    -4  /* the server answered with an error; see c->status and c->error */
#define AE_CHAT_ERR_BODY      -5  /* a 2xx whose body is not the expected shape */

#define AE_CHAT_BASE "/chat/v1"
#define AE_CHAT_REPLY_MAX 8192
#define AE_CHAT_DEFAULT_TIMEOUT 10
#define AE_CHAT_TEXT_MAX 500      /* the server's limit on one message */
#define AE_CHAT_ROW_FIELDS 8      /* the widest row: events and history */

/** What PROGDIR:LIVECHAT.cfg holds. */
typedef struct {
    char host[64];
    int port;                  /* 80 unless set */
    char board_key[128];       /* <board-id>.<secret> */
    int timeout_secs;          /* 10 unless set */
} ae_chat_config;

/**
 * Parse `Key=value` text (`#` and `;` comments; keys Host, Port, BoardKey,
 * Timeout) into `cfg`. Returns 1 when Host and BoardKey are both non-empty,
 * else 0. `cfg` is always left filled with the defaults for what is missing.
 */
int ae_chat_config_parse(ae_chat_config *cfg, const char *text);

/** Read a file and parse it. Returns 0 when the file cannot be opened. */
int ae_chat_config_load(ae_chat_config *cfg, const char *path);

typedef struct {
    ae_chat_config cfg;
    char handle[32];           /* kept so an expired session can be reopened */
    int sysop;
    char sid[64];
    char user[48];             /* handle@BOARD as the server names us */
    int expires_in;
    long last_seq;             /* the next `since` for ae_chat_poll */
    long send_counter;         /* makes clientId unique within the session */
    int status;                /* HTTP status of the last call */
    char error[32];            /* the server's error code on a non-2xx */
    int retry_after;           /* seconds, when the server sent retryAfter */
    int http_error;            /* ae_http error of the last AE_CHAT_ERR_TRANSPORT */
    int calls;                 /* requests sent, reopens included */
    char reply[AE_CHAT_REPLY_MAX];
    unsigned long reply_len;
    unsigned long cursor;      /* where ae_chat_next_row reads next */
} ae_chat;

/** Start a session. `cfg` is copied. Returns AE_CHAT_OK or an AE_CHAT_ERR_*. */
int ae_chat_open(ae_chat *c, const ae_chat_config *cfg, const char *handle, int sysop);

/** End the session (DELETE /sessions/current). Safe on an unopened ae_chat. */
int ae_chat_close(ae_chat *c);

/** GET rooms.txt. Rows: id, name, topic, visibility, members, owner. */
int ae_chat_rooms(ae_chat *c);

/** POST /rooms. `topic` may be NULL. `visibility` "public" or "private". */
int ae_chat_room_create(ae_chat *c, const char *name, const char *topic, const char *visibility);

/** POST /rooms/:id/join. A "since" newer than c->last_seq moves last_seq up to it. On success `name`/`topic` (either may be NULL) get the room's, `members` its count. */
int ae_chat_join(ae_chat *c, const char *room, char *name, int name_cap,
                 char *topic, int topic_cap, int *members);

/** POST /rooms/:id/leave. */
int ae_chat_leave(ae_chat *c, const char *room);

/** GET history.txt, newest `limit` rows, older than `before` when > 0.
 *  Rows: seq, id, user, at, replyTo, threadId, roleColor, text. */
int ae_chat_history(ae_chat *c, const char *room, long before, int limit);

/** POST a line to a room. `reply_to` / `thread_id` may be NULL. */
int ae_chat_send(ae_chat *c, const char *room, const char *text,
                 const char *reply_to, const char *thread_id);

/** GET events.txt?since=c->last_seq&wait=`wait`. Rows: seq, type, room, user, ref, at, roleColor, text. */
int ae_chat_poll(ae_chat *c, int wait);

/** POST /messages/:id/react. `count` (may be NULL) gets the new count. */
int ae_chat_react(ae_chat *c, const char *msg_id, const char *emoji, int *count);

/** POST /messages/:id/thread. */
int ae_chat_thread(ae_chat *c, const char *msg_id, const char *text);

/** GET /threads/:id.txt. Rows as history. */
int ae_chat_thread_list(ae_chat *c, const char *msg_id, int limit);

/** GET /dm/:threadId/history.txt. Rows as history. */
int ae_chat_dm_history(ae_chat *c, const char *thread_id, long before, int limit);

/** POST /dm/:peer ("handle@BOARD"). `thread_id` (may be NULL) gets the DM thread. */
int ae_chat_dm(ae_chat *c, const char *peer, const char *text, char *thread_id, int cap);

/** GET dm.txt. Rows: threadId, peer, lastAt, unread. */
int ae_chat_dm_list(ae_chat *c);

/** GET who.txt. Rows: user, room, sysop, roleColor, idleSeconds. */
int ae_chat_who(ae_chat *c);

/** GET members.txt. Rows: user, sysop, op, roleColor, roleName. */
int ae_chat_members(ae_chat *c, const char *room);

/**
 * Next row of the last list reply, split on `|` with `!` turned back into
 * `|`. Fills fields[0..max-1] (missing trailing fields point at ""), returns
 * how many fields the row really had, or 0 when there are no more rows.
 */
int ae_chat_next_row(ae_chat *c, char **fields, int max);

#ifdef __cplusplus
}
#endif

#endif /* AE_CHAT_H */

/*
 * ae_achieve - reporting achievement events from a C door. See ae_achieve.h
 * for what this is and why a door sends one event at a time.
 *
 * Everything here is bounded and on the stack: a 68K door has no allocator
 * worth the name, and a fixed body buffer that refuses to overflow is the
 * whole memory story. The JSON is written by hand rather than through a
 * builder because there is exactly one shape to write and it is eight fields
 * long; json_lite reads the answer.
 */
#include <string.h>
#include <stdio.h>

#include "ae_achieve.h"
#include "ae_http.h"
#include "json_lite.h"

/* One event's JSON, plus the {"events":[ ]} around it. A ref, an email, a
 * type, a timestamp and two optional dimensions do not reach this even with
 * every string at its longest sensible length. */
#define AE_ACHIEVE_BODY_MAX 1024
/* The answer: counts, plus whatever unlocked. The board reads the whole
 * unlock list; a door needs the numbers, so it keeps only the first kilobyte
 * and counts what it can see. */
#define AE_ACHIEVE_REPLY_MAX 4096

static int last_http_error = 0;

int ae_achieve_last_http_error(void)
{
    return last_http_error;
}

/* A JSON string body, escaped as the standard requires and no further.
 * Returns the number of bytes written, or -1 if it would not fit. */
static long put_json_string(char *buf, unsigned long size, unsigned long at, const char *s)
{
    unsigned long i = at;
    const unsigned char *p = (const unsigned char *)s;

    if (i + 1 >= size) return -1;
    buf[i++] = '"';
    for (; *p != '\0'; p++) {
        const char *escape = 0;
        char unicode[7];

        switch (*p) {
            case '"':  escape = "\\\""; break;
            case '\\': escape = "\\\\"; break;
            case '\b': escape = "\\b";  break;
            case '\f': escape = "\\f";  break;
            case '\n': escape = "\\n";  break;
            case '\r': escape = "\\r";  break;
            case '\t': escape = "\\t";  break;
            default:
                if (*p < 0x20) {
                    /* A control byte has no short form: \u00XX, as JSON says. */
                    sprintf(unicode, "\\u%04x", (unsigned int)*p);
                    escape = unicode;
                }
                break;
        }

        if (escape != 0) {
            unsigned long len = (unsigned long)strlen(escape);
            if (i + len + 1 >= size) return -1;
            memcpy(buf + i, escape, len);
            i += len;
        } else {
            if (i + 2 >= size) return -1;
            buf[i++] = (char)*p;
        }
    }
    if (i + 1 >= size) return -1;
    buf[i++] = '"';
    buf[i] = '\0';
    return (long)i;
}

/* Literal text, bounds-checked the same way. */
static long put_raw(char *buf, unsigned long size, unsigned long at, const char *text)
{
    unsigned long len = (unsigned long)strlen(text);
    if (at + len + 1 >= size) return -1;
    memcpy(buf + at, text, len);
    buf[at + len] = '\0';
    return (long)(at + len);
}

static int blank(const char *s)
{
    return s == 0 || s[0] == '\0';
}

long ae_achieve_build_body(const ae_achieve_event *event, char *buf, unsigned long size)
{
    long at;
    char number[32];

    if (event == 0 || buf == 0 || size == 0) return -1;
    if (blank(event->ref) || blank(event->email) || blank(event->type) || blank(event->at)) return -1;

    at = put_raw(buf, size, 0, "{\"events\":[{\"ref\":");
    if (at < 0) return -1;
    at = put_json_string(buf, size, (unsigned long)at, event->ref);
    if (at < 0) return -1;
    at = put_raw(buf, size, (unsigned long)at, ",\"email\":");
    if (at < 0) return -1;
    at = put_json_string(buf, size, (unsigned long)at, event->email);
    if (at < 0) return -1;
    at = put_raw(buf, size, (unsigned long)at, ",\"type\":");
    if (at < 0) return -1;
    at = put_json_string(buf, size, (unsigned long)at, event->type);
    if (at < 0) return -1;
    at = put_raw(buf, size, (unsigned long)at, ",\"at\":");
    if (at < 0) return -1;
    at = put_json_string(buf, size, (unsigned long)at, event->at);
    if (at < 0) return -1;

    /* The optional three. An absent dimension is LEFT OUT rather than sent as
     * null: the server's `distinct` rules count the values they are given,
     * and a null is a value. */
    if (event->have_value) {
        sprintf(number, ",\"value\":%ld", event->value);
        at = put_raw(buf, size, (unsigned long)at, number);
        if (at < 0) return -1;
    }
    if (!blank(event->key)) {
        at = put_raw(buf, size, (unsigned long)at, ",\"key\":");
        if (at < 0) return -1;
        at = put_json_string(buf, size, (unsigned long)at, event->key);
        if (at < 0) return -1;
    }
    if (!blank(event->door)) {
        at = put_raw(buf, size, (unsigned long)at, ",\"door\":");
        if (at < 0) return -1;
        at = put_json_string(buf, size, (unsigned long)at, event->door);
        if (at < 0) return -1;
    }

    at = put_raw(buf, size, (unsigned long)at, "}]}");
    return at;
}

/* The reply, kept only as far as it fits: a door needs the counts, which are
 * at the front of the object, not the unlock list that follows them. */
typedef struct {
    char body[AE_ACHIEVE_REPLY_MAX];
    unsigned long len;
} reply_buffer;

static int collect(void *ctx, const unsigned char *buf, unsigned long len)
{
    reply_buffer *reply = (reply_buffer *)ctx;
    unsigned long room = (unsigned long)(sizeof reply->body) - 1 - reply->len;
    unsigned long take = len < room ? len : room;

    if (take > 0) {
        memcpy(reply->body + reply->len, buf, take);
        reply->len += take;
        reply->body[reply->len] = '\0';
    }
    return 0; /* never abort: the status matters even when the body is long */
}

/* How many objects an array of them holds, counted by their opening braces.
 * The reply's arrays are flat objects, so this is exact for `unlocks` and
 * `rejected`, and `notLinked` is an array of strings, counted by commas. */
static int count_objects(const char *json, const char *array_key)
{
    unsigned long cursor = 0;
    const char *object = 0;
    unsigned long object_len = 0;
    int seen = 0;

    while (json_next_array_object(json, array_key, &cursor, &object, &object_len) == 0) {
        seen++;
        if (seen > 4096) break; /* a malformed reply must not spin */
    }
    return seen;
}

static int count_strings(const char *json, const char *array_key)
{
    const char *at = strstr(json, array_key);
    const char *p;
    int seen = 0;
    int in_string = 0;

    if (at == 0) return 0;
    p = strchr(at, '[');
    if (p == 0) return 0;
    for (p++; *p != '\0' && *p != ']'; p++) {
        if (*p == '"' && (p == at || p[-1] != '\\')) {
            in_string = !in_string;
            if (in_string) seen++;
        }
    }
    return seen;
}

int ae_achieve_report(const ae_achieve_config *config,
                      const ae_achieve_event *event,
                      ae_achieve_result *out)
{
    char body[AE_ACHIEVE_BODY_MAX];
    char authorization[256];
    const char *headers[2];
    ae_http_target target;
    ae_http_response response;
    reply_buffer reply;
    long body_len;
    int rc;

    if (out != 0) memset(out, 0, sizeof *out);
    last_http_error = 0;

    if (config == 0 || event == 0) return AE_ACHIEVE_ERR_ARGS;
    if (blank(config->host) || blank(config->board_key)) return AE_ACHIEVE_ERR_ARGS;

    body_len = ae_achieve_build_body(event, body, sizeof body);
    if (body_len < 0) {
        /* Either a required field is missing or the JSON would not fit; the
         * caller can tell the two apart by checking his own event. */
        if (blank(event->ref) || blank(event->email) || blank(event->type) || blank(event->at)) {
            return AE_ACHIEVE_ERR_ARGS;
        }
        return AE_ACHIEVE_ERR_TOO_LONG;
    }

    if ((unsigned long)strlen(config->board_key) + 32 >= sizeof authorization) {
        return AE_ACHIEVE_ERR_TOO_LONG;
    }
    sprintf(authorization, "Authorization: Board %s\r\n", config->board_key);
    headers[0] = authorization;
    headers[1] = "Content-Type: application/json\r\n";

    memset(&target, 0, sizeof target);
    target.host = config->host;
    target.port = config->port > 0 ? config->port : 80;
    target.timeout_secs = config->timeout_secs > 0 ? config->timeout_secs : AE_ACHIEVE_DEFAULT_TIMEOUT;
    target.user_agent = config->user_agent;

    memset(&response, 0, sizeof response);
    reply.len = 0;
    reply.body[0] = '\0';

    rc = ae_http_request(&target, "POST", AE_ACHIEVE_EVENTS_PATH,
                         body, (unsigned long)body_len,
                         headers, 2, &response, collect, &reply, 0);
    if (rc != AE_HTTP_OK) {
        last_http_error = rc;
        return AE_ACHIEVE_ERR_TRANSPORT;
    }

    if (out != 0) out->status = response.status;
    if (response.status != 200) return AE_ACHIEVE_ERR_STATUS;

    /* A 200 that is not an events response is the surface being off, or a
     * proxy answering for it. Say so rather than reporting nought accepted. */
    if (strstr(reply.body, "\"accepted\"") == 0) return AE_ACHIEVE_ERR_BODY;

    if (out != 0) {
        int value = 0;
        if (json_extract_bool(reply.body, "accepted", &value) == 0) out->accepted = value;
        if (json_extract_bool(reply.body, "duplicates", &value) == 0) out->duplicates = value;
        out->rejected = count_objects(reply.body, "rejected");
        out->unlocked = count_objects(reply.body, "unlocks");
        out->not_linked = count_strings(reply.body, "notLinked");
    }
    return AE_ACHIEVE_OK;
}

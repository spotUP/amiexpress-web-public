/* test_ae_request.c - tests for ae_request.c, the global-requests client a C
 * door talks to the door server through. The JSON it builds and the query
 * escaping are checked directly; the request and the answer are driven against
 * the local stub server, so what is asserted is the bytes that would reach the
 * server and what the door is told about the reply.
 *
 * POSIX-only harness; ae_request.c itself is platform-neutral C89.
 */

#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include "../include/ae_request.h"
#include "stub_server.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-58s ", #name); fflush(stdout); test_##name(); } while (0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((got) == (expected)) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long)(got), (long)(expected)); } \
    tests_run++; \
} while (0)
#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s\n", msg); } \
    tests_run++; \
} while (0)

/* ------------------------------------------------------------- the body */

TEST(the_post_body_is_kind_title_and_handle)
{
    char body[1024];
    long len = ae_req_build_post_body(AE_REQ_KIND_RELEASE, "Nexus 7", 0, "Spot", body, sizeof body);
    ASSERT_TRUE(len > 0, "the body was built");
    ASSERT_TRUE(strcmp(body,
        "{\"kind\":\"release\",\"title\":\"Nexus 7\",\"handle\":\"Spot\"}") == 0,
        "no notes when none given");
    ASSERT_EQ((long)strlen(body), len, "the length is what was written");
}

TEST(notes_are_sent_only_when_given)
{
    char body[1024];
    ae_req_build_post_body(AE_REQ_KIND_ART, "Login screen", "80x25 please", "Spot", body, sizeof body);
    ASSERT_TRUE(strcmp(body,
        "{\"kind\":\"art\",\"title\":\"Login screen\",\"notes\":\"80x25 please\",\"handle\":\"Spot\"}") == 0,
        "art with notes");
    ae_req_build_post_body(AE_REQ_KIND_ART, "Login screen", "", "Spot", body, sizeof body);
    ASSERT_TRUE(strstr(body, "notes") == 0, "an empty notes is left out");
}

TEST(a_quote_in_a_field_cannot_break_out_of_the_json)
{
    char body[1024];
    ae_req_build_post_body(AE_REQ_KIND_RELEASE, "he said \"go\"\nthen left", 0, "Spot", body, sizeof body);
    ASSERT_TRUE(strstr(body, "\\\"go\\\"") != 0, "the quotes are escaped");
    ASSERT_TRUE(strstr(body, "\\n") != 0, "the newline is escaped");
    ASSERT_TRUE(strchr(body, '\n') == 0, "no raw control byte reaches the wire");
}

TEST(a_missing_required_field_is_refused)
{
    char body[1024];
    ASSERT_EQ(ae_req_build_post_body(AE_REQ_KIND_RELEASE, "", 0, "Spot", body, sizeof body), -1, "an empty title is refused");
    ASSERT_EQ(ae_req_build_post_body(AE_REQ_KIND_RELEASE, "x", 0, 0, body, sizeof body), -1, "a missing handle is refused");
}

TEST(a_body_that_would_not_fit_is_refused_rather_than_truncated)
{
    char body[24];
    ASSERT_EQ(ae_req_build_post_body(AE_REQ_KIND_RELEASE, "a long enough title here", 0, "Spot", body, sizeof body), -1, "too long is -1");
}

/* ----------------------------------------------------------- url escape */

TEST(url_escape_keeps_unreserved_and_percent_encodes_the_rest)
{
    char out[64];
    long n = ae_req_url_escape("Spot The Kid!", out, sizeof out);
    ASSERT_TRUE(n > 0, "escaped");
    ASSERT_TRUE(strcmp(out, "Spot%20The%20Kid%21") == 0, "spaces and bang are encoded, letters kept");
}

TEST(url_escape_refuses_when_it_would_not_fit)
{
    char out[4];
    ASSERT_EQ(ae_req_url_escape("a space", out, sizeof out), -1, "no room is -1");
}

/* ------------------------------------------------------------- the wire */

static ae_req_config config_for(int port)
{
    ae_req_config config;
    memset(&config, 0, sizeof config);
    config.host = "127.0.0.1";
    config.port = port;
    config.board_key = "board-key-abc";
    config.timeout_secs = 5;
    return config;
}

static unsigned long reply_with(char *out, const char *status, const char *body)
{
    return (unsigned long)sprintf(out,
        "HTTP/1.1 %s\r\nContent-Type: application/json\r\nContent-Length: %lu\r\n\r\n%s",
        status, (unsigned long)strlen(body), body);
}

TEST(a_post_sends_the_board_key_and_the_json)
{
    unsigned char captured[4096];
    int pid = 0;
    int capture_fd = -1;
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", "{\"id\":104,\"state\":\"open\",\"at\":\"x\"}");
    int port = stub_server_start_capturing((const unsigned char *)reply, reply_len, &pid, &capture_fd);
    ae_req_config config = config_for(port);
    ae_req_result result;
    int rc;
    unsigned long got;

    ASSERT_TRUE(port > 0, "the stub server started");
    rc = ae_req_post(&config, AE_REQ_KIND_RELEASE, "Nexus 7", 0, "Spot", &result);
    got = stub_server_read_capture(capture_fd, captured, sizeof captured - 1);
    captured[got] = '\0';
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_REQ_OK, "the post succeeded");
    ASSERT_TRUE(strstr((char *)captured, "POST /requests/v1/requests HTTP/1.1") != 0, "it POSTs to the requests endpoint");
    ASSERT_TRUE(strstr((char *)captured, "Authorization: Board board-key-abc") != 0, "the board key identifies the board");
    ASSERT_TRUE(strstr((char *)captured, "Content-Type: application/json") != 0, "the body is declared as JSON");
    ASSERT_TRUE(strstr((char *)captured, "\"title\":\"Nexus 7\"") != 0, "the request is in the body");
}

TEST(the_reply_tells_the_door_the_id_and_state)
{
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", "{\"id\":104,\"state\":\"open\",\"at\":\"x\"}");
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_req_config config = config_for(port);
    ae_req_result result;
    int rc = ae_req_post(&config, AE_REQ_KIND_RELEASE, "Nexus 7", 0, "Spot", &result);
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_REQ_OK, "the post succeeded");
    ASSERT_EQ(result.status, 200, "the status is reported");
    ASSERT_EQ(result.id, 104, "the new id is reported");
    ASSERT_TRUE(strcmp(result.state, "open") == 0, "the state is open");
}

TEST(an_action_posts_to_the_action_path_with_the_handle)
{
    unsigned char captured[4096];
    int pid = 0;
    int capture_fd = -1;
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", "{\"id\":103,\"votes\":13,\"voted\":true}");
    int port = stub_server_start_capturing((const unsigned char *)reply, reply_len, &pid, &capture_fd);
    ae_req_config config = config_for(port);
    ae_req_result result;
    int rc;
    unsigned long got;

    rc = ae_req_action(&config, 103, "vote", "Voter", 0, &result);
    got = stub_server_read_capture(capture_fd, captured, sizeof captured - 1);
    captured[got] = '\0';
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_REQ_OK, "the action succeeded");
    ASSERT_TRUE(strstr((char *)captured, "POST /requests/v1/requests/103/vote HTTP/1.1") != 0, "it POSTs to the vote path");
    ASSERT_TRUE(strstr((char *)captured, "\"handle\":\"Voter\"") != 0, "the handle is in the body");
    ASSERT_EQ(result.votes, 13, "the new count is reported");
}

TEST(a_done_action_carries_its_note_only_when_given)
{
    unsigned char captured[4096];
    int pid = 0;
    int capture_fd = -1;
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", "{\"id\":103,\"state\":\"done\"}");
    int port = stub_server_start_capturing((const unsigned char *)reply, reply_len, &pid, &capture_fd);
    ae_req_config config = config_for(port);
    ae_req_result result;
    unsigned long got;

    ae_req_action(&config, 103, "done", "Rebel", "uploaded to /X", &result);
    got = stub_server_read_capture(capture_fd, captured, sizeof captured - 1);
    captured[got] = '\0';
    stub_server_reap(pid);

    ASSERT_TRUE(strstr((char *)captured, "\"note\":\"uploaded to /X\"") != 0, "the note rides along");
    ASSERT_TRUE(strcmp(result.state, "done") == 0, "the state is done");
}

TEST(a_non_200_names_the_refusal_for_the_door)
{
    char reply[512];
    unsigned long reply_len = reply_with(reply, "409 Conflict", "{\"error\":\"already_claimed\",\"detail\":\"someone already claimed it\"}");
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_req_config config = config_for(port);
    ae_req_result result;
    int rc = ae_req_action(&config, 103, "claim", "Late", 0, &result);
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_REQ_ERR_STATUS, "a refusal is an error");
    ASSERT_EQ(result.status, 409, "the status is reported");
    ASSERT_TRUE(strcmp(result.error, "already_claimed") == 0, "the error code reaches the door");
}

TEST(a_get_with_a_null_sink_is_refused)
{
    ae_req_config config = config_for(9);
    ASSERT_EQ(ae_req_get(&config, AE_REQ_BASE "/list.txt", 0, 0), AE_REQ_ERR_ARGS, "a NULL sink is refused before the wire");
}

static int collect_body(void *ctx, const unsigned char *buf, unsigned long len)
{
    char *dst = (char *)ctx;
    unsigned long at = (unsigned long)strlen(dst);
    if (at + len < 400) {
        memcpy(dst + at, buf, len);
        dst[at + len] = '\0';
    }
    return 0;
}

TEST(a_get_with_a_sink_receives_the_listing)
{
    char body[512];
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", "REQUEST|1|r1-t5|1\r\n103|release|open|12|uprough|Spot|Nexus 7||5|5\r\n");
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_req_config config = config_for(port);
    int status;
    body[0] = '\0';
    status = ae_req_get(&config, AE_REQ_BASE "/list.txt?state=open", collect_body, body);
    stub_server_reap(pid);
    ASSERT_EQ(status, 200, "the status is reported");
    ASSERT_TRUE(strncmp(body, "REQUEST|1|", 10) == 0, "the header line arrived");
    ASSERT_TRUE(strstr(body, "|release|open|") != 0, "the row arrived");
}

TEST(a_server_that_is_not_there_is_a_transport_error)
{
    ae_req_config config = config_for(stub_closed_port());
    ae_req_result result;
    int rc = ae_req_post(&config, AE_REQ_KIND_RELEASE, "x", 0, "Spot", &result);
    ASSERT_EQ(rc, AE_REQ_ERR_TRANSPORT, "a closed port is a transport error");
    ASSERT_TRUE(ae_req_last_http_error() != 0, "...and ae_http says why");
}

TEST(a_call_without_a_board_key_never_reaches_the_wire)
{
    ae_req_config config = config_for(9);
    ae_req_result result;
    config.board_key = "";
    ASSERT_EQ(ae_req_post(&config, AE_REQ_KIND_RELEASE, "x", 0, "Spot", &result), AE_REQ_ERR_ARGS, "an empty key is refused");
    config.board_key = "k";
    config.host = 0;
    ASSERT_EQ(ae_req_action(&config, 1, "vote", "Spot", 0, &result), AE_REQ_ERR_ARGS, "a missing host is refused");
}

int main(void)
{
    printf("\n====== Requests Client Tests ======\n\n");

    RUN_TEST(the_post_body_is_kind_title_and_handle);
    RUN_TEST(notes_are_sent_only_when_given);
    RUN_TEST(a_quote_in_a_field_cannot_break_out_of_the_json);
    RUN_TEST(a_missing_required_field_is_refused);
    RUN_TEST(a_body_that_would_not_fit_is_refused_rather_than_truncated);
    RUN_TEST(url_escape_keeps_unreserved_and_percent_encodes_the_rest);
    RUN_TEST(url_escape_refuses_when_it_would_not_fit);
    RUN_TEST(a_post_sends_the_board_key_and_the_json);
    RUN_TEST(the_reply_tells_the_door_the_id_and_state);
    RUN_TEST(an_action_posts_to_the_action_path_with_the_handle);
    RUN_TEST(a_done_action_carries_its_note_only_when_given);
    RUN_TEST(a_non_200_names_the_refusal_for_the_door);
    RUN_TEST(a_get_with_a_null_sink_is_refused);
    RUN_TEST(a_get_with_a_sink_receives_the_listing);
    RUN_TEST(a_server_that_is_not_there_is_a_transport_error);
    RUN_TEST(a_call_without_a_board_key_never_reaches_the_wire);

    printf("\n%d run, %d passed, %d failed\n\n", tests_run, tests_passed, tests_failed);
    return tests_failed == 0 ? 0 : 1;
}

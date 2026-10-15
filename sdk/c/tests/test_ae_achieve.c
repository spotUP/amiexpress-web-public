/* test_ae_achieve.c - tests for ae_achieve.c, the achievements client a C
 * door reports through. The JSON it builds is checked directly; the request
 * and the answer are driven against the local stub server, so what is
 * asserted is the bytes that would reach the board's achievements server and
 * what the door is told about the reply.
 *
 * POSIX-only harness; ae_achieve.c itself is platform-neutral C89.
 */

#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include "../include/ae_achieve.h"
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

static ae_achieve_event a_game_finished(void)
{
    ae_achieve_event event;
    memset(&event, 0, sizeof event);
    event.ref = "gm-42";
    event.email = "spot@example.com";
    event.type = "door.gmaster.game";
    event.at = "2026-09-07T18:00:00Z";
    return event;
}

/* ---------------------------------------------------------------- the body */

TEST(the_body_is_one_event_in_an_events_array)
{
    ae_achieve_event event = a_game_finished();
    char body[1024];
    long len = ae_achieve_build_body(&event, body, sizeof body);

    ASSERT_TRUE(len > 0, "the body was built");
    ASSERT_TRUE(strcmp(body,
        "{\"events\":[{\"ref\":\"gm-42\",\"email\":\"spot@example.com\","
        "\"type\":\"door.gmaster.game\",\"at\":\"2026-09-07T18:00:00Z\"}]}") == 0,
        "the body is the four required fields and nothing else");
    ASSERT_EQ((long)strlen(body), len, "the length is what was written");
}

TEST(a_number_is_sent_only_when_the_door_says_so)
{
    ae_achieve_event event = a_game_finished();
    char body[1024];

    /* A score of nought is a real score - `have_value` is what decides, not
     * whether the number happens to be zero. */
    event.value = 0;
    event.have_value = 1;
    ae_achieve_build_body(&event, body, sizeof body);
    ASSERT_TRUE(strstr(body, "\"value\":0") != 0, "a zero value is sent when declared");

    event.have_value = 0;
    event.value = 120000;
    ae_achieve_build_body(&event, body, sizeof body);
    ASSERT_TRUE(strstr(body, "\"value\"") == 0, "an undeclared value is left out");
}

TEST(an_absent_dimension_is_left_out_rather_than_sent_as_null)
{
    /* The server's `distinct` rules count the values they are given, and a
     * null is a value. */
    ae_achieve_event event = a_game_finished();
    char body[1024];

    ae_achieve_build_body(&event, body, sizeof body);
    ASSERT_TRUE(strstr(body, "null") == 0, "no nulls anywhere");

    event.key = "master";
    event.door = "GMASTER";
    ae_achieve_build_body(&event, body, sizeof body);
    ASSERT_TRUE(strstr(body, "\"key\":\"master\"") != 0, "the key is sent when given");
    ASSERT_TRUE(strstr(body, "\"door\":\"GMASTER\"") != 0, "the door is sent when given");
}

TEST(a_quote_in_a_field_cannot_break_out_of_the_json)
{
    ae_achieve_event event = a_game_finished();
    char body[1024];

    event.key = "he said \"go\"\nthen left";
    ae_achieve_build_body(&event, body, sizeof body);
    ASSERT_TRUE(strstr(body, "\\\"go\\\"") != 0, "the quotes are escaped");
    ASSERT_TRUE(strstr(body, "\\n") != 0, "the newline is escaped");
    ASSERT_TRUE(strstr(body, "\n") == 0, "no raw control byte reaches the wire");
}

TEST(a_missing_required_field_is_refused)
{
    ae_achieve_event event = a_game_finished();
    char body[1024];

    event.email = "";
    ASSERT_EQ(ae_achieve_build_body(&event, body, sizeof body), -1, "an empty email is refused");

    event = a_game_finished();
    event.type = 0;
    ASSERT_EQ(ae_achieve_build_body(&event, body, sizeof body), -1, "a missing type is refused");
}

TEST(a_body_that_would_not_fit_is_refused_rather_than_truncated)
{
    ae_achieve_event event = a_game_finished();
    char body[40];
    ASSERT_EQ(ae_achieve_build_body(&event, body, sizeof body), -1, "too long is -1");
}

/* ------------------------------------------------------------- the request */

static ae_achieve_config config_for(int port)
{
    ae_achieve_config config;
    memset(&config, 0, sizeof config);
    config.host = "127.0.0.1";
    config.port = port;
    config.board_key = "board-key-abc";
    config.timeout_secs = 5;
    return config;
}

/* One JSON body, wrapped in a response whose Content-Length is COUNTED
 * rather than typed: a hand-written length that disagrees with the body is a
 * transport error, and the test would then be measuring my arithmetic. */
static unsigned long reply_with(char *out, const char *status, const char *body)
{
    return (unsigned long)sprintf(out,
        "HTTP/1.1 %s\r\nContent-Type: application/json\r\nContent-Length: %lu\r\n\r\n%s",
        status, (unsigned long)strlen(body), body);
}

static const char OK_BODY[] =
    "{\"accepted\":1,\"duplicates\":0,\"rejected\":[],\"notLinked\":[],"
    "\"unlocks\":[{\"id\":\"first_game\"}],\"progress\":[]}";

TEST(a_report_sends_the_board_key_and_the_json)
{
    unsigned char captured[4096];
    int pid = 0;
    int capture_fd = -1;
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", OK_BODY);
    int port = stub_server_start_capturing((const unsigned char *)reply, reply_len, &pid, &capture_fd);
    ae_achieve_config config = config_for(port);
    ae_achieve_event event = a_game_finished();
    ae_achieve_result result;
    int rc;
    unsigned long got;

    ASSERT_TRUE(port > 0, "the stub server started");
    rc = ae_achieve_report(&config, &event, &result);
    got = stub_server_read_capture(capture_fd, captured, sizeof captured - 1);
    captured[got] = '\0';
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_ACHIEVE_OK, "the report succeeded");
    ASSERT_TRUE(strstr((char *)captured, "POST /achievements/v1/events HTTP/1.1") != 0,
                "it POSTs to the events endpoint");
    ASSERT_TRUE(strstr((char *)captured, "Authorization: Board board-key-abc") != 0,
                "the board key identifies the board");
    ASSERT_TRUE(strstr((char *)captured, "Content-Type: application/json") != 0,
                "the body is declared as JSON");
    ASSERT_TRUE(strstr((char *)captured, "\"ref\":\"gm-42\"") != 0, "the event is in the body");
}

TEST(the_reply_tells_the_door_what_unlocked)
{
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", OK_BODY);
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_achieve_config config = config_for(port);
    ae_achieve_event event = a_game_finished();
    ae_achieve_result result;
    int rc = ae_achieve_report(&config, &event, &result);
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_ACHIEVE_OK, "the report succeeded");
    ASSERT_EQ(result.status, 200, "the status is reported");
    ASSERT_EQ(result.accepted, 1, "one event was accepted");
    ASSERT_EQ(result.duplicates, 0, "nothing was a duplicate");
    ASSERT_EQ(result.unlocked, 1, "one achievement unlocked");
    ASSERT_EQ(result.not_linked, 0, "the player is linked");
}

TEST(a_player_who_has_not_linked_is_named_rather_than_counted_as_accepted)
{
    static const char NOT_LINKED[] =
        "{\"accepted\":0,\"duplicates\":0,\"rejected\":[],"
        "\"notLinked\":[\"spot@example.com\"],\"unlocks\":[],\"progress\":[]}";
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", NOT_LINKED);
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_achieve_config config = config_for(port);
    ae_achieve_event event = a_game_finished();
    ae_achieve_result result;
    int rc = ae_achieve_report(&config, &event, &result);
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_ACHIEVE_OK, "the call itself worked");
    ASSERT_EQ(result.accepted, 0, "nothing was accepted");
    ASSERT_EQ(result.not_linked, 1, "the door is told to ask him to link");
}

TEST(a_non_200_is_an_error_that_still_reports_the_status)
{
    char reply[512];
    unsigned long reply_len = reply_with(reply, "401 Unauthorized", "{\"error\":\"unknown_board\"}");
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_achieve_config config = config_for(port);
    ae_achieve_event event = a_game_finished();
    ae_achieve_result result;
    int rc = ae_achieve_report(&config, &event, &result);
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_ACHIEVE_ERR_STATUS, "a refusal is an error");
    ASSERT_EQ(result.status, 401, "...and the door is told which");
}

TEST(a_200_that_is_not_an_events_response_is_not_reported_as_success)
{
    /* The surface being off, or a proxy answering for it. Reporting "nought
     * accepted" there would look like the server had considered the event. */
    char reply[512];
    unsigned long reply_len = reply_with(reply, "200 OK", "{\"ok\":true,\"n\":1}");
    int pid = 0;
    int port = stub_server_start((const unsigned char *)reply, reply_len, &pid);
    ae_achieve_config config = config_for(port);
    ae_achieve_event event = a_game_finished();
    ae_achieve_result result;
    int rc = ae_achieve_report(&config, &event, &result);
    stub_server_reap(pid);

    ASSERT_EQ(rc, AE_ACHIEVE_ERR_BODY, "a 200 with the wrong shape is refused");
}

TEST(a_server_that_is_not_there_is_a_transport_error_the_door_can_name)
{
    ae_achieve_config config = config_for(stub_closed_port());
    ae_achieve_event event = a_game_finished();
    ae_achieve_result result;
    int rc = ae_achieve_report(&config, &event, &result);

    ASSERT_EQ(rc, AE_ACHIEVE_ERR_TRANSPORT, "a closed port is a transport error");
    ASSERT_TRUE(ae_achieve_last_http_error() != 0, "...and ae_http says why");
}

TEST(a_report_without_a_board_key_never_reaches_the_wire)
{
    ae_achieve_config config = config_for(9);
    ae_achieve_event event = a_game_finished();

    config.board_key = "";
    ASSERT_EQ(ae_achieve_report(&config, &event, 0), AE_ACHIEVE_ERR_ARGS, "an empty key is refused");
    config.board_key = "k";
    config.host = 0;
    ASSERT_EQ(ae_achieve_report(&config, &event, 0), AE_ACHIEVE_ERR_ARGS, "a missing host is refused");
}

int main(void)
{
    printf("\n====== Achievements Client Tests ======\n\n");

    RUN_TEST(the_body_is_one_event_in_an_events_array);
    RUN_TEST(a_number_is_sent_only_when_the_door_says_so);
    RUN_TEST(an_absent_dimension_is_left_out_rather_than_sent_as_null);
    RUN_TEST(a_quote_in_a_field_cannot_break_out_of_the_json);
    RUN_TEST(a_missing_required_field_is_refused);
    RUN_TEST(a_body_that_would_not_fit_is_refused_rather_than_truncated);
    RUN_TEST(a_report_sends_the_board_key_and_the_json);
    RUN_TEST(the_reply_tells_the_door_what_unlocked);
    RUN_TEST(a_player_who_has_not_linked_is_named_rather_than_counted_as_accepted);
    RUN_TEST(a_non_200_is_an_error_that_still_reports_the_status);
    RUN_TEST(a_200_that_is_not_an_events_response_is_not_reported_as_success);
    RUN_TEST(a_server_that_is_not_there_is_a_transport_error_the_door_can_name);
    RUN_TEST(a_report_without_a_board_key_never_reaches_the_wire);

    printf("\n%d run, %d passed, %d failed\n\n", tests_run, tests_passed, tests_failed);
    return tests_failed == 0 ? 0 : 1;
}

/* test_ae_userfield.c - the W door's client for AEW_USERFIELD (10600), against a stand-in board. */
#include "../include/ae_userfield.h"
#include "../include/ae_transport_native.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static char last_request[256];
static const char *next_answer = "";

static int stand_in(void *ctx, int field, const char *request, char *out, int cap)
{
    int n;
    (void)ctx;
    assert(field == AE_FIELD_USERFIELD);
    strncpy(last_request, request, sizeof(last_request) - 1);
    n = (int)strlen(next_answer);
    if (n > cap - 1) n = cap - 1;
    memcpy(out, next_answer, (size_t)n);
    out[n] = '\0';
    return n;
}

static void a_field_row_is_read_in_full(void)
{
    ae_uf_field f;
    next_answer = "E\tGroup\tG\xf6teborg\tT\t29\tGroup: ";
    assert(ae_uf_get(4, &f) == 1);
    assert(strcmp(last_request, "GET 4") == 0);
    assert(f.state == 'E' && f.kind == 'T' && f.maxlen == 29 && f.number == 4);
    assert(strcmp(f.label, "Group") == 0 && strcmp(f.value, "G\xf6teborg") == 0 && strcmp(f.prompt, "Group: ") == 0);
    printf("  [OK] a field row is read in full, latin1 intact\n");
}

static void a_hidden_field_says_so(void)
{
    ae_uf_field f;
    next_answer = "H";
    assert(ae_uf_get(15, &f) == 1 && f.state == 'H');
    printf("  [OK] a hidden field says so\n");
}

static void every_answer_to_a_write_is_told_apart(void)
{
    ae_uf_answer a;
    next_answer = "OK\tG\xf6teborg";
    assert(ae_uf_set(4, "G\xf6teborg", &a) == AE_UF_STORED && strcmp(a.text, "G\xf6teborg") == 0);
    assert(strcmp(last_request, "SET 4 G\xf6teborg") == 0);
    next_answer = "SAME";    assert(ae_uf_set(4, "", &a) == AE_UF_SAME);
    next_answer = "DENIED";  assert(ae_uf_set(4, "x", &a) == AE_UF_DENIED);
    next_answer = "AGAIN";   assert(ae_uf_set(7, "300", &a) == AE_UF_AGAIN);
    next_answer = "NO\t1\tUsername not allowed!!";
    assert(ae_uf_set(0, "NEW", &a) == AE_UF_REFUSED && a.retry == 1 && strcmp(a.text, "Username not allowed!!") == 0);
    next_answer = "";        assert(ae_uf_set(4, "x", &a) == AE_UF_SILENT);
    printf("  [OK] every answer to a write is told apart\n");
}

static void the_password_goes_as_one_request(void)
{
    ae_uf_answer a;
    next_answer = "NO\t0\t\r\nPasswords do not match, changes not saved";
    assert(ae_uf_password("Abc1", "Abc2", &a) == AE_UF_REFUSED && a.retry == 0);
    assert(strcmp(last_request, "PASSWORD Abc1\tAbc2") == 0);
    printf("  [OK] the password goes as one request\n");
}

static void a_door_row_and_the_end_of_the_list(void)
{
    ae_uf_door d;
    next_answer = "NOTIFY\tCommunication\tNotifications\tHow the board reaches you";
    assert(ae_uf_door_at(0, &d) == 1);
    assert(strcmp(d.command, "NOTIFY") == 0 && strcmp(d.section, "Communication") == 0);
    assert(strcmp(d.label, "Notifications") == 0 && strcmp(d.description, "How the board reaches you") == 0);
    next_answer = "";
    assert(ae_uf_door_at(1, &d) == 0);
    printf("  [OK] a door row, and the end of the list\n");
}

static void the_secret_flag_is_asked_on_and_off(void)
{
    next_answer = "OK"; assert(ae_uf_secret(1) == 1); assert(strcmp(last_request, "SECRET 1") == 0);
    next_answer = "OK"; assert(ae_uf_secret(0) == 1); assert(strcmp(last_request, "SECRET 0") == 0);
    next_answer = "";   assert(ae_uf_secret(1) == 0);
    printf("  [OK] the secret flag is asked on and off\n");
}

static void the_resume_row_comes_back_once(void)
{
    next_answer = "OK"; assert(ae_uf_resume_arm(21) == 1); assert(strcmp(last_request, "RESUME 21") == 0);
    next_answer = "21"; assert(ae_uf_resume_take() == 21); assert(strcmp(last_request, "RESUME?") == 0);
    next_answer = "";   assert(ae_uf_resume_take() == -2);
    printf("  [OK] the resume row comes back once\n");
}

static void a_refusal_is_not_silence(void)
{
    /* Controller ruling C2: 0 is a refusal from ae_uf_open, SILENT is its own value. */
    next_answer = "NO";  assert(ae_uf_open() == 0);
    next_answer = "";    assert(ae_uf_open() == AE_UF_SILENT);
    next_answer = "OK";  assert(ae_uf_open() == 1);
    assert(AE_UF_SILENT != 0);
    printf("  [OK] a refused open is not told as a silent board\n");
}

static void a_long_value_is_kept_whole(void)
{
    ae_uf_field f;
    char reply[199];
    int i;
    memset(reply, 'a', sizeof(reply) - 1);
    memcpy(reply, "E\tEmail\t", 8);
    for (i = 8; i < 108; i++) reply[i] = 'x';          /* a 100-char value */
    memcpy(reply + 108, "\tT\t100\tEmail: ", 14);
    reply[108 + 14] = '\0';
    assert(ae_uf_parse_field(2, reply, &f) == 1);
    assert(strlen(f.value) == 100 && f.maxlen == 100 && strcmp(f.prompt, "Email: ") == 0);
    /* a full 198-byte answer: 4 + 189 value + 5 */
    memcpy(reply, "E\tL\t", 4);
    for (i = 4; i < 193; i++) reply[i] = 'y';
    memcpy(reply + 193, "\tT\t9\t", 5);
    reply[198] = '\0';
    assert(strlen(reply) == 198);
    assert(ae_uf_parse_field(2, reply, &f) == 1 && strlen(f.value) == 189 && f.maxlen == 9);
    printf("  [OK] a long value is kept whole\n");
}

static void an_empty_prompt_cycle_row_parses(void)
{
    ae_uf_field f;
    assert(ae_uf_parse_field(9, "E\tScreen clear\tON\tY\t0\t", &f) == 1);
    assert(f.kind == 'Y' && f.maxlen == 0 && strcmp(f.value, "ON") == 0 && f.prompt[0] == '\0');
    printf("  [OK] an empty-prompt cycle row parses\n");
}

int main(void)
{
    printf("ae_userfield\n");
    ae_native_set_exchange(stand_in, 0);
    a_field_row_is_read_in_full();
    a_hidden_field_says_so();
    every_answer_to_a_write_is_told_apart();
    the_password_goes_as_one_request();
    a_door_row_and_the_end_of_the_list();
    the_secret_flag_is_asked_on_and_off();
    the_resume_row_comes_back_once();
    a_refusal_is_not_silence();
    a_long_value_is_kept_whole();
    an_empty_prompt_cycle_row_parses();
    printf("ae_userfield: all passed\n");
    return 0;
}

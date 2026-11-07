/* test_chat.c - ae_chat (the /chat/v1 client) and the LIVECHAT68 door, against a routed stub server.
 *
 * Three layers: the config parser and the client calls are checked directly; the door's real main() is
 * then driven with scripted keys, and what it did is read off the stub's POST counters (the reachability
 * proof: a count that moves only if the door's code reached the wire) and off the rendered screen. */
#define main livechat_main
#define LIVECHAT_CFG_PATH "build/test_chat.cfg"
#include "../examples/livechat/livechat.c"
#undef main
#include "../include/ae_transport_native.h"
#include "stub_server.h"
#include <assert.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>

int ae_field_write(int field, const char *value) { (void)field; (void)value; return 0; }
int ae_query_bit(int acs) { (void)acs; return 1; }
int ae_field_read(int field, char *out, int cap)
{
    const char *text = field == AE_FIELD_USER_LEVEL ? "255" : "Tester";
    int n = (int)strlen(text);
    if (cap <= 0) return 0;
    if (n > cap - 1) n = cap - 1;
    memcpy(out, text, (size_t)n); out[n] = '\0';
    return n;
}

static int board(void *ctx, int field, const char *request, char *out, int cap)
{
    (void)ctx; (void)cap;
    out[0] = '\0';
    if (field == AE_FIELD_SCREEN && strcmp(request, "SIZE") == 0) { strcpy(out, "80\t25"); return 4; }
    return 0;
}

static char screen_text[262144];
static stub_chat_stats *st;
static int stub_pid, stub_port;

static void start_stub(void)
{
    FILE *f;
    stub_port = stub_chat_start(&st, &stub_pid);
    assert(stub_port > 0);
    f = fopen("build/test_chat.cfg", "w");
    assert(f);
    fprintf(f, "# test\nHost=127.0.0.1\nPort=%d\nBoardKey=boardA.secret\nTimeout=5\n", stub_port);
    fclose(f);
}

static void stop_stub(void) { stub_chat_stop(stub_pid); remove("build/test_chat.cfg"); }

/* Runs the door's main with `keys` on stdin (all at once, or via a slow feeder when `slow`). */
static int drive(const char *keys, size_t n, int slow)
{
    char *argv[] = { (char *)"livechat", (char *)"1", 0 };
    int saved_out = dup(1), saved_in = dup(0), rc, fds[2];
    pid_t feeder = 0;
    size_t got;
    FILE *f;
    fflush(stdout);
    {
        int out = open("build/test_chat_screen.bin", O_WRONLY | O_CREAT | O_TRUNC, 0644);
        assert(out >= 0);
        dup2(out, 1); close(out);
    }
    if (slow) {
        assert(pipe(fds) == 0);
        feeder = fork();
        assert(feeder >= 0);
        if (feeder == 0) {
            size_t i;
            close(fds[0]);
            for (i = 0; i < n; i++) {
                (void)!write(fds[1], keys + i, 1);
                if (keys[i] == '\r') usleep(400000);
            }
            close(fds[1]);
            _exit(0);
        }
        close(fds[1]);
        dup2(fds[0], 0); close(fds[0]);
        clearerr(stdin);
    } else {
        f = fopen("build/test_chat_keys.bin", "wb"); assert(f);
        fwrite(keys, 1, n, f); fclose(f);
        {
            int in = open("build/test_chat_keys.bin", O_RDONLY);
            assert(in >= 0);
            dup2(in, 0); close(in);
            clearerr(stdin);
        }
    }
    rc = livechat_main(2, argv);
    fflush(stdout);
    dup2(saved_out, 1); close(saved_out);
    dup2(saved_in, 0); close(saved_in);
    clearerr(stdout); clearerr(stdin);
    if (feeder > 0) waitpid(feeder, 0, 0);
    f = fopen("build/test_chat_screen.bin", "rb"); assert(f);
    got = fread(screen_text, 1, sizeof screen_text - 1, f); screen_text[got] = '\0'; fclose(f);
    return rc;
}

#define KEYS(s) s, sizeof(s) - 1

static void test_config(void)
{
    ae_chat_config cfg;
    assert(ae_chat_config_parse(&cfg, "# c\nHost=doors.uprough.net\nPort=8080\nBoardKey=a.b\n; x\nTimeout=7\n") == 1);
    assert(strcmp(cfg.host, "doors.uprough.net") == 0 && cfg.port == 8080 && strcmp(cfg.board_key, "a.b") == 0 && cfg.timeout_secs == 7);
    assert(ae_chat_config_parse(&cfg, "Host=x\n") == 0);
    assert(cfg.port == 80 && cfg.timeout_secs == AE_CHAT_DEFAULT_TIMEOUT);
    assert(ae_chat_config_load(&cfg, "build/no-such-file.cfg") == 0);
    printf("  [OK] config parser: keys, comments, defaults, missing file\n");
}

static void test_client(void)
{
    ae_chat c;
    ae_chat_config cfg;
    char name[48], topic[80], tid[32], *f[AE_CHAT_ROW_FIELDS];
    int members = 0, count = 0, n;
    FILE *cf;
    start_stub();
    assert(ae_chat_config_load(&cfg, "build/test_chat.cfg") == 1);
    assert(ae_chat_open(&c, &cfg, "Tester", 1) == AE_CHAT_OK && st->sessions == 1 && strcmp(c.sid, "sid0123456789") == 0);

    assert(ae_chat_rooms(&c) == AE_CHAT_OK);
    n = ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS);
    assert(n >= 6 && strcmp(f[0], "lobby") == 0 && strcmp(f[3], "public") == 0 && atoi(f[4]) == 3);
    assert(ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS) >= 6 && strcmp(f[0], "secret") == 0);
    assert(ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS) == 0);

    assert(ae_chat_join(&c, "lobby", name, sizeof name, topic, sizeof topic, &members) == AE_CHAT_OK);
    assert(strcmp(name, "Lobby") == 0 && strcmp(topic, "Hello all") == 0 && members == 3 && c.last_seq == 5);
    assert(ae_chat_join(&c, "nosuch", name, sizeof name, topic, sizeof topic, &members) == AE_CHAT_ERR_STATUS);
    assert(strcmp(c.error, "not_found") == 0);

    assert(ae_chat_history(&c, "lobby", 0, 20) == AE_CHAT_OK);
    assert(ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS) == 8 && strcmp(f[7], "hello there|bar") == 0);   /* '!' is a pipe */

    assert(ae_chat_send(&c, "lobby", "hi", 0, 0) == AE_CHAT_OK && strcmp(st->last_message, "hi") == 0);
    assert(ae_chat_poll(&c, 0) == AE_CHAT_OK);
    assert(ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS) == 8 && strcmp(f[3], "carol") == 0 && c.last_seq == 8);
    assert(ae_chat_react(&c, "m1", "+1", &count) == AE_CHAT_OK && count == 2 && strcmp(st->last_react, "+1") == 0);
    assert(ae_chat_thread(&c, "m1", "reply") == AE_CHAT_OK && st->threads == 1);
    assert(ae_chat_dm(&c, "bob", "psst", tid, sizeof tid) == AE_CHAT_OK && strcmp(tid, "th1") == 0 && strcmp(st->last_dm_peer, "bob") == 0);
    assert(ae_chat_dm_list(&c) == AE_CHAT_OK && ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS) >= 4 && strcmp(f[1], "alice") == 0);
    assert(ae_chat_who(&c) == AE_CHAT_OK && ae_chat_next_row(&c, f, AE_CHAT_ROW_FIELDS) >= 5 && strcmp(f[0], "alice") == 0);

    st->expire_next = 1;                                     /* the session died: one silent re-open, the call still lands */
    assert(ae_chat_send(&c, "lobby", "again", 0, 0) == AE_CHAT_OK && st->sessions == 2 && st->messages == 2);
    assert(st->bad_auth == 0 && st->bad_session == 0);

    assert(ae_chat_close(&c) == AE_CHAT_OK && st->session_closes == 1);
    stop_stub();
    cf = fopen("build/test_chat.cfg", "r");
    assert(cf == 0);
    printf("  [OK] client: every call reaches its route, rows unescape, an expired session re-opens, auth on every request\n");
}

static void test_door_keys(void)
{
    int rc;
    start_stub();
    rc = drive(KEYS("\r" "hello world\r" "/r 2 +1\r" "/t 1 thread text\r" "/d bob hi bob\r" "/?\r" "x" "/q\r"), 0);
    assert(rc == 0);
    assert(st->sessions == 1 && st->rooms_listed >= 1 && st->joins == 1 && st->histories == 1);
    assert(st->messages == 1 && strcmp(st->last_message, "hello world") == 0);
    assert(st->reacts == 1 && strcmp(st->last_react, "+1") == 0);
    assert(st->threads == 1);
    assert(st->dms == 1 && strcmp(st->last_dm_peer, "bob") == 0 && strcmp(st->last_dm_text, "hi bob") == 0);
    assert(st->leaves == 1 && st->session_closes == 1);
    assert(st->bad_auth == 0 && st->bad_session == 0);
    assert(strstr(screen_text, "LIVECHAT - #Lobby"));
    assert(strstr(screen_text, "alice: ") && strstr(screen_text, "hello there|bar"));          /* history, '!' unescaped */
    assert(strstr(screen_text, "Tester: "));                                                   /* own line arrived via the post-send poll */
    assert(strstr(screen_text, "carol: ") && strstr(screen_text, "from idle poll"));
    assert(strstr(screen_text, "react to message n") || strstr(screen_text, "/r n emoji"));    /* help screen */
    assert(!strstr(screen_text, "\x1b[40m"));                                                  /* never paints background 40 */
    stop_stub();
    printf("  [OK] door: join, send, react, thread, direct message, help and quit reach the server and the screen\n");
}

static void test_door_lists(void)
{
    int rc;
    start_stub();
    rc = drive(KEYS("w" "q" "d" "\r"), 0);
    assert(rc == 0 && st->whos == 1 && st->dm_lists == 1);
    assert(strstr(screen_text, "WHO IS ON") && strstr(screen_text, "bob") && strstr(screen_text, "sysop"));
    assert(strstr(screen_text, "DIRECT MESSAGES") && strstr(screen_text, "alice"));
    assert(strstr(screen_text, "private hello"));                                              /* Enter opened the DM thread */
    stop_stub();
    printf("  [OK] door: who and direct-message lists load; Enter opens a DM thread\n");
}

static void test_door_idle_poll(void)
{
    int rc;
    start_stub();
    poll_steps = 2;
    rc = drive(KEYS("\r" "/q\r"), 1);                       /* a quiet second after joining: only idle polling can fetch carol */
    assert(rc == 0 && st->events >= 1 && st->messages == 0);
    assert(strstr(screen_text, "carol: ") && strstr(screen_text, "from idle poll"));
    poll_steps = POLL_STEPS_DEFAULT;
    stop_stub();
    printf("  [OK] door: idle polling shows a message nobody sent from here\n");
}

/* Regression (2026-11-07 mirror run): the rooms view had no way to make a room, so an empty list was a
 * dead end; and /n joined by the typed NAME while the server joins by id, so a new room never opened. */
static void test_door_new_room(void)
{
    int rc;
    start_stub();
    rc = drive(KEYS("n" "My Room\r" "/l\r" "q"), 0);
    assert(rc == 0 && st->rooms_created == 1 && strcmp(st->last_created, "My Room") == 0);
    assert(st->joins == 1 && strcmp(st->last_join, "newroom") == 0);    /* joined by the id the create reply gave */
    assert(strstr(screen_text, "New public room: ") && strstr(screen_text, "N new room"));
    stop_stub();
    start_stub();
    rc = drive(KEYS("\r" "/n Second Room\r" "/q\r"), 0);
    assert(rc == 0 && st->rooms_created == 1 && strcmp(st->last_created, "Second Room") == 0);
    assert(st->joins == 2 && strcmp(st->last_join, "newroom") == 0);
    stop_stub();
    printf("  [OK] door: N in the rooms view and /n in a room make a room and join it by its new id\n");
}

static void test_door_no_config(void)
{
    int rc = drive(KEYS("x"), 0);
    assert(rc == 0 && strstr(screen_text, "no LIVECHAT.cfg"));
    printf("  [OK] door: no config says so and leaves\n");
}

int main(void)
{
    ae_native_set_exchange(board, 0);
    test_config();
    test_client();
    test_door_keys();
    test_door_lists();
    test_door_idle_poll();
    test_door_new_room();
    test_door_no_config();
    remove("build/test_chat_keys.bin"); remove("build/test_chat_screen.bin");
    puts("test_chat: OK");
    return 0;
}

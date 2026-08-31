/* test_dirlist.c - the directory primitive (dirlist.h), native side.
 *
 * The Amiga branch cannot be exercised here (it needs dos.library), so what
 * is pinned is the CONTRACT both branches must satisfy - the part that a
 * caller depends on and that the two implementations could disagree about:
 *
 *   - "." and ".." never reach the callback, on either platform;
 *   - an empty directory is 0 and a missing one is -1, because install
 *     verification has to tell "unpacked nothing" from "did not unpack";
 *   - a directory reports size 0, since only one of the two platforms has a
 *     meaningful size for one;
 *   - returning non-zero from the callback stops the walk, and the entry
 *     that stopped it is still counted.
 *
 * Builds its own tree under a temp directory rather than shipping fixtures:
 * the thing under test is reading a real filesystem.
 */

#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>

#include "../dirlist.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define RUN_TEST(name) do { printf("%-58s ", #name); fflush(stdout); test_##name(); } while(0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((long)(got) == (long)(expected)) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long)(got), (long)(expected)); } \
    tests_run++; \
} while(0)
#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s\n", msg); } \
    tests_run++; \
} while(0)

#define ROOT "build-test-dirlist-tree"

/* ---- collector ------------------------------------------------------- */

#define MAX_SEEN 16

typedef struct {
    char names[MAX_SEEN][64];
    unsigned long sizes[MAX_SEEN];
    int dirs[MAX_SEEN];
    int count;
    int stop_after;   /* 0 = never stop */
} collector;

static int collect(void *ctx, const char *name, unsigned long size, int is_dir)
{
    collector *c = (collector *) ctx;

    if (c->count < MAX_SEEN) {
        strncpy(c->names[c->count], name, sizeof(c->names[0]) - 1);
        c->names[c->count][sizeof(c->names[0]) - 1] = '\0';
        c->sizes[c->count] = size;
        c->dirs[c->count] = is_dir;
        c->count++;
    }

    if (c->stop_after != 0 && c->count >= c->stop_after) {
        return 1;
    }
    return 0;
}

static int saw(const collector *c, const char *name)
{
    int i;
    for (i = 0; i < c->count; i++) {
        if (strcmp(c->names[i], name) == 0) {
            return 1;
        }
    }
    return 0;
}

static int index_of(const collector *c, const char *name)
{
    int i;
    for (i = 0; i < c->count; i++) {
        if (strcmp(c->names[i], name) == 0) {
            return i;
        }
    }
    return -1;
}

/* ---- fixture --------------------------------------------------------- */

static void write_file(const char *path, const char *contents)
{
    FILE *f = fopen(path, "wb");
    if (f != (FILE *) 0) {
        fputs(contents, f);
        fclose(f);
    }
}

static void build_tree(void)
{
    mkdir(ROOT, 0755);
    write_file(ROOT "/aehelp", "binary");        /* 6 bytes */
    write_file(ROOT "/readme.txt", "hello");     /* 5 bytes */
    mkdir(ROOT "/docs", 0755);
    write_file(ROOT "/docs/guide.txt", "x");
    mkdir(ROOT "/empty", 0755);
}

static void destroy_tree(void)
{
    unlink(ROOT "/docs/guide.txt");
    rmdir(ROOT "/docs");
    rmdir(ROOT "/empty");
    unlink(ROOT "/aehelp");
    unlink(ROOT "/readme.txt");
    rmdir(ROOT);
}

/* ---- tests ----------------------------------------------------------- */

void test_lists_every_child_once(void)
{
    collector c;
    long n;

    memset(&c, 0, sizeof(c));
    n = dirlist_scan(ROOT, collect, &c);

    ASSERT_EQ(n, 4, "four children");
    ASSERT_TRUE(saw(&c, "aehelp") && saw(&c, "readme.txt")
                && saw(&c, "docs") && saw(&c, "empty"),
                "all four names reported");
}

void test_never_yields_dot_or_dotdot(void)
{
    collector c;

    memset(&c, 0, sizeof(c));
    dirlist_scan(ROOT, collect, &c);

    ASSERT_TRUE(!saw(&c, ".") && !saw(&c, ".."), "neither . nor .. reported");
}

void test_does_not_recurse(void)
{
    collector c;

    memset(&c, 0, sizeof(c));
    dirlist_scan(ROOT, collect, &c);

    /* guide.txt lives one level down; a recursing walk would report it. */
    ASSERT_TRUE(!saw(&c, "guide.txt"), "child of a subdirectory not reported");
}

void test_reports_file_size_and_directory_flag(void)
{
    collector c;
    int i;

    memset(&c, 0, sizeof(c));
    dirlist_scan(ROOT, collect, &c);

    i = index_of(&c, "aehelp");
    ASSERT_TRUE(i >= 0 && c.sizes[i] == 6UL && c.dirs[i] == 0, "aehelp is a 6-byte file");

    i = index_of(&c, "docs");
    ASSERT_TRUE(i >= 0 && c.dirs[i] == 1, "docs is flagged a directory");
}

void test_directory_size_is_zero(void)
{
    collector c;
    int i;

    memset(&c, 0, sizeof(c));
    dirlist_scan(ROOT, collect, &c);

    /* Only one of the two platforms has a meaningful size for a directory,
     * so the contract is that neither reports one. */
    i = index_of(&c, "docs");
    ASSERT_TRUE(i >= 0 && c.sizes[i] == 0UL, "a directory reports size 0");
}

void test_empty_directory_is_zero_not_failure(void)
{
    collector c;
    long n;

    memset(&c, 0, sizeof(c));
    n = dirlist_scan(ROOT "/empty", collect, &c);

    ASSERT_EQ(n, 0, "empty directory returns 0");
    ASSERT_EQ(c.count, 0, "callback never fired");
}

void test_missing_directory_is_minus_one(void)
{
    collector c;
    long n;

    memset(&c, 0, sizeof(c));
    n = dirlist_scan(ROOT "/nosuchdir", collect, &c);

    /* The distinction install verification depends on: an archive that
     * unpacked nothing leaves an EMPTY directory, not a missing one. */
    ASSERT_EQ(n, -1, "missing directory returns -1");
}

void test_a_plain_file_is_not_a_directory(void)
{
    collector c;
    long n;

    memset(&c, 0, sizeof(c));
    n = dirlist_scan(ROOT "/aehelp", collect, &c);

    ASSERT_EQ(n, -1, "scanning a file returns -1");
}

void test_callback_can_stop_the_walk(void)
{
    collector c;
    long n;

    memset(&c, 0, sizeof(c));
    c.stop_after = 2;
    n = dirlist_scan(ROOT, collect, &c);

    ASSERT_EQ(c.count, 2, "callback saw exactly two entries");
    ASSERT_EQ(n, 2, "the entry that stopped the walk is counted");
}

void test_null_arguments_are_refused(void)
{
    collector c;

    memset(&c, 0, sizeof(c));
    ASSERT_EQ(dirlist_scan((const char *) 0, collect, &c), -1, "NULL path");
    ASSERT_EQ(dirlist_scan(ROOT, (dirlist_cb) 0, &c), -1, "NULL callback");
}

int main(void)
{
    printf("\n=== dirlist tests ===\n\n");

    build_tree();

    RUN_TEST(lists_every_child_once);
    RUN_TEST(never_yields_dot_or_dotdot);
    RUN_TEST(does_not_recurse);
    RUN_TEST(reports_file_size_and_directory_flag);
    RUN_TEST(directory_size_is_zero);
    RUN_TEST(empty_directory_is_zero_not_failure);
    RUN_TEST(missing_directory_is_minus_one);
    RUN_TEST(a_plain_file_is_not_a_directory);
    RUN_TEST(callback_can_stop_the_walk);
    RUN_TEST(null_arguments_are_refused);

    destroy_tree();

    printf("\n====== Results ======\n");
    printf("Passed: %d/%d\n", tests_passed, tests_run);
    printf("Failed: %d/%d\n", tests_failed, tests_run);

    return tests_failed == 0 ? 0 : 1;
}

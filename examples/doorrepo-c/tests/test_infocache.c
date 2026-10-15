/* test_infocache.c - the info pane's LRU (infocache.h).
 *
 * The behaviours pinned here are the ones the browser's responsiveness
 * depends on: a revisit must not refetch, a 404 must be remembered as
 * firmly as a hit (most catalog rows have no DIZ, so if absence were
 * uncached the commonest case would stay slow), and eviction must drop the
 * least recently USED entry rather than the least recently added - moving
 * the cursor down and back up is precisely the access pattern that tells
 * those two apart.
 */

#include <stdio.h>
#include <string.h>
#include "../infocache.h"

static int tests_run = 0;
static int tests_passed = 0;
static int tests_failed = 0;

#define TEST(name) void test_##name(void)
#define RUN_TEST(name) do { printf("%-55s ", #name); fflush(stdout); test_##name(); } while(0)
#define ASSERT_EQ(got, expected, msg) do { \
    if ((long)(got) == (long)(expected)) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s (got %ld, expected %ld)\n", msg, (long)(got), (long)(expected)); } \
    tests_run++; \
} while(0)
#define ASSERT_STR_EQ(got, expected, msg) do { \
    if (strcmp((got), (expected)) == 0) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s (got '%s', expected '%s')\n", msg, got, expected); } \
    tests_run++; \
} while(0)
#define ASSERT_TRUE(cond, msg) do { \
    if (cond) { tests_passed++; printf("[OK]\n"); } \
    else { tests_failed++; printf("[FAIL] %s\n", msg); } \
    tests_run++; \
} while(0)

#define SLOTS 3
#define ENTRY 32

static info_cache cache;
static info_cache_slot slots[SLOTS];
static char slab[SLOTS * (ENTRY + 1)];

static void fresh(void)
{
    info_cache_init(&cache, slots, slab, SLOTS, ENTRY);
}

/* Fills `key` with `text` the way the door's loaders do. */
static int store(const char *key, const char *text, int present)
{
    unsigned long cap = 0;
    int slot = info_cache_reserve(&cache, key, &cap);
    if (slot >= 0) {
        strcpy(info_cache_buffer(&cache, slot), text);
        info_cache_commit(&cache, slot, (unsigned long) strlen(text), present);
    }
    return slot;
}

TEST(a_fresh_cache_holds_nothing)
{
    fresh();
    ASSERT_EQ(info_cache_find(&cache, "A.LHA"), -1, "nothing is cached yet");
}

TEST(a_stored_entry_is_found_again_with_its_text)
{
    int slot;
    fresh();
    store("A.LHA", "art for A", 1);
    slot = info_cache_find(&cache, "A.LHA");
    ASSERT_TRUE(slot >= 0, "stored entry is a hit");
    ASSERT_STR_EQ(info_cache_buffer(&cache, slot), "art for A", "text survives");
    ASSERT_EQ(cache.slots[slot].present, 1, "recorded as present");
}

TEST(an_absent_entry_is_cached_as_firmly_as_a_hit)
{
    int slot;
    fresh();
    store("NODIZ.LHA", "", 0);
    slot = info_cache_find(&cache, "NODIZ.LHA");
    /* The point: a 404 must be a HIT with present=0, not a miss. A miss
     * would send the door back to the server for every archive that has no
     * DIZ, which is most of them. */
    ASSERT_TRUE(slot >= 0, "a known-absent entry is still cached");
    ASSERT_EQ(cache.slots[slot].present, 0, "recorded as absent");
}

TEST(distinct_keys_occupy_distinct_slots)
{
    fresh();
    ASSERT_TRUE(store("A.LHA", "a", 1) != store("B.LHA", "b", 1), "no collision");
    ASSERT_STR_EQ(info_cache_buffer(&cache, info_cache_find(&cache, "A.LHA")), "a", "A intact");
    ASSERT_STR_EQ(info_cache_buffer(&cache, info_cache_find(&cache, "B.LHA")), "b", "B intact");
}

TEST(eviction_drops_the_least_recently_used_not_the_oldest)
{
    fresh();
    store("A.LHA", "a", 1);
    store("B.LHA", "b", 1);
    store("C.LHA", "c", 1);

    /* Touch A, so B is now the least recently used even though A is the
     * oldest. This is the cursor-down-then-back-up pattern. */
    ASSERT_TRUE(info_cache_find(&cache, "A.LHA") >= 0, "A is still cached");

    store("D.LHA", "d", 1);

    ASSERT_TRUE(info_cache_find(&cache, "B.LHA") < 0, "B was evicted as least recently used");
    ASSERT_TRUE(info_cache_find(&cache, "A.LHA") >= 0, "A survived because it was touched");
    ASSERT_TRUE(info_cache_find(&cache, "C.LHA") >= 0, "C survived");
    ASSERT_TRUE(info_cache_find(&cache, "D.LHA") >= 0, "D is cached");
}

TEST(refetching_the_same_key_reuses_its_slot)
{
    int first;
    int second;
    fresh();
    first = store("A.LHA", "old", 1);
    second = store("A.LHA", "new", 1);
    ASSERT_EQ(second, first, "same key does not consume a second slot");
    ASSERT_STR_EQ(info_cache_buffer(&cache, second), "new", "content replaced");
}

TEST(commit_clamps_a_length_past_the_slot_size)
{
    int slot;
    fresh();
    slot = store("A.LHA", "short", 1);
    info_cache_commit(&cache, slot, ENTRY + 999, 1);
    ASSERT_EQ(cache.slots[slot].len, (unsigned long) ENTRY, "length clamped to the slot");
}

TEST(a_key_longer_than_the_field_is_truncated_not_overrun)
{
    char big[INFO_CACHE_KEY_MAX + 40];
    int slot;
    fresh();
    memset(big, 'X', sizeof(big) - 1);
    big[sizeof(big) - 1] = '\0';
    slot = store(big, "x", 1);
    ASSERT_TRUE(slot >= 0, "still reserves a slot");
    ASSERT_EQ((long) strlen(cache.slots[slot].key), (long) (INFO_CACHE_KEY_MAX - 1), "key truncated, NUL kept");
}

TEST(out_of_range_slots_are_refused)
{
    fresh();
    ASSERT_TRUE(info_cache_buffer(&cache, -1) == (char *) 0, "negative index");
    ASSERT_TRUE(info_cache_buffer(&cache, SLOTS) == (char *) 0, "past the end");
}

TEST(null_arguments_do_not_crash)
{
    fresh();
    ASSERT_EQ(info_cache_find(&cache, (const char *) 0), -1, "NULL key is a miss");
    ASSERT_EQ(info_cache_find((info_cache *) 0, "A"), -1, "NULL cache is a miss");
    ASSERT_EQ(info_cache_reserve((info_cache *) 0, "A", (unsigned long *) 0), -1, "NULL cache reserves nothing");
}

int main(void)
{
    printf("\n=== infocache tests ===\n\n");
    RUN_TEST(a_fresh_cache_holds_nothing);
    RUN_TEST(a_stored_entry_is_found_again_with_its_text);
    RUN_TEST(an_absent_entry_is_cached_as_firmly_as_a_hit);
    RUN_TEST(distinct_keys_occupy_distinct_slots);
    RUN_TEST(eviction_drops_the_least_recently_used_not_the_oldest);
    RUN_TEST(refetching_the_same_key_reuses_its_slot);
    RUN_TEST(commit_clamps_a_length_past_the_slot_size);
    RUN_TEST(a_key_longer_than_the_field_is_truncated_not_overrun);
    RUN_TEST(out_of_range_slots_are_refused);
    RUN_TEST(null_arguments_do_not_crash);
    printf("\nPassed: %d/%d\nFailed: %d/%d\n", tests_passed, tests_run, tests_failed, tests_run);
    if (tests_failed == 0) { printf("ALL TESTS PASSED\n"); return 0; }
    return 1;
}

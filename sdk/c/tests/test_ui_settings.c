/*
 * A C door reads the settings its TypeScript twin reads.
 *
 * The files are the TypeScript's own names - door.settings.json marks the
 * root, settings.json holds the sysop's answers (sdk/core/settings.ts) - so
 * the test builds a real door directory on disk and reads it the way a door
 * would.
 */

#include "../include/ui_settings.h"

#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* getpid: the test needs a directory of its own, and C89 has no mkdtemp. */
#include <sys/types.h>
#include <unistd.h>

static char door[512];
static char dist[600];

static void write_file(const char *dir, const char *name, const char *text)
{
    char path[700];
    FILE *f;

    sprintf(path, "%s/%s", dir, name);
    f = fopen(path, "wb");
    assert(f != 0);
    fputs(text, f);
    fclose(f);
}

/** A door directory with a dist/ inside it, the shape a compiled door has. */
static void make_door(const char *values)
{
    char cmd[900];

    sprintf(door, "/tmp/ui-settings-test-%d", (int) getpid());
    sprintf(dist, "%s/dist", door);
    sprintf(cmd, "rm -rf %s && mkdir -p %s", door, dist);
    assert(system(cmd) == 0);

    write_file(door, "door.settings.json", "{\"settings\":[]}");
    if (values) write_file(door, "settings.json", values);
}

static void clean_up(void)
{
    char cmd[700];
    sprintf(cmd, "rm -rf %s", door);
    (void) system(cmd);
}

static void it_finds_the_door_from_its_dist(void)
{
    char found[512];

    make_door("{}");
    /* A compiled door is started from dist/, and its settings are one level
       up - the same walk resolveDoorRoot() does on the TypeScript side. */
    assert(ui_door_dir(dist, found, (int) sizeof(found)) > 0);
    assert(strcmp(found, door) == 0);

    assert(ui_door_dir(door, found, (int) sizeof(found)) > 0);
    assert(strcmp(found, door) == 0);
    clean_up();
    printf("  [OK] it finds the door's root from the door or its dist\n");
}

static void a_directory_that_is_not_a_door_answers_itself(void)
{
    char found[512];

    /* Better than a guess at a path that has never existed. */
    assert(ui_door_dir("/tmp", found, (int) sizeof(found)) > 0);
    assert(strcmp(found, "/tmp") == 0);
    printf("  [OK] a directory that is not a door answers itself\n");
}

static void it_reads_what_the_sysop_set(void)
{
    char text[64];

    make_door("{\"greeting\":\"hello sysop\",\"rows\":12,\"loud\":true}");

    assert(ui_setting_str(door, "greeting", "none", text, (int) sizeof(text)) == 1);
    assert(strcmp(text, "hello sysop") == 0);
    assert(ui_setting_int(door, "rows", 25) == 12);
    assert(ui_setting_bool(door, "loud", 0) == 1);
    clean_up();
    printf("  [OK] it reads what the sysop set\n");
}

static void a_missing_key_takes_the_doors_own_default(void)
{
    char text[64];

    make_door("{\"greeting\":\"hi\"}");

    assert(ui_setting_str(door, "absent", "fallback", text, (int) sizeof(text)) == 0);
    assert(strcmp(text, "fallback") == 0);
    assert(ui_setting_int(door, "absent", 42) == 42);
    assert(ui_setting_bool(door, "absent", 1) == 1);
    clean_up();
    printf("  [OK] a missing key takes the door's own default\n");
}

static void a_door_with_no_settings_file_still_runs(void)
{
    char text[64];

    make_door(0);                      /* declared settings, none answered */

    assert(ui_setting_str(door, "greeting", "default", text, (int) sizeof(text)) == 0);
    assert(strcmp(text, "default") == 0);
    assert(ui_setting_int(door, "rows", 25) == 25);
    clean_up();
    printf("  [OK] a door with no settings file still runs\n");
}

static void a_value_that_is_not_a_number_is_not_zero(void)
{
    make_door("{\"rows\":\"lots\"}");

    /* 0 is a real setting, so a garbled file must not look like one. */
    assert(ui_setting_int(door, "rows", 25) == 25);
    clean_up();
    printf("  [OK] a value that is not a number falls back rather than reading 0\n");
}

static void a_boolean_written_as_text_is_still_a_boolean(void)
{
    make_door("{\"loud\":\"true\",\"quiet\":\"false\"}");

    /* A sysop who typed true into a string field meant true. */
    assert(ui_setting_bool(door, "loud", 0) == 1);
    assert(ui_setting_bool(door, "quiet", 1) == 0);
    clean_up();
    printf("  [OK] a boolean written as text is still a boolean\n");
}

static void a_value_too_long_for_the_caller_is_an_error_not_a_truncation(void)
{
    char small[8];

    make_door("{\"greeting\":\"a very long greeting indeed\"}");
    /* Truncating a path or a URL silently is how a door ends up asking for
       something that does not exist. */
    assert(ui_setting_str(door, "greeting", "", small, (int) sizeof(small)) <= 0);
    clean_up();
    printf("  [OK] a value too long for the caller is an error, not a truncation\n");
}

int main(void)
{
    printf("ui_settings\n");
    it_finds_the_door_from_its_dist();
    a_directory_that_is_not_a_door_answers_itself();
    it_reads_what_the_sysop_set();
    a_missing_key_takes_the_doors_own_default();
    a_door_with_no_settings_file_still_runs();
    a_value_that_is_not_a_number_is_not_zero();
    a_boolean_written_as_text_is_still_a_boolean();
    a_value_too_long_for_the_caller_is_an_error_not_a_truncation();
    printf("ui_settings: all passed\n");
    return 0;
}

/*
 * ui_settings - see ui_settings.h.
 *
 * Deliberately small: find the door's directory, read one file into a
 * bounded buffer, and ask json_lite for one key. A door calls these a
 * handful of times at startup, so re-reading the file per key costs nothing
 * worth caching and keeps the module free of state that could go stale while
 * the sysop edits the file.
 */

#include "ui_settings.h"
#include "json_lite.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/** The biggest settings file this will read. A door's is a few hundred bytes. */
#define UI_SETTINGS_MAX 8192

static int join_path(char *out, int cap, const char *dir, const char *name)
{
    int len;

    if (!out || cap <= 0 || !dir || !name) return -1;
    len = (int) strlen(dir) + 1 + (int) strlen(name);
    if (len + 1 > cap) return -1;

    strcpy(out, dir);
    /* One separator, whether or not the caller's directory ended with one. */
    if (*dir && dir[strlen(dir) - 1] != '/') strcat(out, "/");
    strcat(out, name);
    return (int) strlen(out);
}

static int file_exists(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (!f) return 0;
    fclose(f);
    return 1;
}

int ui_door_dir(const char *start, char *out, int cap)
{
    char dir[512];
    char probe[600];
    int depth;

    if (!out || cap <= 0) return -1;
    out[0] = '\0';
    if (!start || !*start) return -1;
    if ((int) strlen(start) + 1 > (int) sizeof(dir)) return -1;

    strcpy(dir, start);

    for (depth = 0; depth <= UI_DOOR_ROOT_DEPTH; depth++) {
        char *slash;

        if (join_path(probe, (int) sizeof(probe), dir, UI_SETTINGS_MANIFEST) > 0
            && file_exists(probe)) {
            if ((int) strlen(dir) + 1 > cap) return -1;
            strcpy(out, dir);
            return (int) strlen(out);
        }

        slash = strrchr(dir, '/');
        if (!slash || slash == dir) break;
        *slash = '\0';
    }

    /* Nothing found: the directory asked about, unchanged. A guess at a path
       that has never existed is worse than the caller's own answer. */
    if ((int) strlen(start) + 1 > cap) return -1;
    strcpy(out, start);
    return (int) strlen(out);
}

/** The values file, whole. Returns 1 when it was read. */
static int read_values(const char *door_dir, char *buf, int cap)
{
    char path[600];
    FILE *f;
    size_t got;

    if (!door_dir || !buf || cap <= 1) return 0;
    buf[0] = '\0';

    if (join_path(path, (int) sizeof(path), door_dir, UI_SETTINGS_VALUES) <= 0) return 0;
    f = fopen(path, "rb");
    if (!f) return 0;

    got = fread(buf, 1, (size_t) cap - 1, f);
    fclose(f);
    buf[got] = '\0';
    return got > 0 ? 1 : 0;
}

int ui_setting_str(const char *door_dir, const char *key,
                   const char *fallback, char *out, int cap)
{
    char json[UI_SETTINGS_MAX];

    if (!out || cap <= 0) return -1;
    out[0] = '\0';
    if (!fallback) fallback = "";

    /* json_lite returns 0 for SUCCESS - the opposite of the convention the
       rest of this SDK uses, and worth naming here rather than getting
       backwards twice. */
    if (key && read_values(door_dir, json, (int) sizeof(json))
        && json_extract_string(json, key, out, (unsigned long) cap) == 0
        && out[0] != '\0') {
        return 1;
    }
    out[0] = '\0';

    if ((int) strlen(fallback) + 1 > cap) { out[0] = '\0'; return -1; }
    strcpy(out, fallback);
    return 0;
}

int ui_setting_int(const char *door_dir, const char *key, int fallback)
{
    char json[UI_SETTINGS_MAX];
    char text[64];
    int value = 0;

    if (!key) return fallback;

    /* A JSON number is not a JSON string, so the number reader comes first;
       json_extract_bool is json_lite's name for "bare token or digits". */
    if (read_values(door_dir, json, (int) sizeof(json))
        && json_extract_bool(json, key, &value) == 0) {
        return value;
    }

    /* A sysop who quoted the number meant the number. */
    if (ui_setting_str(door_dir, key, "", text, (int) sizeof(text)) != 1) return fallback;
    if (!text[0]) return fallback;
    /* Anything that is not a number at all is the file being wrong, and the
       fallback is a better answer than 0 - which is a real setting. */
    if ((text[0] < '0' || text[0] > '9') && text[0] != '-') return fallback;
    return atoi(text);
}

int ui_setting_bool(const char *door_dir, const char *key, int fallback)
{
    char json[UI_SETTINGS_MAX];
    char text[16];
    int value = 0;

    if (!key) return fallback;

    if (read_values(door_dir, json, (int) sizeof(json))
        && json_extract_bool(json, key, &value) == 0) {
        return value ? 1 : 0;
    }

    /* A sysop who typed "true" into a string field meant true. */
    if (ui_setting_str(door_dir, key, "", text, (int) sizeof(text)) == 1) {
        if (strcmp(text, "true") == 0 || strcmp(text, "1") == 0) return 1;
        if (strcmp(text, "false") == 0 || strcmp(text, "0") == 0) return 0;
    }
    return fallback;
}

/*
 * ui_settings - the door's own settings, read from the file its TypeScript
 * twin reads.
 *
 * A door on this board declares its settings in `door.settings.json` and the
 * sysop's answers land in `settings.json` beside it
 * (sdk/core/settings.ts: MANIFEST_FILE, VALUES_FILE). A C door reads the
 * SAME two files, so a sysop configures a door once and it does not matter
 * which language it happens to be written in.
 *
 * Reading only. Writing is the admin UI's job, and a door that rewrote its
 * own settings file would race the thing editing it.
 *
 * The JSON parsing is json_lite (moved into this SDK from DoorRepo, where it
 * has been reading the admin API's replies): narrow, bounded, and it never
 * reads past a NUL.
 */

#ifndef UI_SETTINGS_H
#define UI_SETTINGS_H

#ifdef __cplusplus
extern "C" {
#endif

/** The two file names, which are the TypeScript's own. */
#define UI_SETTINGS_MANIFEST "door.settings.json"
#define UI_SETTINGS_VALUES   "settings.json"

/**
 * How far up to look for the door's root.
 *
 * A compiled door may be started from its own directory or from a `dist`
 * beside it, and the settings sit at the root either way - the same reason
 * resolveDoorRoot() walks up on the TypeScript side.
 */
#define UI_DOOR_ROOT_DEPTH 3

/**
 * The door's root directory, starting from where the binary was started.
 *
 * A directory holding `door.settings.json` marks it. Nothing found means the
 * directory asked about, unchanged - the same answer the TypeScript gives,
 * and better than a guess at a path that has never existed.
 *
 * Returns the length written, or -1 when it will not fit.
 */
int ui_door_dir(const char *start, char *out, int cap);

/**
 * A string setting, from `settings.json`, with a fallback.
 *
 * Returns 1 when the file answered, 0 when the fallback was used, and -1
 * when `out` is too small for either. `out` is always a valid string.
 */
int ui_setting_str(const char *door_dir, const char *key,
                   const char *fallback, char *out, int cap);

/** A whole-number setting. `fallback` when the file does not say. */
int ui_setting_int(const char *door_dir, const char *key, int fallback);

/** A true/false setting. `fallback` when the file does not say. */
int ui_setting_bool(const char *door_dir, const char *key, int fallback);

#ifdef __cplusplus
}
#endif

#endif /* UI_SETTINGS_H */

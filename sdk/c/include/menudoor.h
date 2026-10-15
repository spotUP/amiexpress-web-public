/*
 * menudoor - the shared shell every menu door is (plan M10).
 *
 * The main menu, the bulletins menu and later the conference list are one
 * program with different strings: the catalogue comes from the board
 * (ae_menu), the screen is drawn here, and the only things a door supplies are
 * what Enter does on an entry and what Enter does on a typed line. Nothing
 * door-specific lives in menudoor.c.
 *
 * Draws on all three screens: 80x25 Amiga ANSI, wider ANSI, and 40x25 PETSCII
 * (one column, a caret instead of a bar, no rail).
 */
#ifndef MENUDOOR_H
#define MENUDOOR_H

#include "ae_menu.h"

#ifdef __cplusplus
extern "C" {
#endif

struct menudoor;
typedef enum { MENUDOOR_STAY = 0, MENUDOOR_LEAVE = 1 } menudoor_result;

typedef struct menudoor_spec {
    const char *kind;                          /* "MAIN", "BULLETINS", later "CONFERENCES" */
    const char *masthead;                      /* fallback title when the catalogue has none */
    const char *fallback_command;              /* returned when the board is silent: "BULLS", or 0 */
    const char *keybar_wide, *keybar_narrow;   /* full words: "Arrows Move  Enter Run  Esc Prompt" */
    int digits_show_at_once;                   /* BULLETINS: a unique number acts without Enter */
    menudoor_result (*activate)(struct menudoor *d, int entry);      /* Enter / click on an entry */
    menudoor_result (*typed)(struct menudoor *d, const char *line);  /* Enter on a typed line */
} menudoor_spec;

/** The door's main(): returns the exit code. */
int menudoor_run(const menudoor_spec *spec, int node);
/** The MENUSETTINGS screen (plan Decision 23): scroll, pages, or the board's default. */
int menudoor_settings_run(int node);

/* For the activate / typed callbacks. */
const ae_menu_entry *menudoor_entry(struct menudoor *d, int entry);
/** Decision 42: Enter on an 'L' entry opens its child list. Returns what the callback should hand back: LEAVE when the caller picked something below. */
menudoor_result menudoor_open_child(struct menudoor *d, int entry);

#ifdef __cplusplus
}
#endif
#endif

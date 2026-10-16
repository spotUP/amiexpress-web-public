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
    const char *palette_name;                  /* the registration that opens the search palette (Ctrl-K), or 0 */
} menudoor_spec;

/** The door's main(): returns the exit code. */
int menudoor_run(const menudoor_spec *spec, int node);
/**
 * The door's main() when ONE binary is registered under two names (plan Decision 23): opens the board once, asks which
 * registration the caller used, and runs the settings screen when it is `settings_name` (0 = this door has none),
 * the menu otherwise.
 */
int menudoor_main(const menudoor_spec *spec, const char *settings_name, int node);
/*
 * Invoked under spec->palette_name (plan D11-D13) the same binary is a search palette: the catalogue flattened, the
 * typed text filters it (md_palette_rank), the status row counts "N of M", and Enter runs the exact key, else the
 * highlighted match, else the line as typed. The board's main line after the name is the starting filter.
 */
/** The MENUSETTINGS screen (plan Decision 23): scroll, pages, or the board's default. */
int menudoor_settings_run(int node);

/** What the key bar says about Esc inside a second-level list: it goes back up, not out to the prompt. */
#define MENUDOOR_CHILD_KEYBAR_WIDE   "Arrows Move  Enter Run  Esc Back"
#define MENUDOOR_CHILD_KEYBAR_NARROW "Enter Run  Esc Back"
/** Drill: the top level lists sections; Enter opens one, Esc still leaves to the prompt. */
#define MENUDOOR_SECTIONS_KEYBAR_WIDE   "Arrows Move  Enter Open  Esc Prompt"
#define MENUDOOR_SECTIONS_KEYBAR_NARROW "Enter Open  Esc Prompt"

/**
 * The bottom row has two states. Navigation (nothing typed): a hint, the key bar, no cursor. Typing (from the first
 * character): the board's prompt, the typed text, this key bar if it fits, the cursor. Esc clears the line and returns
 * to navigation; Esc on an empty line leaves (or goes back up in a child list).
 */
#define MENUDOOR_HINT_WIDE           "Arrows and Enter, or type a command"
#define MENUDOOR_HINT_NARROW         "Arrows or type"
/* A door whose typing is numbers (digits_show_at_once) says so instead. */
#define MENUDOOR_HINT_NUMBER_WIDE    "Arrows and Enter, or type a number"
#define MENUDOOR_HINT_NUMBER_NARROW  "Type a number"
/* Typing does not move the grid's window: a match below it is named in the status row and Tab brings the window to it.
   The full bar says so; where it does not fit, the shorter one keeps Tab (Enter is the obvious key) - see typing_bar(). */
#define MENUDOOR_TYPING_KEYBAR_WIDE   "Enter Run  Tab Show  Esc Clear"
#define MENUDOOR_TYPING_KEYBAR_NARROW "Tab Show  Esc Clear"
/* The palette: every key types, the list follows the text, so there is no Tab and no q. */
#define MENUDOOR_PALETTE_HINT_WIDE    "Type to search the menu"
#define MENUDOOR_PALETTE_HINT_NARROW  "Type to search"
#define MENUDOOR_PALETTE_KEYBAR_WIDE  "Arrows Move  Enter Run  Esc Clear"
#define MENUDOOR_PALETTE_KEYBAR_NARROW "Enter Run  Esc Clear"

/* For the activate / typed callbacks. */
const ae_menu_entry *menudoor_entry(struct menudoor *d, int entry);
/** Says `text` (<= 39 characters) in the status row until the next key: a typed line that matched nothing. */
void menudoor_status(struct menudoor *d, const char *text);
/** Decision 42: Enter on an 'L' entry opens its child list. Returns what the callback should hand back: LEAVE when the caller picked something below. */
menudoor_result menudoor_open_child(struct menudoor *d, int entry);

#ifdef __cplusplus
}
#endif
#endif

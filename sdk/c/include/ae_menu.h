/*
 * ae_menu - the client for AEW_MENU (10900): the board's menu catalogue and the
 * actions a menu door sends back. The board side is
 * web/backend/src/amiga-emulation/xim/menu.ts; the catalogue file it writes is
 * services/menu-catalogue/catalogue-file.ts (magic "AEMENU 1", TAB fields, LF).
 *
 *   OPEN <kind> [<parent>]   -> "OK TAB <amiga path>" | "NO" (the board printed why) | "" (not listening)
 *   LOGO <pos> <t> <l> <r> <c> -> "OK TAB <rows>" | "NONE"   (the board draws it)
 *   ROW <n>                  -> "OK"     (the selected row, kept for the next open)
 *   STYLE? / STYLE <m>       -> "<stored> TAB <effective>" / "OK TAB <effective>"
 *                               m: classic|scroll|coverflow|default (a stored '' arrives as "default")
 *   RUN <line>               -> "OK"     (run after this door exits, as typed)
 *   SHOW <key>               -> "OK" | "NO"
 *
 * A board that does not know the field answers nothing: AE_MENU_SILENT, and the
 * door's fallback command runs instead.
 */
#ifndef AE_MENU_H
#define AE_MENU_H

#include "ui_grid.h"

#ifdef __cplusplus
extern "C" {
#endif

#define AE_MENU_MAX_ENTRIES  UI_GRID_MAX_ENTRIES
#define AE_MENU_MAX_SECTIONS 24
#define AE_MENU_MAX_LOGOS    4
#define AE_MENU_SILENT 6
#define AE_MENU_GONE  (-1)
#define AE_MENU_STYLE_SCROLL    0         /* an "O pages" line (the retired Pages style) reads as scroll */
#define AE_MENU_STYLE_COVERFLOW 1
#define AE_MENU_STYLE_CAP 16                  /* style buffers hold at least this many bytes */

typedef struct {
    char key[16]; char label[27]; char description[77]; char right[11]; char flags[5];
} ae_menu_entry;

typedef struct { char position[8]; int rows, cols, after_section; } ae_menu_logo;

typedef struct {
    char kind[16]; char parent[16]; char title[31]; char prompt[256];   /* 72 columns plus the board's colours */
    int style;                               /* AE_MENU_STYLE_*, the catalogue's O line */
    int slide;                               /* "F 1": cover flow slides between pages */
    char wipe_open, wipe_leave, wipe_page;   /* 0 = none; wipe_page went with the Pages style and is only parsed */
    int last_row;
    char notice[41];                         /* "N <text>": a line the door says once as it opens, "" none */
    int section_count, entry_count, logo_count, truncated;
    char section_title[AE_MENU_MAX_SECTIONS][31];
    int entry_section[AE_MENU_MAX_ENTRIES];
    ae_menu_entry entries[AE_MENU_MAX_ENTRIES];
    ae_menu_logo logos[AE_MENU_MAX_LOGOS];
} ae_menu;

/** 1 OK, 0 refused (the board printed why), AE_MENU_SILENT (also: the file is unreadable or malformed), AE_MENU_GONE. */
int ae_menu_open(const char *kind, const char *parent, ae_menu *m);
/** Pure: 1 a whole catalogue, 0 malformed. A file with no final "." line is never shown. Fields are cut at their widths. */
int ae_menu_parse(const char *text, long len, ae_menu *m);
/** Rows the board drew, 0 none, AE_MENU_GONE. */
int ae_menu_logo_draw(const char *position, int top, int left, int rows, int cols);
/** 1 stored, 0 not, AE_MENU_GONE. Sent on leave only. */
int ae_menu_row(int row);
/** The caller's stored style and the style in force; both buffers AE_MENU_STYLE_CAP bytes (either may be 0).
    1 answered, 0 silent, AE_MENU_GONE. */
int ae_menu_style_get(char *stored, char *effective);
/** ae_menu_style_get plus `slide` (may be 0): 1 when a cover flow page turn slides for this caller (the sysop's
    setting, never at 40 columns or PETSCII), the same rule as the catalogue's F line. 1 answered, 0 silent, AE_MENU_GONE. */
int ae_menu_style_query(char *stored, char *effective, int *slide);
/** Stores mode (classic|scroll|coverflow|default); `effective` (AE_MENU_STYLE_CAP, may be 0) receives the style
    in force. 1 stored, 0 refused or silent, AE_MENU_GONE. */
int ae_menu_style(const char *mode, char *effective);
/** Tab's next style: the board stores the one after `shown` (the style on screen) in its one cycle order and
    `effective` (AE_MENU_STYLE_CAP, may be 0) receives it; "classic" means leave the door. 1 stored, 0 refused or silent, AE_MENU_GONE. */
int ae_menu_style_next(const char *shown, char *effective);
/** Wrapper over ae_menu_style / ae_menu_style_get. mode "scroll", "coverflow", "default" stores; 0 asks. `effective` receives the mode in force. 1 answered, 0 silent, AE_MENU_GONE. */
int ae_menu_overflow(const char *mode, char *effective, int cap);
/** Wrapper over ae_menu_style_get with caller-sized buffers. */
int ae_menu_overflow_get(char *stored, int scap, char *effective, int ecap);
/** 1 the board will run `line` once this door exits, 0 refused, AE_MENU_GONE. */
int ae_menu_run(const char *line);
/** 1 the board will show bulletin `key` once this door exits, 0 refused, AE_MENU_GONE. `nonstop` 1 shows it with no
    More prompts (the caller typed NS: express.e:24626). */
int ae_menu_show(const char *key, int nonstop);

#ifdef __cplusplus
}
#endif
#endif

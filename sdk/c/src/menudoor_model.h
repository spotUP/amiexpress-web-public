/* menudoor_model.h - the shell's pure decisions, host-tested (plan M10). Internal: only menudoor.c and its test include this. */
#ifndef MENUDOOR_MODEL_H
#define MENUDOOR_MODEL_H
#include "ae_menu.h"

#define MD_MIN_GRID_ROWS 5     /* never squeeze the grid below this: the logos give way first (sysop 2026-10-15: 5 keeps a 12-row logo on a 24-row web terminal) */
#define MD_WIDE_COLS     120   /* plan Decision 30: the side logo is for wide screens only */

typedef struct {
    int masthead_row;
    int divider_row;                              /* the row under the header logo (masthead rail / static rule); 0 = no header logo */
    int rail_row;                                 /* where the masthead rail lives: the divider under a header logo, else the masthead row */
    int header_top, header_rows, header_cols;     /* rows 0 = no header logo */
    int footer_top, footer_rows, footer_cols;
    int side_top, side_left, side_rows, side_cols;   /* cols 0 = no side logo */
    int band_after_section, band_height, band_cols;  /* band_height 0 = no between logo */
    int grid_top, grid_left, grid_height, grid_width;
    int status_row, prompt_row;
} md_layout_out;

/** The entry to highlight for what is typed: an exact key (any case) first, else the first key it starts; -1 none. */
int  md_typeahead(const ae_menu *m, const char *typed);
/** Decision 37: q on an empty line leaves, but only while no entry key is Q or starts with Q (the same scan as typeahead). */
int  md_q_leaves(const ae_menu *m);
/** The entry to act on at once for typed digits: exactly one key equals them and no other starts with them; -1 wait. */
int  md_digits_act(const ae_menu *m, const char *typed);
/** Where everything goes at cols x rows. */
void md_layout(const ae_menu *m, int cols, int rows, md_layout_out *o);

#endif

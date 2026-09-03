/*
 * theme_tables.h - GENERATED. Do not edit.
 *
 * Written by sdk/c/tools/generate-theme-tables.ts from
 * sdk/engines/ui/theme/tokens.ts, which stays the single source of truth for
 * what a theme IS. Each token is reduced to the nearest of the eight colours
 * a C door has, by RGB distance, so a theme keeps its intent - phosphor stays
 * green, neon stays magenta - without pretending the Amiga can render the
 * exact shade.
 *
 * Regenerate:  cd sdk && npx tsx c/tools/generate-theme-tables.ts
 * Check:       ... --check   (fails when this file is stale)
 */

#ifndef UI_THEME_TABLES_H
#define UI_THEME_TABLES_H

#define UI_THEME_COUNT 7

static const ui_theme UI_THEME_TABLE[UI_THEME_COUNT] = {
    {
        "classic",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_WHITE,    /* white -> 7 */
        /* chrome        */ ANSI_CYAN,     /* cyan -> 6 */
        /* dim           */ ANSI_WHITE,    /* gray -> 7 */
        /* bar           */ ANSI_BLUE,     /* blue -> 4 */
        /* bar_ink       */ ANSI_WHITE,    /* white -> 7 */
        /* accent        */ ANSI_YELLOW,   /* yellow -> 3 */
        /* accent_alt    */ ANSI_CYAN,     /* cyan -> 6 */
        /* selection_bg  */ ANSI_BLUE,     /* blue -> 4 */
        /* selection_ink */ ANSI_WHITE,    /* white -> 7 */
        /* ok            */ ANSI_GREEN,    /* green -> 2 */
        /* warn          */ ANSI_YELLOW,   /* yellow -> 3 */
        /* alert         */ ANSI_RED,      /* red -> 1 */
        UI_BORDER_LINE,
        ""
    },
    {
        "slate-slash",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_WHITE,    /* #C9D4E8 -> 7 */
        /* chrome        */ ANSI_WHITE,    /* #48566E -> 7 */
        /* dim           */ ANSI_WHITE,    /* #48566E -> 7 */
        /* bar           */ ANSI_BLACK,    /* black -> 0 */
        /* bar_ink       */ ANSI_WHITE,    /* #C9D4E8 -> 7 */
        /* accent        */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent_alt    */ ANSI_CYAN,     /* #4DE0F0 -> 6 */
        /* selection_bg  */ ANSI_MAGENTA,  /* magenta -> 5 */
        /* selection_ink */ ANSI_BLACK,    /* black -> 0 */
        /* ok            */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* warn          */ ANSI_YELLOW,   /* #F5C451 -> 3 */
        /* alert         */ ANSI_RED,      /* #FF5C7A -> 1 */
        UI_BORDER_LINE,
        "///"
    },
    {
        "slate-muted",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_WHITE,    /* #95A0B4 -> 7 */
        /* chrome        */ ANSI_WHITE,    /* #3A4354 -> 7 */
        /* dim           */ ANSI_WHITE,    /* #5A6474 -> 7 */
        /* bar           */ ANSI_BLACK,    /* black -> 0 */
        /* bar_ink       */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent        */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent_alt    */ ANSI_WHITE,    /* #5A6474 -> 7 */
        /* selection_bg  */ ANSI_MAGENTA,  /* magenta -> 5 */
        /* selection_ink */ ANSI_BLACK,    /* black -> 0 */
        /* ok            */ ANSI_WHITE,    /* #95A0B4 -> 7 */
        /* warn          */ ANSI_WHITE,    /* #95A0B4 -> 7 */
        /* alert         */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        UI_BORDER_LINE,
        "///"
    },
    {
        "uprough-neon",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_WHITE,    /* #E4ECFA -> 7 */
        /* chrome        */ ANSI_CYAN,     /* #4DE0F0 -> 6 */
        /* dim           */ ANSI_WHITE,    /* #48566E -> 7 */
        /* bar           */ ANSI_BLACK,    /* black -> 0 */
        /* bar_ink       */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent        */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent_alt    */ ANSI_YELLOW,   /* #F5C451 -> 3 */
        /* selection_bg  */ ANSI_MAGENTA,  /* magenta -> 5 */
        /* selection_ink */ ANSI_BLACK,    /* black -> 0 */
        /* ok            */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* warn          */ ANSI_YELLOW,   /* #F5C451 -> 3 */
        /* alert         */ ANSI_RED,      /* #FF5C7A -> 1 */
        UI_BORDER_LINE,
        "/////"
    },
    {
        "neon-muted",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_WHITE,    /* #A8B4C8 -> 7 */
        /* chrome        */ ANSI_CYAN,     /* #2E6E7A -> 6 */
        /* dim           */ ANSI_WHITE,    /* #5A6474 -> 7 */
        /* bar           */ ANSI_BLACK,    /* black -> 0 */
        /* bar_ink       */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent        */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        /* accent_alt    */ ANSI_WHITE,    /* #5A6474 -> 7 */
        /* selection_bg  */ ANSI_MAGENTA,  /* magenta -> 5 */
        /* selection_ink */ ANSI_BLACK,    /* black -> 0 */
        /* ok            */ ANSI_WHITE,    /* #A8B4C8 -> 7 */
        /* warn          */ ANSI_WHITE,    /* #A8B4C8 -> 7 */
        /* alert         */ ANSI_MAGENTA,  /* #FF3D9A -> 5 */
        UI_BORDER_LINE,
        "/////"
    },
    {
        "quiet-phosphor",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* chrome        */ ANSI_WHITE,    /* #2E4A3C -> 7 */
        /* dim           */ ANSI_WHITE,    /* #2E4A3C -> 7 */
        /* bar           */ ANSI_BLACK,    /* black -> 0 */
        /* bar_ink       */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* accent        */ ANSI_GREEN,    /* #8CFFB4 -> 2 */
        /* accent_alt    */ ANSI_YELLOW,   /* #F5C451 -> 3 */
        /* selection_bg  */ ANSI_GREEN,    /* green -> 2 */
        /* selection_ink */ ANSI_BLACK,    /* black -> 0 */
        /* ok            */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* warn          */ ANSI_YELLOW,   /* #F5C451 -> 3 */
        /* alert         */ ANSI_RED,      /* #FF8B6B -> 1 */
        UI_BORDER_NONE,
        "////"
    },
    {
        "phosphor-muted",
        /* ground        */ ANSI_BLACK,    /* black -> 0 */
        /* ink           */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* chrome        */ ANSI_WHITE,    /* #1E3A28 -> 7 */
        /* dim           */ ANSI_WHITE,    /* #2E4A3C -> 7 */
        /* bar           */ ANSI_BLACK,    /* black -> 0 */
        /* bar_ink       */ ANSI_GREEN,    /* #8CFFB4 -> 2 */
        /* accent        */ ANSI_GREEN,    /* #8CFFB4 -> 2 */
        /* accent_alt    */ ANSI_WHITE,    /* #2E4A3C -> 7 */
        /* selection_bg  */ ANSI_BLACK,    /* black -> 0 */
        /* selection_ink */ ANSI_GREEN,    /* #C8FFDC -> 2 */
        /* ok            */ ANSI_GREEN,    /* #57E389 -> 2 */
        /* warn          */ ANSI_GREEN,    /* #8CFFB4 -> 2 */
        /* alert         */ ANSI_GREEN,    /* #C8FFDC -> 2 */
        UI_BORDER_NONE,
        "////"
    }
};

#endif /* UI_THEME_TABLES_H */

/*
 * MAINMENU - the board's main menu as a door (plan M14).
 *
 * Everything is the shared shell (menudoor.c): the catalogue, the grid, the
 * wipes, the logos, the mouse, the masthead. What is MAIN about it is two
 * answers: an entry runs its command, and a typed line runs exactly as the
 * main prompt would run it (sysop, 2026-10-15). The board decides how
 * (AEW_MENU RUN, plan Decision 34). Registered three times - MENU, MENUSETTINGS
 * (Decision 23) and PALETTE (the search palette, plan P4) - and menudoor_main
 * tells them apart with ae_menu_command.
 */
#include <stdlib.h>
#include "aedoor.h"
#include "ae_menu.h"
#include "menudoor.h"

static menudoor_result run_entry(struct menudoor *d, int entry)
{
    ae_menu_run(menudoor_entry(d, entry)->key);
    return MENUDOOR_LEAVE;
}

static menudoor_result run_line(struct menudoor *d, const char *line)
{
    (void)d;
    ae_menu_run(line);
    return MENUDOOR_LEAVE;
}

static const menudoor_spec MAIN_MENU = {
    "MAIN", "MAIN MENU", 0,
    "Arrows Move  Enter Run  Esc Prompt",             /* typing is the hint's: "Arrows and Enter, or type a command" */
    "Enter Run  Esc Prompt",
    0, run_entry, run_line,
    "PALETTE",                                        /* Ctrl-K at a board prompt (plan P5) */
    0
};

int main(int argc, char **argv)
{
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    return menudoor_main(&MAIN_MENU, "MENUSETTINGS", node);
}

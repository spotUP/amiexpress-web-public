/*
 * BULLETINS - the bulletin menu as a door (plan M16), on the menudoor shell.
 *
 * Enter, a click or the number shows the bulletin THROUGH THE BOARD - its own
 * screen, wipe and pauses - and the board brings this door back after it
 * (AEW_MENU SHOW, plan M7). On a board that does not know AEW_MENU the door
 * hands B to the old Bulls door (BULLS, plan M18).
 */
#include <stdlib.h>
#include <string.h>
#include "ae_menu.h"
#include "menudoor.h"

static menudoor_result show_entry(struct menudoor *d, int entry)
{
    ae_menu_show(menudoor_entry(d, entry)->key);
    return MENUDOOR_LEAVE;
}

static menudoor_result show_typed(struct menudoor *d, const char *line)
{
    int i;
    for (i = 0; menudoor_entry(d, i) != 0; i++)
        if (strcmp(menudoor_entry(d, i)->key, line) == 0) return show_entry(d, i);
    /* WEB_: express.e:24652 says "Sorry there is no bulletin #n"; the door cannot know the number was meant for a
       level-variant file, so it says what it knows. */
    menudoor_status(d, "Sorry, there is no such bulletin.");
    return MENUDOOR_STAY;
}

static const menudoor_spec BULLETINS = {
    "BULLETINS", "BULLETINS", "BULLS",
    "Arrows Move  Enter Read  Type a Number  Esc Leave",
    "Enter Read  Esc Leave",
    1, show_entry, show_typed
};

int main(int argc, char **argv)
{
    return menudoor_run(&BULLETINS, (argc > 1) ? atoi(argv[1]) : 1);
}

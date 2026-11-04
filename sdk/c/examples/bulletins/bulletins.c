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
    ae_menu_show(menudoor_entry(d, entry)->key, 0);
    return MENUDOOR_LEAVE;
}

/* NS anywhere after the number, any case (express.e:24626, :24643 paramsContains('NS')). */
static int asks_nonstop(const char *p)
{
    while (*p) {
        while (*p == ' ') p++;
        if ((p[0] == 'N' || p[0] == 'n') && (p[1] == 'S' || p[1] == 's') && (p[2] == ' ' || p[2] == '\0')) return 1;
        while (*p && *p != ' ') p++;
    }
    return 0;
}

/* "12" or "12 NS": the first word is the bulletin, the rest its flags. */
static menudoor_result show_typed(struct menudoor *d, const char *line)
{
    char key[21];
    int i, n = 0;
    while (*line == ' ') line++;
    while (line[n] && line[n] != ' ' && n < (int)sizeof key - 1) { key[n] = line[n]; n++; }
    key[n] = '\0';
    for (i = 0; menudoor_entry(d, i) != 0; i++)
        if (strcmp(menudoor_entry(d, i)->key, key) == 0) {
            ae_menu_show(key, asks_nonstop(line + n));
            return MENUDOOR_LEAVE;
        }
    /* WEB_: express.e:24652 says "Sorry there is no bulletin #n"; the door cannot know the number was meant for a
       level-variant file, so it says what it knows. */
    menudoor_status(d, "Sorry, there is no such bulletin.");
    return MENUDOOR_STAY;
}

static const menudoor_spec BULLETINS = {
    "BULLETINS", "BULLETINS", "BULLS",
    "Arrows Move  Enter Read  Esc Leave",
    "Enter Read  Esc Leave",
    1, show_entry, show_typed, 0, 1
};

int main(int argc, char **argv)
{
    return menudoor_run(&BULLETINS, (argc > 1) ? atoi(argv[1]) : 1);
}

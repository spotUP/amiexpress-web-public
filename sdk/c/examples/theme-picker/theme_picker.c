/*
 * THEME - pick how the doors look. In C, on a 68K Amiga.
 *
 * The port of Doors/theme-picker (255 lines of TypeScript), and the proof
 * the C SDK asked for: a real door, drawn with the widgets, reading and
 * writing through the protocol.
 *
 * It is deliberately the SAME door: the caller's current theme is marked
 * rather than merely highlighted (the highlight follows the cursor and says
 * nothing about what is saved), the screen is drawn in the theme you are
 * leaving, and the door says when a change applies rather than leaving
 * anyone wondering why nothing looks different yet.
 *
 * WHAT IT DOES THAT THE TYPESCRIPT ONE CANNOT: nothing. What it does that no
 * C door could until now: save the choice. AEW_THEME is this board's own
 * command (sdk/c/include/ae_session.h), so the door asks where it is running
 * before offering to save at all - on a classic AmiExpress it lists the
 * themes and says plainly that this board cannot keep one.
 */

#include "ae_host.h"
#include "ae_session.h"
#include "ui_ansi.h"
#include "ui_chrome.h"
#include "ui_input.h"
#include "ui_key.h"
#include "ui_list.h"
#include "ui_profile.h"
#include "ui_screen.h"
#include "ui_theme.h"

#include <stdlib.h>
#include <string.h>

/* One frame and one AEDoor message, both owned here: a library that
   allocated would be a library a door cannot budget for. */
static char frame_buffer[16384];
static char session_storage[AE_SESSION_MIN_STORAGE];

/** The id in force when the door opened, so the list can mark it. */
static char active_theme[32];

/** One row: the mark, the name, and the blurb if the screen has room. */
static const char *theme_row(void *context, int index)
{
    static char row[96];
    const ui_theme *t = ui_theme_at(index);
    int wide = *(int *)context;
    const char *mark;

    /* Marked, not highlighted: the highlight is where the cursor is, and
       this is what is SAVED - the same distinction the TypeScript makes. */
    mark = (strcmp(t->id, active_theme) == 0) ? "[*] " : "[ ] ";

    row[0] = '\0';
    strcat(row, mark);
    strncat(row, t->id, sizeof(row) - strlen(row) - 2);

    /* 40 columns: the id alone. A folded row eats the theme underneath it,
       which is how the C64 lost a third of this list in the TypeScript. */
    if (wide) {
        unsigned long pad = strlen(row);
        while (pad < 24 && pad < sizeof(row) - 2) row[pad++] = ' ';
        row[pad] = '\0';
        strncat(row, t->rail[0] ? t->rail : "-", sizeof(row) - strlen(row) - 2);
    }
    return row;
}

/** A key, read through the board. */
static int door_key(void *ctx)
{
    (void)ctx;
    return ae_key();
}

static int door_pending(void *ctx)
{
    (void)ctx;
    return ae_input_pending();
}

static void door_settle(void *ctx)
{
    (void)ctx;
    /* Long enough for the rest of an escape sequence to land, short enough
       that a lone ESC still feels immediate - the door layer's own probe. */
    ae_delay_ticks(2);
}

int main(int argc, char **argv)
{
    ae_session session;
    ui_screen screen;
    ui_list list;
    ui_key_source keys;
    const ae_host_info_t *host;
    const ui_theme *theme;
    int pushback = -1;
    int node = (argc > 1) ? atoi(argv[1]) : 1;
    int wide;
    int running = 1;
    int saved = 0;

    if (ae_start(node) != 0) return 20;
    if (ae_open_bbs(&session, session_storage, (long)sizeof(session_storage), node) != 0) {
        ae_shutdown();
        return 20;
    }

    ui_screen_open(&screen, &session, frame_buffer, (long)sizeof(frame_buffer));
    wide = !ui_is_compact_width(screen.cols);

    /* Drawn in the theme you are LEAVING, so the screen you choose from is
       itself an example of what you have. */
    ae_user_theme(&session, active_theme, (int)sizeof(active_theme));
    theme = ui_theme_by_id(active_theme);

    keys.next = door_key;
    keys.pending = door_pending;
    keys.settle = door_settle;
    keys.ctx = 0;

    ui_list_init(&list);
    list.top = 3;
    list.left = 2;
    list.width = screen.cols - 2;
    list.height = screen.rows - 5;
    list.count = ui_theme_count();
    list.row = theme_row;
    list.context = &wide;
    list.label = " THEMES ";
    list.borders = screen.profile.borders;
    /* The primary colour carries the chrome, the same rule the TypeScript
       doors follow since 2026-09-03. */
    list.chrome = theme->accent;
    list.ink = theme->ink;
    list.selected_fg = theme->selection_ink;
    list.selected_bg = theme->selection_bg;

    {
        int i;
        for (i = 0; i < ui_theme_count(); i++) {
            if (strcmp(ui_theme_at(i)->id, active_theme) == 0) ui_list_select(&list, i);
        }
    }

    host = ae_host_info();

    while (running && ae_carrier(&session)) {
        int key;
        const char *note;

        ansi_clear(&screen.buf);
        ui_masthead_draw(&screen.buf, 1, 1, screen.cols, "THEME",
                         theme->rail, theme->ground, theme->accent);
        ui_list_draw(&list, &screen.buf);

        /* Say what will happen, and say the truth about this board - in
           words that FIT. ansi_text() clips at cols-3, which is 37 cells on
           a C64, and both of the wide sentences are longer than that: the
           caller was reading "THIS BOARD CANNOT KEEP A THEME - SHOW", cut
           mid-word. A shorter sentence is the door saying the same thing in
           its own words, which is what a 40-column screen is owed; clipping
           is the door saying half of one. */
        if (wide) {
            note = (host->host == AE_HOST_WEB)
                ? "A theme applies the next time a door draws."
                : "This board cannot keep a theme - showing them only.";
        } else {
            note = (host->host == AE_HOST_WEB)
                ? "Applies the next time a door draws."
                : "This board cannot keep a theme.";
        }
        ansi_color(&screen.buf, theme->dim, theme->ground, 0);
        ansi_text(&screen.buf, screen.rows - 1, 2, note, screen.cols - 3);

        {
            char footer[160];
            const char *optional[2];
            int n = 0;

            if (host->host == AE_HOST_WEB) optional[n++] = "ENTER=Use it";
            optional[n++] = "Up/Down=Choose";
            ui_footer_build(footer, sizeof(footer), screen.cols,
                            "", optional, n, "Q=Leave");
            ui_bar_draw(&screen.buf, screen.rows, 1, screen.cols,
                        footer, theme->ground, theme->accent);
        }

        ui_screen_flush(&screen);

        key = ui_key_read(&keys, &pushback);
        if (key < 0) break;

        switch (key) {
            case UI_KEY_UP:   ui_list_move(&list, -1); break;
            case UI_KEY_DOWN: ui_list_move(&list, 1); break;
            case UI_KEY_PGUP: ui_list_move(&list, -ui_list_visible_rows(&list)); break;
            case UI_KEY_PGDN: ui_list_move(&list, ui_list_visible_rows(&list)); break;
            case UI_KEY_HOME: ui_list_select(&list, 0); break;
            case UI_KEY_END:  ui_list_select(&list, list.count - 1); break;

            case UI_KEY_ENTER: {
                const ui_theme *chosen = ui_theme_at(list.selected);

                /* Only where the board can keep it. Offering to save on a
                   host that cannot would be a door lying to a sysop. */
                if (host->host != AE_HOST_WEB) break;

                if (ae_set_user_theme(&session, chosen->id)) {
                    /* Read back rather than assumed: the board resolves what
                       it is given, and that answer is the mark's truth. */
                    ae_user_theme(&session, active_theme, (int)sizeof(active_theme));
                    theme = ui_theme_by_id(active_theme);
                    list.chrome = theme->accent;
                    list.ink = theme->ink;
                    list.selected_fg = theme->selection_ink;
                    list.selected_bg = theme->selection_bg;
                    saved = 1;
                }
                break;
            }

            case 'q': case 'Q': case UI_KEY_ESC:
                running = 0;
                break;

            default:
                break;
        }
    }

    /* Put the terminal back: attributes reset and the cursor shown, or the
       board's next prompt is painted in this door's colours. */
    ui_screen_close(&screen);
    if (saved) ae_put("Theme saved.\r\n", 0);

    ae_close(&session);
    ae_shutdown();
    return 0;
}

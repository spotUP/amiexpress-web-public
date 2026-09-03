/*
 * The same door, drawing a bordered list.
 *
 * The third yardstick: hello costs nothing for the widgets it does not
 * call, hello_box costs one box, and this costs the list widget and the
 * ANSI layer under it. That last number is the one a sysop asking "can a C
 * door draw a list?" actually wants.
 */

#include "ae_host.h"
#include "ae_out.h"
#include "ui_list.h"

static const char *door_name(void *context, int index)
{
    static const char *doors[] = {
        "CARD LOBBY", "GRANDMASTER", "LIVECHAT", "DOORMAN", "WHIP",
    };
    (void)context;
    return doors[index % 5];
}

/* One frame, composed here and written once. */
static char frame[8192];

int main(void)
{
    ansi_buf buf;
    ui_list list;

    ansi_begin(&buf, frame, (long)sizeof(frame));

    ui_list_init(&list);
    list.top = 2;
    list.left = 2;
    list.height = 12;
    list.width = 40;
    list.count = 20;
    list.label = " DOORS ";
    list.row = door_name;

    /* A C64 caller has no room for a frame (ui_profile.h). */
    list.borders = ae_can(AE_CAP_ANSI) && !ae_can(AE_CAP_PETSCII);

    ui_list_select(&list, 4);
    ansi_clear(&buf);
    ui_list_draw(&list, &buf);

    /* No session in this example, so the frame goes to stdout rather than
       to the board - the point here is the binary's size, not the wire. */
    buf.data[buf.len] = '\0';
    ae_write(buf.data);
    ae_write_line("");
    return 0;
}

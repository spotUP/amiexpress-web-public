/*
 * ui_input - see ui_input.h. The editing rules are doorrepo's, lifted.
 */

#include "ui_input.h"

#include <string.h>

void ui_input_style_init(ui_input_style *style)
{
    if (!style) return;
    style->row = 1;
    style->left = 1;
    style->cols = 80;
    style->fg = ANSI_WHITE;
    style->bg = ANSI_BLUE;
    style->ink = ANSI_YELLOW;
    style->upper = 0;
}

/** Draw the prompt row and leave the cursor after the text. */
static void paint(ansi_buf *b, const ui_input_style *st,
                  const char *label, const char *text)
{
    char line[256];
    unsigned long room = sizeof(line) - 2;

    line[0] = '\0';
    if (label) {
        strncat(line, label, room);
        strncat(line, " ", room - strlen(line));
    }
    if (text) strncat(line, text, room - strlen(line));

    ansi_fill(b, st->row, st->left, st->cols, st->fg, st->bg);
    ansi_color(b, st->ink, st->bg, 1);
    ansi_text(b, st->row, st->left + 1, line, st->cols - 1);
    ansi_goto(b, st->row, st->left + 1 + (int) strlen(line));
    ansi_cursor(b, 1);
}

/** Put back what the prompt changed: cursor hidden, attributes reset. */
static void restore(ansi_buf *b)
{
    ansi_cursor(b, 0);
    ansi_reset(b);
}

int ui_input(ansi_buf *b, const ui_key_source *src, int *pushback,
             const ui_input_style *style, const char *label,
             char *buf, int maxlen)
{
    ui_input_style fallback;
    int len;

    if (!b || !src || !pushback || !buf || maxlen <= 0) return -1;
    if (!style) { ui_input_style_init(&fallback); style = &fallback; }

    len = (int) strlen(buf);

    for (;;) {
        int key;

        paint(b, style, label, buf);
        key = ui_key_read(src, pushback);

        if (key < 0) return -1;              /* the caller went away */

        if (key == UI_KEY_ENTER) {
            restore(b);
            return (buf[0] != '\0') ? 1 : 0;
        }

        /* A cursor key inside a prompt means nothing. Swallowing it is the
           point: letting it through would put an escape sequence into the
           text a door is about to act on. */
        if (key == UI_KEY_ESC || key >= 1000) continue;

        if (key == 8 || key == 127) {
            if (len > 0) buf[--len] = '\0';
        } else if (key == 21) {              /* CTRL-U clears the line */
            len = 0;
            buf[0] = '\0';
        } else if (key >= 32 && key < 127 && len < maxlen - 1) {
            char c = (char) key;
            if (style->upper && c >= 'a' && c <= 'z') c = (char) (c - 'a' + 'A');
            buf[len++] = c;
            buf[len] = '\0';
        }
    }
}

int ui_confirm(ansi_buf *b, const ui_key_source *src, int *pushback,
               const ui_input_style *style, const char *question,
               int default_yes)
{
    ui_input_style fallback;
    char line[256];

    if (!b || !src || !pushback) return -1;
    if (!style) { ui_input_style_init(&fallback); style = &fallback; }

    line[0] = '\0';
    strncat(line, question ? question : "", sizeof(line) - 12);
    strncat(line, default_yes ? " [Y/n] " : " [y/N] ", 8);

    for (;;) {
        int key;

        ansi_fill(b, style->row, style->left, style->cols, style->fg, style->bg);
        ansi_color(b, style->ink, style->bg, 1);
        ansi_text(b, style->row, style->left + 1, line, style->cols - 1);
        ansi_cursor(b, 0);

        key = ui_key_read(src, pushback);
        if (key < 0) return -1;

        if (key == 'y' || key == 'Y') { restore(b); return 1; }
        if (key == 'n' || key == 'N') { restore(b); return 0; }
        /* ENTER takes the default, and ESC is a no - the safe answer to a
           question somebody backed out of. */
        if (key == UI_KEY_ENTER) { restore(b); return default_yes ? 1 : 0; }
        if (key == UI_KEY_ESC) { restore(b); return 0; }
    }
}

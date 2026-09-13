/*
 * ui_editor - see ui_editor.h. A port of express.e's `PROC edit`
 * (express.e:10077-10574), line-editor half.
 *
 * The per-character editing is NOT re-derived here: line entry and the two
 * prompts go through ui_input / ui_confirm, which already own backspace, the
 * swallowed cursor key, the flush-before-blocking rule and the restore of
 * colours on the way out. A second copy of those rules is how they drift.
 *
 * One deliberate divergence, recorded rather than hidden: express.e clears the
 * line being typed on char 30 (express.e:10195), ui_input clears on CTRL-U.
 * The door's other prompts have used CTRL-U since doorrepo, and a caller who
 * has learnt one prompt should not find a different key in the next one.
 */

#include "ui_editor.h"
#include "ui_input.h"

#include <stdio.h>      /* sprintf - C89 has no snprintf */
#include <stdlib.h>     /* atoi */
#include <string.h>

void ui_editor_style_init(ui_editor_style *style)
{
    if (!style) return;
    style->top = 1;
    style->left = 1;
    style->cols = 80;
    style->rows = 24;
    style->fg = ANSI_WHITE;
    style->bg = ANSI_BLACK;
    style->ink = ANSI_YELLOW;
    style->width = UI_EDITOR_WIDTH;
    style->to = 0;
    style->subject = 0;
}

void ui_editor_text_init(ui_editor_text *text)
{
    if (!text) return;
    text->count = 0;
    text->line[0][0] = '\0';
}

/** The width actually used, clamped to what the storage can hold. */
static int width_of(const ui_editor_style *st)
{
    int w = st->width > 0 ? st->width : UI_EDITOR_WIDTH;
    return w > UI_EDITOR_WIDTH ? UI_EDITOR_WIDTH : w;
}

static int push_line(ui_editor_text *text, const char *s, int len)
{
    if (text->count >= UI_EDITOR_MAX_LINES) return 0;
    if (len > UI_EDITOR_WIDTH) len = UI_EDITOR_WIDTH;
    memcpy(text->line[text->count], s, (size_t) len);
    text->line[text->count][len] = '\0';
    text->count++;
    return 1;
}

int ui_editor_append_wrapped(ui_editor_text *text, const char *s, int width)
{
    int added = 0;

    if (!text || !s) return 0;
    if (width <= 0 || width > UI_EDITOR_WIDTH) width = UI_EDITOR_WIDTH;

    for (;;) {
        int len, brk, cut;

        while (*s == '\r') s++;
        if (*s == '\0') return added;

        /* A newline in the source is a line break the caller MEANT. Honour it
           before any wrapping, or a quoted message loses its shape. */
        len = 0;
        while (s[len] && s[len] != '\n' && len < width) len++;

        if (s[len] == '\0' || s[len] == '\n') {
            brk = len;                       /* fits, or ends here anyway */
        } else {
            /* Too long: break at the last space before the limit. A word
               longer than the whole width has nowhere to break and is cut,
               which is what express.e's fixed-width buffer does too. */
            brk = len;
            while (brk > 0 && s[brk] != ' ' && s[brk - 1] != ' ') brk--;
            if (brk <= 0) brk = len;
        }

        /* The space we broke ON belongs to neither line. Keeping it would
           leave every wrapped line with a trailing blank, which a fixed-width
           message base then stores and every reader then shows. */
        cut = brk;
        while (cut > 0 && s[cut - 1] == ' ') cut--;

        if (!push_line(text, s, cut)) return added;
        added++;

        s += brk;
        if (*s == '\n') s++;
        else while (*s == ' ') s++;
    }
}

/** express.e:10157 - two digits to line 99, three beyond. */
static void number_prompt(char *out, int line_no)
{
    if (line_no <= 99) sprintf(out, "%2d>", line_no);
    else sprintf(out, "%3d>", line_no);
}

/**
 * Draw the chrome, and answer the first row the text may use.
 *
 * ONCE per visit to the editor, not once per keystroke. The old version of
 * this repainted the header, the instructions and every text row on every
 * line entered, which is ~20 rows of fill plus text - well over the ~198 bytes
 * that make one XIM message on 68K (RULES.md). The frame then arrived in
 * pieces and the screen did not agree with itself: on localhost 2026-09-13 the
 * first line of a message vanished as the second was typed.
 */
static int paint_chrome(ansi_buf *b, const ui_editor_style *st)
{
    char head[128];
    int row = st->top;

    if (st->to || st->subject) {
        head[0] = '\0';
        if (st->to) {
            strcat(head, "To: ");
            strncat(head, st->to, 30);
        }
        if (st->subject) {
            if (head[0]) strcat(head, "   ");
            strcat(head, "Subject: ");
            strncat(head, st->subject, 40);
        }
        ansi_fill(b, row, st->left, st->cols, st->fg, st->bg);
        ansi_color(b, st->ink, st->bg, 1);
        ansi_text_raw(b, row, st->left, head, st->cols);
        row++;
    }

    /* express.e:10148's words, so a caller reads the same instruction. */
    sprintf(head, "Enter your text. (Enter) alone to end. (%d chars/line)",
            width_of(st));
    ansi_fill(b, row, st->left, st->cols, st->fg, st->bg);
    ansi_color(b, st->fg, st->bg, 0);
    ansi_text_raw(b, row, st->left, head, st->cols);
    row++;

    return row;
}

/** One text row: the number, then the line. */
static void paint_line(ansi_buf *b, const ui_editor_style *st,
                       int row, int number, const char *text)
{
    char numbered[UI_EDITOR_WIDTH + 8];
    char num[8];

    number_prompt(num, number);
    sprintf(numbered, "%s %s", num, text);
    ansi_fill(b, row, st->left, st->cols, st->fg, st->bg);
    ansi_color(b, st->fg, st->bg, 0);
    ansi_text_raw(b, row, st->left, numbered, st->cols);
}

/**
 * The whole text window. Only when it has SCROLLED, or after the menu has
 * drawn over it - one line arriving redraws one line.
 */
static void paint_lines(ansi_buf *b, const ui_editor_style *st,
                        const ui_editor_text *text, int body_top, int first,
                        int last_row)
{
    int i, row = body_top;

    for (i = first; i < text->count && row <= last_row; i++, row++)
        paint_line(b, st, row, i + 1, text->line[i]);
    for (; row <= last_row; row++)
        ansi_fill(b, row, st->left, st->cols, st->fg, st->bg);
}

/** The one-line style the prompts and the entry row share. */
static void prompt_style(ui_input_style *is, const ui_editor_style *st, int row)
{
    ui_input_style_init(is);
    is->row = row;
    is->left = st->left;
    is->cols = st->cols;
    is->fg = st->fg;
    is->bg = st->bg;
    is->ink = st->ink;
    is->upper = 0;
}

/**
 * Type lines until a bare ENTER.
 *
 * Returns 1 normally, -1 if the caller went away. `resume` is the line number
 * to start at, which is how C(ontinue) steps back into the last line
 * (express.e:10452-10465).
 */
static int enter_lines(ansi_buf *b, const ui_key_source *src, int *pushback,
                       const ui_editor_style *st, ui_editor_text *text,
                       int *body_top_out, int *first_out)
{
    int body_top = paint_chrome(b, st);
    /* The lowest row the prompt may stand on. Below it live the menu and the
       status line the door draws. */
    int last_row = st->top + st->rows - 3;
    int visible = last_row - body_top;
    int w = width_of(st);
    int first = 0;
    int entry_row;

    if (visible < 1) visible = 1;
    if (text->count > visible) first = text->count - visible;

    paint_lines(b, st, text, body_top, first, last_row);

    for (;;) {
        ui_input_style is;
        char buf[UI_EDITOR_WIDTH + 1];
        char num[8];
        int rc;

        if (text->count >= UI_EDITOR_MAX_LINES) break;

        /*
         * THE PROMPT FOLLOWS THE TEXT. express.e's editor is a teletype: it
         * prints `NN> ` straight after the line before it and the whole thing
         * walks down the screen (express.e:10168-10176). Anchoring the prompt
         * to the bottom of the frame instead put a fixed input line under an
         * empty middle - "feels more like a chat than a message editor", the
         * sysop, 2026-09-14. It also made short messages look wrong, which is
         * most of them.
         */
        entry_row = body_top + (text->count - first);
        if (entry_row > last_row) {
            /* Out of room: drop the oldest visible line and redraw. */
            first += entry_row - last_row;
            entry_row = last_row;
            paint_lines(b, st, text, body_top, first, last_row);
        }

        prompt_style(&is, st, entry_row);
        number_prompt(num, text->count + 1);

        buf[0] = '\0';
        rc = ui_input(b, src, pushback, &is, num, buf, w + 1);
        if (rc < 0) return -1;

        /* express.e:10184 - a bare ENTER ends entry, and the empty line is
           NOT kept. */
        if (buf[0] == '\0') break;

        if (!push_line(text, buf, (int) strlen(buf))) break;

        /* The line just typed is already on that row, minus its number: draw
           it once more so the prompt's `NN>` becomes the line's own. */
        paint_line(b, st, entry_row, text->count, text->line[text->count - 1]);
    }

    if (body_top_out) *body_top_out = body_top;
    if (first_out) *first_out = first;
    return 1;
}

/** Ask for a line number in 1..count. 0 means "they changed their mind". */
static int ask_line_number(ansi_buf *b, const ui_key_source *src, int *pushback,
                           const ui_editor_style *st, int count, const char *what,
                           int *out)
{
    int row = st->top + st->rows - 3;

    for (;;) {
        ui_input_style is;
        char label[64];
        char buf[8];
        int rc, n;

        prompt_style(&is, st, row);
        sprintf(label, "Line number to %s [1..%d]?", what, count);
        buf[0] = '\0';
        rc = ui_input(b, src, pushback, &is, label, buf, (int) sizeof(buf));
        if (rc < 0) return -1;
        if (buf[0] == '\0') { *out = 0; return 1; }   /* express.e:10414 */

        n = atoi(buf);
        if (n >= 1 && n <= count) { *out = n; return 1; }
        /* express.e:10420 says so and asks again. */
    }
}

/** Print one message, wait for nothing - the frame carries it. */
static void say(ansi_buf *b, const ui_editor_style *st, const char *msg)
{
    int row = st->top + st->rows - 2;
    ansi_fill(b, row, st->left, st->cols, st->fg, st->bg);
    ansi_color(b, st->ink, st->bg, 1);
    ansi_text(b, row, st->left, msg, st->cols);
}

int ui_editor(ansi_buf *b, const ui_key_source *src, int *pushback,
              const ui_editor_style *style, ui_editor_text *text)
{
    ui_editor_style fallback;
    int menu_row, body_top = 0, first = 0, last_row, helplist = 0, dirty = 0;

    if (!b || !src || !pushback || !text) return -1;
    if (!style) { ui_editor_style_init(&fallback); style = &fallback; }

    last_row = style->top + style->rows - 3;

    if (enter_lines(b, src, pushback, style, text, &body_top, &first) < 0) return -1;

    /* enter_lines left the chrome and the text on screen; the menu only
       redraws when something has actually changed it. Repainting per keystroke
       is what stopped the frame fitting one XIM message. */

    for (;;) {
        ui_input_style is;
        char buf[16];
        int rc, n;

        /* The menu stands directly under the text, for the same reason the
           entry prompt does: a prompt marooned at the bottom of an empty
           frame reads as a chat window, not as an editor. */
        if (text->count > first + (last_row - body_top))
            first = text->count - (last_row - body_top);
        menu_row = body_top + (text->count - first);
        if (menu_row > last_row) menu_row = last_row;

        if (dirty) {
            paint_lines(b, style, text, body_top, first, last_row);
            dirty = 0;
        }

        if (helplist) {
            /* express.e:10381-10389, minus the two file-transfer options: this
               door does not attach files, and offering a letter that answers
               "no" is worse than not offering it. */
            int row = style->top + 1;
            static const char *help[] = {
                "A>bort", "C>ontinue", "D>elete Lines", "E>dit", "L>ist", "S>ave"
            };
            int i;
            for (i = 0; i < 6 && row < menu_row; i++, row++) {
                ansi_fill(b, row, style->left, style->cols, style->fg, style->bg);
                ansi_color(b, style->ink, style->bg, 1);
                ansi_text(b, row, style->left, help[i], style->cols);
            }
            helplist = 0;
            dirty = 1;    /* the help drew over the text */
        }

        prompt_style(&is, style, menu_row);
        is.upper = 1;
        buf[0] = '\0';
        rc = ui_input(b, src, pushback, &is, "Msg. Options: A,C,D,E,L,S,? >:",
                      buf, (int) sizeof(buf));
        if (rc < 0) return -1;

        switch (buf[0]) {
        case '?':
            helplist = 1;
            break;

        case 'S':                                  /* express.e:10557 */
            return 1;

        case 'A': {                                /* express.e:10567 */
            ui_input_style cs;
            int yes;
            prompt_style(&cs, style, menu_row);
            yes = ui_confirm(b, src, pushback, &cs, "Abort message entry", 0);
            if (yes < 0) return -1;
            if (yes) return 0;
            break;
        }

        case 'C':                                  /* express.e:10452 */
            /* express.e steps BACK one line and reopens it for editing. The
               effect a caller wants is "let me keep typing", and dropping the
               last line to retype it is how the board gives them that. */
            if (text->count > 0) text->count--;
            if (enter_lines(b, src, pushback, style, text, &body_top, &first) < 0)
                return -1;
            dirty = 1;
            break;

        case 'L':                                  /* express.e:10495 */
            dirty = 1;
            break;

        case 'D': {                                /* express.e:10402 */
            ui_input_style cs;
            int yes, i;
            if (text->count < 1) { say(b, style, "No lines to delete."); break; }
            if (ask_line_number(b, src, pushback, style, text->count, "delete", &n) < 0)
                return -1;
            if (n == 0) break;
            prompt_style(&cs, style, menu_row);
            yes = ui_confirm(b, src, pushback, &cs, "Is this the correct line", 0);
            if (yes < 0) return -1;
            if (!yes) break;
            for (i = n - 1; i < text->count - 1; i++)
                memcpy(text->line[i], text->line[i + 1], UI_EDITOR_WIDTH + 1);
            text->count--;
            dirty = 1;
            break;
        }

        case 'E': {                                /* express.e:10467 */
            ui_input_style es;
            char edit[UI_EDITOR_WIDTH + 1];
            if (text->count < 1) { say(b, style, "No Lines to edit!"); break; }
            if (ask_line_number(b, src, pushback, style, text->count, "edit", &n) < 0)
                return -1;
            if (n == 0) break;
            /* Pre-filled, exactly as express.e:10489 hands `temp` to
               lineInput - the caller amends a line, never retypes it. */
            strcpy(edit, text->line[n - 1]);
            prompt_style(&es, style, menu_row);
            {
                char num[8];
                number_prompt(num, n);
                if (ui_input(b, src, pushback, &es, num, edit, width_of(style) + 1) < 0)
                    return -1;
            }
            strcpy(text->line[n - 1], edit);
            dirty = 1;
            break;
        }

        default:
            break;                                 /* unknown: ask again */
        }
    }
}

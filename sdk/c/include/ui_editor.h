/*
 * ui_editor - a message body, typed by the caller, in the door's own chrome.
 *
 * The gap this fills: SUBS reads the message base itself so it runs on a real
 * Amiga, but it could not let anyone WRITE. Pressing P handed `EALL` back to
 * the board and exited the door - "the subs door exits when i press P", the
 * sysop, 2026-09-08.
 *
 * THIS IS THE LINE EDITOR, AND ONLY THE LINE EDITOR, which is exactly the
 * split AmiExpress itself makes.
 *
 * express.e has no built-in full-screen editor. `PROC edit` offers one only by
 * shelling out to an external door - `runSysCommand('FULLEDIT')`,
 * express.e:10125 - and implements the line editor itself
 * (express.e:10147-10480). So a door that embeds a line editor and delegates
 * full-screen is not cutting a corner; it is the board's own architecture.
 *
 * The plan originally called for an ANSI mode here too. Dropped with the
 * sysop, 2026-09-13: this board already has an ANSI message editor
 * (`Doors/mail-composer`, the ANSIEditor widget with a to/subject header), and
 * a second one in C would be a third ANSI editor in a codebase that already
 * has two. That door is TypeScript and cannot run inside a 68K door or on a
 * real Amiga, so the agreed route is to port THAT to 68K later and let it be
 * the FULLEDIT-shaped delegate - not to re-derive one here.
 *
 * So: line mode is a PORT, and parity with `PROC edit` is the standard.
 * Anything here that differs from express.e is a bug, including the width of
 * the `NN> ` prompt and the letters on the menu.
 *
 * Conventions are ui_input's and ui_doc's, deliberately: paints into an
 * `ansi_buf`, reads through a `ui_key_source`, calls `src->flush(src->ctx)`
 * after painting and before every blocking read, and returns 1 accept /
 * 0 cancel / -1 caller gone. The flush is not optional politeness - a widget
 * that paints and then blocks without it is the "pressing P did nothing" bug
 * (ui_key.h).
 */

#ifndef UI_EDITOR_H
#define UI_EDITOR_H

#include "ui_ansi.h"
#include "ui_key.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * express.e's line width - `PROC edit(allowFullscreen=TRUE, maxLineLen=75,
 * ...)` at express.e:10077.
 *
 * NOT 76. That number appears in the same procedure
 * (`editor.editorMaxWidth:=76`, express.e:10117) and belongs to the EXTERNAL
 * full-screen door, a different program with a different limit. Using it here
 * would wrap one column wider than the board does.
 */
#define UI_EDITOR_WIDTH 75

/** Hard ceiling on lines held, so a door can size its own storage. */
#define UI_EDITOR_MAX_LINES 200

/** Where the editor draws, and what it is writing. */
typedef struct {
    int top, left, cols, rows;
    int fg, bg, ink;
    /** Columns of text per line. 0 takes UI_EDITOR_WIDTH. */
    int width;
    /**
     * Shown above the text so the caller can see what they are answering.
     * Either may be NULL.
     */
    const char *to;
    const char *subject;
} ui_editor_style;

/** 80x24, express.e's width, no header. */
void ui_editor_style_init(ui_editor_style *style);

/**
 * The text being written: a fixed block of lines the caller owns.
 *
 * Plain `char` storage rather than pointers, because a 68K door has no
 * allocator worth the risk mid-session and because the door hands the whole
 * thing to `ae_dos_write` unchanged.
 */
typedef struct {
    char line[UI_EDITOR_MAX_LINES][UI_EDITOR_WIDTH + 1];
    int count;
} ui_editor_text;

/** Empty it. Always call this before the first ui_editor on a buffer. */
void ui_editor_text_init(ui_editor_text *text);

/**
 * Append `s`, breaking at `width` on whitespace where it can.
 *
 * Exposed because quoting an original message needs it, and because it is the
 * piece most worth testing alone - a wrap that splits mid-word is what turns a
 * quoted reply into rubble.
 *
 * Returns the number of lines added, or 0 when the buffer is full.
 */
int ui_editor_append_wrapped(ui_editor_text *text, const char *s, int width);

/**
 * Let the caller write a message.
 *
 * Returns 1 when they SAVED, 0 when they ABORTED, -1 when the line dropped.
 * A door must treat 0 and -1 differently: an abort goes back to the message
 * list, a lost carrier ends the session.
 *
 * `text` is edited in place and still holds whatever was typed after an abort,
 * so a door may offer it back. On -1 its contents are unspecified beyond being
 * safe to read.
 */
int ui_editor(ansi_buf *b, const ui_key_source *src, int *pushback,
              const ui_editor_style *style, ui_editor_text *text);

#ifdef __cplusplus
}
#endif

#endif /* UI_EDITOR_H */

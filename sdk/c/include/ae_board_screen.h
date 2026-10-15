/*
 * ae_board_screen - the client for the board's AEW_SCREEN (10800).
 *
 * One conversation any C door can have: the caller's real size, a board wipe
 * around a screen, and mouse events. A request in String, the answer in
 * String, over ae_field_exchange. The board side is
 * web/backend/src/amiga-emulation/xim/board-screen.ts.
 *
 *   SIZE            -> "cols TAB rows"
 *   WIPE IN <c>     -> "OK" (the board now holds the door's next output) | "NO"
 *   WIPE OUT <c>    -> as IN, for the reveal played in reverse
 *   WIPE END        -> "OK" (the held output has been played)
 *   MOUSE ON / OFF  -> "OK" | "NO" (not an ANSI caller)
 *   MOUSE?          -> "kind TAB col TAB row" (1-based), "" when none queued
 *
 * A board that does not know the field answers nothing: every call then says
 * "not available" and the door carries on as it did.
 */

#ifndef AE_BOARD_SCREEN_H
#define AE_BOARD_SCREEN_H

#ifdef __cplusplus
extern "C" {
#endif

#define AE_BS_GONE (-1)

/** kind: P press, R release, M move, U wheel up, D wheel down. col/row are 1-based. */
typedef struct { char kind; int col; int row; } ae_mouse_event;

/** 1 answered, 0 silent board (outputs untouched), AE_BS_GONE. */
int ae_bs_size(int *cols, int *rows);
/** 1 capturing (draw now, then ae_bs_wipe_end), 0 no wipe (draw normally), AE_BS_GONE.
    `conceal` 0 plays the screen in, 1 plays it out; `letter` is the board's wipe code, 0 = none. */
int ae_bs_wipe_begin(char letter, int conceal);
/** 1 played, 0 not, AE_BS_GONE. */
int ae_bs_wipe_end(void);
/** 1 on, 0 not available, AE_BS_GONE. */
int ae_bs_mouse(int on);
/** One MOUSE? round trip: 1 event, 0 none, AE_BS_GONE. */
int ae_bs_mouse_next(ae_mouse_event *ev);
/**
 * Everything queued, in order, up to `cap` events (the latest always kept:
 * once full, the last slot is overwritten). Returns the count, or AE_BS_GONE.
 *
 * Asks until the board answers empty and NEVER stops after one event: the
 * wake byte (UI_KEY_MOUSE) re-arms only after the queue has drained, so a
 * door that reads one event leaves the rest unread and is never woken again.
 */
int ae_bs_mouse_drain(ae_mouse_event *evs, int cap);

/** Pure parsers: strict, 0 on anything malformed, outputs untouched on failure. */
int ae_bs_parse_size(const char *reply, int *cols, int *rows);
int ae_bs_parse_mouse(const char *reply, ae_mouse_event *ev);

#ifdef __cplusplus
}
#endif

#endif /* AE_BOARD_SCREEN_H */

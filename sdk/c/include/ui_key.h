/*
 * ui_key - one keystroke, decoded.
 *
 * LIFTED from examples/doorrepo-c/flow.h and flow.c, where this exact
 * decoder has been reading arrows in a real C door. The reasoning below is
 * that file's, unchanged, because the thing it explains cost six debugging
 * rounds and is not obvious from the code.
 *
* ---- Key decoding: the ESC problem -------------------------------------
 *
 * Cursor keys arrive as ESC [ A and friends, one byte per read, and a lone
 * ESC is the natural "back" key. Without a clock the two share a first byte
 * and nothing else: DOORMAN spent six debugging rounds on that ambiguity
 * (handoff.md, 2026-08-17), and DoorRepo's answer was to have NO ESC
 * binding and read the byte after an ESC blocking - so a user's ESC swallowed
 * whatever they pressed next and delivered THAT instead. ESC then Q from a
 * sub-screen went straight out of the door ("q quits doorrepo and it's a
 * stupid button to use for back out - use ESC!", the sysop, 2026-09-01).
 *
 * The clock is the door layer's non-consuming probe (ae_input_pending):
 * settle for a moment, and if nothing is queued the ESC was alone. A byte
 * that turns out not to belong to a sequence is handed BACK, never eaten.
 *
 * The values are what doorrepo.c's UI_KEY_* aliases have always been. */
#define UI_KEY_UP    1000
#define UI_KEY_DOWN  1001
#define UI_KEY_PGUP  1002
#define UI_KEY_PGDN  1003
#define UI_KEY_HOME  1004
#define UI_KEY_END   1005
#define UI_KEY_ENTER 1006
#define UI_KEY_ESC   1007

typedef struct ui_key_source {
    int  (*next)(void *ctx);     /* blocking read of one byte; < 0 = user gone */
    int  (*pending)(void *ctx);  /* non-zero if a byte is queued; must NOT consume */
    void (*settle)(void *ctx);   /* wait long enough for a sequence's tail to land; may be NULL */
    void *ctx;
} ui_key_source;

/* Decodes what follows an ESC that the caller has already read. Returns
 * UI_KEY_ESC for a lone ESC, a UI_KEY_* for a recognised CSI/SS3
 * sequence, 0 for one it does not know, or the negative value next()
 * reported for a lost user. *pushback receives a byte that was read but
 * belongs to the NEXT key (ESC then Q, typed fast), else -1; the caller
 * must deliver it before reading again. */
int ui_decode_escape(const ui_key_source *src, int *pushback);

#ifndef UI_KEY_H
#define UI_KEY_H

#ifdef __cplusplus
extern "C" {
#endif

/*
 * The whole loop: read one key, decoding an escape sequence if that is what
 * arrives. `pushback` is the caller's one-byte holding pen - initialise it
 * to -1 and hand the same pointer back every time.
 */
int ui_key_read(const ui_key_source *src, int *pushback);

#ifdef __cplusplus
}
#endif

#endif /* UI_KEY_H */

/*
 * ae_box - a drawn frame.
 *
 * The "widget" of the phase 0 measurement: a door that never draws a box
 * must not carry this code. It is deliberately fat enough to see in a size
 * table (a character table plus the drawing loop).
 */
#ifndef AE_BOX_H
#define AE_BOX_H
#ifdef __cplusplus
extern "C" {
#endif

/** Draw a frame `width` x `height` at the cursor, with an optional title. */
void ae_box(int width, int height, const char *title);

#ifdef __cplusplus
}
#endif
#endif /* AE_BOX_H */

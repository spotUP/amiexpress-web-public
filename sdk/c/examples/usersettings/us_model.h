/* us_model.h - the W door's rows: pure, no board, no screen. C89. */
#ifndef US_MODEL_H
#define US_MODEL_H

#include "ae_userfield.h"

#define US_FIELDS 17
#define US_MAX_DOORS 24
#define US_MAX_ROWS 120
/* The list draws this many columns of caret before a row's text. */
#define US_CARET_WIDTH 2

typedef enum { US_ROW_HEADER, US_ROW_FIELD, US_ROW_VALUE, US_ROW_DOOR } us_row_kind;
typedef struct { us_row_kind kind; int ref; } us_row;   /* ref: field number, door index, or header id */
typedef struct {
    ae_uf_field field[US_FIELDS];
    ae_uf_door door[US_MAX_DOORS];
    int door_count;
    int cols;
    int stacked;                 /* 40-column tier: the value on the line under its label */
    us_row row[US_MAX_ROWS];
    int row_count;
    char header[US_MAX_DOORS + 6][40];
    char text[256];
} us_model;

void us_model_layout(us_model *m, int cols);
int us_row_selectable(const us_model *m, int index);
int us_step(const us_model *m, int from, int delta);
int us_first(const us_model *m);
int us_row_of_field(const us_model *m, int n);
const char *us_row_text(us_model *m, int index);
/* Length of a row's text BEFORE it is clipped to the room: a row longer than
   us_text_room() loses its tail on the glass, so the tests ask this. */
int us_row_length(us_model *m, int index);
/* Columns a row's text has: the list is cols-1 wide, takes a scroll bar and a caret. */
int us_text_room(int cols);
/* Width of the message rows, and of the wrap that fills them. One number for both. */
int us_message_width(int cols);
/* Where the editor's bar starts: its text sits one column right of it
   (ui_input pads one cell), so the text lands on us_value_column(). */
int us_editor_left(const us_model *m);
/* The 1-based screen column where a field's value is drawn: the ONE number
   both the row text and the editor use (ruling C3). */
int us_value_column(const us_model *m);
int us_jump(int *pending, int key);       /* field number to select, or -1 */
int us_wrap(const char *text, int width, char lines[][81], int max_lines);

#endif /* US_MODEL_H */

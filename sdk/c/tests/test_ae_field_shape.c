/* test_ae_field_shape.c - the Data-or-String list ae_transport_amiga reads every field by. */
#include "../include/ae_field_shape.h"
#include "../include/ae_session.h"
#include <assert.h>
#include <stdio.h>

int main(void)
{
    /* DT_ISANSI answers in Data (express.e:3907-3908). Read from String it was empty, so every C door saw colour
       off and the menu door drew its selection as ">>" with no bar. */
    assert(ae_field_answers_in_data(AE_FIELD_IS_ANSI));
    printf("  [OK] DT_ISANSI is read from Data, so an ANSI caller is not told colour is off\n");

    assert(ae_field_answers_in_data(AE_FIELD_SCREEN_COLS) && ae_field_answers_in_data(AE_FIELD_SCREEN_ROWS));
    assert(ae_field_answers_in_data(AE_FIELD_LAST_READ) && ae_field_answers_in_data(AE_FIELD_LAST_SCANNED));
    assert(ae_field_answers_in_data(AE_FIELD_MSGBASE_FUNC) && ae_field_answers_in_data(AE_FIELD_MSGBASE_CONF));
    /* String fields stay String: a numeric-looking one (BB_CONFNUM is StringF'd) and a text one. */
    assert(!ae_field_answers_in_data(AE_FIELD_CONFERENCE));
    assert(!ae_field_answers_in_data(AE_FIELD_USER_LOCATION));
    assert(!ae_field_answers_in_data(AE_FIELD_TIME_LEFT));
    printf("  [OK] the geometry, pointer and message-base fields read Data; String fields stay String\n");
    printf("test_ae_field_shape: OK\n");
    return 0;
}

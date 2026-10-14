/*
 * ae_userfield - the W door's client for the board's AEW_USERFIELD (10600).
 *
 * A request in String, the answer in String, over ae_field_exchange. The wire
 * table is W4 of the W user-settings door plan; the board side is
 * web/backend/src/amiga-emulation/xim/userfield.ts.
 *
 *   OPEN                    -> "OK" | refusal | nothing
 *   GET n                   -> "H" | "state TAB label TAB value TAB kind TAB maxlen TAB prompt"
 *   SET n value             -> "OK TAB text" | "SAME" | "DENIED" | "AGAIN" | "NO TAB retry TAB text"
 *   CHOICES n i             -> the i-th choice, "" past the end
 *   PASSWORD first TAB 2nd  -> as SET
 *   DOORS i                 -> "command TAB section TAB label TAB description", "" past the end
 *   RESUME row / RESUME?    -> "OK" / the armed row, "" when none
 *
 * Text is latin1 and travels as it is.
 */

#ifndef AE_USERFIELD_H
#define AE_USERFIELD_H

#ifdef __cplusplus
extern "C" {
#endif

/* The outcome of a write. SILENT is 6, not 0: 0 is what ae_uf_open returns for
   a refusal, and a refused caller must not be told the board cannot host W. */
#define AE_UF_STORED   1
#define AE_UF_SAME     2
#define AE_UF_DENIED   3
#define AE_UF_REFUSED  4
#define AE_UF_AGAIN    5
#define AE_UF_SILENT   6    /* the board answered nothing: not a board that hosts W */
#define AE_UF_GONE    -1    /* carrier lost */

typedef struct {
    int number;
    char state;
    char kind;
    int maxlen;
    char label[32];
    char value[200];   /* any 198-byte answer fits whole: a legacy email can exceed 64 */
    char prompt[72];
} ae_uf_field;

typedef struct {
    char command[24];
    char section[32];
    char label[40];
    char description[100];
} ae_uf_door;

typedef struct {
    int outcome;
    int retry;
    char text[200];
} ae_uf_answer;

int ae_uf_open(void);                                   /* 1 OK, 0 refused, AE_UF_SILENT, AE_UF_GONE */
int ae_uf_get(int n, ae_uf_field *out);                 /* 1, 0 nothing, AE_UF_GONE */
int ae_uf_set(int n, const char *value, ae_uf_answer *out);
int ae_uf_password(const char *first, const char *second, ae_uf_answer *out);
int ae_uf_choice(int n, int index, char *out, int cap); /* length, 0 past the end, AE_UF_GONE */
int ae_uf_door_at(int index, ae_uf_door *out);          /* 1, 0 past the end, AE_UF_GONE */
int ae_uf_resume_arm(int row);                          /* 1 armed, 0 not, AE_UF_GONE */
int ae_uf_resume_take(void);                            /* row >= 0, -2 none, AE_UF_GONE */

/* pure, for the tests */
int ae_uf_parse_field(int n, const char *reply, ae_uf_field *out);
int ae_uf_parse_answer(const char *reply, ae_uf_answer *out);
int ae_uf_parse_door(const char *reply, ae_uf_door *out);

#ifdef __cplusplus
}
#endif

#endif /* AE_USERFIELD_H */

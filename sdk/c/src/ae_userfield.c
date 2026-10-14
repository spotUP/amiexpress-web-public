/* ae_userfield.c - the W door's client for AEW_USERFIELD (10600). C89. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "aedoor.h"
#include "ae_session.h"
#include "ae_userfield.h"

/* Copy the text up to the next TAB (or the end) into dest; return the start of the next field, or 0. */
static const char *take(const char *from, char *dest, int cap)
{
    int n = 0;
    while (*from && *from != '\t') {
        if (n < cap - 1) dest[n++] = *from;
        from++;
    }
    dest[n] = '\0';
    return *from == '\t' ? from + 1 : 0;
}

static int ask(const char *request, char *reply, int cap)
{
    return ae_field_exchange(AE_FIELD_USERFIELD, request, reply, cap);
}

int ae_uf_parse_field(int n, const char *reply, ae_uf_field *out)
{
    char num[8];
    const char *p = reply;
    memset(out, 0, sizeof(*out));
    out->number = n;
    if (!reply || !reply[0]) return 0;
    out->state = reply[0];
    if (out->state == 'H') return 1;
    if (!(p = (reply[1] == '\t') ? reply + 2 : 0)) return 0;
    if (!(p = take(p, out->label, (int)sizeof(out->label)))) return 0;
    if (!(p = take(p, out->value, (int)sizeof(out->value)))) return 0;
    out->kind = *p;
    if (!(p = (p[0] && p[1] == '\t') ? p + 2 : 0)) return 0;
    if (!(p = take(p, num, (int)sizeof(num)))) return 0;
    out->maxlen = atoi(num);
    take(p, out->prompt, (int)sizeof(out->prompt));
    return 1;
}

int ae_uf_parse_answer(const char *reply, ae_uf_answer *out)
{
    const char *p;
    memset(out, 0, sizeof(*out));
    if (!reply || !reply[0]) return out->outcome = AE_UF_SILENT;
    if (strncmp(reply, "OK\t", 3) == 0) { take(reply + 3, out->text, (int)sizeof(out->text)); return out->outcome = AE_UF_STORED; }
    if (strcmp(reply, "SAME") == 0) return out->outcome = AE_UF_SAME;
    if (strcmp(reply, "DENIED") == 0) return out->outcome = AE_UF_DENIED;
    if (strcmp(reply, "AGAIN") == 0) return out->outcome = AE_UF_AGAIN;
    if (strncmp(reply, "NO\t", 3) == 0) {
        out->retry = reply[3] == '1';
        p = reply[4] == '\t' ? reply + 5 : reply + 4;
        strncpy(out->text, p, sizeof(out->text) - 1);
        return out->outcome = AE_UF_REFUSED;
    }
    return out->outcome = AE_UF_SILENT;
}

int ae_uf_parse_door(const char *reply, ae_uf_door *out)
{
    const char *p;
    memset(out, 0, sizeof(*out));
    if (!reply || !reply[0]) return 0;
    if (!(p = take(reply, out->command, (int)sizeof(out->command)))) return 0;
    if (!(p = take(p, out->section, (int)sizeof(out->section)))) return 0;
    p = take(p, out->label, (int)sizeof(out->label));
    if (p) take(p, out->description, (int)sizeof(out->description));
    return 1;
}

int ae_uf_open(void)
{
    char reply[AE_MAX_LINE + 1];
    int n = ask("OPEN", reply, (int)sizeof(reply));
    if (n < 0) return AE_UF_GONE;
    if (n == 0) return AE_UF_SILENT;
    return strcmp(reply, "OK") == 0 ? 1 : 0;
}

int ae_uf_get(int n, ae_uf_field *out)
{
    char req[16], reply[AE_MAX_LINE + 1];
    int got;
    sprintf(req, "GET %d", n);
    got = ask(req, reply, (int)sizeof(reply));
    if (got < 0) return AE_UF_GONE;
    return ae_uf_parse_field(n, reply, out);
}

int ae_uf_set(int n, const char *value, ae_uf_answer *out)
{
    char req[AE_MAX_LINE + 1], reply[AE_MAX_LINE + 1];
    int got;
    sprintf(req, "SET %d ", n);
    strncat(req, value ? value : "", sizeof(req) - strlen(req) - 1);
    got = ask(req, reply, (int)sizeof(reply));
    if (got < 0) { memset(out, 0, sizeof(*out)); return out->outcome = AE_UF_GONE; }
    return ae_uf_parse_answer(reply, out);
}

int ae_uf_password(const char *first, const char *second, ae_uf_answer *out)
{
    char req[AE_MAX_LINE + 1], reply[AE_MAX_LINE + 1];
    volatile char *wipe;
    int got, i;
    strcpy(req, "PASSWORD ");
    strncat(req, first ? first : "", 50);
    strcat(req, "\t");
    strncat(req, second ? second : "", 50);
    got = ask(req, reply, (int)sizeof(reply));
    /* The text lives only as long as the round trip. Through a volatile
       pointer so the compiler cannot drop the stores as dead. */
    wipe = req;
    for (i = 0; i < (int)sizeof(req); i++) wipe[i] = 0;
    if (got < 0) { memset(out, 0, sizeof(*out)); return out->outcome = AE_UF_GONE; }
    return ae_uf_parse_answer(reply, out);
}

int ae_uf_choice(int n, int index, char *out, int cap)
{
    char req[24];
    sprintf(req, "CHOICES %d %d", n, index);
    return ask(req, out, cap);
}

int ae_uf_door_at(int index, ae_uf_door *out)
{
    char req[16], reply[AE_MAX_LINE + 1];
    int got;
    sprintf(req, "DOORS %d", index);
    got = ask(req, reply, (int)sizeof(reply));
    if (got < 0) return AE_UF_GONE;
    return got == 0 ? 0 : ae_uf_parse_door(reply, out);
}

int ae_uf_resume_arm(int row)
{
    char req[16], reply[8];
    int got;
    sprintf(req, "RESUME %d", row);
    got = ask(req, reply, (int)sizeof(reply));
    if (got < 0) return AE_UF_GONE;
    return strcmp(reply, "OK") == 0;
}

int ae_uf_resume_take(void)
{
    char reply[16];
    int got = ask("RESUME?", reply, (int)sizeof(reply));
    if (got < 0) return AE_UF_GONE;
    return got == 0 ? -2 : atoi(reply);
}

/*
 * The rows ACHIEVE prints. See achieve_rows.h for what parity covers and
 * what is exempt.
 *
 * Every format string here is `Doors/achieve/app.ts` transcribed. Where the
 * twin uses JavaScript's padding, the C equivalent is spelled out:
 *
 *   String(n).padStart(3)          ->  "%3s"
 *   handle.padEnd(20).slice(0,20)  ->  "%-20.20s"   (pad, then truncate)
 *   handle.slice(0,16).padEnd(16)  ->  "%-16.16s"   (truncate, then pad)
 *
 * The last two are the same string for every input, which is why one
 * conversion serves both: `.NN` truncates and `-NN` pads to the same NN.
 */

#include "achieve_rows.h"

#include <stdio.h>
#include <string.h>

void achieve_rows_split(char *listing, achieve_rows *out)
{
    char *p = listing;
    int first_line = 1;

    out->count = 0;
    if (listing == 0) return;

    while (*p != '\0' && out->count < ACHIEVE_ROWS_MAX) {
        char *line = p;
        char *end = strchr(p, '\n');
        int field = 0;

        if (end != 0) {
            *end = '\0';
            p = end + 1;
        } else {
            p = line + strlen(line);
        }
        if (end != 0 && end > line && end[-1] == '\r') end[-1] = '\0';
        if (line[0] == '\0') continue;

        if (first_line) {
            first_line = 0;
            continue;   /* ACHIEVE|1|<revision>|<count> */
        }

        out->row[out->count].field[field++] = line;
        while (field < ACHIEVE_FIELDS_MAX) {
            char *bar = strchr(line, '|');
            if (bar == 0) break;
            *bar = '\0';
            line = bar + 1;
            out->row[out->count].field[field++] = line;
        }
        out->row[out->count].fields = field;
        out->count++;
    }
}

const char *achieve_rows_field(const achieve_rows *rows, int row, int index)
{
    if (rows == 0 || row < 0 || row >= rows->count) return "";
    if (index < 0 || index >= rows->row[row].fields) return "";
    return rows->row[row].field[index] != 0 ? rows->row[row].field[index] : "";
}

const char *achieve_clip(const char *text, int width, char *buf, unsigned long size)
{
    unsigned long len;

    if (text == 0) return "";
    len = (unsigned long)strlen(text);
    if (width < 0) width = 0;
    if (len <= (unsigned long)width) return text;
    /* The twin keeps `width - 1` characters and appends `~`; a width of 0
       keeps none, which is `Math.max(0, width - 1)`. */
    if (size == 0) return "";
    {
        unsigned long keep = width > 0 ? (unsigned long)(width - 1) : 0;
        if (keep > size - 2) keep = size - 2;
        memcpy(buf, text, keep);
        buf[keep] = '~';
        buf[keep + 1] = '\0';
    }
    return buf;
}

/**
 * The tier tag, as the twin's TIER_TAG maps it: a known tier has a word, and
 * anything else is its first three characters, upper-cased.
 */
static const char *tier_tag(const char *tier, char *buf, unsigned long size)
{
    unsigned long i;

    if (strcmp(tier, "bronze") == 0) return "BRZ";
    if (strcmp(tier, "silver") == 0) return "SLV";
    if (strcmp(tier, "gold") == 0) return "GLD";
    if (strcmp(tier, "platinum") == 0) return "PLT";

    if (size == 0) return "";
    for (i = 0; i < 3 && i + 1 < size && tier[i] != '\0'; i++) {
        char c = tier[i];
        buf[i] = (c >= 'a' && c <= 'z') ? (char)(c - 'a' + 'A') : c;
    }
    buf[i] = '\0';
    return buf;
}

const char *achieve_menu_row(int index, int wide)
{
    switch (index) {
        case 0: return wide ? "This board's scoreboard" : "Board scoreboard";
        case 1: return wide ? "The global scoreboard" : "Global scoreboard";
        case 2: return wide ? "The catalog, by family" : "Catalog";
        /* The twin offers the account flow; this door says where it lives.
           A written exemption, not a divergence to fix here. */
        case 3: return wide ? "Account: on the web terminal" : "Account: web only";
        default: return wide ? "Leave the door" : "Leave";
    }
}

const char *achieve_board_row(const achieve_rows *rows, int index, int wide,
                              char *buf, unsigned long size)
{
    if (rows == 0 || index < 0 || index >= rows->count || size == 0) return "";

    /* leaderboardLines():
       `${rank.padStart(3)}. ${handle} ${points.padStart(5)} pts ${unlocks.padStart(3)}`
       with handle 20 wide at 80 columns and 16 wide at 40. */
    sprintf(buf, wide ? "%3s. %-20.20s %5s pts %3s" : "%3s. %-16.16s %5s pts %3s",
            achieve_rows_field(rows, index, 0),
            achieve_rows_field(rows, index, 1),
            achieve_rows_field(rows, index, 2),
            achieve_rows_field(rows, index, 3));
    return buf;
}

const char *achieve_catalog_row(const achieve_rows *rows, int index, int wide,
                                char *buf, unsigned long size)
{
    char tag[8];

    if (rows == 0 || index < 0 || index >= rows->count || size == 0) return "";

    /* catalogLines(), with the unlocked mark always the twin's not-unlocked
       space: this door has no caller identity to mark with. */
    if (wide) {
        sprintf(buf, " [%s] %-20.20s %s",
                tier_tag(achieve_rows_field(rows, index, 2), tag, sizeof tag),
                achieve_rows_field(rows, index, 5),
                achieve_rows_field(rows, index, 6));
    } else {
        sprintf(buf, " [%s] %s",
                tier_tag(achieve_rows_field(rows, index, 2), tag, sizeof tag),
                achieve_rows_field(rows, index, 5));
    }
    return buf;
}

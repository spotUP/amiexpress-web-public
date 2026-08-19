/* infocache.c - see infocache.h. */

#include <string.h>
#include "infocache.h"

void info_cache_init(info_cache *c, info_cache_slot *slots, char *data,
                     int slot_count, unsigned long entry_size)
{
    int i;

    if (c == (info_cache *) 0) {
        return;
    }
    c->slots = slots;
    c->data = data;
    c->slot_count = slot_count;
    c->entry_size = entry_size;
    c->clock = 0;

    for (i = 0; i < slot_count; i++) {
        slots[i].key[0] = '\0';
        slots[i].len = 0;
        slots[i].present = 0;
        slots[i].used = 0;
        slots[i].stamp = 0;
    }
}

char *info_cache_buffer(const info_cache *c, int slot)
{
    if (c == (const info_cache *) 0 || slot < 0 || slot >= c->slot_count) {
        return (char *) 0;
    }
    return c->data + ((unsigned long) slot * (c->entry_size + 1));
}

int info_cache_find(info_cache *c, const char *key)
{
    int i;

    if (c == (info_cache *) 0 || key == (const char *) 0) {
        return -1;
    }
    for (i = 0; i < c->slot_count; i++) {
        if (c->slots[i].used && strcmp(c->slots[i].key, key) == 0) {
            c->clock++;
            c->slots[i].stamp = c->clock;
            return i;
        }
    }
    return -1;
}

int info_cache_reserve(info_cache *c, const char *key, unsigned long *cap_out)
{
    int i;
    int victim = 0;

    if (c == (info_cache *) 0 || key == (const char *) 0 || c->slot_count <= 0) {
        return -1;
    }

    /* A slot already holding this key is reused rather than duplicated. The
     * door's loaders call info_cache_find() first, so this is not the normal
     * path - but two slots with the same key would waste one and let a stale
     * copy shadow the fresh one depending on scan order, which is a bug
     * waiting for a caller that reserves without looking first. */
    for (i = 0; i < c->slot_count; i++) {
        if (c->slots[i].used && strcmp(c->slots[i].key, key) == 0) {
            victim = i;
            goto claim;
        }
    }

    /* An unused slot first, so a cold cache fills before it evicts. */
    for (i = 0; i < c->slot_count; i++) {
        if (!c->slots[i].used) {
            victim = i;
            break;
        }
        if (c->slots[i].stamp < c->slots[victim].stamp) {
            victim = i;
        }
    }

claim:
    strncpy(c->slots[victim].key, key, INFO_CACHE_KEY_MAX - 1);
    c->slots[victim].key[INFO_CACHE_KEY_MAX - 1] = '\0';
    c->slots[victim].len = 0;
    c->slots[victim].present = 0;
    c->slots[victim].used = 1;
    c->clock++;
    c->slots[victim].stamp = c->clock;

    info_cache_buffer(c, victim)[0] = '\0';

    if (cap_out != (unsigned long *) 0) {
        *cap_out = c->entry_size;
    }
    return victim;
}

void info_cache_commit(info_cache *c, int slot, unsigned long len, int present)
{
    char *buf;

    if (c == (info_cache *) 0 || slot < 0 || slot >= c->slot_count) {
        return;
    }
    if (len > c->entry_size) {
        len = c->entry_size;
    }
    c->slots[slot].len = len;
    c->slots[slot].present = present;

    buf = info_cache_buffer(c, slot);
    buf[len] = '\0';
}

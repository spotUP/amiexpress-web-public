/* infocache.h - a small fixed-size LRU for the info pane's per-archive text.
 *
 * The browser's detail pane shows the FILE_ID.DIZ (or the archive listing,
 * or the documentation) for whichever entry is selected, and each of those
 * is an HTTP fetch. All three used to be cached "for exactly one archive",
 * on the reasoning that only moving the cursor invalidates them - which is
 * exactly backwards: moving the cursor is what a person browsing a catalog
 * does continuously. Measured against the live server, every arrow key cost
 * a fresh TCP connection and 430-620 ms with "Fetching..." on the screen,
 * and arrowing back to the entry you just looked at fetched it again.
 *
 * So: keep the last N. Nothing here does I/O or knows about HTTP - it hands
 * out slots and remembers which was used least recently, so it can be tested
 * without a server.
 *
 * The caller owns all the storage (no malloc: this is a C89 door with a
 * declared 8 KB stack, and everything large in it is static). Give it an
 * array of slots and one flat byte slab of slot_count * (entry_size + 1).
 *
 * A NEGATIVE result is a cached result. Most catalog rows have no DIZ at
 * all, so "the server said 404" must be remembered as firmly as a hit -
 * otherwise the commonest case stays uncached and nothing improves.
 *
 * C89. No stdint.h (not available on the m68k-amiga-elf/vbcc toolchain).
 */

#ifndef DOORREPO_INFOCACHE_H
#define DOORREPO_INFOCACHE_H

#define INFO_CACHE_KEY_MAX 64

typedef struct {
    char key[INFO_CACHE_KEY_MAX];
    unsigned long len;      /* bytes held in this slot's data */
    int present;            /* 1 = the server had it; 0 = it does not exist */
    int used;               /* 0 = never filled */
    unsigned long stamp;    /* LRU clock value at last touch */
} info_cache_slot;

typedef struct {
    info_cache_slot *slots;
    char *data;
    int slot_count;
    unsigned long entry_size;   /* usable bytes per slot, EXCLUDING the NUL */
    unsigned long clock;
} info_cache;

/* `data` must be at least slot_count * (entry_size + 1) bytes. */
void info_cache_init(info_cache *c, info_cache_slot *slots, char *data,
                     int slot_count, unsigned long entry_size);

/* Slot index holding `key`, or -1 when it is not cached. A hit is touched,
 * so it becomes the most recently used. */
int info_cache_find(info_cache *c, const char *key);

/* Claims a slot for `key`, evicting the least recently used entry when the
 * cache is full, and returns its index. The slot is emptied (len 0, present
 * 0) and ready to be filled, and *cap_out (when given) receives how many
 * bytes it may hold. Returns -1 only for a cache with no slots. */
int info_cache_reserve(info_cache *c, const char *key, unsigned long *cap_out);

/* Writable storage for a slot. NULL for an out-of-range index. */
char *info_cache_buffer(const info_cache *c, int slot);

/* Records the outcome of a fetch into a slot reserved above. */
void info_cache_commit(info_cache *c, int slot, unsigned long len, int present);

#endif /* DOORREPO_INFOCACHE_H */

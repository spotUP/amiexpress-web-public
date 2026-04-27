/* glib-stub.h — minimal GLib type stubs for WASM build */
#ifndef GLIB_STUB_H
#define GLIB_STUB_H

#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>

typedef int          gboolean;
typedef char         gchar;
typedef int          gint;
typedef unsigned int guint;
typedef long         glong;
typedef void*        gpointer;
typedef double       gdouble;
typedef float        gfloat;

#define TRUE  1
#define FALSE 0
#define G_GNUC_UNUSED __attribute__((unused))
#define GINT_TO_POINTER(i) ((gpointer)(long)(i))
#define GPOINTER_TO_INT(p) ((gint)(long)(p))
#define g_assert(x) do { if (!(x)) abort(); } while(0)

/* GDate stub */
typedef struct { unsigned int julian_days; } GDate;
static inline void g_date_clear(GDate *d, unsigned int n) { memset(d, 0, sizeof(GDate)*n); }
static inline void g_date_set_time_t(GDate *d, long t) { d->julian_days = (unsigned int)(t / 86400); }
static inline void g_date_add_days(GDate *d, unsigned int days) { d->julian_days += days; }
static inline int  g_date_days_between(const GDate *d1, const GDate *d2) {
  return (int)d2->julian_days - (int)d1->julian_days;
}
static inline gboolean g_date_valid(const GDate *d) { return d->julian_days > 0; }

/* GSList */
typedef struct _GSList { void *data; struct _GSList *next; } GSList;
static inline GSList* g_slist_append(GSList *list, void *data) {
  GSList *node = (GSList*)malloc(sizeof(GSList));
  node->data = data; node->next = NULL;
  if (!list) return node;
  GSList *tail = list; while (tail->next) tail = tail->next; tail->next = node; return list;
}
static inline GSList* g_slist_prepend(GSList *list, void *data) {
  GSList *node = (GSList*)malloc(sizeof(GSList)); node->data = data; node->next = list; return node;
}
static inline GSList* g_slist_remove(GSList *list, const void *data) {
  GSList *prev = NULL, *cur = list;
  while (cur) { if (cur->data == data) { if (prev) prev->next = cur->next; else list = cur->next; free(cur); return list; } prev = cur; cur = cur->next; } return list;
}
static inline void g_slist_free(GSList *list) { while (list) { GSList *next = list->next; free(list); list = next; } }
static inline guint g_slist_length(GSList *list) { guint n = 0; while (list) { n++; list = list->next; } return n; }
static inline GSList* g_slist_nth(GSList *list, guint n) { while (list && n--) list = list->next; return list; }
static inline void* g_slist_nth_data(GSList *list, guint n) { GSList *node = g_slist_nth(list, n); return node ? node->data : NULL; }
static inline GSList* g_slist_find(GSList *list, const void *data) { while (list) { if (list->data == data) return list; list = list->next; } return NULL; }
static inline GSList* g_slist_find_custom(GSList *list, const void *data, int (*cmp)(const void*, const void*)) {
  while (list) { if (cmp(list->data, data) == 0) return list; list = list->next; } return NULL;
}

/* String utilities */
static inline gchar* g_strdup(const gchar *s) { return s ? strdup(s) : NULL; }
static inline void   g_free(void *p) { free(p); }
static inline gchar* g_strdup_printf(const gchar *fmt, ...) {
  char buf[2048]; va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof(buf), fmt, ap); va_end(ap); return strdup(buf);
}
static inline gchar* g_strndup(const gchar *s, gsize n) {
  char *r = (char*)malloc(n+1); if (r) { memcpy(r, s, n); r[n] = '\0'; } return r;
}
static inline gboolean g_str_equal(const char *a, const char *b) { return strcmp(a,b)==0; }
static inline int g_ascii_strcasecmp(const char *a, const char *b) {
  while (*a && *b) { int d = tolower((unsigned char)*a) - tolower((unsigned char)*b); if (d) return d; a++; b++; } return (unsigned char)*a - (unsigned char)*b;
}
#include <ctype.h>
typedef unsigned long gsize;
typedef long gssize;

/* Misc */
#define g_new(type, n)  ((type*)malloc(sizeof(type)*(n)))
#define g_new0(type, n) ((type*)calloc((n), sizeof(type)))
#define g_renew(type, mem, n) ((type*)realloc((mem), sizeof(type)*(n)))

/* GString stub (used in configfile.c) */
typedef struct { gchar *str; gsize len; gsize allocated_len; } GString;
static inline GString* g_string_new(const gchar *init) {
  GString *s = g_new(GString, 1);
  s->str = init ? g_strdup(init) : g_strdup("");
  s->len = s->str ? strlen(s->str) : 0; s->allocated_len = s->len + 1; return s;
}
static inline GString* g_string_append(GString *s, const gchar *val) {
  gsize vlen = strlen(val); s->str = (gchar*)realloc(s->str, s->len + vlen + 1);
  memcpy(s->str + s->len, val, vlen + 1); s->len += vlen; s->allocated_len = s->len + 1; return s;
}
static inline GString* g_string_append_c(GString *s, gchar c) {
  char tmp[2] = {c, 0}; return g_string_append(s, tmp);
}
static inline gchar* g_string_free(GString *s, gboolean free_segment) {
  gchar *str = s->str; free(s); if (free_segment) { free(str); return NULL; } return str;
}

/* Error stub */
typedef struct { int code; char *message; } GError;
static inline void g_clear_error(GError **e) { if (e && *e) { free((*e)->message); free(*e); *e = NULL; } }

/* File/IO stubs (configfile.c uses g_io_channel) */
typedef void GIOChannel;
typedef int GIOCondition;
typedef int GIOStatus;
#define G_IO_STATUS_NORMAL 0
#define G_IO_STATUS_EOF    1
#define G_IO_STATUS_ERROR  2
#define G_IO_IN  1
#define G_IO_OUT 2
static inline GIOChannel* g_io_channel_new_file(const char *fn, const char *mode, GError **e) { (void)fn;(void)mode;(void)e; return NULL; }
static inline void g_io_channel_unref(GIOChannel *c) { (void)c; }
static inline GIOStatus g_io_channel_read_line(GIOChannel *c, char **s, gsize *l, gsize *t, GError **e) { (void)c;(void)s;(void)l;(void)t;(void)e; return G_IO_STATUS_EOF; }

#endif /* GLIB_STUB_H */

/* glib-stub.h — minimal GLib type stubs for WASM build */
#ifndef GLIB_STUB_H
#define GLIB_STUB_H

#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <stdio.h>
#include <ctype.h>
#include <unistd.h>

typedef unsigned long  gsize;
typedef long           gssize;
typedef int            gboolean;
typedef char           gchar;
typedef unsigned char  guchar;
typedef int            gint;
typedef unsigned int   guint;
typedef long           glong;
typedef unsigned long  gulong;
typedef short          gshort;
typedef unsigned short gushort;
typedef void*          gpointer;
typedef double         gdouble;
typedef float          gfloat;

#define TRUE  1
#define FALSE 0
#define G_GNUC_UNUSED __attribute__((unused))
#define GINT_TO_POINTER(i) ((gpointer)(long)(i))
#define GPOINTER_TO_INT(p) ((gint)(long)(p))
#define g_assert(x) do { if (!(x)) abort(); } while(0)

#ifndef MIN
#define MIN(a,b) ((a)<(b)?(a):(b))
#endif
#ifndef MAX
#define MAX(a,b) ((a)>(b)?(a):(b))
#endif

/* GDate stub */
typedef struct { unsigned int julian_days; } GDate;
static inline void g_date_clear(GDate *d, unsigned int n) { memset(d, 0, sizeof(GDate)*n); }
static inline void g_date_set_time_t(GDate *d, long t) { d->julian_days = (unsigned int)(t / 86400); }
static inline void g_date_add_days(GDate *d, unsigned int days) { d->julian_days += days; }
static inline int  g_date_days_between(const GDate *d1, const GDate *d2) {
  return (int)d2->julian_days - (int)d1->julian_days;
}
static inline gboolean g_date_valid(const GDate *d) { return d->julian_days > 0; }
static inline gsize g_date_strftime(gchar *s, gsize slen, const gchar *format, const GDate *d) {
  (void)d; (void)format;
  if (s && slen > 0) s[0] = '\0';
  return 0;
}
static inline GDate* g_date_new_dmy(int day, int month, int year) {
  GDate *d = (GDate*)calloc(1, sizeof(GDate));
  /* Simple Julian day approximation */
  d->julian_days = (unsigned int)(year * 365 + month * 30 + day);
  return d;
}

/* GScanner character set macros */
#define G_CSET_a_2_z  "abcdefghijklmnopqrstuvwxyz"
#define G_CSET_A_2_Z  "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
#define G_CSET_DIGITS "0123456789"
/* Extended latin characters (ISO-8859) — approximation for identifier parsing */
#define G_CSET_LATINS ""
#define G_CSET_LATINC ""

/* Install-time path stubs for WASM build */
#ifndef DPDATADIR
#define DPDATADIR "/tmp"
#endif
#ifndef DPDOCDIR
#define DPDOCDIR  "/tmp"
#endif
#ifndef DPSCOREDIR
#define DPSCOREDIR "/tmp"
#endif
#ifndef VERSION
#define VERSION "1.0.0-wasm"
#endif

/* GLog stubs */
typedef unsigned int GLogLevelFlags;
#define G_LOG_LEVEL_ERROR    (1 << 2)
#define G_LOG_LEVEL_CRITICAL (1 << 3)
#define G_LOG_LEVEL_WARNING  (1 << 4)
#define G_LOG_LEVEL_MESSAGE  (1 << 5)
#define G_LOG_LEVEL_INFO     (1 << 6)
#define G_LOG_LEVEL_DEBUG    (1 << 7)
#define G_LOG_LEVEL_MASK     (~0x3)
typedef void (*GLogFunc)(const gchar *log_domain, GLogLevelFlags log_level,
                         const gchar *message, gpointer user_data);
static inline guint g_log_set_handler(const gchar *domain, GLogLevelFlags levels,
                                      GLogFunc fn, gpointer userdata) {
  (void)domain;(void)levels;(void)fn;(void)userdata; return 0;
}
static inline void g_log_remove_handler(const gchar *domain, guint id) {
  (void)domain;(void)id;
}
static inline void g_log(const gchar *domain, GLogLevelFlags level,
                         const gchar *fmt, ...) {
  (void)domain; (void)level; (void)fmt;
}

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
static inline int g_ascii_strncasecmp(const char *a, const char *b, gsize n) {
  while (n > 0 && *a && *b) {
    int d = tolower((unsigned char)*a) - tolower((unsigned char)*b);
    if (d) return d;
    a++; b++; n--;
  }
  if (n == 0) return 0;
  return tolower((unsigned char)*a) - tolower((unsigned char)*b);
}
static inline gchar* g_ascii_strup(gchar *str, gssize len) {
  gsize n = (len < 0) ? strlen(str) : (gsize)len;
  for (gsize i = 0; i < n; i++) str[i] = (gchar)toupper((unsigned char)str[i]);
  return str;
}
static inline gchar* g_ascii_strdown(gchar *str, gssize len) {
  gsize n = (len < 0) ? strlen(str) : (gsize)len;
  for (gsize i = 0; i < n; i++) str[i] = (gchar)tolower((unsigned char)str[i]);
  return str;
}
/* Misc */
#define g_new(type, n)    ((type*)malloc(sizeof(type)*(n)))
#define g_new0(type, n)   ((type*)calloc((n), sizeof(type)))
#define g_renew(type, mem, n) ((type*)realloc((mem), sizeof(type)*(n)))
#define g_malloc(n)       malloc(n)
#define g_malloc0(n)      calloc(1, (n))
#define g_realloc(p, n)   realloc((p), (n))
#define g_memmove(d,s,n)  memmove((d),(s),(n))

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

/* GPtrArray stub */
typedef struct {
  gpointer *pdata;
  guint     len;
} GPtrArray;
static inline GPtrArray* g_ptr_array_new(void) {
  GPtrArray *a = g_new0(GPtrArray, 1); return a;
}
static inline void g_ptr_array_add(GPtrArray *a, gpointer v) {
  a->pdata = (gpointer*)realloc(a->pdata, (a->len + 1) * sizeof(gpointer));
  a->pdata[a->len++] = v;
}
static inline void g_ptr_array_free(GPtrArray *a, gboolean free_seg) {
  if (free_seg) free(a->pdata); free(a);
}

/* GScanner stubs (config file parser) */
typedef enum {
  G_TOKEN_EOF              = 0,
  G_TOKEN_LEFT_PAREN       = '(',
  G_TOKEN_RIGHT_PAREN      = ')',
  G_TOKEN_LEFT_CURLY       = '{',
  G_TOKEN_RIGHT_CURLY      = '}',
  G_TOKEN_LEFT_BRACE       = '[',
  G_TOKEN_RIGHT_BRACE      = ']',
  G_TOKEN_EQUAL_SIGN       = '=',
  G_TOKEN_COMMA            = ',',
  G_TOKEN_NONE             = 256,
  G_TOKEN_ERROR,
  G_TOKEN_CHAR,
  G_TOKEN_BINARY,
  G_TOKEN_OCTAL,
  G_TOKEN_INT,
  G_TOKEN_HEX,
  G_TOKEN_FLOAT,
  G_TOKEN_STRING,
  G_TOKEN_SYMBOL,
  G_TOKEN_IDENTIFIER,
  G_TOKEN_IDENTIFIER_NULL,
  G_TOKEN_COMMENT_SINGLE,
  G_TOKEN_COMMENT_MULTI,
  G_TOKEN_LAST
} GTokenType;

typedef struct {
  /* config fields — actual values ignored in WASM stub */
  const gchar *cset_skip_characters;
  const gchar *cset_identifier_first;
  const gchar *cset_identifier_nth;
  const gchar *cpair_comment_single;
  guint case_sensitive : 1;
  guint skip_comment_multi : 1;
  guint skip_comment_single : 1;
  guint scan_comment_multi : 1;
  guint scan_identifier : 1;
  guint scan_identifier_1char : 1;
  guint scan_identifier_NULL : 1;
  guint scan_symbols : 1;
  guint scan_binary : 1;
  guint scan_octal : 1;
  guint scan_float : 1;
  guint scan_hex : 1;
  guint scan_hex_dollar : 1;
  guint scan_string_sq : 1;
  guint scan_string_dq : 1;
  guint numbers_2_int : 1;
  guint int_2_float : 1;
  guint identifier_2_string : 1;
  guint char_2_token : 1;
  guint symbol_2_token : 1;
  guint scope_0_fallback : 1;
  guint store_int64 : 1;
} GScannerConfig;

/* Forward declare GScanner so the callback typedef can reference it */
struct _GScanner;
typedef void (*GScannerMsgFunc)(struct _GScanner *scanner, gchar *message, gboolean error);

typedef struct _GScanner {
  gpointer        user_data;
  guint           max_parse_errors;
  guint           parse_errors;
  const gchar    *input_name;
  GTokenType      token;
  union {
    gchar   *v_identifier;
    gchar   *v_string;
    double   v_float;
    gulong   v_int;
  } value;
  GScannerMsgFunc msg_handler;
  GScannerConfig *config;
} GScanner;

typedef int GQuark;

static inline GScanner* g_scanner_new(const GScannerConfig *cfg) {
  (void)cfg; return (GScanner*)calloc(1, sizeof(GScanner));
}
static inline void g_scanner_destroy(GScanner *s) { free(s); }
static inline GTokenType g_scanner_get_next_token(GScanner *s) { (void)s; s->token = G_TOKEN_EOF; return G_TOKEN_EOF; }
static inline GTokenType g_scanner_peek_next_token(GScanner *s) { (void)s; return G_TOKEN_EOF; }
static inline void g_scanner_input_text(GScanner *s, const gchar *t, guint l) { (void)s;(void)t;(void)l; }
static inline void g_scanner_input_file(GScanner *s, int fd) { (void)s;(void)fd; }
static inline gboolean g_scanner_eof(GScanner *s) { (void)s; return TRUE; }
static inline guint g_scanner_cur_line(GScanner *s) { (void)s; return 0; }
static inline void g_scanner_error(GScanner *s, const gchar *fmt, ...) { (void)s;(void)fmt; }
static inline void g_scanner_unexp_token(GScanner *s, GTokenType t,
    const gchar *idspec, const gchar *symspec, const gchar *symname,
    const gchar *msg, gboolean is_error) {
  (void)s;(void)t;(void)idspec;(void)symspec;(void)symname;(void)msg;(void)is_error;
}

/* g_slist_next macro */
#define g_slist_next(l) ((l) ? (l)->next : NULL)

/* g_string_append_printf */
static inline GString* g_string_append_printf(GString *s, const gchar *fmt, ...) {
  char buf[2048]; va_list ap; va_start(ap, fmt); vsnprintf(buf, sizeof(buf), fmt, ap); va_end(ap);
  return g_string_append(s, buf);
}

/* g_string_assign */
static inline GString* g_string_assign(GString *s, const gchar *val) {
  free(s->str); s->str = g_strdup(val); s->len = strlen(val); s->allocated_len = s->len + 1; return s;
}

/* g_string_truncate */
static inline GString* g_string_truncate(GString *s, gsize len) {
  if (len < s->len) { s->str[len] = '\0'; s->len = len; }
  return s;
}

/* g_string_insert_c (simplified: always appends) */
static inline GString* g_string_insert_c(GString *s, gssize pos, gchar c) {
  char tmp[2] = {c, 0}; (void)pos; return g_string_append(s, tmp);
}

/* g_strdelimit */
static inline gchar* g_strdelimit(gchar *str, const gchar *delims, gchar new_delim) {
  if (!str || !delims) return str;
  for (gchar *p = str; *p; p++) {
    for (const gchar *d = delims; *d; d++) {
      if (*p == *d) { *p = new_delim; break; }
    }
  }
  return str;
}

/* g_print */
static inline void g_print(const gchar *fmt, ...) {
  va_list ap; va_start(ap, fmt); vprintf(fmt, ap); va_end(ap);
}

/* Sound/plugin stubs — no audio in WASM build */
static inline gchar* GetPluginList(void) { return g_strdup("none"); }


/* g_warning / g_error — implemented as inline functions to avoid string-concat issues with _(x) */
static inline void g_warning(const gchar *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  fprintf(stderr, "WARNING: "); vfprintf(stderr, fmt, ap); fprintf(stderr, "\n");
  va_end(ap);
}
static inline void g_error(const gchar *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  fprintf(stderr, "ERROR: "); vfprintf(stderr, fmt, ap); fprintf(stderr, "\n");
  va_end(ap);
  abort();
}

/* GArray stub — typed array with g_array_index macro */
typedef struct { gchar *data; guint len; guint elt_size; } GArray;
static inline GArray* g_array_new(gboolean zero, gboolean clear, guint elt_size) {
  (void)zero; (void)clear;
  GArray *a = g_new0(GArray, 1); a->elt_size = elt_size; return a;
}
static inline GArray* g_array_set_size(GArray *a, guint new_len) {
  if (new_len > a->len) {
    a->data = (gchar*)realloc(a->data, new_len * a->elt_size);
    memset(a->data + a->len * a->elt_size, 0, (new_len - a->len) * a->elt_size);
  }
  a->len = new_len; return a;
}
static inline GArray* g_array_append_vals(GArray *a, const void *data, guint n) {
  guint old = a->len; g_array_set_size(a, a->len + n);
  memcpy(a->data + old * a->elt_size, data, n * a->elt_size); return a;
}
static inline gchar* g_array_free(GArray *a, gboolean free_seg) {
  gchar *d = a->data; free(a); if (free_seg) { free(d); return NULL; } return d;
}
/* g_array_index: access element by index as a given type */
#define g_array_index(a, t, i) (*(t*)((a)->data + (i) * (a)->elt_size))

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

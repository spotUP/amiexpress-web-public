/* convert.h — stub for WASM build; no codeset conversion in browser */
#ifndef CONVERT_H
#define CONVERT_H

#include "glib-stub.h"

typedef struct _Converter {
  gchar *ext_codeset;
} Converter;

static inline void Conv_SetInternalCodeset(const gchar *codeset) { (void)codeset; }
static inline Converter* Conv_New(void) { return g_new0(Converter, 1); }
static inline void Conv_SetCodeset(Converter *conv, const gchar *codeset) { (void)conv; (void)codeset; }
static inline gboolean Conv_Needed(Converter *conv) { (void)conv; return FALSE; }
static inline gchar* Conv_ToExternal(Converter *conv, const gchar *s, int len) {
  (void)conv; (void)len; return s ? g_strdup(s) : NULL;
}
static inline gchar* Conv_ToInternal(Converter *conv, const gchar *s, int len) {
  (void)conv; (void)len; return s ? g_strdup(s) : NULL;
}
static inline void Conv_Free(Converter *conv) { if (conv) { g_free(conv->ext_codeset); g_free(conv); } }

#endif /* CONVERT_H */

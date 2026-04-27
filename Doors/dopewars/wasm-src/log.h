/* log.h — stub for WASM build; no file logging in browser */
#ifndef LOG_H
#define LOG_H

#include "glib-stub.h"

typedef enum {
    LF_SERVER = (1 << 0)
} LogFlags;

static inline void dopelog(int loglevel, LogFlags flags, const gchar *format, ...) {
  (void)loglevel; (void)flags; (void)format;
}

static inline GLogLevelFlags LogMask(void) {
  return G_LOG_LEVEL_MASK;
}

static inline GString* GetLogString(GLogLevelFlags log_level, const gchar *message) {
  (void)log_level;
  return g_string_new(message);
}

static inline void OpenLog(void)  {}
static inline void CloseLog(void) {}

#endif /* LOG_H */

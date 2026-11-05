/* error.h — stub for WASM build */
#ifndef ERROR_H
#define ERROR_H

#include "glib-stub.h"
#include <errno.h>
#include <string.h>

static inline gchar* ErrStrFromErrno(int errcode) {
  return g_strdup(strerror(errcode));
}

#endif /* ERROR_H */

# C Stubs for WASM Door Ports

Reusable C header stubs for compiling Amiga/legacy C codebases to WASM via Emscripten.

## glib-stub.h

Minimal GLib type stubs (GSList, GString, GDate, GArray, GScanner, etc.) for building
doors that depend on GLib without linking the full library. Used by the Dopewars door.

### Contents

- **Type definitions**: gboolean, gchar, gint, guint, gsize, gpointer, and 20+ more
- **GString**: dynamic string buffer management
- **GSList**: singly-linked list
- **GPtrArray**: resizable pointer array
- **GArray**: typed array with element indexing
- **GDate**: Julian day number-based date
- **GScanner**: tokenizer/config file parser
- **GLog**: logging framework stubs
- **String utilities**: g_strdup, g_ascii_strcasecmp, g_ascii_strdown, g_ascii_strup, etc.
- **Memory macros**: g_malloc, g_free, g_new, g_renew, etc.
- **Path stubs**: DPDATADIR, DPDOCDIR, DPSCOREDIR for install-time paths
- **I/O stubs**: GIOChannel for file operations

### Usage in Your Makefile

```makefile
CFLAGS += -I$(SDK_ROOT)/utils/c-stubs
```

Or if building relative to the dopewars door structure:

```makefile
CFLAGS += -I../../../sdk/utils/c-stubs
```

Include it in your C files:

```c
#include "glib-stub.h"
```

### Limitations

This is a minimal stub implementation. It provides:
- Safe memory management (no leaked structures)
- Correct type layouts for binary compatibility
- Basic functionality for parsing and string manipulation

It does **not** provide:
- Full GLib feature parity
- Thread safety
- Hash tables (GHashTable)
- Regex or pattern matching beyond GScanner
- GUI/widget support
- Dynamic module loading

For features not in this stub, define them in your source or extend glib-stub.h.

### Future Extensions

To add more GLib stubs for other doors:
1. Add the struct definitions and function stubs to this file
2. Test with the target door's WASM build
3. Document the additions in this README

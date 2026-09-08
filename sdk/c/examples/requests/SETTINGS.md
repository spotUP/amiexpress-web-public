# Giving a C SDK door a settings form in the admin

A door **registers** automatically: the board scans `Commands/BBSCmd/*.info` at
boot, and 138 doors appear in the admin with nobody lifting a finger.

Its **settings** used to be the exception. Those needed a hand-written
`Doors/<door>/door.settings.json`, so of those 138 doors exactly 8 had a form
and only one of them was a C door. A sysop could see every door on the board
and configure almost none of them.

Now the declaration lives in the door's own source, beside the code that reads
the values.

## Three steps

**1. Declare the settings** in `sdk/c/examples/<door>/settings.c`:

```c
#include "ae_settings.h"

AE_SETTINGS_BEGIN(MYDOOR, "MYDOOR.cfg")
  AE_SETTING_STR_HELP("host", "Server host", "doors.uprough.net", "Host",
    "Plain HTTP - the 68K stack cannot do TLS.")
  AE_SETTING_INT_RANGE("port", "Port", 80, 1, 65535, "Port", NULL)
  AE_SETTING_SECRET("boardKey", "Board key", "BoardKey",
    "Stored beside the door and never committed.")
  AE_SETTING_BOOL("notify", "Announce new requests", 1, "Notify")
AE_SETTINGS_END
```

The second argument to `AE_SETTINGS_BEGIN` is the legacy `.cfg` filename the
68K binary opens - a bare filename, never a path. Pass `NULL` if the door reads
its settings some other way. Each `cfgKey` is the `Key=` that lands in that
file.

**2. Register it** in `sdk/c/Makefile`, as `<example-dir>:<Doors-dir>`:

```make
SETTINGS_DOORS = requests:REQUESTS mydoor:MYDOOR
```

**3. Generate:**

```sh
make -C sdk/c settings
```

That writes `Doors/MYDOOR/door.settings.json`. Commit it - it is a build
product, but the board reads it from disk and the admin has to find it there.

## What happens then

- The admin renders the form from the manifest, with types, ranges, help text
  and `secret` fields masked.
- Saving writes the values to the board's own store.
- `renderAllDoorCfgs` regenerates `Doors/MYDOOR/MYDOOR.cfg` at boot, as plain
  `Key=value` lines, which is what the 68K binary actually opens.

The door never parses JSON, and nobody hand-edits a `.cfg` again.

## The rule that keeps it honest

`web/backend/tests/doors/c-sdk-settings-manifest.test.ts` re-runs the generator
and compares it byte-for-byte against the manifest shipped in `Doors/`. Edit
the declaration without regenerating - or hand-edit the manifest behind the
generator's back - and it fails.

That matters because the failure it prevents is silent: a form that edits
fields the door never reads looks like it works, and the sysop only finds out
when the setting does nothing.

## Why build time, and not at runtime

The emitter is compiled for the HOST, from the same declaration the door
compiles for the Amiga. Nothing has to run a 68K binary to learn what it can be
told, and a door that has never booted - or that crashes on start - still gets
a settings form the sysop can fill in.
